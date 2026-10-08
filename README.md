# Cursor → DeepSeek Harness 逆向与插件集成

把本机 `/Applications/Cursor.app` 的「系统工程」逆向出来，映射到 DeepSeek Harness (DSH)，并做成三个可安装的 DSH bundle 插件：

| # | 交付物 | 路径 | 对应 Cursor 组件 |
|---|--------|------|------------------|
| A | `@local/cursor-skills` | `cursor-skills/` | `~/.cursor/skills-cursor/`（26 个内置 skill） |
| B | `@local/cursor-mcp` | `cursor-mcp/` | `~/.cursor/mcp.json`（8 个 MCP server） |
| C | `@local/cursor-persona` | `cursor-persona/` | Cursor 系统提示词（`cursor-agent-host` 内嵌） |
| D | `@local/cursor-telemetry` | `cursor-telemetry/` | Cursor 可观测性（skill 触发 / 目录变更 / goal 生命周期） |

---

## 〇、为什么 Cursor 跑得顺（方法论调研）

> 本仓库另附一篇方法论调研报告，回答"顺滑"背后的工程决策（系统提示词分节 / skill 检索 / MCP 自动发现 / 上下文注入 / 长任务编排），并给出可借鉴清单：
> 见 [docs/why-cursor-is-smooth.md](docs/why-cursor-is-smooth.md)。
>
> 以及一篇**触发与编排逆向**报告，拆解 MCP / skill / 系统提示词的具体触发条件与编排协议，并与 DSH 逐项对比（含可落地的差异清单）：
> 见 [docs/cursor-orchestration-reverse.md](docs/cursor-orchestration-reverse.md)。

---

## 一、逆向结论

### 1. Cursor 应用结构

`/Applications/Cursor.app/Contents/Resources/app/` 是一个 **VS Code 分支**：

- `out/main.js`（约 2.5 MB）— 主进程入口（minified）。
- `extensions/` — 117 个内置扩展；其中 `cursor-agent-host`（约 12 MB）承载 agent 运行时与系统提示词；`cursor-mcp` 承载 MCP 客户端（用 `@modelcontextprotocol/sdk` 1.25.1）。
- `product.json` — 产品配置（本机 `aiConfig` 仅 `{ ariaKey: "control-key" }`）。
- 应用**没有 asar 打包**（`app.asar` 不存在、`node_modules.asar` 是 28 字节占位），直接是明文 `out/` + `extensions/`，所以可直接字符串检索。

### 2. 系统提示词

提示词在 `extensions/cursor-agent-host/dist/main.js` 中，用类似 JSX 的 `wK("section"/"p"/"h2"/...)` 辅助函数 + 模板字面量拼装。共提取到 **3 个变体**：

1. **AGENT-BASE** — `You are a coding agent in the Cursor IDE that helps the USER with software engineering tasks.`（含 auto-attached-state 提示）
2. **AGENTIC-CURSOR** — `You are a powerful agentic AI coding assistant powered by Cursor. ... You operate exclusively in Cursor...`（含 `<communication>` / `<tool_calling>` / `<search_and_reading>` / `<making_code_changes>` / `<maximize_parallel_tool_calls>` / `<no_reverts>` / `tone_and_style` 等分节）
3. **COMPOSER** — `You are an AI coding assistant, powered by Composer. ... You are pair programming with a USER...`

另含大量 subagent/侧边栏/调试/摘要压缩子提示词。**核心行为指令**（已忠实移植到插件 C 的 persona prefix）：

- 不向用户提及工具名（说「我来改文件」而非「我用 edit 工具」）
- 只在必要时调用工具；能直接答就直接答
- 不确定就先读/搜/问，倾向自己找答案而非麻烦用户
- 改代码用编辑工具而非输出代码块；编辑前先读文件；修掉自己引入的 lint 错误
- 无依赖的工具调用并行发起；禁止用占位符猜参数
- 不擅自回退用户改动；用户换话题则当作新任务

> 注：v1.1.0 起 persona prefix 已补全到高保真——在原有基础上新增 `<task_management>`、`<citing_code>`、`<calling_external_apis>`、`<parameter_discipline>` 分节，并把 `<communication>` 扩为含 "lead with the answer" 的完整版；`citing_code` 的 `startLine:endLine:filepath` 格式按 DSH 惯例映射为 markdown 链接带行号（`path#L24-L30`）。

### 3. 系统 Skill

`~/.cursor/skills-cursor/` 共 **27 个内置 skill**，每个是一个 `<name>/SKILL.md`：

- YAML frontmatter：`name`、`description`（常用 `>-` 折叠块标量）、可选 `disable-model-invocation`。
- `disable-model-invocation: true` 表示只能走斜杠命令（`/goal`、`/review` 等），不被模型自主调用。
- 少数 skill 带附属资源：`canvas/sdk/*.d.ts`、`visualize/references/*.md`。
- 清单文件：`.cursor-managed-skills-manifest.json`（`builtinSkillIds` + `managedSkillIds`）、`.sync-manifest.json`。

