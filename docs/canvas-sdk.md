# Canvas SDK + 编译渲染 分析

> 补充 `orchestration.md` §4.7（那只覆盖了 ShareCanvas RPC 分享/存储）。
> 本文覆盖 Canvas 的**客户端渲染技术栈**：`cursor/canvas` SDK 表面、`.canvas.tsx` 编译产物、
> 状态桥、tokens 派生，以及可落地到 DSH 的等价物方案。

## 〇、Canvas 是什么（一句话）

Canvas 是一个**单文件 live React app**：agent 写一个 `.canvas.tsx` 文件，IDE 把它编译成
`.canvas.bundle.gz`，用户在 chat 旁边打开一个 sandbox 面板实时渲染。它不是 agent 工具，是
**客户端渲染能力** + **一套 dependency-free 的 React 组件库（`cursor/canvas`）**。

## 一、文件布局与编译产物

从 `out/vs/workbench/workbench.desktop.main.js` 的 `canvas.js` 模块（minified 常量）还原：

| 常量 | 值 | 含义 |
|------|-----|------|
| 源扩展名 | `.canvas.tsx` | 单文件、default-export 顶层组件 |
| 编译产物 | `.canvas.bundle.gz` | gzip 压缩的自包含 JS bundle |
| 目录名 | `canvases` | 每个 workspace 一个 |
| 状态 sidecar | `.canvas.data.json` | `useCanvasState` 的持久化存储 |
| 本地路径 | `/.cursor/projects/<workspace>/canvases/<name>.canvas.tsx` | 仅此精确目录被检测（子目录/其它扩展名不识别） |
| 云路径 | `<...>/files/canvases/<uuid>/source.canvas.tsx` | 云端 canvas（`canvas.json` + `canvas.bundle.gz`） |
| share 命令 | `canvas.shareCanvas` | 分享 RPC（见 §4.7） |

约束（来自 skill + 编译产物）：
- **一个 canvas = 一个 `.canvas.tsx`**，禁止 helper 文件 / 样式文件 / 子模块。
- 只能 `import { ... } from "cursor/canvas"`，无 npm 包、无 Node builtin、无相对导入。
- 数据**内联**，禁止 `fetch()`/网络调用。

## 二、`cursor/canvas` SDK 完整表面

声明文件（16 个 `.d.ts`，共 1933 行）位于 `~/.cursor/skills-cursor/canvas/sdk/*.d.ts`。
SDK 是**零依赖独立 bundle**（编译 `.canvas.tsx` 时注入，不在 workbench 主 bundle 里——
workbench 里的 `UsageBar`/`DiffStats`/`CollapsibleSection` 是容器 UI 的同名同源组件，SDK 本体
按需打包进产物）。

### 2.1 React 基础（re-export）

`useEffect, useMemo, useRef, useState`；类型 `CSSProperties, RefObject`。

### 2.2 Host 状态 hooks（核心差异化能力）

| Hook | 签名 | 语义 |
|------|------|------|
| `useHostTheme()` | `() => CanvasHostTheme` | 当前主题，语义色组可直接 `theme.accent` / `theme.text.primary` 等访问 |
| `useCanvasState<T>(key, defaultValue)` | `[T, SetCanvasState<T>]` | **跨 rebuild/reload/IDE 重启持久化**，存 `.canvas.data.json`，按 key 寻址 |
| `useCanvasAction()` | `() => (action) => void` | fire-and-forget 触发 IDE 动作：`openAgent` / `newComposerChat` / `openFile` |

`CanvasHostTheme` 形状（`theme.d.ts` + `hooks.d.ts`）：

```
CanvasHostTheme = CanvasTokens & {
  kind: "dark" | "light" | ...   // host 主题极性
  tokens: CanvasTokens           // 自引用命名空间
  palette: CanvasPalette         // 扁平 20 色
}
```

### 2.3 布局

`Stack`（竖向 flex）、`Row`（横向 flex）、`Grid`（CSS grid，`columns: number | string`）、
`Spacer`、`Divider`。

