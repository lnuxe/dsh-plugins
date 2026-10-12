import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Grid,
  H1,
  Pill,
  Row,
  Select,
  Spacer,
  Stack,
  Text,
  Toggle,
  useCanvasState,
  useHostTheme,
  useMemo,
  useState,
} from "cursor/canvas";

/* ------------------------------------------------------------------ */
/* 配置表                                                              */
/* ------------------------------------------------------------------ */

const ANIM_TYPES = [
  { value: "rotate", label: "旋转" },
  { value: "pulse", label: "脉动" },
  { value: "float", label: "漂浮" },
  { value: "bounce", label: "弹跳" },
  { value: "orbit", label: "公转" },
  { value: "wave", label: "摆动" },
  { value: "morph", label: "形变" },
  { value: "ripple", label: "波纹" },
] as const;

const SHAPES = [
  { value: "circle", label: "圆形" },
  { value: "square", label: "方块" },
  { value: "triangle", label: "三角" },
  { value: "star", label: "星形" },
  { value: "ring", label: "圆环" },
  { value: "blob", label: "液态" },
] as const;

const SPEEDS = [
  { value: "slow", label: "慢", dur: 3.2 },
  { value: "med", label: "中", dur: 2.0 },
  { value: "fast", label: "快", dur: 1.1 },
] as const;

const SIZES = [
  { value: "sm", label: "S", s: 26 },
  { value: "md", label: "M", s: 38 },
  { value: "lg", label: "L", s: 52 },
] as const;

const COLOR_KEYS = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"] as const;
const COLOR_LABELS: Record<string, string> = {
  red: "红", orange: "橙", yellow: "黄", green: "绿", cyan: "青", blue: "蓝", purple: "紫", pink: "粉",
};

const GHOSTS = 4; // 拖尾数量

/* ------------------------------------------------------------------ */
/* 确定性随机与形状路径（JSX 与导出代码共用同一份数据）                 */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starPath(s: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? s : s * 0.45;
    pts.push((Math.cos(a) * rad).toFixed(1) + " " + (Math.sin(a) * rad).toFixed(1));
  }
  return "M " + pts.join(" L ") + " Z";
}

function trianglePath(s: number): string {
  return "M 0 " + (-s * 1.08).toFixed(1) + " L " + (s * 0.94).toFixed(1) + " " + (s * 0.54).toFixed(1) + " L " + (-s * 0.94).toFixed(1) + " " + (s * 0.54).toFixed(1) + " Z";
}

function blobPath(seed: number, s: number): string {
  const rnd = mulberry32(seed * 7 + 13);
  const pts: number[][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = s * (0.72 + rnd() * 0.36);
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  let d = "M " + pts[0][0].toFixed(1) + " " + pts[0][1].toFixed(1);
  for (let i = 0; i < 8; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % 8];
    d += " Q " + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + " " + ((p0[0] + p1[0]) / 2).toFixed(1) + " " + ((p0[1] + p1[1]) / 2).toFixed(1);
  }
  return d + " Z";
}

function shapePath(shape: string, s: number, seed: number): string | null {
  if (shape === "triangle") return trianglePath(s);
  if (shape === "star") return starPath(s);
  if (shape === "blob") return blobPath(seed, s);
  return null;
}

/* ------------------------------------------------------------------ */
/* Keyframes：按类型生成 CSS 动画定义                                    */
/* ------------------------------------------------------------------ */

const EASING: Record<string, string> = {
  rotate: "linear", pulse: "ease-in-out", float: "ease-in-out", bounce: "ease-in-out",
  orbit: "linear", wave: "ease-in-out", morph: "ease-in-out", ripple: "ease-out",
};

function kfName(type: string, dur: number, trail: boolean): string {
  return "al-" + type + "-" + dur + (trail ? "-tr" : "");
}

