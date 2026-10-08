# Changelog

本仓库遵循语义化版本（SemVer）。四个 bundle 插件各自维护版本号，仓库级 tag 对齐 cursor-persona 的主版本号。

## [1.4.0] - 2026-10-08

### Added
- `cursor-mcp-policy` 插件（新 bundle E）：Cursor 三级 MCP 过滤的 DSH 移植——`enabledServers`（server 开关）+ `toolAllowlist`（per-server 工具白名单）+ `denyTools`（单工具禁用）。DSH 无 context-global `tools.restrict`（会遮蔽所有 agent），改用 plain-context `tools.guard`（全局守卫，被禁工具调用时返回 deny 原因）。
- `cursor-hooks` 插件（新 bundle F）：Cursor 生命周期 hook 的 DSH 移植——把 7 个 Cursor hook 事件桥接到 DSH 事件（PreToolUse→`tools/pre-execute`、PostToolUse→`tools/result`、UserPromptSubmit→`agent/inbox/inserted`、Stop→`agent/turn-stopping`、SubagentStop→`subagent/end`、SessionStart→`agent/created`、SessionEnd→`agent/disposed`）；用户 shell 命令经 stdin 收 JSON payload（fire-and-forget，第一版观察模式不 veto）。
- cursor-skills 增强：manifest 增补 `environments`/`disabled-environments` 并透传进 `SkillCandidate.metadata`（`entryMetadata`）。

### Fixed
- `docs/cursor-orchestration-reverse.md` §六：纠正 `alwaysApply` 误判——Cursor skill 的真实 frontmatter 字段是 `environments`/`disabled-environments`，`alwaysApply` 并非真实字段。

### Changed
- 全部本地 bundle 的 package `name` 统一为 `@local/<id>`（与 `cordis.patch.yml` 的 row `name` 一致），修复 `@local/cursor-telemetry` 等模块的 `failed to import`。

## [1.3.0] - 2026-10-08

### Added
- `docs/cursor-orchestration-reverse.md`：Cursor 系统工程「触发与编排」深度逆向——一次 turn 的完整触发链、系统提示词分节组装（含 `info_complete` 流式注入）与变体选择、skill 门控（`disable-model-invocation` / `alwaysApply` / `environments`）、MCP 懒加载 + 工具级 allowlist 过滤、hook 事件系统（10 个生命周期事件点）、subagent/compaction/exec-server 编排协议，以及与 DSH 的逐项差异对比 + 可借鉴清单。

### Changed
- `README.md`：新增「触发与编排逆向」报告入口。

## [1.2.0] - 2026-10-08

### Added
- `cursor-orchestrator` skill：Cursor Project Agent Mode 的忠实移植（`progress.md` 持久便签、编排者只编排不实现、写作用域互斥、阶段门控、高工程标准），映射到 DSH 的 create_goal / subagent / subagent_fork / todo_write / ask_user_question。
- `cursor-telemetry` 插件（新 bundle）：零依赖内存态可观测性，包装 `ctx.skills.get` 记录 skill 触发次数，监听 `skills/change` 与 `goal/changed`，句柄 `ctx.cursorTelemetry`（`.stats()` / `.reset()`）。
- `cursor-persona` 新增 `<orchestration>` 分节，指向 cursor-orchestrator skill。

### Changed
- cursor-skills 27 个 skill（新增 cursor-orchestrator）；README 增补插件 D 与验证项；文档中 bundle 数量、skill 数量同步更新。

## [1.1.0] - 2026-10-08

### Added
- `docs/why-cursor-is-smooth.md`：Cursor 逆向的方法论调研报告（系统提示词分节、skill 检索、MCP 自动发现、上下文注入、长任务编排，及可借鉴清单）。
- `cursor-persona` 系统提示词补全到高保真：新增 `<task_management>`、`<citing_code>`、`<calling_external_apis>`、`<parameter_discipline>` 分节；`<communication>` 补入 "lead with the answer" 沟通纪律与"最终消息独立成文"要求；`<maximize_parallel_tool_calls>` 补全文。
- `CHANGELOG.md` 与 `LICENSE`（MIT）。

### Changed
- `README.md`：新增"为什么顺滑"调研报告入口；修正扩展目录数量（117 个，原文误写 119）；标注 persona 已补全的提示词分节。

## [1.0.0] - 2026-10-08

### Added
- `cursor-skills`：26 个 Cursor 内置 skill 的 DSH skill provider + manifest + 工具映射（`dshtool-map.json`）。
- `cursor-mcp`：8 个 Cursor MCP server 的 DSH mcp-client 行（stdio + streamable-http，HTTP 密钥运行时读取）。
- `cursor-persona`：可选的新 `cursor` agent preset（Cursor 系统提示词 + 标准工具集）。
- `README.md`：逆向结论与 DSH 集成映射文档。