### 2.4 排版 / 表面 / 动作 / 反馈

- 排版：`H1/H2/H3`、`Text`（tone/size/weight/italic/truncate）、`Code`、`Link`。
- 表面：`Card`（variant/size/collapsible/stickyHeader）、`CardHeader`（trailing 槽）、`CardBody`、
  `Callout`（info/success/warning/danger/neutral）、`Stat`、`Pill`、`Table`（framed/striped/stickyHeader/rowTone）。
- 动作：`Button`（primary/secondary/ghost）、`IconButton`。
- 表单：`TextInput`、`TextArea`、`Checkbox`、`Toggle`、`Select`（原生 `<select>` 主题化）。
- 工具：`mergeStyle(base, override?)`。

### 2.5 图表（纯 SVG，零依赖，distilled from portal Highcharts）

`BarChart`（grouped/stacked/normalized/horizontal/valuePrefix/Suffix/referenceLines）、
`LineChart`（fill/hover guide/value labels）、`PieChart`（donut/size/tone per slice）。

### 2.6 其他

`DiffView` + `DiffStats`、`TodoList` + `TodoListCard`、`UsageBar`、`Swatch`、
`CollapsibleSection`、`computeDAGLayout`（DAG 布局算法）。

### 2.7 Tokens / 主题导出

`canvasTokens` / `canvasTokensLight`、`canvasPaletteDark` / `canvasPaletteLight`、
`categoryPaletteDark` / `categoryPaletteLight`、`chartPalette`、`chartColorSequence`、
`usageColorSequence`、`canvasTypography`（h1 24px/590 … small 12px）、
`canvasSpacing`（0.5–10，2–40px）、`canvasRadius`（none–full）。

## 三、Tokens 派生（可精确复刻）

`canvas-tokens.d.ts` 注释给出了完整映射规则——Canvas 的 tokens 是 `packages/ui` cursor-core
主题的 **pinned 副本**，通过 `CURSOR_SEMANTIC_RULES` 派生，**不需要枚举全主题**：

- **base**：dark `#F0F0F0`（foreground）、light `#141414`。
- **text*** ← `foreground*`（100/74/60/36% alpha）。
- **fill*** ← `bg-*`（20/14/8/6% alpha）。
- **stroke*** ← `stroke-*`（20/12/8% alpha）。
- **strokeFocused** ← core `focus` 全 opacity（非 15% 那个）。
- **accent/button** ← `bg-accent` / `action-label` / `bg-accent-hover`（base 混 10%）。
- **link** ← `text-link`（= core blue）。
- **diff\*Line** ← core diff 行背景；**diffStrip\*** 是 canvas 专用 alpha 绿/红。

宿主提供的 `primary`（VS Code 主题 accent）只覆盖 accent-adjacent 条目
（`applyPrimaryColor`），其余条目保持 base light/dark——任何主题无需枚举即支持。

### 3.1 分类色（categoryPalette 源头，从 bundle CSS 变量还原）

Cursor 分类色顺序：`["blue","purple","green","orange","cyan","magenta","red","yellow"]`。
Canvas `Color` 类型是 9 个（`gray,purple,green,yellow,cyan,pink,blue,orange,red`），
其中 Canvas `pink` 映射 Cursor `magenta`。

| Color | dark 值 |
|-------|---------|
| gray | = foregroundTertiary（base 60%） |
| blue | `#7BAFE9` |
| purple | `#9386F2` |
| green | `#3FA266` |
| yellow | `#F1B467` |
| cyan | `#81A1C1` |
| pink (magenta) | `#B48EAD` |
| orange | `#D08770` |
| red | `#FC6B83` |

accent `#599CE7`；added `#70B489`；removed `#FC6B83`。

### 3.2 chartPalette（`.d.ts` 内联，直接可用）

