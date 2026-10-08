import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Reverse-engineered Cursor built-in skills provider for the DeepSeek Harness.
// Mirrors the shape of @deepseek-ai/dsh-skill-badge: a self-contained bundled
// provider registered on ctx.skills, with skill bodies shipped next to this
// module and located through import.meta.url (no fragile path resolution).
//
// On load, bodies that reference Cursor-specific tools/commands get a leading
// "DSH 工具适配" note mapping each Cursor name to its DSH equivalent
// (see dshtool-map.json).

const BUNDLED_SKILL_RANK = 600; // matches @deepseek-ai/dsh-skill BUNDLED_SKILL_RANK
const PROVIDER_NAME = "cursor";
const MANIFEST_URL = new URL("./skills-manifest.json", import.meta.url);
const TOOL_MAP_URL = new URL("./dshtool-map.json", import.meta.url);

/** Strip a leading YAML frontmatter block (`---\n...\n---\n`) from a body. */
function stripFrontmatter(md) {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(md);
  return match ? md.slice(match[0].length) : md;
}

/** `gh` is the only ambiguous key, so match it as a whole word. */
function matchesKey(content, key) {
  if (key === "gh") return /\bgh\b/.test(content);
  return content.includes(key);
}

async function adaptContent(content) {
  const toolMap = JSON.parse(await readFile(TOOL_MAP_URL, "utf8"));
  const hits = [];
  for (const [key, entry] of Object.entries(toolMap.mapping)) {
    if (matchesKey(content, key)) {
      hits.push(`- \`${key}\` → \`${entry.to}\`：${entry.note}`);
    }
  }
  if (hits.length === 0) return content;
  const note = `> **DSH 工具适配**\n> ${toolMap.heading}\n> ${hits.join("\n> ")}\n\n`;
  return note + content;
}

async function listCandidates() {
  const manifest = JSON.parse(await readFile(MANIFEST_URL, "utf8"));
  return manifest.map((entry) => {
    const dirUrl = new URL(`./skills/${entry.dir}/`, import.meta.url);
    const fileUrl = new URL(`./skills/${entry.dir}/SKILL.md`, import.meta.url);
    return {
      name: entry.name,
      description: entry.description,
      whenToUse: entry.whenToUse,
      invocation: {
        modelInvocable: entry.modelInvocable,
        userInvocable: entry.userInvocable,
      },
      provider: PROVIDER_NAME,
      source: "bundled",
      rank: BUNDLED_SKILL_RANK,
      resourceBase: { kind: "directory", path: fileURLToPath(dirUrl) },
      path: fileURLToPath(fileUrl),
      locator: { fileUrl },
    };
  });
}

const provider = {
  name: PROVIDER_NAME,
  list: () => listCandidates(),
  async get(candidate) {
    const md = await readFile(candidate.locator.fileUrl, "utf8");
    return {
      name: candidate.name,
      description: candidate.description,
      whenToUse: candidate.whenToUse,
      invocation: candidate.invocation,
      provider: candidate.provider,
      source: candidate.source,
      resourceBase: candidate.resourceBase,
      content: await adaptContent(stripFrontmatter(md)),
    };
  },
};

export const name = "cursor-skills";
export const inject = ["skills"];

export function apply(ctx) {
  return ctx.skills.registerProvider(() => provider);
}