27 个 skill：automate、autopilot、canvas、create-hook、create-rule、create-skill、create-subagent、cursor-orchestrator、deploy-with-vercel、goal、loop、migrate-to-skills、new-repo、onboard、origin、rename-chat、review、review-bugbot、review-security、sdk、share、shell、split-to-prs、statusline、update-cli-config、update-cursor-settings、visualize。

其中 `disable-model-invocation: true` 的有 8 个：create-subagent、deploy-with-vercel、goal、migrate-to-skills、onboard、rename-chat、review、shell。

### 4. 系统 MCP

`~/.cursor/mcp.json` 共 **8 个 MCP server**：

| server | transport | 命令 / 地址 | 备注 |
|--------|-----------|-------------|------|
| dart | stdio | `dart mcp-server --experimental-mcp-server --force-roots-fallback` | |
| Mobile MCP | stdio | `npx -y @mobilenext/mobile-mcp@latest` | serverName 改为 `mobile-mcp` |
| wdio-mcp | stdio | `npx -y @wdio/mcp` | env: APPIUM_URL / APPIUM_URL_PORT |
| appium-mcp | stdio | `npx appium-mcp@latest` | env: ANDROID_HOME |
| adb-mcp | stdio | `npx -y @landicefu/android-adb-mcp-server` | |
| android-mcp | stdio | `uvx android-mcp` | 依赖 uv/uvx |
| perfdog-mcp-tools | streamable-http | `https://perfdog.qq.com/mcp` | header `Mcp_token` |

---

## 二、DSH 集成映射

| Cursor 概念 | DSH 对应 | 实现 |
|-------------|----------|------|
| 系统提示词 | `@deepseek-ai/dsh-persona`（`prefix`） | 新 preset `cursor` |
| 内置 skill（SKILL.md） | `@deepseek-ai/dsh-skill` 的 `registerProvider` | 自托管 Host 插件 `@local/cursor-skills` |
| `disable-model-invocation: true` | `invocation.modelInvocable: false` | manifest 生成时映射 |
| MCP server | `@deepseek-ai/dsh-mcp-client` | 每 server 一行，`serverName` 生成 `mcp__<name>__<tool>` 工具 |
| stdio transport | `transport: stdio` + `command`/`args`/`env` | 直接搬 |
| streamable-http transport | `transport: streamable-http` + `url`/`headers` | header 用 `!!js` 从 `~/.cursor/mcp.json` 读 token |

关键取舍：skill provider 注册在 **host 全局层**（`ctx.skills`），这样 26 个 skill 对所有 preset 可见，不依赖 `skill-filesystem` 的目录扫描路径解析，最稳。MCP 同样挂在 host 层，所有 agent 共享。系统提示词单独做成 **新的 `cursor` preset**，不覆盖现有 `standard`/`ptc`/`minimal`/`cordis`（本环境还有 dsh-purge 的自定义 persona，避免冲突）。

---

## 三、交付的四个插件

### 插件 A — `@local/cursor-skills`（Host skill provider）

```
cursor-skills/
├── package.json            # dsh.bundle.patch 指向 cordis.patch.yml
├── cordis.patch.yml        # - insert: cursor-skills -> @local/cursor-skills
├── index.js                # registerProvider 的 Host 插件
├── skills-manifest.json    # 26 条 {name, description, modelInvocable, ...}
└── skills/<name>/SKILL.md  # 原样复制的 26 个 skill（含 canvas/sdk、visualize/references）
```

- `index.js` 零外部依赖（内置 `node:fs/promises`、`node:url`），`rank = 600`（对齐 `BUNDLED_SKILL_RANK`）。
- `resourceBase` 指向每个 skill 自己的目录，`visualize`/`canvas` 的相对 `references/`、`sdk/` 引用可正常解析。
- `list()` 每次读 manifest（不缓存），改 skill 只需刷新目录，无需重启。

### 插件 B — `@local/cursor-mcp`（8 个 mcp-client 行）

```
cursor-mcp/
├── package.json
└── cordis.patch.yml        # 8 个 - insert: cursor-mcp-<name> -> @deepseek-ai/dsh-mcp-client
```

- stdio 6 个直接搬；http 2 个的 token 通过 `!!js` + `process.getBuiltinModule('fs')` 从 `~/.cursor/mcp.json` **运行时读取**，密钥不落盘到插件、不写进本报告。

### 插件 C — `@local/cursor-persona`（新 preset `cursor`）

```
cursor-persona/
├── package.json
└── cordis.patch.yml        # - insert: preset-cursor -> @deepseek-ai/dsh-agent-preset
```

