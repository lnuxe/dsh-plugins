// Cursor-style tool-level MCP policy for the DeepSeek Harness.
//
// Cursor builds each turn's tool set through `bA()` (cursor-mcp/dist/main.js):
//   1. enabledServerIds        — server switch
//   2. toolAllowlistByServer   — per-server allowlist
//   3. userDisabledToolKeys    — single-tool disable
// DSH registers whole MCP servers as global tools named `mcp__<server>__<tool>`.
//
// Two complementary mechanisms, matching Cursor's dual behavior:
//   - Per-agent `tools.restrict({ deny })` REMOVES the denied MCP tools from that
//     agent's visible tool set (the model no longer sees them). Registered on
//     `agent.ctx` in an `agent/created` listener, so it unwinds on agent disposal.
//   - A plain-context `tools.guard()` denies any call that still reaches dispatch
//     (a tool registered after the restriction snapshot, or a config change),
//     matching Cursor's "block at use" for `userDisabledToolKeys`.
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

  // Dispatch-time denial, global, monotonic.
  const disposeGuard = ctx.tools.guard((execution) =>
    isDenied(execution.name)
      ? `MCP tool "${execution.name}" is disabled by cursor-mcp-policy`
      : undefined,
  );

  // Per-agent removal: hide denied MCP tools from each agent's tool surface.
  const restrictions = new Set();
  const disposeListener = ctx.on("agent/created", ({ agent }) => {
    const denied = [];
    for (const schema of ctx.tools.schemas()) {
      if (isDenied(schema.name)) denied.push(schema.name);
    }
    if (denied.length === 0) return;
    try {
      restrictions.add(agent.ctx.tools.restrict({ deny: denied }));
    } catch {
      // `restrict` rejects unknown/reserved names; the guard still denies at
      // dispatch, so the policy holds even when removal cannot be applied.
    }
  });

  return () => {
    disposeListener();
    disposeGuard();
    for (const d of restrictions) d();
    restrictions.clear();
  };
}
