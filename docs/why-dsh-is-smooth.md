# 为什么 Agent 跑得顺 —— 工程实践调研

> 本报告是对 `/Applications/Cursor.app` 与 `~/.cursor/` 实测逆向后的**方法论提炼**，
> 不是文件搬运清单（搬运清单见根目录 README.md）。目标是回答一个问题：
> **Cursor 的"顺滑好用"到底来自哪些可复用的工程决策？** 以及哪些已经落到本仓库的 DSH 插件里、哪些还值得补。

## 结论先行（TL;DR）

Cursor 的顺滑**不是模型更强，而是把"系统级纪律"写进了提示词和工具契约里**，让模型每一步都知道：该不该动手、怎么动手、何时并行、何时闭嘴。可以拆成五层：

| 层 | Cursor 的做法 | 直接效果 | 本仓库状态 |
|----|--------------|----------|-----------|
| 1. 系统提示词分节 | 用 `<section>` 把行为规范拆成小段，而不是一坨长文 | 模型对每类场景有明确、可检索的规则 | ✅ 已移植（本次补全到高保真） |
| 2. Skill 即检索词 | 每个 skill 的 `description` 就是"何时该用"的触发条件 | 模型按需加载技能，而非全量塞进上下文 | ✅ 已移植（26 个 + manifest） |
| 3. MCP 工具自动发现 | 每个 server 一行配置，工具名 `mcp__<server>__<tool>` 自动展开 | 外部能力即插即用、零胶水代码 | ✅ 已移植（8 个 server） |
| 4. 上下文自动注入 | 打开的文件/光标/最近浏览/编辑史/lint 错误自动附带 | 模型"睁眼"就能接上下文，少问用户 | ⚠️ DSH 由 harness 注入，persona 已声明该预期 |
| 5. 编排与状态外置 | 长任务用 `progress.md` 外置状态 + 阶段门控 + 子代理 | 上下文被压缩也能从磁盘恢复 | ⚠️ 有 create_goal/subagent，可对齐但未强约束 |

---

## 一、系统提示词为什么这样写

Cursor 的 AGENTIC-CURSOR 提示词不是一段散文，而是**若干带标题的分节**。每个分节只回答一个问题：

- `<communication>` —— 怎么跟用户说话（**先说结论**、别提工具名、少用 emoji、别用 echo/注释当沟通渠道）
- `<tool_calling>` —— 什么时候该调工具（能直接答就不调；只用标准工具调用格式）
- `<search_and_reading>` —— 不确定时怎么办（先自己搜/读，**偏向于不问用户**）
- `<making_code_changes>` —— 怎么改代码（用编辑工具而非贴代码块；**改前先读**；修掉自己引入的 lint；别超过 3 次循环）
- `<maximize_parallel_tool_calls>` —— 无依赖的调用**并行**发（读 3 个文件就同时读 3 个）
- `<citing_code>` —— 引用已有代码用 `startLine:endLine:filepath`，新代码用带语言标记的代码块
- `<calling_external_apis>` —— 选版本要兼容依赖文件；密钥别硬编码
- `<task_management>` —— 复杂任务用 TodoWrite，简单任务跳过
- `<parameter_discipline>`（尾段）—— 调工具前检查必需参数是否齐/可推断；**用户给的参数值原样使用，绝不编造**；可选参数别去问
- `<think>` —— 允许用 think 标签逐步思考（不展示给用户）

**这套结构的关键不是"内容多"，而是"可定位"**：模型遇到"要不要读文件"这个局部决策时，只需要锚定到 `<making_code_changes>` 第 1 条，不需要通读整篇提示词。分节标题充当了**行为索引**。

### 最值得抄的三条"顺滑"纪律

1. **Lead with the answer**（先说结论）：先答用户真正的疑问（尤其"为什么"类），再给细节；**不要用否定句开头**（"不是 X"，而是"是 Y"）；能从上下文回答就直接答，**不要反问澄清**、不要甩原始数据。
2. **参数纪律**：调工具前核对必需参数，用户给了值就原样用。这一条直接消灭了"占位符乱猜 / 问多余的可选参数"这类最让用户烦躁的失败模式。
3. **改前先读 + 无依赖并行**：先读再改避免盲改；读多个文件并行避免串行等待——这是"快"和"稳"的两根支柱。

---

## 二、Skill 系统：description 就是检索词

Cursor 的 skill 本质是**一份按需加载的指令**，它的 `SKILL.md` frontmatter 里 `description` 不是给人看的简介，而是**给模型看的"什么时候用我"的触发条件**。例如：

- `canvas` 的 description 长达一段，写满了"当你要产出独立分析产物/表格/图表时 MUST 用我"。
- `review-bugbot` 用 `disable-model-invocation: true` 声明"只能走斜杠命令，不参与模型自主选择"。

带来的好处：

- **上下文瘦身**：26 个 skill 全塞进提示词会撑爆上下文；改成"description 进目录、正文按需加载"后，模型只在需要时展开具体 skill。
- **触发可预测**：description 写得越具体，模型选 skill 越准；描述模糊的 skill 几乎不会被触发。

DSH 的映射（本仓库 `dsh-skills/`）：

- `description` → manifest 的 `description` 字段（进 skill catalog）
- `disable-model-invocation` → `invocation.modelInvocable: false`
- 斜杠命令（`/goal` 等）→ DSH 的 `userInvocable` 语义（`skill` 工具加载）
- Cursor 专属工具名（AskQuestion/CreateGoal/gh 等）→ `dshtool-map.json` 里的 DSH 等价物映射，加载时给 skill 正文**前缀一段"DSH 工具适配"提示**

