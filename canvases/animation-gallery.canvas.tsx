import {
  Card,
  CardBody,
  CardHeader,
  Grid,
  H1,
  Pill,
  Row,
  Stack,
  Text,
  useHostTheme,
} from "cursor/canvas";

/* ------------------------------------------------------------------ */
/* 动画引擎（与 animation-lab 同一套：keyframes + 形状路径 + 拖尾）      */
/* ------------------------------------------------------------------ */

const GHOSTS = 4;

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

const EASING: Record<string, string> = {
  rotate: "linear", pulse: "ease-in-out", float: "ease-in-out", bounce: "ease-in-out",
  orbit: "linear", wave: "ease-in-out", morph: "ease-in-out", ripple: "ease-out",
};

function kfName(type: string, dur: number, trail: boolean): string {
  return "ga-" + type + "-" + dur + (trail ? "-tr" : "");
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
        name: "ga-rip-" + dur,
        css:
          "@keyframes ga-rip-" + dur +
          " { 0% { transform: scale(0.25); opacity: 0.85; } 100% { transform: scale(1.5); opacity: 0; } }",
      };
  }
  return { name, css: "@keyframes " + name + " { " + body + " }" };
}

/* ------------------------------------------------------------------ */
/* 精选动画配置（12 组：8 类型全收录 + 4 组跨类型特色组合）             */
/* ------------------------------------------------------------------ */

interface Demo {
  title: string;
  type: string;
  shape: string;
  colorKey: string;
  speed: string; // slow 3.2 / med 2.0 / fast 1.1
  size: number;
  trail: boolean;
  seed: number;
  desc: string;
}

const DEMOS: Demo[] = [
  { title: "星旋", type: "rotate", shape: "star", colorKey: "orange", speed: "med", size: 38, trail: true, seed: 1, desc: "星形 360° 旋转，橙色拖尾如彗尾。" },
  { title: "液态脉动", type: "pulse", shape: "blob", colorKey: "purple", speed: "med", size: 38, trail: false, seed: 2, desc: "液态形状呼吸式缩放，紫色软体感。" },
  { title: "轻羽漂浮", type: "float", shape: "ring", colorKey: "cyan", speed: "slow", size: 38, trail: true, seed: 3, desc: "圆环上下漂浮 + 轻摆，青色慢速。" },
  { title: "红球弹跳", type: "bounce", shape: "circle", colorKey: "red", speed: "med", size: 38, trail: false, seed: 4, desc: "经典弹跳 + 落地挤压拉伸。" },
  { title: "三角公转", type: "orbit", shape: "triangle", colorKey: "green", speed: "med", size: 34, trail: false, seed: 5, desc: "三角绕舞台中心匀速公转。" },
  { title: "方块摆动", type: "wave", shape: "square", colorKey: "blue", speed: "fast", size: 34, trail: false, seed: 6, desc: "左右横摆 + 旋转，蓝色快节奏。" },
  { title: "星光形变", type: "morph", shape: "star", colorKey: "pink", speed: "med", size: 38, trail: true, seed: 7, desc: "星形软体形变，粉紫拖尾。" },
  { title: "金色波纹", type: "ripple", shape: "circle", colorKey: "yellow", speed: "slow", size: 32, trail: false, seed: 8, desc: "三环扩散波纹，金色涟漪。" },
  { title: "蓝环飞转", type: "rotate", shape: "ring", colorKey: "blue", speed: "fast", size: 40, trail: true, seed: 9, desc: "圆环高速旋转，蓝色拖尾。" },
  { title: "粉星弹跳", type: "bounce", shape: "star", colorKey: "pink", speed: "fast", size: 28, trail: true, seed: 10, desc: "星形快节奏弹跳，粉色残影。" },
  { title: "绿液漂浮", type: "float", shape: "blob", colorKey: "green", speed: "slow", size: 48, trail: true, seed: 11, desc: "大尺寸液态慢漂，绿色缓动。" },
  { title: "黄星公转", type: "orbit", shape: "star", colorKey: "yellow", speed: "fast", size: 26, trail: true, seed: 12, desc: "小星快公转，黄色拖尾。" },
];

const SPEED_DUR: Record<string, number> = { slow: 3.2, med: 2.0, fast: 1.1 };
const SPEED_LABEL: Record<string, string> = { slow: "慢", med: "中", fast: "快" };

/* ------------------------------------------------------------------ */
/* 单个演示卡片                                                         */
/* ------------------------------------------------------------------ */

