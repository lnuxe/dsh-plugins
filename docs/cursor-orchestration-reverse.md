# Cursor 系统工程「触发与编排」逆向分析

> 对象：本机 `/Applications/Cursor.app`（VS Code 分支，无 asar，明文可检索）
> 载体：`extensions/cursor-agent-host/dist/main.js`（12 MB，编排核心）+ `extensions/cursor-mcp/dist/main.js`（1.5 MB，MCP 客户端）
> 结论：Cursor 不是"把 skill/MCP/提示词一股脑塞进上下文"，而是一套 **分节注入 + 门控 + 懒加载 + 事件化编排** 的流水线。本文拆解其触发链，并与 DSH 逐项对比。

---

## 〇、一次 turn 的完整触发链（先看全景）

```
turn 开始
  ├─ 1. rebuildRequestContext()           ← 规则/上下文变化时重建
  │      ├─ always_applied_workspace_rules   (始终应用规则)
  │      ├─ agent_requestable_workspace_rules(可请求规则)
  │      ├─ user_rules                        (用户规则)
  │      ├─ agent_skills                      (getAgentSkills(ctx) 懒加载)
  │      ├─ available_skills                  (只注入 description)
  │      ├─ cloud_instructions / cloud_task_instructions
  │      ├─ open_and_recently_viewed_files
  │      ├─ system_reminder / instructions_update
  │      ├─ mcp_instructions / mcp_file_system
  │      └─ ...  (git_status 等，见 §2.1 完整顺序)
  ├─ 2. 组装系统提示词(systemPrompt 分节)   ← 按固定顺序拼接 + info_complete 流式标志
  ├─ 3. 注入工具集 getToolSet()
  │      └─ MCP 工具按 server + allowlist policy 过滤(§4.2)
  ├─ 4. 模型步进：工具调用 → exec server 路由(§5.4)
  │      ├─ 普通工具：直接执行
  │      ├─ mcp_args：走 MCP client.callTool
  │      └─ subagent_args：派生 subagent
  ├─ 5. hook 事件在关键点触发(§5.1)
  │      PreToolUse / PostToolUse / UserPromptSubmit / Stop / SubagentStop / PreCompact ...
  └─ 6. 上下文逼近阈值 → PreCompact 触发 compaction(§5.3)
```

---

## 一、系统提示词的触发与组装

### 1.1 分节组装（section order 是硬编码的）

`main.js` 里有一段 **context 分节 key 的有序数组**，直接定义了系统提示词每个分节的注入顺序：

```js
[
  "always_applied_workspace_rules",
  "agent_requestable_workspace_rules",
  "user_rules",
  "agent_skills",
  "available_skills",
  "cloud_instructions",
  "cloud_task_instructions",
  "open_and_recently_viewed_files",
  "system_reminder", "system-reminder",
  "instructions_update",
  "mcp_instructions",
  "mcp_file_system",
  // ... 后续还有 git_status / rules 等
]
```

要点：
- **规则在最前**（workspace → user），**skill 居中**（agent_skills → available_skills），**MCP 靠后**（mcp_instructions → mcp_file_system）。
- 每一类都对应一个 `info_complete` 标志（`agent_skills_info_complete`、`mcp_file_system_info_complete`、`git_status_info_complete`），说明这些分节是**渐进/流式**注入的——先出能立刻用的部分，降低首 token 延迟。

### 1.2 变体选择（不是一套提示词走天下）

README 已提取到 **3 个提示词变体**：

| 变体 | 首句 | 用途（据 transport site 推断）|
|------|------|------|
| `AGENT-BASE` | `You are a coding agent in the Cursor IDE...` | 基础 agent（含 auto-attached-state）|
| `AGENTIC-CURSOR` | `You are a powerful agentic AI coding assistant powered by Cursor...` | agentic 模式（含 `<communication>`/`<tool_calling>`/`<search_and_reading>` 等分节）|
| `COMPOSER` | `You are an AI coding assistant, powered by Composer...` | Composer 后端 |

