# Changelog

本仓库遵循语义化版本（SemVer）。三个 bundle 插件各自维护版本号，仓库级 tag 对齐 cursor-persona 的主版本号。

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
