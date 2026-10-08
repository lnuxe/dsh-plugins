import { spawn } from "node:child_process";

// Cursor-style agent lifecycle hooks for the DeepSeek Harness.
//
// Cursor maps 10 hook events (PreToolUse, PostToolUse, SubagentStop, ...) to
// user scripts in hooks.json; the script receives a JSON event on stdin and
// may veto PreToolUse by exit code. DSH already emits the equivalent Cordis
// events, so this plugin bridges them to user shell commands. First version is
// observation-only: each command gets `{ "hook": ..., ...payload }` on stdin
// and runs fire-and-forget (for logging / notifications / side effects).
//
// Zero-dependency on purpose: `link:` bundles do not install their own
// dependencies, so only node builtins are imported.

export const name = "cursor-hooks";
export const inject = [];

// Cursor hook name -> DSH event + payload projector. `waterfall` events
// forward `next()` unconditionally (observation only, no veto).
const EVENTS = {
  PreToolUse: {
    event: "tools/pre-execute",
    waterfall: true,
    payload: (exec) => ({ name: exec.name, arguments: exec.arguments }),
  },
  PostToolUse: {
    event: "tools/result",
    payload: (exec, result) => ({ name: exec.name, isError: result?.isError }),
  },
  UserPromptSubmit: {
    event: "agent/inbox/inserted",
    payload: (payload) => ({ turn: payload?.turn }),
  },
  Stop: {
    event: "agent/turn-stopping",
    payload: (payload) => ({ turn: payload?.turn }),
  },
  SubagentStop: {
    event: "subagent/end",
    payload: (info) => info,
  },
  SessionStart: {
    event: "agent/created",
    payload: (payload) => ({ source: payload?.source }),
  },
  SessionEnd: {
    event: "agent/disposed",
    payload: () => ({}),
  },
};

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function fireHook(command, payload) {
  try {
    const child = spawn(command, { shell: true, stdio: ["pipe", "ignore", "inherit"] });
    child.stdin.end(JSON.stringify(safeJson(payload)));
    child.on("error", () => {});
  } catch {
    // Hook failures never affect the agent turn.
  }
}

export function apply(ctx, config = {}) {
  const hooks = config.hooks ?? {};
  const disposers = [];
  for (const [hookName, command] of Object.entries(hooks)) {
    if (!command) continue;
    const spec = EVENTS[hookName];
    if (!spec) continue;

    const handler = spec.waterfall
      ? (...args) => {
          const next = args[args.length - 1];
          fireHook(command, { hook: hookName, ...spec.payload(...args.slice(0, -1)) });
          return next();
        }
      : (...args) => {
          fireHook(command, { hook: hookName, ...spec.payload(...args) });
        };

    disposers.push(ctx.on(spec.event, handler));
  }
  return () => disposers.forEach((off) => off());
}
