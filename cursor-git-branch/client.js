/**
 * Client half — Cursor-style git branch pill in the composer dock (v4).
 *
 * Reverse-engineered from Cursor's `agent-panel-checkout-branch-pill`. Shows the
 * session workspace's CURRENT branch; clicking opens a local-branch switcher.
 * Data comes from the shipped `workspaceFiles` Remote:
 *   - `.git/HEAD`        -> current branch label
 *   - `.git/refs/heads`  -> local branch list
 * Picking a branch hands `git checkout <branch>` to the composer via `inputActions`.
 *
 * Popup mirrors ui-chat's DialogPill: createPortal to document.body with a
 * position that flips up when there is no room below (the composer sits at the
 * bottom edge, so downward-only menus are pushed off-viewport).
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
      position: 'fixed', minWidth: 200, maxWidth: 300, maxHeight: 260, overflowY: 'auto',
      background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)',
      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 4, zIndex: 10000,
    }

    const mutedStyle = { padding: '6px 8px', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }

    function branchItem(name, current, onPick) {
      const isCurrent = name === current
      return h('button', {
        key: name, type: 'button', role: 'option', 'aria-selected': isCurrent,
        style: {
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          padding: '5px 8px', border: 'none', borderRadius: 5,
          background: isCurrent ? 'var(--dsw-alias-bg-layer-2, transparent)' : 'transparent',
          fontSize: 12, lineHeight: '18px', cursor: 'pointer', textAlign: 'left',
          color: 'var(--dsw-alias-label-primary, var(--dsw-alias-label-secondary))',
          fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        },
        onClick: () => onPick(name),
      },
        h('span', { style: { width: 12, display: 'inline-block' } }, isCurrent ? '✓' : ''),
        h('span', null, name),
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
            const count = (branches && branches.length) || 1
            const estH = Math.min(260, count * 28 + 12)
            let top = rect.bottom + 4
            if (top + estH > vh - 8) top = rect.top - estH - 4
            if (top < 8) top = 8
            let left = rect.left
            if (left + 220 > vw - 8) left = Math.max(8, vw - 228)
            setPos({ top, left })
          } else {
            setPos({ top: 120, left: 40 })
          }
          if (branches === null) {
            setBusy(true)
            listBranches(sessionId).then((list) => { setBranches(list || []); setBusy(false) })
              .catch(() => { setBranches([]); setBusy(false) })
          }
        }
        setOpen(next)
      }

      const pick = (name) => {
        setOpen(false)
        if (name && inputActions && typeof inputActions.setDraft === 'function') {
          inputActions.setDraft('git checkout ' + name)
        }
      }

      if (!branch) return null
      const items = (branches || []).length > 0 ? branches : (branches !== null && !busy ? [branch] : [])

      const menuContent = busy
        ? h('div', { style: mutedStyle }, 'Loading…')
        : h('div', null,
          items.length === 0
            ? h('div', { style: mutedStyle }, 'No local branches')
            : items.map((name) => branchItem(name, branch, pick)),
        )

      const menu = open && pos && createPortal(
        h('div', { ref: panelRef, role: 'listbox', style: { ...menuStyle, top: pos.top, left: pos.left } }, menuContent),
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
          name: 'conversation.composer.dock', id: 'cursor-git-branch', order: 2,
          inject: () => ({ readHead, listBranches }),
        }, GitBranchPill))
      },
    }
  },
})