---

## 三、MCP 集成：一行一个 server，工具名自动展开

Cursor 的 `~/.cursor/mcp.json` 每个 server 只有一行配置，两种 transport：

- `stdio`：本地进程（dart / npx / uvx），工具通过 stdin/stdout JSON-RPC 通信。
- `streamable-http`：远程端点 + header 鉴权（perfdog）。

客户端（`cursor-mcp` 扩展，`@modelcontextprotocol/sdk` 1.25.1）负责**自动发现**每个 server 的工具列表，并生成 `mcp__<serverName>__<tool>` 这样的扁平工具名。好处：

- 加一个能力 = 加一行配置 + 重启，零胶水代码。
- 工具名带 server 前缀，命名空间清晰，模型不会把两个 server 的同名工具搞混。
- **HTTP 密钥不落盘到插件**（本仓库用 `!!js` 运行时从 `~/.cursor/mcp.json` 读 token，避免把密钥复制进 DSH profile）。

DSH 的 `@deepseek-ai/dsh-mcp-client` 复用了几乎同一套心智模型（`transport` + `serverName` + `command`/`url`），因此 8 个 server 可以近乎原样搬运——这也是为什么交付物只有一份 `cordis.patch.yml`。

---

## 四、上下文注入：让模型"睁眼"接活

AGENTIC 提示词开头明确声明了一件事：**每次用户发消息，系统可能自动附带当前状态**——打开的文件、光标位置、最近浏览的文件、本会话编辑史、lint 错误。模型拿到这些后：

- 改代码前往往已经有目标文件内容，少一次读文件往返；
- 知道用户刚在看哪个文件，回复更贴上下文；
- 知道 lint 错误，改完顺手修掉。

这在 DSH 里由 harness 的 `agent-instructions` + `maxBytes` 注入承担（persona 已声明该预期，`suffix` 也注入了 `cwd`）。这条属于"harness 能力"而非"提示词技巧"，本次调研把它**显式写进了 persona**，让模型知道可以利用这些自动附带的信息，而不是假设没有。

---

## 五、长任务编排：状态外置 + 阶段门控

Cursor 的 PROJECT 模式（长期规划/编排者）有几条硬约束，是"长时间不跑偏"的关键：

1. **Orchestrate, don't execute** —— 编排者不改文件，改动都交给子代理。
2. **外置状态** —— 用 `<conversation-notes>/progress.md` 作为唯一事实源，随时可从磁盘恢复，不依赖聊天上下文。
3. **阶段门控** —— Clarify → Research → Plan → User Review → Implement → Review Panel → Iterate → Finalize，不跳步。
4. **安全并行** —— 只读任务可自由并行；**写作用域重叠的子代理绝不并行**，宁可疑似重叠就串行。
5. **高工程标准** —— 复用现有模式，避免一次性 hack；临时探针用完必须移除。

DSH 已有 `create_goal`（持久目标）、`subagent`/`subagent_fork`（子代理）、`todo_write`（任务清单），但**尚未强约束"写作用域互斥"和"状态外置到 progress.md"**。这是本次调研识别出的、未来可增强 DSH 的两个方向（见下）。

---

## 六、可借鉴清单（checklist）

**已移植到本仓库（v1.0.0）：**

- [x] 系统提示词分节结构（persona prefix）
- [x] 26 个内置 skill + manifest + 工具映射
- [x] 8 个 MCP server（stdio + streamable-http + 密钥运行时读取）
- [x] 新 `cursor` preset（不覆盖现有 preset）

**本次补全（v1.1.0）：**

- [x] persona 提示词高保真：补 `<citing_code>`、`<calling_external_apis>`、`<task_management>`、`<parameter_discipline>`、"lead with the answer" 沟通纪律、`<maximize_parallel_tool_calls>` 全文
- [x] 本报告（工程原理提炼）

**未来可增强 DSH 的方向（不在本次范围）：**

- [ ] 写作用域互斥：subagent 并行时检测/阻止重叠写文件（对齐 Cursor 的"safe parallelism"）
- [ ] 长任务状态外置：goal 执行中把 `progress.md` 作为唯一事实源，支持上下文压缩后恢复
- [ ] skill 触发统计：记录哪些 skill 被模型选中，反推 description 写得好不好（对齐 Cursor 的 manifest 可观测性）
- [ ] 上下文注入增强：把"最近浏览/编辑史/lint 错误"更结构化地喂给 agent-instructions

---

## 附：逆向的源码坐标

- 系统提示词：`/Applications/Cursor.app/Contents/Resources/app/extensions/cursor-agent-host/dist/main.js`
  - `You are a powerful agentic AI coding assistant` → 约 index 11475839（AGENTIC-CURSOR 变体）
  - `You are a coding agent in the Cursor IDE` → 约 index 9861240（AGENT-BASE 变体）
  - `You are an AI coding assistant, powered by Composer` → 约 index 11467297（COMPOSER 变体）
  - `tone_and_style` 分节函数 `O5`、`plan_mode_guardrails` 函数 `F5`、`citing_code` 函数 `W5`/`V5`
  - PROJECT 编排模式提示词（`progress.md` scratchpad + 阶段门控）
- 内置 skill：`~/.cursor/skills-cursor/<name>/SKILL.md`（26 个，含 frontmatter）
- MCP 配置：`~/.cursor/mcp.json`（8 个 server）
- MCP 客户端扩展：`extensions/cursor-mcp`（`@modelcontextprotocol/sdk` 1.25.1）