function kfCss(type: string, dur: number, trail: boolean): { name: string; css: string } {
  const name = kfName(type, dur, trail);
  let body = "";
  switch (type) {
    case "rotate":
      body = "to { transform: rotate(360deg); }";
      break;
    case "pulse":
      body = "0%,100% { transform: scale(0.66); } 50% { transform: scale(1.16); }";
      break;
    case "float":
      body =
        "0%,100% { transform: translateY(0) rotate(0deg); }" +
        "25% { transform: translateY(-14%) rotate(-7deg); }" +
        "50% { transform: translateY(0) rotate(0deg); }" +
        "75% { transform: translateY(14%) rotate(7deg); }";
      break;
    case "bounce":
      body =
        "0%,100% { transform: translateY(0) scale(1,1); }" +
        "10% { transform: translateY(-46%) scale(0.97,1.03); }" +
        "24% { transform: translateY(0) scale(1.14,0.86); }" +
        "36% { transform: translateY(-16%) scale(1,1); }" +
        "48% { transform: translateY(0) scale(1.08,0.92); }" +
        "60% { transform: translateY(-5%) scale(1,1); }" +
        "74% { transform: translateY(0) scale(1.03,0.97); }";
      break;
    case "orbit":
      body = "to { transform: rotate(360deg); }";
      break;
    case "wave":
      body =
        "0%,100% { transform: translateX(-38%) rotate(-9deg); }" +
        "50% { transform: translateX(38%) rotate(9deg); }";
      break;
    case "morph":
      body =
        "0%,100% { transform: scale(1,1) rotate(0deg); }" +
        "30% { transform: scale(1.3,0.68) rotate(4deg); }" +
        "70% { transform: scale(0.68,1.3) rotate(-4deg); }";
      break;
    case "ripple":
      return {
        name: "al-rip-" + dur,
        css:
          "@keyframes al-rip-" + dur +
          " { 0% { transform: scale(0.25); opacity: 0.85; } 100% { transform: scale(1.5); opacity: 0; } }",
      };
  }
  return { name, css: "@keyframes " + name + " { " + body + " }" };
}

/* ------------------------------------------------------------------ */
/* 预览舞台                                                             */
/* ------------------------------------------------------------------ */

interface StageProps {
  type: string;
  shape: string;
  color: string;
  dur: number;
  size: number;
  trail: boolean;
  paused: boolean;
  seed: number;
}

