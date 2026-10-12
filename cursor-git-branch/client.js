/**
 * Client half — Cursor-style git branch pill in the composer dock (v5).
 *
 * Mirrors Cursor's `getAllBranchNames({ includeRemotes: true })` + `OVp`:
 * lists LOCAL branches (`master`) and REMOTE branches (`origin/xxx`), with the
 * popup flip-to-top fix. Data comes from the shipped `workspaceFiles` Remote:
 *   - `.git/HEAD`                  -> current branch label
 *   - `.git/refs/heads`            -> local branches
 *   - `.git/refs/remotes/<remote>` -> remote branches (`<remote>/<name>`)
 * Picking a local branch drafts `git checkout <name>`; picking a remote branch
 * drafts `git checkout -b <name> <remote>/<name>` (mirrors Cursor's
 * `createAndCheckoutBranch`).
 */
window.__ModuleLoader__.load({
  id: '@local/cursor-git-branch',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    function parseHead(headText) {
      if (typeof headText !== 'string') return null
      const ref = /^ref:\s*refs\/heads\/(.+?)\s*$/.exec(headText)
      if (ref) return { label: ref[1] }
      const detached = /^([0-9a-f]{40})\s*$/.exec(headText.trim())
      if (detached) return { label: `HEAD@${detached[1].slice(0, 7)}` }
      return null
    }

    function GitBranchIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 13, height: 13, 'aria-hidden': true, style: { display: 'block' } },
        h('circle', { cx: 4, cy: 4, r: 1.9, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 4, r: 1.9, fill: 'currentColor' }),
        h('circle', { cx: 4, cy: 12, r: 1.9, fill: 'currentColor' }),
        h('path', { d: 'M4 6v4M12 6c0 3-2 4-4 4', stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }),
      )
    }

    function ChevronIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 10, height: 10, 'aria-hidden': true, style: { display: 'block' } },
        h('path', { d: 'M4 6l4 4 4-4', stroke: 'currentColor', strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    const pillStyle = {
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '1px 8px', borderRadius: '999px', fontSize: '12px', lineHeight: '18px',
      color: 'var(--dsw-alias-label-secondary)', background: 'var(--dsw-alias-bg-layer-1)',
      border: '1px solid var(--dsw-alias-border-l1)', cursor: 'pointer',
      userSelect: 'none', whiteSpace: 'nowrap', maxWidth: '300px', fontFamily: 'inherit',
    }

    const menuStyle = {
      position: 'fixed', minWidth: 220, maxWidth: 320, overflowY: 'auto',
      background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 4, zIndex: 10000,
    }

    const mutedStyle = { padding: '6px 8px', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }

    const sectionStyle = {
      padding: '4px 8px 2px', fontSize: 10, fontWeight: 600,
      color: 'var(--dsw-alias-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em',
    }

    function branchItem(item, current, onPick) {
      const isCurrent = item.name === current
      return h('button', {
        key: item.name, type: 'button', role: 'option', 'aria-selected': isCurrent,
        style: {
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '5px 8px', border: 'none', borderRadius: 5,
          background: isCurrent ? 'var(--dsw-alias-bg-layer-2, transparent)' : 'transparent',
          fontSize: 12, lineHeight: '18px', cursor: 'pointer', textAlign: 'left',
          color: 'var(--dsw-alias-label-primary, var(--dsw-alias-label-secondary))',
          fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        },
        onClick: () => onPick(item),
      },
        h('span', { style: { width: 12, display: 'inline-block', flexShrink: 0 } }, isCurrent ? '✓' : ''),
        h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, item.name),
        item.remote ? h('span', { style: { marginLeft: 'auto', flexShrink: 0, fontSize: 10, color: 'var(--dsw-alias-label-secondary)', border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 4, padding: '0 4px' } }, 'remote') : null,
      )
    }

    function GitBranchPill({ sessionId, inputActions, readHead, listBranches }) {
      const rootRef = useRef(null)
      const panelRef = useRef(null)
      const [branch, setBranch] = useState(null)
      const [branches, setBranches] = useState(null)
      const [busy, setBusy] = useState(false)
      const [open, setOpen] = useState(false)
      const [pos, setPos] = useState(null)

      useEffect(() => {
        let alive = true
        readHead(sessionId).then((info) => { if (alive) setBranch(info && info.label ? info.label : null) })
          .catch(() => { if (alive) setBranch(null) })
        return () => { alive = false }
      }, [sessionId])

      useEffect(() => {
        if (!open) return
        const onDown = (e) => {
          if (rootRef.current && rootRef.current.contains(e.target)) return
          if (panelRef.current && panelRef.current.contains(e.target)) return
          setOpen(false)
        }
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('pointerdown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('pointerdown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      const toggle = () => {
        const next = !open
        if (next) {
          const rect = rootRef.current && rootRef.current.getBoundingClientRect()
          if (rect) {
            const vw = window.innerWidth
            const vh = window.innerHeight
            const maxH = 300
            const spaceTop = rect.top - 8
            const spaceBottom = vh - rect.bottom - 8
            let left = rect.left
            if (left + 220 > vw - 8) left = Math.max(8, vw - 228)
            // Default pop upward (the pill sits near the bottom edge); fall back
            // downward only when there is no room above but more room below.
            if (spaceTop < maxH && spaceBottom > spaceTop) {
              setPos({ left, top: rect.bottom + 4, maxHeight: Math.min(maxH, spaceBottom) })
            } else {
              setPos({ left, bottom: vh - rect.top + 4, maxHeight: Math.min(maxH, spaceTop) })
            }
          } else {
            setPos({ top: 120, left: 40, maxHeight: 300 })
          }
          if (branches === null) {
            setBusy(true)
            listBranches(sessionId).then((list) => { setBranches(list || []); setBusy(false) })
              .catch(() => { setBranches([]); setBusy(false) })
          }
        }
        setOpen(next)
      }

      const pick = (item) => {
        setOpen(false)
        if (!item || !inputActions || typeof inputActions.setDraft !== 'function') return
        if (item.remote) {
          const slash = item.name.indexOf('/')
          const local = slash > 0 ? item.name.slice(slash + 1) : item.name
          inputActions.setDraft('git checkout -b ' + local + ' ' + item.name)
        } else {
          inputActions.setDraft('git checkout ' + item.name)
        }
      }

      if (!branch) return null
      const list = branches || []
      const locals = list.filter((x) => !x.remote)
      const remotes = list.filter((x) => x.remote)

      const menuContent = busy
        ? h('div', { style: mutedStyle }, 'Loading…')
        : h('div', null,
          locals.length > 0 && h('div', { style: sectionStyle }, 'Local'),
          locals.map((item) => branchItem(item, branch, pick)),
          remotes.length > 0 && h('div', { style: sectionStyle }, 'Remote'),
          remotes.map((item) => branchItem(item, branch, pick)),
          locals.length === 0 && remotes.length === 0 && h('div', { style: mutedStyle }, 'No branches'),
        )

      const menu = open && pos && createPortal(
        h('div', {
          ref: panelRef, role: 'listbox',
          style: { ...menuStyle, left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight },
        }, menuContent),
        document.body,
      )

      return h('span', {
        ref: rootRef,
        style: { position: 'relative', display: 'inline-flex' },
        title: 'Current branch: ' + branch + ' (click to switch)',
      },
        h('button', {
          type: 'button', style: pillStyle, onClick: toggle,
          'aria-haspopup': 'listbox', 'aria-expanded': open,
        }, h(GitBranchIcon), h('span', null, branch), h(ChevronIcon)),
        menu,
      )
    }

    return {
      inject: ['slots', 'remote', 'remote.workspaceFiles'],
      apply(ctx) {
        const remoteOf = () => (ctx.remote && ctx.remote.workspaceFiles) || null
        // Cursor's gitContext resolves the real git dir through `git rev-parse
        // --git-dir`, which also works for submodules and worktrees. Here we do
        // the same over the filesystem: a normal repo has `.git` as a directory,
        // while a submodule/worktree has `.git` as a FILE containing
        // `gitdir: <path>`. `read` (unlike `list`) is not workspace-confined, so
        // it can reach the real git dir outside the workspace root.
        const resolveGitBase = async (remote, sessionId, signal) => {
          const gitFile = await remote.read(sessionId, '.git', { offset: 1, limit: 1 }, signal)
          if (gitFile && gitFile.ok === true && gitFile.value && gitFile.value.text) {
            const m = /^gitdir:\s*(.+?)\s*$/m.exec(gitFile.value.text)
            if (m && m[1]) return m[1]
          }
          return '.git'
        }
        const readHead = async (sessionId) => {
          const remote = remoteOf()
          if (!remote) return null
          const controller = new AbortController()
          try {
            const base = await resolveGitBase(remote, sessionId, controller.signal)
            const result = await remote.read(sessionId, base + '/HEAD', { offset: 1, limit: 1 }, controller.signal)
            if (!result || result.ok !== true) return null
            return parseHead(result.value && result.value.text)
          } finally {
            controller.abort()
          }
        }
        const listBranches = async (sessionId) => {
          const remote = remoteOf()
          if (!remote) return []
          const controller = new AbortController()
          const out = []
          const seen = new Set()
          const add = (name, isRemote) => {
            if (!name || seen.has(name)) return
            seen.add(name)
            out.push({ name, remote: isRemote })
          }
          const addRef = (ref) => {
            if (ref.startsWith('refs/heads/')) add(ref.slice('refs/heads/'.length), false)
            else if (ref.startsWith('refs/remotes/')) {
              const rest = ref.slice('refs/remotes/'.length)
              const idx = rest.indexOf('/')
              if (idx > 0) {
                const branch = rest.slice(idx + 1)
                if (branch !== 'HEAD') add(rest, true)
              }
            }
          }
          try {
            const base = await resolveGitBase(remote, sessionId, controller.signal)
            const isSubmodule = base !== '.git'
            // Loose refs are only listable when the git dir sits inside the
            // workspace (normal repo). Submodule/worktree git dirs live outside
            // it, so `list` refuses them and we rely on packed-refs + reflog.
            if (!isSubmodule) {
              const local = await remote.list(sessionId, base + '/refs/heads', controller.signal)
              if (local && local.ok === true && local.value && local.value.entries) {
                for (const e of local.value.entries) if (e && e.type === 'file') add(e.name, false)
              }
              const remotes = await remote.list(sessionId, base + '/refs/remotes', controller.signal)
              if (remotes && remotes.ok === true && remotes.value && remotes.value.entries) {
                for (const r of remotes.value.entries) {
                  if (!r || r.type !== 'directory') continue
                  const refs = await remote.list(sessionId, base + '/refs/remotes/' + r.name, controller.signal)
                  if (refs && refs.ok === true && refs.value && refs.value.entries) {
                    for (const e of refs.value.entries) {
                      if (!e || e.type !== 'file' || e.name === 'HEAD') continue
                      add(r.name + '/' + e.name, true)
                    }
                  }
                }
              }
            }
            // Packed refs (remote branches usually live here, and `read` can
            // reach a submodule git dir): fresh clones / frequent fetches pack
            // refs so the loose dirs above may be empty or unreachable.
            const packed = await remote.read(sessionId, base + '/packed-refs', { offset: 1, limit: 5000 }, controller.signal)
            if (packed && packed.ok === true && packed.value && packed.value.text) {
              for (const line of packed.value.text.split('\n')) {
                const m = /^[0-9a-f]{40}\s+(refs\/(?:heads|remotes)\/.+?)\s*$/.exec(line)
                if (m) addRef(m[1])
              }
            }
            // Submodule/worktree: local branch names are loose files under a
            // git dir we cannot list. Recover them from HEAD + the HEAD reflog
            // (checkout/rename history), which covers every branch that was
            // ever checked out — a faithful best-effort of Cursor's git command.
            if (isSubmodule) {
              const head = await remote.read(sessionId, base + '/HEAD', { offset: 1, limit: 1 }, controller.signal)
              if (head && head.ok === true && head.value && head.value.text) {
                const m = /^ref:\s*refs\/heads\/(.+?)\s*$/.exec(head.value.text)
                if (m) add(m[1], false)
              }
              // FETCH_HEAD lists every branch the last fetch saw, including the
              // loose remote refs that packed-refs does not yet contain.
              const fetchHead = await remote.read(sessionId, base + '/FETCH_HEAD', { offset: 1, limit: 5000 }, controller.signal)
              if (fetchHead && fetchHead.ok === true && fetchHead.value && fetchHead.value.text) {
                for (const line of fetchHead.value.text.split('\n')) {
                  const m = /branch '([^']+)' of /.exec(line)
                  if (m) add('origin/' + m[1], true)
                }
              }
              const logs = await remote.read(sessionId, base + '/logs/HEAD', { offset: 1, limit: 5000 }, controller.signal)
              if (logs && logs.ok === true && logs.value && logs.value.text) {
                for (const line of logs.value.text.split('\n')) {
                  const co = /checkout: moving from (\S+) to (\S+)/.exec(line)
                  if (co) { add(co[1], false); add(co[2], false) }
                  const refs = line.match(/refs\/heads\/[^\s\t,]+/g)
                  if (refs) for (const r of refs) add(r.slice('refs/heads/'.length), false)
                }
              }
            }
            return out
          } finally {
            controller.abort()
          }
        }
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock', id: 'cursor-git-branch', order: 2,
          inject: () => ({ readHead, listBranches }),
        }, GitBranchPill))
      },
    }
  },
})