逆向到的选择线索：`Http2TransportCallSite.AGENTIC_COMPOSER` / `BACKGROUND_COMPOSER_PROXY` / `SUBAGENT_COMPOSER_BCID_NAMESPACE`——变体与 **agent 类型 / 传输后端**绑定，而非用户可见的单一开关。

### 1.3 `cloud_instructions` = AGENTS.md（项目级指令，非云端后端）

`cloud_instructions` 分节名像"云端指令"，实际内容是 **AGENTS.md**：

```js
function rne({ cloudRuleContent: e }) {
  return section({
    title: "cloud_instructions",
    description: "Instructions pulled from AGENTS.md",
    children: [p("AGENTS.md contents:"), br, e],
  });
}
```

加载链路（`LocalCursorRulesService` + `CloudRulesService`）：

- `buildIncludeGlobs()` 监听 `["*/**/.cursor/**", "*/**/.agents/**", "*/**/AGENTS.md", "*/**/CLAUDE.md", "*/**/CLAUDE.local.md", ...]`。
- 加载时从 cwd **向上遍历到文件系统根**，每级目录都尝试 `loadRulesFromMarkdownFile(ctx, dir, "AGENTS.md")`，结果合并（最近优先）：
  ```js
  for (;;) {
    s.push(loadRulesFromDirectory(ctx, i));            // .cursor/rules
    n.push("AGENTS.md");                               // + CLAUDE.md/.local 可选
    for (const e of n) s.push(loadRulesFromMarkdownFile(ctx, i, e));
    const l = dirname(i); if (l === i) break; i = l;   // 向上一级
  }
  ```
- `computeGlobalCache()` 里与 cursorRules / codebaseRef / customSubagents **并行**加载 `cloudRule`（`this.cloudRulesService.getCloudRule(ctx)`），最后写入 `RequestContext.cloudRule`。
- 语义区分：`.cursor/rules/*.mdc` → `rules`/`always_applied_workspace_rules`；`AGENTS.md` → 独立 `cloud_instructions` 分节。两者是**不同分节**。

> 对应落地：`cursor-rules` 已把 AGENTS.md 作为独立 `cursor:cloud-instructions` 分节注入（`agentsMd` 开关，从 cwd 向上遍历收集）。

---

## 二、系统 Skill 的触发与门控

### 2.1 frontmatter 门控（`disable-model-invocation` 的真实语义）

`main.js` 里 skill 加载循环的还原：

```js
for (const skill of skills) {
  let disableModelInvocation = false;
  if (skill.content?.includes("disable-model-invocation")) {
    try {
      disableModelInvocation =
        jsYaml.parse(skill.content).data?.["disable-model-invocation"] === true;
    } catch {}
  }
  push({
    fullPath: join(installPath, skill.path),
    content: skill.content,
    disableModelInvocation,                       // proto field: disable_model_invocation
    environments, disabledEnvironments,           // 环境过滤
    scopedTo, git_remote_origin,                  // 作用域 / 来源
  });
}
```

skill 的 proto 字段（可序列化到 agent 执行层）：

```js
{ no:1 name:"full_path" }
{ no:2 name:"description" }
{ no:3 name:"content" }
{ no:4 name:"disable_model_invocation" }
{ no:5 name:"environments"        repeated }
{ no:6 name:"disabled_environments" repeated }
{ no:7 name:"git_remote_origin" }
{ no:8/9/10/11 name:"plugin"/"marketplace"/"plugin_id"/... }
```

→ 结论：`disable-model-invocation: true` 的语义是"**该 skill 不进入模型可自主调用的候选集**（只走斜杠命令）"，与 DSH 的 `invocation.modelInvocable: false` 完全对应（插件 A 已映射）。

### 2.2 注入方式：只注入 description，不注入 content

`available_skills` 分节的渲染：

```js
function renderAvailableSkills(skills) {
  return section({
    title: "available_skills",
    description: "Only use skills listed below.",   // 或 "skills shown in the skills section"
    children: skills.map(s =>
      x({ tag: "agent_skill", fullPath: s.fullPath, children: s.description })
    )
  });
}
```