88% opacity（`E0`）软化：green `#1F8A65E8`、darkGreen `#0D855AE0`、lightGreen `#52B896E0`、
mintGreen `#7DCAB0E0`、blue `#2E79B5E0`、lightBlue `#70B0D8E0`、indigo `#5A6CC0F0`、
lightIndigo `#9AAADCE0`、purple `#7B64B8F0`、lightPurple `#AA98D8E0`、warmPink `#C85898E0`、
lightPink `#E8A0C4E0`、brightOrange `#F0A040E0`、deepOrange `#C06028E0`、goldenYellow `#E8C030E0`、
darkAmber `#C04848E0`、warmPeach `#F0A088E0`、vibrantTeal `#2A9A8AE0`、muted `#8888A8E0`、
neutralLine `#888899D0`。

## 四、编译渲染机制

- 源 `.canvas.tsx`（TSX）→ 编译 → `.canvas.bundle.gz`（gzip 自包含 JS）。
- 编译工具链**不是** esbuild/swc/babel（bundle 内无对应 wasm，`swc`/`babel` 出现均为无关
  symbol）——是 IDE 内置的 TSX transform + `zlib.gzip`（bundle 内 `gzip`×5、`gunzip`×1、
  `deflate`×2、`inflate`×9）。
- `cursor/canvas` 的 import 在编译时**替换为 SDK bundle 的具名导出**（dependency-free，
  随 `.canvas.tsx` 一起打进产物）。
- 运行时容器是 **sandbox iframe**（bundle 内 `iframe`×21、`sandbox`×44），渲染 `app_js` /
  `canvas.bundle.gz`，宿主通过 `window.__cursorCanvas.state` 注入 theme/state。

## 五、状态桥（host ↔ canvas）

- **主题/状态通道**：`window.__cursorCanvas.state`（`theme` + `state` 通道），跨
  JSON/SSE boundary，字段逐项校验后读取（不信任 wire）。
- `useHostTheme()`：读 host theme 通道；无 host state 时 fallback 到
  `prefers-color-scheme` 极性（不假设 dark）。
- `useCanvasState()`：持久化到 `.canvas.data.json` sidecar，按 key 寻址，跨 rebuild/reload 存活。
- `useCanvasAction()` → `CanvasAction`（来自 `internal/canvas-action-dispatch`）：
  `openAgent{agentId}` / `newComposerChat{userPrompt}` / `openFile{path, selection}`。

## 六、DSH 集成方案

DSH 当前**无 live React 渲染容器**（`present` 工具只是 declare files；Web UI 是静态 shell）。
完整复刻需两半：

| 层 | Cursor | DSH 等价物 |
|----|--------|-----------|
| SDK | `cursor/canvas` 组件库 + tokens（零依赖，随产物打包） | 新增 `@deepseek-ai/dsh-canvas` 包（同 API 的 React 组件 + tokens，可直接 npm 安装） |
| 编译 | IDE 内置 TSX transform + gzip | vite/esbuild `transformWithEsbuild` + `zlib.gzip`，产出 `.canvas.bundle.gz` |
| 容器 | client sandbox iframe + `window.__cursorCanvas.state` | DSH Web UI 新增 canvas panel（iframe + postMessage 状态桥）+ host 侧 canvas store |
| 状态 | `.canvas.data.json` sidecar | host 侧 key-value store（DSH session store 或文件 sidecar） |

可落地的最小闭环（bundle 能做的）：
1. **`@deepseek-ai/dsh-canvas` SDK 包**（本文 §2/§3 全部 API + tokens，纯 React + 零运行时依赖）。
2. **编译 CLI/工具**：`.canvas.tsx` → `.canvas.bundle.gz`（esbuild transform + gzip），
   复用 SDK 的 `cursor/canvas` 别名映射。
3. **host plugin**：canvas store（本地 `canvases/` 目录 + share RPC 骨架）。
4. **client UI panel**：iframe 容器 + `postMessage` 状态桥（需 DSH client 侧新增，上游功能）。

> 结论：SDK 包 + 编译工具 + host store 可作为 bundle 交付；sandbox iframe 面板属 DSH
> client UI 渲染，等价物用 `present` + 静态 HTML/图片降级，完整复刻需上游新增 canvas panel。