function Stage({ demo }: { demo: Demo }) {
  const theme = useHostTheme();
  const type = demo.type;
  const dur = SPEED_DUR[demo.speed] ?? 2.0;
  const color = theme.category[demo.colorKey as keyof typeof theme.category] ?? theme.accent.primary;
  const name = kfName(type, dur, demo.trail && type !== "ripple");
  const size = demo.size;

  const anim = (n: string, delay = 0, opacity = 1) => ({
    animation: n + " " + dur + "s " + (EASING[type] || "ease-in-out") + " " + delay + "s infinite",
    transformBox: "fill-box" as const,
    transformOrigin: "center",
    opacity,
  });

  const orbitAnim = {
    animation: name + " " + dur + "s linear 0s infinite",
    transformBox: "view-box" as const,
    transformOrigin: "50% 50%",
  };

  const shapeNode = (delay = 0, opacity = 1, key = "main") => {
    const st = anim(name, delay, opacity);
    switch (demo.shape) {
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
        return <path key={key} d={blobPath(demo.seed, size)} fill={color} style={st} />;
    }
    return null;
  };

  const isRipple = type === "ripple";

  return (
    <svg viewBox="0 0 360 360" width="100%" style={{ display: "block", background: theme.bg.chrome, borderRadius: 4 }} role="img" aria-label={demo.title + "动画预览"}>
      <style>{kfCss(type, dur, demo.trail).css}</style>
      <rect x="0" y="0" width="360" height="360" fill={theme.bg.chrome} />
      <line x1="0" y1="180" x2="360" y2="180" stroke={theme.stroke.tertiary} strokeWidth="1" opacity="0.4" />
      <line x1="180" y1="0" x2="180" y2="360" stroke={theme.stroke.tertiary} strokeWidth="1" opacity="0.4" />

      {isRipple ? (
        <g transform="translate(180,180)">
          {shapeNode(0, 1, "core")}
          {[0, 1, 2].map((i) => (
            <circle
              key={"rip" + i}
              r={size * 1.1}
              fill="none"
              stroke={color}
              strokeWidth={size * 0.26}
              style={anim("ga-rip-" + dur, (i * dur) / 3)}
            />
          ))}
        </g>
      ) : type === "orbit" ? (
        <g style={orbitAnim}>
          <g transform="translate(180,50)">{shapeNode(0, 1, "orbiter")}</g>
          <circle cx="180" cy="180" r="3" fill={theme.stroke.tertiary} />
        </g>
      ) : (
        <g transform="translate(180,180)">
          {demo.trail &&
            [1, 2, 3, 4].map((i) =>
              shapeNode(-(i * dur) / (GHOSTS + 1), (GHOSTS - i + 1) / (GHOSTS + 1) / 2.6, "ghost" + i),
            )}
          {shapeNode(0, 1, "main")}
        </g>
      )}
    </svg>
  );
}

function DemoCard({ demo }: { demo: Demo }) {
  const theme = useHostTheme();
  return (
    <Card>
      <CardHeader trailing={<Pill>{demo.type} · {demo.shape}</Pill>}>{demo.title}</CardHeader>
      <CardBody>
        <Stack gap={8}>
          <Stage demo={demo} />
          <Text size="small" tone="secondary">{demo.desc}</Text>
          <Text size="small" tone="tertiary">
            {demo.shape === "circle" ? "圆形" : demo.shape === "square" ? "方块" : demo.shape === "triangle" ? "三角" : demo.shape === "star" ? "星形" : demo.shape === "ring" ? "圆环" : "液态"}
            {" · "}
            {demo.colorKey}
            {" · "}
            {SPEED_LABEL[demo.speed]}速
            {demo.trail && demo.type !== "ripple" ? " · 拖尾" : ""}
            {" · "}
            seed {demo.seed}
          </Text>
        </Stack>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 画廊主体                                                             */
/* ------------------------------------------------------------------ */

export default function AnimationGallery() {
  const theme = useHostTheme();
  const typeCount = new Set(DEMOS.map((d) => d.type)).size;
  return (
    <Stack gap={20} style={{ padding: 24, background: theme.bg.editor }}>
      <Row justify="space-between" align="center">
        <H1 style={{ margin: 0 }}>动画画廊</H1>
        <Pill active>theme: {theme.kind}</Pill>
      </Row>
      <Text tone="secondary">
        由动画实验室引擎驱动的一组精选动画：{DEMOS.length} 组作品，覆盖 {typeCount} 种动画类型 × 6 种形状，并排实时播放。
        每个卡片右下角标注配置（形状 · 颜色 · 速度 · 拖尾 · seed），感兴趣的组合可到动画实验室复现并导出代码。
      </Text>
      <Grid columns={3} gap={16}>
        {DEMOS.map((d, i) => (
          <DemoCard key={i} demo={d} />
        ))}
      </Grid>
      <Text size="small" tone="tertiary">
        颜色：宿主主题 token · 动画：CSS keyframes + transform-box（fill-box / view-box）· 状态：纯声明式，无 rAF
      </Text>
    </Stack>
  );
}
