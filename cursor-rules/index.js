import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// Reverse-engineered Cursor Rules loader for the DeepSeek Harness.
//
// Cursor keeps persistent project guidance in `.cursor/rules/*.mdc` files with
// YAML frontmatter (`description`, `globs`, `alwaysApply`). Rules with
// `alwaysApply: true` are always injected; rules with `globs` only apply while
// matching files are open. This plugin mirrors that split: always rules become
// a per-agent system-prompt section, and glob rules are advertised (name +
// description + glob) so the model can read the matching file on demand.

const SECTION_NAME = "cursor:workspace-rules";
// Between the persona prefix (0) and plan policy (500), matching Cursor's
// placement of workspace rules before skills and tools.
const SECTION_ORDER = 400;

/** Strip the leading `---\n...\n---` frontmatter block and parse its scalars. */
function parseFrontmatter(md) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  if (!match) return { frontmatter: {}, body: md };
  const frontmatter = {};
  for (const raw of match[1].split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (value === "true") value = true;
    else if (value === "false") value = false;
    else value = value.replace(/^["']|["']$/g, "");
    frontmatter[key] = value;
  }
  return { frontmatter, body: md.slice(match[0].length) };
}

/** Synchronously load every `.mdc` rule under `rulesDir` (resolved against `cwd`). */
function loadRulesSync(rulesDir, cwd, maxRuleBytes) {
  const absDir = resolve(cwd, rulesDir);
  if (!existsSync(absDir)) return [];
  const rules = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".mdc")) continue;
    const md = readFileSync(join(absDir, entry.name), "utf8");
    const { frontmatter, body } = parseFrontmatter(md);
    rules.push({
      name: entry.name.replace(/\.mdc$/, ""),
      description: String(frontmatter.description ?? ""),
      globs: frontmatter.globs,
      alwaysApply: frontmatter.alwaysApply === true,
      content: body.trim().slice(0, maxRuleBytes),
    });
  }
  return rules;
}

/** Render always rules inline and advertise glob rules by name. */
function renderRules(rules, advertiseGlobRules) {
  const always = rules.filter((r) => r.alwaysApply);
  const globbed = rules.filter((r) => !r.alwaysApply);
  const parts = [];
  if (always.length > 0) {
    const body = always
      .map((r) => (r.description ? `## ${r.name}\n${r.description}\n\n${r.content}` : `## ${r.name}\n${r.content}`))
      .join("\n\n");
    parts.push(`<always_applied_workspace_rules>\n${body}\n</always_applied_workspace_rules>`);
  }
  if (globbed.length > 0 && advertiseGlobRules) {
    const list = globbed
      .map((r) => `- ${r.name}${r.description ? `: ${r.description}` : ""}${r.globs ? ` (globs: ${r.globs})` : ""}`)
      .join("\n");
    parts.push(
      `<agent_requestable_workspace_rules>\nThe following workspace rules apply only when their glob pattern matches the files in play; read the matching rule file under ${rulesDirName()}/ when relevant.\n${list}\n</agent_requestable_workspace_rules>`,
    );
  }
  return parts.join("\n\n");
}

function rulesDirName() {
  return ".cursor/rules";
}

export const name = "cursor-rules";
export const inject = ["systemPrompt", "fs"];

export function apply(ctx, config) {
  const rulesDir = config.rulesDir ?? ".cursor/rules";
  const advertiseGlobRules = config.advertiseGlobRules ?? true;
  const maxRuleBytes = config.maxRuleBytes ?? 8000;

  const disposers = new Set();
  const disposeListener = ctx.on("agent/created", ({ agent }) => {
    const cwd = agent.session.header.cwd ?? process.cwd();
    // Provider re-reads on every assembly so rule edits take effect immediately.
    const disposer = agent.ctx.systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: () => {
        try {
          const rules = loadRulesSync(rulesDir, cwd, maxRuleBytes);
          return rules.length > 0 ? renderRules(rules, advertiseGlobRules) : "";
        } catch {
          return "";
        }
      },
    });
    disposers.add(disposer);
  });

  return () => {
    disposeListener();
    for (const d of disposers) d();
    disposers.clear();
  };
}
