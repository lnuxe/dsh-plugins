# Feature request: native git branch indicator + switcher in the composer

<!--
  Submit target: https://github.com/deepseek-ai/deepseek-harness/discussions
  Category:      Ideas
  (DeepSeek Harness does not accept external PRs yet — see CONTRIBUTING.md.
   Feature requests go through GitHub Discussions.)
-->

## Summary

Add a native git **branch pill** to the conversation composer that shows the
current branch and, on click, opens a branch picker with **local + remote**
branches — mirroring Cursor's branch selector. Today the DSH web UI has no git
branch affordance; switching a branch requires asking the agent to run
`git checkout`, which costs a model round-trip.

## Motivation

- Cursor renders the current branch in the composer and opens a grouped
  local/remote branch picker on click. It is a small, high-frequency UX
  affordance for git-heavy work.
- In DSH, switching branches is currently agent-mediated. A client-side pill
  gives instant, deterministic control, saves tokens, and removes an
  ambiguity-heavy tool call.
- The underlying data (`ctx.remote.workspaceFiles`) is already shipped; this is
  mostly a UI-slot feature on top of it.

## Proposed feature

1. A pill in `conversation.composer.dock` rendering the current branch read
   from `.git/HEAD`, with a git-branch icon and a chevron.
2. Click opens a portal menu (viewport-aware: pops upward near the bottom edge,
   `maxHeight` clipped to the available space) listing:
   - **Local** branches (short names, current branch checked)
   - **Remote** branches (`origin/<name>`)
3. Picking a branch drafts the checkout into the composer:
   - local → `git checkout <branch>`
   - remote → `git checkout -b <name> origin/<name>` (mirrors Cursor's
     `createAndCheckoutBranch`)
4. Must handle **submodules and worktrees**, where `.git` is a *file* containing
   `gitdir: <path>` that points outside the workspace root.

## Technical context (reverse-engineered)

- Cursor's git extension lists branches with
  `git for-each-ref --format='%(refname)%00%(upstream:short)%00...' refs/heads/<e> refs/remotes/<e>`,
  then merges local (short) names with remote (`origin/x`) names.
- DSH's client cannot exec `git`; it reads files through
  `ctx.remote.workspaceFiles`. Key finding: **`workspaceFiles.read` is not
  workspace-confined** (unlike `list`), so it can reach a submodule's git dir
  that lives outside the workspace root.
- For submodules/worktrees, branch names can be recovered from
  `gitdir/packed-refs` + `FETCH_HEAD` + `logs/HEAD`, but loose local refs under
  a workspace-external `refs/heads` are **not enumerable** via `list` (which is
  confined to the workspace).

## Value

- Parity with Cursor for a common git workflow.
- Saves model round-trips and tokens on every branch switch.
- Demonstrates a reusable pattern: client slots reading workspace git metadata
  via `remote.workspaceFiles`.

## Suggested follow-up for the core team

The cleanest fix for exact results is a small **Host-side `@Remote` git
service** (e.g. `remote.gitBranch.list(sessionId)` that runs
`git for-each-ref` and returns the merged local/remote list). That would give
plugins exact branch data — including submodule/worktree/packed-refs cases —
without re-reading `.git` internals, and would also unlock other git
affordances (status, diffs, commit author) for the community.

## Reference implementation

A working community plugin (`dsh-plugin` topic) ships this today:
`@local/dsh-git-branch` — host `git_branch` tool + client
`conversation.composer.dock` pill, with the submodule/worktree handling
described above.
