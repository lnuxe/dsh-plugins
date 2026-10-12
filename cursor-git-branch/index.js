/**
 * Host half of the Cursor-style git branch bundle.
 *
 * Registers one `git_branch` tool so the agent can query the current branch,
 * list LOCAL + REMOTE branches, and (optionally) switch branch. This mirrors
 * Cursor's `getAllBranchNames({ includeRemotes: true })` + `OVp` merge: local
 * branches use short names (`master`), remote branches use `origin/xxx`.
 *
 * Zero-dependency on purpose: only node builtins are imported.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const name = 'cursor-git-branch'
export const inject = ['tools']

/** One bounded git invocation. */
async function runGit(cwd, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout: 8000,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  return stdout
}

/**
 * List local + remote branch names the way Cursor's `OVp` does:
 *   - `refs/heads/<b>`           -> `<b>`            (local, short)
 *   - `refs/remotes/<r>/<b>`     -> `<r>/<b>`        (remote, `origin/xxx`)
 *   - `refs/remotes/<r>/HEAD`    -> skipped (symbolic)
 */
async function listAllBranches(cwd) {
  const refs = (await runGit(cwd, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes']))
    .split('\n').map((line) => line.trim()).filter(Boolean)

  const branches = []
  const remotes = new Set()
  for (const ref of refs) {
    if (ref.startsWith('refs/heads/')) {
      branches.push(ref.slice('refs/heads/'.length))
    } else if (ref.startsWith('refs/remotes/')) {
      const rest = ref.slice('refs/remotes/'.length)
      const idx = rest.indexOf('/')
      if (idx > 0) {
        const remote = rest.slice(0, idx)
        const branch = rest.slice(idx + 1)
        if (branch === 'HEAD') continue // symbolic ref, not a branch
        remotes.add(remote)
        branches.push(rest) // origin/xxx
      }
    }
  }
  return { branches, remotes: [...remotes] }
}

/** Read current branch, all branches, dirty count, and last commit. */
async function readGitStatus(cwd, checkout) {
  if (checkout !== undefined && checkout !== '') {
    await runGit(cwd, ['checkout', checkout])
  }
  const branch = (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  const { branches, remotes } = await listAllBranches(cwd)
  const porcelain = (await runGit(cwd, ['status', '--porcelain=v1']))
    .split('\n').map((line) => line.trimEnd()).filter(Boolean)
  const lastCommit = (await runGit(cwd, ['log', '-1', '--format=%h %s'])).trim()
  return { branch, branches, remotes, changed: porcelain.length, lastCommit, cwd }
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'git_branch',
    description:
      'Report the current git branch, LOCAL + REMOTE branches, working-tree change count, and last commit for a directory. ' +
      'Remote branches appear as `origin/<name>`. Pass `checkout` to switch to a branch first.',
    parameters: {
      path: {
        type: 'string',
        description: 'Directory to inspect; defaults to the harness working directory.',
      },
      checkout: {
        type: 'string',
        description: 'Branch to switch to (runs `git checkout <branch>`). Omit to only report status.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['branch', 'branches', 'remotes', 'changed', 'lastCommit', 'cwd'],
        properties: {
          branch: { type: 'string' },
          branches: { type: 'array', items: { type: 'string' } },
          remotes: { type: 'array', items: { type: 'string' } },
          changed: { type: 'integer' },
          lastCommit: { type: 'string' },
          cwd: { type: 'string' },
        },
      },
      render: (args, value) => {
        const prefix = args && typeof args.checkout === 'string' && args.checkout !== ''
          ? `Switched to branch "${value.branch}". `
          : ''
        const list = value.branches.length > 0
          ? ` Branches: ${value.branches.join(', ')}.`
          : ''
        return [{
          type: 'text',
          text: `${prefix}On branch "${value.branch}" in ${value.cwd}; ${value.changed} changed file(s); last commit: ${value.lastCommit || '(none)'}.${list}`,
        }]
      },
    },
    async execute(args) {
      const cwd = (args && typeof args.path === 'string' && args.path) || process.cwd()
      const checkout = args && typeof args.checkout === 'string' ? args.checkout : undefined
      try {
        return await readGitStatus(cwd, checkout)
      } catch (error) {
        throw new Error(`not a git repository or git failed in ${cwd}: ${error.message}`)
      }
    },
  })
}
