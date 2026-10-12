// observability for the DeepSeek Harness.
// Zero-dependency, in-memory counters: which skills the model actually loads
// (both the 'skill' tool and user-explicit /name invocation funnel through
// ctx.skills.get), how often the skill catalog invalidates, and goal lifecycle
// changes. Exposed as ctx.dshTelemetry for other plugins / the web UI.

function createTelemetry() {
  const state = {
    startedAt: Date.now(),
    skillLoads: new Map(),      // name -> count
    skillProviders: new Map(),  // name -> provider
    skillCatalogChanges: 0,
    goalChangeCount: 0,
    goalChanges: [],            // ring buffer of { operation, ref, at }
  }
  const MAX_GOAL_EVENTS = 64

  return {
    recordSkillLoad(name, provider) {
      state.skillLoads.set(name, (state.skillLoads.get(name) ?? 0) + 1)
      if (provider) state.skillProviders.set(name, provider)
    },
    recordSkillCatalogChange() {
      state.skillCatalogChanges += 1
    },
    recordGoalChange(operation, ref) {
      state.goalChangeCount += 1
      state.goalChanges.push({ operation, ref, at: Date.now() })
      if (state.goalChanges.length > MAX_GOAL_EVENTS) state.goalChanges.shift()
    },
    stats() {
      const byCount = [...state.skillLoads.entries()].sort((a, b) => b[1] - a[1])
      return {
        startedAt: state.startedAt,
        skillLoads: Object.fromEntries(byCount),
        skillProviders: Object.fromEntries(state.skillProviders),
        skillCatalogChanges: state.skillCatalogChanges,
        goalChangeCount: state.goalChangeCount,
        recentGoalChanges: [...state.goalChanges],
      }
    },
    reset() {
      state.skillLoads.clear()
      state.skillProviders.clear()
      state.skillCatalogChanges = 0
      state.goalChangeCount = 0
      state.goalChanges.length = 0
      state.startedAt = Date.now()
    },
  }
}

export const name = 'dsh-telemetry'
export const inject = ['skills']

export function apply(ctx) {
  const telemetry = createTelemetry()

  // Publish the stats handle for consumers (web UI, other plugins).
  try {
    ctx.dshTelemetry = telemetry
  } catch {
    // ctx may not accept ad-hoc properties; stats remain reachable via logger.
  }

  // 1) Skill loads: wrap the registry get() — the single choke point shared by
  //    the 'skill' tool and user-explicit /name invocation. Restore on dispose.
  const registry = ctx.skills
  const hadOwnGet = Object.prototype.hasOwnProperty.call(registry, 'get')
  const originalGet = registry.get.bind(registry)
  registry.get = async (name, options) => {
    const def = await originalGet(name, options)
    if (def) telemetry.recordSkillLoad(def.name, def.provider)
    return def
  }

  // 2) Skill catalog invalidation.
  const offSkillsChange = ctx.on('skills/change', () => {
    telemetry.recordSkillCatalogChange()
  })

  // 3) Goal lifecycle. goal/changed is scope-filtered; a host-layer listener
  //    observes every agent's goal mutations. Guarded for assemblies where the
  //    goal package is not installed.
  let offGoalChange = () => {}
  try {
    offGoalChange = ctx.on('goal/changed', ({ change }) => {
      if (change) telemetry.recordGoalChange(change.operation, change.ref)
    })
  } catch {
    // goal event not registered in this assembly — no-op.
  }

  // Expose the summary once at startup so the harness log has a baseline.
  ctx.logger?.debug('[dsh-telemetry] armed: skill loads + catalog changes + goal lifecycle')

  return () => {
    if (hadOwnGet) registry.get = originalGet
    else delete registry.get
    offSkillsChange()
    offGoalChange()
    if (ctx.dshTelemetry === telemetry) {
      try { delete ctx.dshTelemetry } catch { /* noop */ }
    }
  }
}
