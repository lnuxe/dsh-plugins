# Changelog

本仓库遵循语义化版本（SemVer）。四个 bundle 插件各自维护版本号，仓库级 tag 对齐 cursor-persona 的主版本号。

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