要点：
- 系统提示词里每个 skill 只放 **`<agent_skill fullPath=...>description</agent_skill>`**。
- **正文 content 不注入**，模型按 description 命中后，再通过 `fullPath` 按需读 `SKILL.md`。
- 这跟 DSH 的 skill catalog（注入 `name + description`，按需 `get()` 读 content）是同一套思想；差异是 Cursor 用 `fullPath` 而 DSH 用 provider 的 `resourceBase + path`。

### 2.3 批量更新与懒获取

- `agent_skills_batch_update`：skill 目录变化后 **4s debounce** 批量刷新（不是每次 turn 重扫）。
- `getAgentSkills(ctx)`：request context 组装时调用，每次 turn **懒加载**当前 skill 集合。

---

## 三、系统 MCP 的触发与路由

### 3.1 懒加载注册

`cursor-mcp/dist/main.js` 的 `SA`（MCP lease）类：

```js
async initializeMcpProviders() {
  const providers = await cursor.getAllMcpProviders();
  // 逐个 registerMcpProvider —— 注册时只建 client 骨架
}

registerMcpProviderToManager(manager, provider) {
  const offerings = async () => {            // listOfferings 首次调用才真正拉取
    if (cached) return cached;
    cached = provider.listOfferings();        // tools/resources/prompts 一起拉
    return cached;
  };
  return {
    getTools: async () => (await offerings()).tools.map(...),
    callTool: async (ctx, name, args, _, meta) =>
      provider.callTool(name, args, { toolCallId: meta.toolCallId, conversationId }),
    listResources / readResource / listPrompts / getPrompt ...
  };
}
```

→ 结论：MCP server **不 eager 启动**，先注册 client 骨架，首次 `getTools`/`callTool` 时才 `listOfferings` 拉清单。

### 3.2 工具级 allowlist 过滤（Cursor 独有，DSH 缺失）

每次取工具集都过 `bA()` 过滤器：

```js
function toolAllowed({ policy, serverIdentifier, toolName, annotations }) {
  if (!policy.enabledServerIds.includes(serverIdentifier)) return false;   // server 级
  const admin = policy.adminToolPolicyByServer?.[serverIdentifier];        // admin 级策略
  const allowlist = policy.toolAllowlistByServer[serverIdentifier];        // 工具 allowlist
  const group = policy.userToolGroupPolicyByServer?.[serverIdentifier];    // 用户组策略
  const key = `${serverIdentifier}|${toolName}`;
  return !policy.userDisabledToolKeys.includes(key);                       // 单工具禁用
}
```

过滤维度：`enabledServerIds`（server 开关）→ `adminToolPolicyByServer`（管理员策略）→ `toolAllowlistByServer`（工具 allowlist）→ `userToolGroupPolicyByServer`（读写分组）→ `userDisabledToolKeys`（单工具禁用）。还有 `mcpAllowlistPrecheckArgs` 预检查。

### 3.3 执行链路

```
模型调 MCP 工具
  → ExecServerMessage.mcp_args
  → MCP client.callTool(ctx, name, args, provider)
  → provider.callTool(name, args, { toolCallId, conversationId })
```

MCP 资源/指令也走独立消息：`listMcpResourcesExecArgs` / `readMcpResourceExecArgs` / `mcpStateExecArgs`，指令注入走 `mcp_instructions` 分节。

---

## 四、编排方式（Orchestration）

### 4.1 Hook 事件系统（10 个生命周期事件点）

`main.js` 里硬编码了事件名 → hook 类型的映射：

```js
const hookEvents = {
  PreToolUse:         "preToolUse",
  PermissionRequest:  null,                 // 不走 hook
  PostToolUse:        "postToolUse",
  UserPromptSubmit:   "beforeSubmitPrompt",
  Stop:               "stop",
  SubagentStop:       "subagentStop",
  SessionStart:       "sessionStart",
  SessionEnd:         "sessionEnd",
  PreCompact:         "preCompact",
  Notification:       null
};
```

