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
//
// Cursor also injects AGENTS.md as a separate `cloud_instructions` section
// ("Instructions pulled from AGENTS.md"). This plugin mirrors that too: it walks
// from the session cwd up to the filesystem root and renders every AGENTS.md it
// finds (nearest-first) into its own section.

const SECTION_NAME = "cursor:workspace-rules";
// Between the persona prefix (0) and plan policy (500), matching Cursor's
// placement of workspace rules before skills and tools.
const SECTION_ORDER = 400;
const CLOUD_SECTION_NAME = "cursor:cloud-instructions";
// Cursor renders cloud_instructions after available_skills; we keep it right
// after workspace rules so project-level guidance stays grouped.
const CLOUD_SECTION_ORDER = 405;

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

/** Walk from `cwd` up to the filesystem root, collecting every AGENTS.md. */
function loadAgentsMdSync(cwd, maxRuleBytes) {
  const found = [];
  let dir = resolve(cwd);
  for (;;) {
    const p = join(dir, "AGENTS.md");
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, "utf8").trim().slice(0, maxRuleBytes);
        if (content) found.push({ path: p, content });
      } catch {
        // unreadable AGENTS.md is skipped, matching Cursor's tolerant loader.
      }
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return found; // nearest-first
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

/** Render the cloud_instructions section (AGENTS.md), mirroring Cursor's rne(). */
function renderCloudInstructions(entries) {
  if (entries.length === 0) return "";
  const body = entries
    .map((e) => (entries.length > 1 ? `<!-- ${e.path} -->\n${e.content}` : e.content))
    .join("\n\n---\n\n");
  return `<cloud_instructions>\nInstructions pulled from AGENTS.md\n\nAGENTS.md contents:\n\n${body}\n</cloud_instructions>`;
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
  const agentsMd = config.agentsMd ?? true;

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
    if (agentsMd) {
      const cloudDisposer = agent.ctx.systemPrompt.section({
        name: CLOUD_SECTION_NAME,
        order: CLOUD_SECTION_ORDER,
        text: () => {
          try {
            const entries = loadAgentsMdSync(cwd, maxRuleBytes);
            return renderCloudInstructions(entries);
          } catch {
            return "";
          }
        },
      });
      disposers.add(cloudDisposer);
    }
  });

  return () => {
    disposeListener();
    for (const d of disposers) d();
    disposers.clear();
  };
}
