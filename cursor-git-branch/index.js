/**
 * Host half of the Cursor-style git branch bundle.
 *
 * Registers one `git_branch` tool so the agent can query the current branch,
 * list local branches, and (optionally) switch branch. This is the model-facing
 * counterpart of the branch pill the Client half renders from `.git/HEAD` and
 * `.git/refs/heads`.
 *
 * Zero-dependency on purpose: only node builtins are imported, so the bundle
 * resolves cleanly from the profile without pulling dsh internals.
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
 * Read the current branch, local branch list, dirty count, and last commit.
 * When `checkout` is set, switch to that branch first and report the new state.
 */
async function readGitStatus(cwd, checkout) {
  if (checkout !== undefined && checkout !== '') {
    await runGit(cwd, ['checkout', checkout])
  }
  const branch = (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  const branches = (await runGit(cwd, ['branch', '--format=%(refname:short)']))
    .split('\n').map((line) => line.trim()).filter(Boolean)
  const porcelain = (await runGit(cwd, ['status', '--porcelain=v1']))
    .split('\n').map((line) => line.trimEnd()).filter(Boolean)
  const lastCommit = (await runGit(cwd, ['log', '-1', '--format=%h %s'])).trim()
  return { branch, branches, changed: porcelain.length, lastCommit, cwd }
}

export function apply(ctx) {
  ctx.tools.register({
    name: 'git_branch',
    description:
      'Report the current git branch, local branches, working-tree change count, and last commit for a directory. ' +
      'Pass `checkout` to switch to a local branch first. Use it before committing or when the user asks which branch we are on.',
    parameters: {
      path: {
        type: 'string',
        description: 'Directory to inspect; defaults to the harness working directory.',
      },
      checkout: {
        type: 'string',
        description: 'Local branch to switch to (runs `git checkout <branch>`). Omit to only report status.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['branch', 'branches', 'changed', 'lastCommit', 'cwd'],
        properties: {
          branch: { type: 'string' },
          branches: { type: 'array', items: { type: 'string' } },
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
          ? ` Local branches: ${value.branches.join(', ')}.`
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