→ 这是 Cursor 的 **agent 生命周期 hook**：工具调用前后、用户提交提示词、停止、subagent 结束、会话起止、压缩前，都可插入用户脚本（`hooks.json`，对应 skill `create-hook`）。

### 4.2 Subagent 编排

proto `SubagentStartRequestQuery` / `SubagentStopRequestQuery` 定义了派生/回收协议：

```
SubagentStart: subagent_id, subagent_type, task, parent_conversation_id,
               is_parallel_worker, git_branch, tool_call_id, model_params
SubagentStop:  status, duration_ms, summary, message_count, tool_call_count,
               modified_files, loop_count, task, description
```

要点：subagent 有 `is_parallel_worker`（并行 worker）标志、`git_branch`（可绑分支）、`loop_count`（递归深度）、`modified_files`（回收时上报改动）。响应里还带 `permission`（派生前要授权）。

**模型选择**：`SubagentStart` 的 proto 字段带 `model`（模型名）/ `model_id`（模型 ID）/ `model_params`（repeated 模型参数 message `SR`）——父 agent 派生 subagent 时可指定用哪个模型。DSH 已有对应物：`subagents` service 的 `SubagentStartRequest.agentOptions.model` + `agentRouteDefaults.model`（`subagentModelSelection` service），无需新建。

### 4.3 Compaction 触发

`PreCompactRequestQuery`：`trigger`（触发原因）、`context_usage_percent`、`context_tokens`、`context_window_size`、`message_count`、`messages_to_compact`、`is_first_compaction`。

→ 压缩是**数据驱动**的：上下文占用率 + token 数 + 消息数共同决定是否压缩、压缩哪些消息。

### 4.4 Exec server（执行后端）

`ExecServerMessage` 的 oneof case 就是"agent 能触发什么"的完整枚举：

```
shell_args / shell_stream_args / write_args / delete_args / grep_args / read_args / ls_args
mcp_args / list_mcp_resources_exec_args / read_mcp_resource_exec_args / mcp_state_exec_args
fetch_args / subagent_args / subagent_await_args / force_background_subagent_args
execute_hook_args / canvas_diagnostics_args / record_screen_args / computer_use_args
git_diff_request / conversation_search_args ...
```

要点：shell、文件读写、MCP、fetch、subagent、hook、canvas、computer-use **统一走 exec server 消息路由**，主 agent 进程不直接执行，而是发消息给执行后端（`move_exec` daemon 本地 loop 或 backend NAL）。

### 4.5 Request context 重建

`rebuildRequestContextOnRulesChange`：规则变化会触发 `rebuildGlobalCache()` + 重建 request context，把最新 rules/skills 反映到下一次 turn。

### 4.6 根编排 agent（orchestrator 模式）

`main.js` 里有多组 orchestration 分节，构成"根编排 agent"（root orchestrator）的完整人格：

**`parent_orchestrator_overview`**（root orchestrator）：
- "You are a root orchestrator agent... Manage a fleet of coding agents and delegate all project work through your agent orchestration tools instead of doing the work directly yourself."
- 优先并行；只有依赖时才等；不过度并行（单步/小任务用单个 subagent）。
- 编排工具：`CREATE_TASK`（启动异步子 agent）+ `SEND_TO_TASK`（继续/中断已有 agent）；子 agent 完成通过 `<agent_notification>` 标签回传。
- 不把编排级指令下发给 subagent，避免混淆。

**`execution_model`**：两种输入——用户消息（`<user_query>` 标签）vs 自动 subagent 通知（`<agent_notification>` 标签）；先判断"直接回答 vs 委派"。

**`project_mode`**：长程 planner/orchestrator——"convert user intent into a correct, high-quality implementation by delegating work to subagents and coordinating them safely over long horizons"，且"Assume chat context may be condensed/truncated at any time; externalize durable state"。

**`hard_constraints`**：Orchestrate don't execute（不直接改文件）、Task-first（默认 subagent）、Clarify before acting、Phase-gated workflow（Clarify→Research→Plan→User Review→Implement→Review→Iterate→Finalize）、Safe parallelism（写作用域互斥）、Durable state（progress.md）、High engineering bar（Probe→Fix→Purge）。

