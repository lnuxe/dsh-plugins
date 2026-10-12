/**
 * Client half — Cursor-style git branch pill in the composer dock.
 *
 * Reverse-engineered from Cursor's `agent-panel-checkout-branch-pill` +
 * `branch-mismatch-tray-view` (workbench.glass.main.js). Cursor keys off the
 * agent's tracked `activeBranchName` vs the repo's current branch; DSH has no
 * agent-branch concept, so this pill shows the session workspace's CURRENT
 * branch and, on click, offers a local-branch switcher.
 *
 * Data comes entirely from the shipped `workspaceFiles` Remote:
 *   - `.git/HEAD`        -> current branch label
 *   - `.git/refs/heads`  -> local branch list (one entry per branch)
 * Switching hands the command to the composer via the standard `inputActions`
 * prop, so the agent (which owns the bash tool) performs `git checkout`.
 */
window.__ModuleLoader__.load({
  id: '@local/cursor-git-branch',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    /** Parse `.git/HEAD` text into a display label, or null when not a repo. */
    function parseHead(headText) {
      if (typeof headText !== 'string') return null
      const ref = /^ref:\s*refs\/heads\/(.+?)\s*$/.exec(headText)
      if (ref) return { kind: 'branch', label: ref[1] }
      const detached = /^([0-9a-f]{40})\s*$/.exec(headText.trim())
      if (detached) return { kind: 'detached', label: `HEAD@${detached[1].slice(0, 7)}` }
      return null
    }

    function GitBranchIcon(props) {
      return h('svg', Object.assign({
        viewBox: '0 0 16 16', width: 13, height: 13,
        'aria-hidden': true, style: { display: 'block' },
      }, props),
        h('circle', { cx: 4, cy: 4, r: 1.9, fill: 'currentColor' }),
        h('circle', { cx: 12, cy: 4, r: 1.9, fill: 'currentColor' }),
        h('circle', { cx: 4, cy: 12, r: 1.9, fill: 'currentColor' }),
        h('path', { d: 'M4 6v4M12 6c0 3-2 4-4 4', stroke: 'currentColor', strokeWidth: 1.4, fill: 'none' }),
      )
    }

    function ChevronIcon() {
      return h('svg', {
        viewBox: '0 0 16 16', width: 10, height: 10,
        'aria-hidden': true, style: { display: 'block', transform: 'translateY(0.5px)' },
      }, h('path', { d: 'M4 6l4 4 4-4', stroke: 'currentColor', strokeWidth: 1.5, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    const pillStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '1px 8px',
      borderRadius: '999px',
      fontSize: '12px',
      lineHeight: '18px',
      color: 'var(--dsw-alias-label-secondary)',
      background: 'var(--dsw-alias-bg-layer-1)',
      border: '1px solid var(--dsw-alias-border-l1)',
      cursor: 'pointer',
      userSelect: 'none',
      whiteSpace: 'nowrap',
      maxWidth: '260px',
      fontFamily: 'inherit',
    }

    const menuStyle = {
      position: 'absolute',
      top: 'calc(100% + 4px)',
      left: 0,
      minWidth: '180px',
      maxWidth: '300px',
      maxHeight: '260px',
      overflowY: 'auto',
      background: 'var(--dsw-alias-bg-layer-1)',
      border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      padding: '4px',
      zIndex: 1000,
    }

    const itemStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      width: '100%',
      padding: '5px 8px',
      border: 'none',
      background: 'transparent',
      borderRadius: '5px',
      fontSize: '12px',
      lineHeight: '18px',
      color: 'var(--dsw-alias-label-primary, var(--dsw-alias-label-secondary))',
      cursor: 'pointer',
      textAlign: 'left',
      fontFamily: 'inherit',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }

    const backdropStyle = { position: 'fixed', inset: 0, zIndex: 999 }

    function GitBranchPill({ sessionId, inputActions, readHead, listBranches }) {
      const [head, setHead] = useState(null)
      const [branches, setBranches] = useState(null)
      const [open, setOpen] = useState(false)
      const [busy, setBusy] = useState(false)

      useEffect(() => {
        let alive = true
        readHead(sessionId).then((info) => {
          if (alive) setHead(info)
        }).catch(() => {
          if (alive) setHead(null)
        })
        return () => { alive = false }
      }, [sessionId, readHead])

      const toggle = () => {
        const next = !open
        setOpen(next)
        if (next && branches === null) {
          setBusy(true)
          listBranches(sessionId).then((list) => {
            setBranches(list || [])
            setBusy(false)
          }).catch(() => {
            setBranches([])
            setBusy(false)
          })
        }
      }

      const pick = (name) => {
        setOpen(false)
        if (inputActions && typeof inputActions.setDraft === 'function') {
          inputActions.setDraft('git checkout ' + name)
        }
      }

      if (!head || !head.label) return null
      const current = head.label
      const items = (branches || []).length > 0
        ? branches
        : (branches !== null && !busy ? [current] : [])

      return h('span', {
        className: 'cursor-git-branch-pill',
        style: { position: 'relative', display: 'inline-flex' },
        title: 'Current branch: ' + current + ' (click to switch)',
      },
        h('button', {
          type: 'button',
          style: pillStyle,
          onClick: toggle,
          'aria-haspopup': 'listbox',
          'aria-expanded': open,
        }, h(GitBranchIcon), h('span', null, current), h(ChevronIcon)),
        open && h('div', { style: backdropStyle, onClick: () => setOpen(false) }),
        open && h('div', { role: 'listbox', style: menuStyle },
          busy ? h('div', { style: { ...itemStyle, cursor: 'default', color: 'var(--dsw-alias-label-secondary)' } }, 'Loading…')
            : items.length === 0 ? h('div', { style: { ...itemStyle, cursor: 'default', color: 'var(--dsw-alias-label-secondary)' } }, 'No local branches')
              : items.map((name) => h('button', {
                key: name,
                type: 'button',
                role: 'option',
                'aria-selected': name === current,
                style: { ...itemStyle, background: name === current ? 'var(--dsw-alias-bg-layer-2, transparent)' : 'transparent', fontWeight: name === current ? 600 : 400 },
                onClick: () => pick(name),
              }, h('span', { style: { width: 12, display: 'inline-block' } }, name === current ? '✓' : ''), h('span', null, name)))),
      )
    }

    return {
      inject: ['slots', 'remote', 'remote.workspaceFiles'],
      apply(ctx) {
        const remoteOf = () => (ctx.remote && ctx.remote.workspaceFiles) || null

        const readHead = async (sessionId) => {
          const remote = remoteOf()
          if (!remote) return null
          const controller = new AbortController()
          try {
            const result = await remote.read(sessionId, '.git/HEAD', { offset: 1, limit: 1 }, controller.signal)
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
          try {
            const result = await remote.list(sessionId, '.git/refs/heads', controller.signal)
            if (!result || result.ok !== true) return []
            return (result.value && result.value.entries || []).map((e) => e && e.name).filter(Boolean)
          } finally {
            controller.abort()
          }
        }

        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'cursor-git-branch',
          order: 2,
          inject: () => ({ readHead, listBranches }),
        }, GitBranchPill))
      },
    }
  },
})