function Stage({ type, shape, color, dur, size, trail, paused, seed }: StageProps) {
  const theme = useHostTheme();
  const name = kfName(type, dur, trail && type !== "ripple");

  const anim = (n: string, delay = 0, opacity = 1) => ({
    animation: n + " " + dur + "s " + (EASING[type] || "ease-in-out") + " " + delay + "s infinite",
    animationPlayState: paused ? ("paused" as const) : ("running" as const),
    transformBox: ("fill-box" as const),
    transformOrigin: "center",
    opacity,
  });

  const orbitAnim = {
    animation: name + " " + dur + "s linear 0s infinite",
    animationPlayState: paused ? ("paused" as const) : ("running" as const),
    transformBox: ("view-box" as const),
    transformOrigin: "50% 50%",
  };

  /* 形状主体（blob 需要 seed 生成路径） */
  const shapeNode = (delay = 0, opacity = 1, key = "main") => {
    const st = anim(name, delay, opacity);
    switch (shape) {
      case "circle":
        return <circle key={key} r={size} fill={color} style={st} />;
      case "square":
        return <rect key={key} x={-size} y={-size} width={size * 2} height={size * 2} fill={color} style={st} />;
      case "triangle":
        return <path key={key} d={trianglePath(size)} fill={color} style={st} />;
      case "star":
        return <path key={key} d={starPath(size)} fill={color} style={st} />;
      case "ring":
        return <circle key={key} r={size} fill="none" stroke={color} strokeWidth={size * 0.34} style={st} />;
      case "blob":
        return <path key={key} d={blobPath(seed, size)} fill={color} style={st} />;
    }
    return null;
  };

  const isRipple = type === "ripple";

  return (
    <svg viewBox="0 0 360 360" width="100%" style={{ display: "block", background: theme.bg.chrome }} role="img" aria-label="动画预览舞台">
      <style>{kfCss(type, dur, trail).css}</style>
      {/* 舞台底色与中心辅助线 */}
      <rect x="0" y="0" width="360" height="360" fill={theme.bg.chrome} />
      <line x1="0" y1="180" x2="360" y2="180" stroke={theme.stroke.tertiary} strokeWidth="1" opacity="0.55" />
      <line x1="180" y1="0" x2="180" y2="360" stroke={theme.stroke.tertiary} strokeWidth="1" opacity="0.55" />

      {isRipple ? (
        <g transform="translate(180,180)">
          {/* 静止核心 */}
          {shapeNode(0, 1, "core")}
          {/* 三个扩散波纹环 */}
          {[0, 1, 2].map((i) => (
            <circle
              key={"rip" + i}
              r={size * 1.1}
              fill="none"
              stroke={color}
              strokeWidth={size * 0.26}
              style={anim("al-rip-" + dur, (i * dur) / 3)}
            />
          ))}
        </g>
      ) : type === "orbit" ? (
        /* 公转：形状放在半径 130 处，外层 g 绕舞台中心旋转 */
        <g style={orbitAnim}>
          <g transform="translate(180,50)">{shapeNode(0, 1, "orbiter")}</g>
          <circle cx="180" cy="180" r="3" fill={theme.stroke.tertiary} />
        </g>
      ) : (
        <g transform="translate(180,180)">
          {/* 拖尾幽灵：负延迟错开相位 */}
          {trail &&
            [1, 2, 3, 4].map((i) =>
              shapeNode(-(i * dur) / (GHOSTS + 1), (GHOSTS - i + 1) / (GHOSTS + 1) / 2.6, "ghost" + i),
            )}
          {shapeNode(0, 1, "main")}
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 导出代码生成（与预览共用形状路径与 keyframes，颜色换成实际色值）      */
/* ------------------------------------------------------------------ */

function exportHtml(type: string, shape: string, color: string, dur: number, size: number, trail: boolean, seed: number, bg: string): string {
  const d = shapePath(shape, size, seed);
  const kf = kfCss(type, dur, trail);
  const easing = EASING[type] || "ease-in-out";
  const animRule =
    type === "orbit"
      ? "transform-box: view-box; transform-origin: 50% 50%;"
      : "transform-box: fill-box; transform-origin: center;";

  const node = (extra = "", delay = 0, opacity = 1) => {
    const anim =
      "animation: " + kf.name + " " + dur + "s " + easing + " " + delay + "s infinite; " +
      animRule +
      (opacity < 1 ? "opacity: " + opacity + ";" : "");
    if (shape === "circle") return "<circle r=\"" + size + "\" fill=\"" + color + "\" style=\"" + anim + "\" " + extra + "/>";
    if (shape === "square") return "<rect x=\"" + (-size) + "\" y=\"" + (-size) + "\" width=\"" + size * 2 + "\" height=\"" + size * 2 + "\" fill=\"" + color + "\" style=\"" + anim + "\" " + extra + "/>";
    if (shape === "ring") return "<circle r=\"" + size + "\" fill=\"none\" stroke=\"" + color + "\" stroke-width=\"" + size * 0.34 + "\" style=\"" + anim + "\" " + extra + "/>";
    return "<path d=\"" + d + "\" fill=\"" + color + "\" style=\"" + anim + "\" " + extra + "/>";
  };

  let inner = "";
  if (type === "ripple") {
    inner = "<g transform=\"translate(180,180)\">" +
      node("", 0, 1) +
      [0, 1, 2].map((i) =>
        "<circle r=\"" + size * 1.1 + "\" fill=\"none\" stroke=\"" + color + "\" stroke-width=\"" + size * 0.26 +
        "\" style=\"animation: al-rip-" + dur + " " + dur + "s ease-out " + (i * dur) / 3 + "s infinite; transform-box: fill-box; transform-origin: center;\"/>",
      ).join("") +
      "</g>";
  } else if (type === "orbit") {
    inner =
      "<g style=\"animation: " + kf.name + " " + dur + "s linear 0s infinite; transform-box: view-box; transform-origin: 50% 50%;\">" +
      "<g transform=\"translate(180,50)\">" + node() + "</g>" +
      "</g>";
  } else {
    const ghosts = trail
      ? [1, 2, 3, 4].map((i) => node("", -(i * dur) / (GHOSTS + 1), (GHOSTS - i + 1) / (GHOSTS + 1) / 2.6)).join("")
      : "";
    inner = "<g transform=\"translate(180,180)\">" + ghosts + node() + "</g>";
  }

  return (
    "<!doctype html>\n" +
    "<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n" +
    "<style>\n" +
    "body { display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }\n" +
    ".stage { display:block; }\n" +
    kf.css.replace(/([{;}])/g, "$1\n") + "\n" +
    "</style>\n</head>\n<body>\n" +
    "<svg class=\"stage\" viewBox=\"0 0 360 360\" width=\"360\" height=\"360\" role=\"img\" aria-label=\"generated animation\">\n" +
    "<rect width=\"360\" height=\"360\" fill=\"" + bg + "\"/>\n" +
    inner + "\n" +
    "</svg>\n</body>\n</html>"
  );
}

/* ------------------------------------------------------------------ */
/* 面板主体                                                             */
/* ------------------------------------------------------------------ */

export default function AnimationLab() {
  const theme = useHostTheme();
  const [type, setType] = useCanvasState("al-type", "bounce");
  const [shape, setShape] = useCanvasState("al-shape", "circle");
  const [colorKey, setColorKey] = useCanvasState("al-color", "cyan");
  const [speed, setSpeed] = useCanvasState("al-speed", "med");
  const [sizeKey, setSizeKey] = useCanvasState("al-size", "md");
  const [trail, setTrail] = useCanvasState("al-trail", true);
  const [paused, setPaused] = useCanvasState("al-paused", false);
  const [seed, setSeed] = useCanvasState("al-seed", 1);
  const [copied, setCopied] = useState(false);

  const dur = SPEEDS.find((s) => s.value === speed)?.dur ?? 2.0;
  const size = SIZES.find((s) => s.value === sizeKey)?.s ?? 38;
  const color = theme.category[colorKey as keyof typeof theme.category] ?? theme.accent.primary;
  const typeLabel = ANIM_TYPES.find((t) => t.value === type)?.label ?? type;
  const shapeLabel = SHAPES.find((s) => s.value === shape)?.label ?? shape;
  const speedLabel = SPEEDS.find((s) => s.value === speed)?.label ?? speed;

  const generated = useMemo(
    () => exportHtml(type, shape, color, dur, size, trail, seed, theme.bg.chrome),
    [type, shape, color, dur, size, trail, seed, theme.bg.chrome],
  );

  const copyCode = () => {
    try {
      void navigator.clipboard?.writeText(generated).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const randomize = () => {
    const t = ANIM_TYPES[Math.floor(Math.random() * ANIM_TYPES.length)].value;
    const sh = SHAPES[Math.floor(Math.random() * SHAPES.length)].value;
    const c = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
    const sp = SPEEDS[Math.floor(Math.random() * SPEEDS.length)].value;
    const sz = SIZES[Math.floor(Math.random() * SIZES.length)].value;
    setType(t); setShape(sh); setColorKey(c); setSpeed(sp); setSizeKey(sz); setSeed((v) => v + 1);
  };

  const typeOptions = ANIM_TYPES.map((t) => ({ value: t.value, label: t.label }));
  const shapeOptions = SHAPES.map((s) => ({ value: s.value, label: s.label }));

  return (
    <Stack gap={20} style={{ padding: 24, background: theme.bg.editor }}>
      <Row justify="space-between" align="center">
        <H1 style={{ margin: 0 }}>动画实验室</H1>
        <Pill active>theme: {theme.kind}</Pill>
      </Row>
      <Text tone="secondary">
        8 种动画 × 6 种形状 × 8 色实时预览；拖尾、暂停、随机灵感一应俱全，底部可一键导出可直接使用的 HTML + CSS 动画代码。
      </Text>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader trailing={<Pill active={!paused}>{paused ? "已暂停" : "播放中"}</Pill>}>控制台</CardHeader>
          <CardBody>
            <Stack gap={14}>
              <Stack gap={6}>
                <Text size="small" tone="tertiary">动画类型</Text>
                <Select value={type} onChange={setType} options={typeOptions} />
              </Stack>
              <Stack gap={6}>
                <Text size="small" tone="tertiary">形状</Text>
                <Select value={shape} onChange={setShape} options={shapeOptions} />
              </Stack>
              <Stack gap={6}>
                <Text size="small" tone="tertiary">颜色</Text>
                <Row gap={6} align="center">
                  {COLOR_KEYS.map((k) => (
                    <button
                      key={k}
                      title={COLOR_LABELS[k]}
                      onClick={() => setColorKey(k)}
                      style={{
                        width: 18, height: 18, borderRadius: 9, border: "none", cursor: "pointer",
                        background: theme.category[k as keyof typeof theme.category],
                        outline: colorKey === k ? "2px solid " + theme.accent.primary : "none",
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </Row>
              </Stack>
              <Stack gap={6}>
                <Text size="small" tone="tertiary">速度 · {dur}s 每周期</Text>
                <Row gap={8} align="center">
                  {SPEEDS.map((s) => (
                    <Pill key={s.value} active={speed === s.value} onClick={() => setSpeed(s.value)}>
                      {s.label}
                    </Pill>
                  ))}
                </Row>
              </Stack>
              <Stack gap={6}>
                <Text size="small" tone="tertiary">尺寸</Text>
                <Row gap={8} align="center">
                  {SIZES.map((s) => (
                    <Pill key={s.value} active={sizeKey === s.value} onClick={() => setSizeKey(s.value)}>
                      {s.label}
                    </Pill>
                  ))}
                </Row>
              </Stack>
              <Row gap={16} align="center">
                <Toggle checked={trail} onChange={setTrail} size="md" />
                <Text size="small">拖尾轨迹</Text>
                <Spacer />
                <Toggle checked={paused} onChange={setPaused} size="md" />
                <Text size="small">暂停</Text>
              </Row>
              <Row gap={8} align="center">
                <Button variant="secondary" onClick={randomize}>随机灵感</Button>
                <Text size="small" tone="tertiary">seed: {seed}</Text>
              </Row>
            </Stack>
          </CardBody>
        </Card>

        <Card>
          <CardHeader trailing={<Pill>{typeLabel} · {shapeLabel}</Pill>}>实时预览</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Stage type={type} shape={shape} color={color} dur={dur} size={size} trail={trail} paused={paused} seed={seed} />
              <Text size="small" tone="secondary">
                {typeLabel} · {shapeLabel} · {speedLabel}速 · {COLOR_LABELS[colorKey] ?? ""} · {sizeKey === "sm" ? "小" : sizeKey === "lg" ? "大" : "中"}尺寸
                {trail && type !== "ripple" ? " · 拖尾 ×" + GHOSTS : ""}
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Card>
        <CardHeader trailing={<Button onClick={copyCode}>{copied ? "已复制" : "复制代码"}</Button>}>导出动画代码</CardHeader>
        <CardBody>
          <Stack gap={8}>
            <pre
              style={{
                margin: 0, padding: 12, borderRadius: 6, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
                background: theme.fill.tertiary, color: theme.text.secondary,
                fontSize: 12, lineHeight: 1.55,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {generated}
            </pre>
            <Text size="small" tone="tertiary">
              导出的片段是独立 HTML：样式与预览完全一致，颜色已固化为当前所选色值；粘贴到任意页面即可播放。
            </Text>
          </Stack>
        </CardBody>
      </Card>
    </Stack>
  );
}