**`progress_md_protocol` + `scratchpad`**：`progress.md`（`<ABS_CONVERSATION_NOTES_FOLDER>/progress.md`）是 canonical source of truth；**Single-writer rule**（只一个 Scribe subagent 写）；Scribe 与其它 subagent 同 wave 并行。

**`swarm_overview`**（Grind，多级并行）：Orchestrator → Planner（探索/委派）→ Worker（实现/提交）+ Sub-planner（细分委派）；每个 agent 隔离 git clone，Worker push 到共享分支走 rebase。

> 对应落地：`cursor-orchestrator` bundle 把 parent_orchestrator_overview / project_mode / hard_constraints / progress_md_protocol 做成 DSH 的 `cursor-orchestrator` preset（工具映射 CREATE_TASK→subagent、SEND_TO_TASK→send_message、AskQuestion→ask_user_question）。

---

## 五、与 DSH 的差异对比

| 维度 | Cursor | DSH | 差异 |
|------|--------|-----|------|
| 提示词组装 | 分节硬编码数组 + `info_complete` 流式注入 | `systemPrompt` service：`section`/`context`/`variable`/`assemble`，`getSectionOrder` 排序 | DSH 是**可插拔服务**，Cursor 是**内置数组**；Cursor 有流式注入优化 |
| 提示词变体 | AGENT-BASE / AGENTIC-CURSOR / COMPOSER 绑传输后端 | `agentPresets`（prefix/suffix），多 preset 可切换 | DSH 的 preset 更"用户可组合"，Cursor 的变体更"后端决定" |
| skill 注入 | 只注入 description（`agent_skill` 标签），按 `fullPath` 读 content | catalog 注入 name+description，按需 `get()` 读 content | 思想一致；DSH 多了 `whenToUse` 字段，Cursor 多了 `environments`/`disabled-environments`/`scopedTo` |
| skill 门控 | `disable-model-invocation`（YAML 解析）| `invocation.modelInvocable: false` | **已映射**（插件 A）|
| skill 更新 | 目录变化 4s debounce 批量刷新 | `list()` 每次读 manifest（插件 A）| DSH 更即时，Cursor 有防抖 |
| MCP 注册 | 懒加载 `listOfferings`（骨架先建）| `dsh-mcp-client` 每 server 一行，工具注册为 `mcp__<s>__<t>` | DSH 是静态声明 + 工具平铺，Cursor 是运行时懒加载 |
| MCP 过滤 | **工具级 allowlist + 用户组策略 + 单工具禁用** | 整 server 注册，无 MCP 专属工具级过滤（有通用 `tools.restrict`）| **Cursor 显著更细**，DSH 可借鉴 |
| 生命周期 hook | PreToolUse/PostToolUse/UserPromptSubmit/Stop/SubagentStop/PreCompact 等 | `Event` service（`ctx.on`），无 agent 生命周期 hook 的成熟形态 | **DSH 缺失**，高价值可移植 |
| subagent | `is_parallel_worker`/`git_branch`/`loop_count`/`modified_files` | `subagent`/`subagent_fork` + continuable | DSH 的 fork 继承上下文更优雅；Cursor 的回收上报更结构化 |
| compaction | 数据驱动（占用率+token+消息数）+ `is_first_compaction` | `compaction` service（`compactIfNeeded`/`compactNow`）| 触发模型相近 |
| 执行后端 | exec server 统一消息路由（shell/mcp/subagent/hook 都发消息）| 工具各自直接执行（bash/subagent 独立工具）| Cursor 是"瘦主进程 + 厚执行后端"，DSH 是"胖主进程" |

---

## 六、高价值可借鉴清单（可落地到 DSH）

按"价值 × 落地成本"排序：

1. **MCP 工具级 allowlist**（价值最高）
   Cursor 的 `enabledServerIds → toolAllowlistByServer → userDisabledToolKeys` 三级过滤，DSH 目前只有整 server 开关。可做一个 `mcp-tool-policy` 插件：拦截 `ctx.tools.register`，对 `mcp__<server>__<tool>` 命名的工具套用 allowlist。

