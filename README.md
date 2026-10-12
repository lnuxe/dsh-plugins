# DeepSeek Harness 插件集合（dsh-plugins）

一组自托管的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）bundle 插件与 agent 预设，覆盖 agent 技能、移动测试 MCP、系统提示词、可观测性、MCP 工具过滤、生命周期 hook、工作区规则、根编排、浏览器自动化与 git 分支指示器等能力。

所有插件均为零外部依赖的本地 bundle（`@local/*`），通过 `cordis.patch.yml` 挂载到 DSH 的 web profile。

## 插件清单

| # | 插件 | 路径 | 能力 |
|---|------|------|------|
| A | `@local/dsh-skills` | `dsh-skills/` | 26 个内置 agent skill（canvas / review / goal / loop / visualize 等） |
| B | `@local/dsh-mcp-mobile` | `dsh-mcp-mobile/` | 移动测试 MCP（mobile-mcp / appium / wdio / adb / dart / perfdog） |
| C | `@local/dsh-persona` | `dsh-persona/` | `agent` 系统提示词 preset |
| D | `@local/dsh-telemetry` | `dsh-telemetry/` | skill / goal 可观测性统计 |
| E | `@local/dsh-mcp-policy` | `dsh-mcp-policy/` | MCP 工具级过滤（server 开关 / allowlist / denyTools） |
| F | `@local/dsh-hooks` | `dsh-hooks/` | 生命周期 hook（PreToolUse veto 门 + 7 事件桥接） |
| G | `@local/dsh-rules` | `dsh-rules/` | 工作区规则（`.cursor/rules/*.mdc` + `AGENTS.md`） |
| H | `@local/dsh-orchestrator` | `dsh-orchestrator/` | 根编排 agent preset |
| I | `@local/dsh-automation` | `dsh-automation/` | 浏览器 / 电脑操作自动化 preset |
| J | `@local/dsh-git-branch` | `dsh-git-branch/` | composer git 分支指示器 + 切换器 |

---

## 插件说明

### A — `@local/dsh-skills`（内置 agent skill provider）

把 26 个常用 agent skill（`automate`、`autopilot`、`canvas`、`create-hook`、`create-rule`、`create-skill`、`create-subagent`、`goal`、`loop`、`migrate-to-skills`、`new-repo`、`onboard`、`origin`、`rename-chat`、`review`、`review-bugbot`、`review-security`、`sdk`、`share`、`shell`、`split-to-prs`、`statusline`、`update-cli-config`、`update-cursor-settings`、`visualize`、`dsh-orchestrator`）打包为 DSH 的 bundled skill provider。

- `index.js` 零外部依赖（`node:fs/promises`、`node:url`），`rank = 600`（对齐 `BUNDLED_SKILL_RANK`）。
- 注册在 host 全局层（`ctx.skills`），所有 preset 可见。
- skill 正文里引用的上游专属工具/命令会在加载时前置一段「DSH 工具适配」说明，映射到 DSH 等价物（见 `dshtool-map.json`）。

### B — `@local/dsh-mcp-mobile`（移动测试 MCP preset）

把移动端测试常用的 MCP server 收敛到一个 `mobile-test` preset，避免日常会话为这些工具 schema 付出 token 成本：

| server | transport | 命令 / 地址 |
|--------|-----------|-------------|
| mobile-mcp | stdio | `npx -y @mobilenext/mobile-mcp@latest` |
| appium-mcp | stdio | `npx appium-mcp@latest` |
| wdio-mcp | stdio | `npx -y @wdio/mcp` |
| adb-mcp | stdio | `npx -y @landicefu/android-adb-mcp-server` |
| dart | stdio | `dart mcp-server --experimental-mcp-server --force-roots-fallback` |
| perfdog-mcp-tools | streamable-http | `https://perfdog.qq.com/mcp` |

HTTP 密钥在加载时通过 `!!js` + `process.getBuiltinModule('fs')` 运行时读取，不落盘到插件。

### C — `@local/dsh-persona`（`agent` 系统提示词 preset）

