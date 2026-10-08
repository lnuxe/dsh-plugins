// Cursor-style tool-level MCP policy for the DeepSeek Harness.
//
// Cursor builds each turn's tool set through `bA()` (cursor-mcp/dist/main.js):
//   1. enabledServerIds        — server switch
//   2. toolAllowlistByServer   — per-server allowlist
//   3. userDisabledToolKeys    — single-tool disable
// DSH registers whole MCP servers as global tools named `mcp__<server>__<tool>`.
// A context-global `tools.restrict()` is rejected (it would mask every agent),
// so this plugin installs a plain-context `tools.guard()` — which IS global —
// and denies any call whose name falls outside the policy. Denied tools stay
// visible to the model but fail on dispatch, matching Cursor's "block at use"
// for `userDisabledToolKeys`.
//
// Zero-dependency on purpose: `link:` bundles do not install their own
// dependencies, so only node builtins are imported.

export const name = "cursor-mcp-policy";
export const inject = ["tools"];

/** `mcp__<server>__<tool>` -> { server, tool }; null for non-MCP tools. */
function parseMcpName(name) {
  if (!name.startsWith("mcp__")) return null;
  const rest = name.slice("mcp__".length);
  const sep = rest.indexOf("__");
  if (sep < 0) return null;
  return { server: rest.slice(0, sep), tool: rest.slice(sep + 2) };
}

export function apply(ctx, config = {}) {
  const enabledServers = config.enabledServers ?? [];
  const toolAllowlist = config.toolAllowlist ?? {};
  const denyTools = config.denyTools ?? [];

  function isDenied(name) {
    if (denyTools.includes(name)) return true;
    const mcp = parseMcpName(name);
    if (!mcp) return false;
    if (enabledServers.length > 0 && !enabledServers.includes(mcp.server)) return true;
    const allowlist = toolAllowlist[mcp.server];
    if (allowlist && allowlist.length > 0 && !allowlist.includes(mcp.tool)) return true;
    return false;
  }

  return ctx.tools.guard((execution) =>
    isDenied(execution.name)
      ? `MCP tool "${execution.name}" is disabled by cursor-mcp-policy`
      : undefined,
  );
}