2. **Agent 生命周期 hook 事件**（价值高，成本中）
   Cursor 的 10 个事件点（PreToolUse/PostToolUse/Stop/SubagentStop/PreCompact...）在 DSH 没有成熟对应物。可做 `dsh-agent-hooks`：在 `tools.execute` 包装器 + `goals`/`compaction` service 上发事件，让用户挂脚本。

3. **skill 的 `environments` / `disabled-environments` 字段**
   Cursor skill 用 `environments`（可用环境）和 `disabled-environments`（禁用环境）做环境过滤（注意：`alwaysApply` 并非真实 frontmatter 字段，属先前误判）。DSH 的 skill candidate 目前只有 `whenToUse`/`invocation`。已扩展 manifest，把这两个字段透传进 `SkillCandidate.metadata`（插件 A），供 DSH 侧按环境决定是否注入。

4. **流式上下文注入（info_complete 标志）**
   Cursor 的分节 `info_complete` 允许渐进注入、降低首 token 延迟。DSH 的 `systemPrompt.assemble` 是一次性。可作为性能优化方向（非本次交付）。

5. **subagent 的结构化回收上报**
   Cursor 的 `SubagentStopRequest`（`modified_files`/`loop_count`/`summary`）比 DSH 的纯文本返回更利于父 agent 消化。可增强 DSH subagent 的返回结构。

---

## 七、交付物映射

| 本文档结论 | 已落地插件 | 状态 |
|-----------|-----------|------|
| skill 门控 `disable-model-invocation` | 插件 A `cursor-skills`（`modelInvocable:false`）| ✅ 已交付 |
| skill description 注入 + 按需加载 | 插件 A（`registerProvider` + `resourceBase`）| ✅ 已交付 |
| MCP 懒加载 + 工具注册 | 插件 B `cursor-mcp`（8 server → 144 工具）| ✅ 已交付 |
| 提示词变体移植 | 插件 C `cursor-persona`（preset `cursor`）| ✅ 已交付 |
| skill/目录/goal 可观测 | 插件 D `cursor-telemetry` | ✅ 已交付 |
| MCP 工具级 allowlist / hook 事件 / environments 元数据 | 插件 E `cursor-mcp-policy` + 插件 F `cursor-hooks` + 插件 A metadata | ✅ 已交付 |
| rules（`.cursor/rules/*.mdc` → 分节） | 插件 G `cursor-rules` | ✅ 已交付 |
| `cloud_instructions`（AGENTS.md → 分节） | 插件 G `cursor-rules`（`agentsMd` 开关） | ✅ 已交付 |
| 根编排 agent（parent_orchestrator_overview / project_mode / hard_constraints / progress_md_protocol） | 插件 H `cursor-orchestrator`（preset `cursor-orchestrator`） | ✅ 已交付 |

---

## 附：关键代码锚点

- 编排核心：`extensions/cursor-agent-host/dist/main.js`（12 MB）— `KOe`（activate）、`createAgentHostExec`、exec server 消息枚举。
- 提示词分节数组：`main.js` 内 `["always_applied_workspace_rules", ...]` 有序数组。
- skill 门控：`main.js` 内 `for (const l of t.skills) { ... jsYaml.parse(l.content)["disable-model-invocation"] === true ... }`。
- skill 渲染：`main.js` 内 `function Rte(e){ return e.map(e=>wK("x",{tag:"agent_skill",fullPath:e.fullPath,children:e.description...}))}`。
- MCP 过滤：`extensions/cursor-mcp/dist/main.js` 内 `function bA({policy,serverIdentifier,toolName,annotations})`。
- MCP 懒加载：`cursor-mcp` 内 `registerMcpProviderToManager`（`listOfferings` 缓存）。
- hook 事件：`main.js` 内 `pA={PreToolUse:"preToolUse", ..., PreCompact:"preCompact"}`。
