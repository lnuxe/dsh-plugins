import { spawn } from "node:child_process";

// agent lifecycle hooks for the DeepSeek Harness.
//
// The upstream maps 10 hook events (PreToolUse, PostToolUse, SubagentStop, ...) to
// user scripts in hooks.json; the script receives a JSON event on stdin and may
// veto PreToolUse by exit code 2 or by printing `{"permissionDecision":"deny"}`.
// DSH already emits the equivalent Cordis events, so this plugin bridges them.
//
// PreToolUse is a `tools/pre-execute` waterfall gate: it awaits the hook and,
// on a veto, returns `{ kind: "deny", reason }` so the tool never dispatches.
// Every other hook is observation-only (fire-and-forget, logging / side effects).
//
// Zero-dependency on purpose: `link:` bundles do not install their own
// dependencies, so only node builtins are imported.

export const name = "dsh-hooks";
export const inject = [];

// Hook name -> DSH event + payload projector. `waterfall` events can
// gate the transition; `PreToolUse` is the only gating event (veto via deny).
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

/**
 * Interpret a hook's exit code + stdout as a veto decision.
 * Convention: exit code 2 blocks, or stdout JSON with
 * `permissionDecision` / `decision` set to "deny"/"block".
 */
function shouldVeto(code, stdout) {
  if (code === 2) return { veto: true, reason: "hook exited with code 2" };
  const trimmed = (stdout ?? "").trim();
  if (!trimmed) return { veto: false };
  try {
    const parsed = JSON.parse(trimmed);
    const specific = parsed?.hookSpecificOutput;
    const decision =
      specific?.permissionDecision ?? parsed?.permissionDecision ?? parsed?.decision;
    if (decision === "deny" || decision === "block") {
      return {
        veto: true,
        reason:
          specific?.permissionDecisionReason ?? parsed?.reason ?? `hook ${decision}`,
      };
    }
    if (parsed?.block === true) {
      return { veto: true, reason: parsed?.reason ?? "hook blocked" };
    }
  } catch {
    // Non-JSON stdout is not a veto.
  }
  return { veto: false };
}

/** Await a hook, capturing stdout + exit code, with a timeout that allows. */
function runHook(command, payload, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };
    let child;
    try {
      child = spawn(command, { shell: true, stdio: ["pipe", "pipe", "inherit"] });
    } catch {
      return finish({ veto: false });
    }
    const timer = setTimeout(() => {
      finish({ veto: false });
      try {
        child.kill();
      } catch {
        /* already exited */
      }
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d;
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish({ veto: false });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish(shouldVeto(code, stdout));
    });
    child.stdin.end(JSON.stringify(safeJson(payload)));
  });
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
  const veto = config.veto ?? true;
  const vetoTimeoutMs = config.vetoTimeoutMs ?? 5000;
  const disposers = [];
  for (const [hookName, command] of Object.entries(hooks)) {
    if (!command) continue;
    const spec = EVENTS[hookName];
    if (!spec) continue;

    const handler = spec.waterfall
      ? async (...args) => {
          const next = args[args.length - 1];
          const exec = args[0];
          if (veto) {
            const decision = await runHook(
              command,
              { hook: hookName, ...spec.payload(exec) },
              vetoTimeoutMs,
            );
            if (decision.veto) {
              return { kind: "deny", reason: decision.reason };
            }
          }
          return next();
        }
      : (...args) => {
          fireHook(command, { hook: hookName, ...spec.payload(...args) });
        };

    disposers.push(ctx.on(spec.event, handler));
  }
  return () => disposers.forEach((off) => off());
}