- 新增可选 preset `cursor`（order 20），`persona.prefix` = 移植后的 Cursor 系统提示词，`suffix` = `Your working directory is {{cwd}}.`
- 工具集与 standard 对齐：bash/pwsh/fs/fs-search/jobs、skill-filesystem + tool-skill、goal、ask-user、todo、web、present、subagent(fork)。

### 插件 D — `@local/cursor-telemetry`（可观测性）

```
cursor-telemetry/
├── package.json
├── cordis.patch.yml        # - insert: cursor-telemetry -> @local/cursor-telemetry
└── index.js                # 内存态统计：ctx.cursorTelemetry
```

- 零依赖，挂 host 全局层。包装 `ctx.skills.get`（`skill` 工具与 `/name` 调用共同的唯一入口）记录 skill 触发次数；监听 `skills/change` 与 `goal/changed` 记录目录失效与 goal 生命周期。
- 统计句柄 `ctx.cursorTelemetry`：`.stats()`（按触发次数降序的 skillLoads、skillCatalogChanges、goalChangeCount、recentGoalChanges）、`.reset()`。
- 内存态，重启清零；dispose 时恢复 `ctx.skills.get` 并移除句柄。

---

## 四、安装与验证

四个 bundle 已通过 `plugin_manager install_bundle` 装进 `web` profile（`list_bundles` 可见，均为 `link:` 到本工作目录）：

```
@local/cursor-skills      -> row cursor-skills (27 skills)
@local/cursor-mcp         -> 8 rows cursor-mcp-*
@local/cursor-persona     -> row preset-cursor
@local/cursor-telemetry   -> row cursor-telemetry
```

**运行时验证结果**：

- ✅ 27 个 Cursor skill 已进入 skill catalog（含 `cursor-orchestrator`）。
- ✅ MCP 工具已注册（`Tool.listTools` 实测可见）：`mcp__dart__*`、`mcp__mobile-mcp__*`、`mcp__wdio-mcp__*`、`mcp__appium-mcp__*`、`mcp__adb-mcp__*`、`mcp__perfdog-mcp-tools__*`。
- ✅ `preset-cursor` 已注册到 `agentPresets` 行表。
- ✅ `cursor-telemetry` 已注册，`ctx.cursorTelemetry` 提供 skill 触发 / 目录变更 / goal 生命周期统计（内存态，重启清零）。

---

## 五、已知限制与迁移注意

1. **重启生效**：`cursor-skills` 的 `index.js` 模块（manifest 描述修正）与 `cursor-mcp` 的 token `!!js` 需重启 dsh 才会在运行进程重新加载；`preset-cursor` 需重启后在 preset 选择器里切到 **Cursor** 才挂载 persona；`cursor-telemetry` 需重启后才挂载 `ctx.cursorTelemetry`。
2. **`android-mcp`（uvx）**：首次 `uvx android-mcp` 会下载建 venv，慢/易超时；本快照里未注册。它和 `adb-mcp` 功能重叠，可保留或去掉。
3. **Cursor 专属工具映射缺失**：若干 Cursor skill 引用了 DSH 没有的 Cursor 工具/命令，例如 `CreateGoal`/`AskQuestion`/`CreateOrUpdateRule`、`/review-bugbot` 斜杠命令、`use_browser`、`gh` 等。已原样保留 skill 文本（忠实逆向），实际调用时这些工具名在 DSH 不存在，模型会改走 DSH 等价物（`create_goal`/`ask_user_question`/`subagent`/`bash` 等）。如需严格对齐，可在这些 skill 里补 DSH 工具名映射。
4. **token 安全**：perfdog 的 token 仍以明文存于 `~/.cursor/mcp.json`（Cursor 原样），插件只做运行时引用，不复制、不落盘到 profile。
5. **描述字段**：Cursor skill 的 `description` 常用折叠块标量（`>-`），已在 `skills-manifest.json` 生成时用 js-yaml 正确折叠。

---

## 附：关键源码位置（供继续二开）

- DSH skill 模板：`<dsh>/node_modules/@deepseek-ai/dsh-skill-badge/lib/index.js`
- DSH skill 类型：`<dsh>/node_modules/@deepseek-ai/dsh-skill/lib/types/index.d.ts`
- DSH mcp 客户端：`<dsh>/node_modules/@deepseek-ai/dsh-mcp-client`
- DSH persona：`<dsh>/node_modules/@deepseek-ai/dsh-persona`
- 标准 preset 参考：`<dsh>/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml`
- Cursor 提示词：`/Applications/Cursor.app/Contents/Resources/app/extensions/cursor-agent-host/dist/main.js`
- Cursor 内置 skill：`~/.cursor/skills-cursor/`
- Cursor MCP 配置：`~/.cursor/mcp.json`