新增可选 `agent` preset（order 20），提供一套 agentic 编码系统提示词（`<communication>` / `<tool_calling>` / `<search_and_reading>` / `<making_code_changes>` / `<maximize_parallel_tool_calls>` / `<task_management>` / `<citing_code>` / `<orchestration>` 等分节），工具集与 standard 对齐。

### D — `@local/dsh-telemetry`（可观测性）

零依赖内存态统计，包装 `ctx.skills.get` 记录 skill 触发次数，监听 `skills/change` 与 `goal/changed`。句柄 `ctx.dshTelemetry` 提供 `.stats()` / `.reset()`。

### E — `@local/dsh-mcp-policy`（MCP 工具级过滤）

三级过滤：`enabledServers`（整 server 开关）→ `toolAllowlist`（per-server 白名单）→ `denyTools`（单工具禁用）。用 plain-context `tools.guard` 做全局守卫，被禁工具调用时返回 deny 原因。

### F — `@local/dsh-hooks`（生命周期 hook）

把 7 个生命周期事件桥接到用户 shell 命令：`PreToolUse→tools/pre-execute`、`PostToolUse→tools/result`、`UserPromptSubmit→agent/inbox/inserted`、`Stop→agent/turn-stopping`、`SubagentStop→subagent/end`、`SessionStart→agent/created`、`SessionEnd→agent/disposed`。

`PreToolUse` 为 veto 门：exit code 2 或 stdout `{"permissionDecision":"deny"}` 阻止工具派发。

### G — `@local/dsh-rules`（工作区规则 + AGENTS.md）

读取 `.cursor/rules/*.mdc`（YAML frontmatter `description` / `globs` / `alwaysApply`）：

- `alwaysApply: true` 的规则注入 `<always_applied_workspace_rules>` 分节（order 400）。
- `globs` 规则按 name+description+glob 广告（agent 按需读文件）。
- 额外从 cwd 向上遍历收集 `AGENTS.md`，注入独立 `cloud_instructions` 分节（order 405）。

### H — `@local/dsh-orchestrator`（根编排 agent preset）

新增 `dsh-orchestrator` preset（order 30）：plan → delegate subagents → `progress.md` 持久状态 → 安全并行。工具映射 `CREATE_TASK` → `subagent`/`subagent_fork`、`SEND_TO_TASK` → `send_message`、`AskQuestion` → `ask_user_question`。

### I — `@local/dsh-automation`（浏览器 / 电脑操作自动化 preset）

新增 `automation` preset，挂载 Playwright 与 computer-use MCP，让 agent 具备浏览器操作与屏幕控制能力，工具集独立于日常编码会话。

### J — `@local/dsh-git-branch`（composer git 分支指示器）

在 composer dock 渲染当前 git 分支 pill，点击弹出 Local / Remote 分支选择器：

- host 半 `git_branch` 工具用 `git for-each-ref` 列出本地 + 远程分支。
- client 半读 `.git/HEAD` + `workspaceFiles`，支持 submodule / worktree（`.git` 为 `gitdir:` 文件时解析真实 git 目录）。
- 选中分支后把 `git checkout` 草稿写入 composer，人工确认后执行。

---

## 安装

各 bundle 通过 `plugin_manager install_bundle` 装进目标 profile（`link:` 到本仓库目录），或直接把 `cordis.patch.yml` 的 `insert` 片段并入你的 composition：

```yaml
- insert:
    - id: dsh-skills
      name: '@local/dsh-skills'
    - id: dsh-git-branch
      name: '@local/dsh-git-branch'
```

> 改 `index.js` 模块不会热更新（HMR 只 watch `cordis.patch.yml`），需重启 dsh 才重新加载。

## 文档

| 文档 | 内容 |
|------|------|
| [docs/why-dsh-is-smooth.md](docs/why-dsh-is-smooth.md) | 工程实践调研：系统提示词分节 / skill 检索 / MCP 自动发现 / 上下文注入 / 长任务编排 |
| [docs/orchestration.md](docs/orchestration.md) | 触发与编排分析：一次 turn 的触发链、skill 门控、MCP 过滤、hook 事件、subagent 编排 |
| [docs/canvas-sdk.md](docs/canvas-sdk.md) | Canvas SDK + 编译渲染分析 |

## License

[MIT](LICENSE)
