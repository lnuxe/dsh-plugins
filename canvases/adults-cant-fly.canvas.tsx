import {
  Button,
  Card,
  CardBody,
  CardHeader,
  H1,
  Pill,
  Row,
  Spacer,
  Stack,
  Text,
  useHostTheme,
  useEffect,
  useState,
} from "cursor/canvas";

/* ================================================================== */
/* 《成人不会飞》· 动画短片                                             */
/* 8 幕分镜 · 每幕 6s · 共 48s · 自动播放                              */
/* ================================================================== */

const SCENE_DUR = 6; // 每幕秒数
const SCENE_COUNT = 8;
const TOTAL = SCENE_DUR * SCENE_COUNT;

interface Scene {
  name: string;
  line: string; // 字幕
}

const SCENES: Scene[] = [
  { name: "童年", line: "小时候，每个人都以为自己会飞" },
  { name: "城市", line: "后来我们学会走路，也忘了起飞" },
  { name: "仰望", line: "星星还是那颗星星，只是抬头的人少了" },
  { name: "失眠", line: "凌晨两点，世界安静得像一场梦" },
  { name: "责任", line: "想飞的人，先得学会站稳" },
  { name: "妥协", line: "有些梦，折成纸飞机就够了" },
  { name: "银河", line: "不会飞也没关系，我们都在自己的轨道上" },
  { name: "黎明", line: "成人不会飞，但可以一直走下去" },
];

/* ---- 全局场景 keyframes（视频专用，前缀 gv-） ---- */
const GV_CSS = `
@keyframes gv-walk { from { transform: translateX(-90px); } to { transform: translateX(90px); } }
@keyframes gv-twinkle { 0%,100% { opacity: 0.18; } 50% { opacity: 1; } }
@keyframes gv-meteor {
  0% { transform: translate(0,0); opacity: 0; }
  8% { opacity: 0.9; }
  35% { transform: translate(-260px, -150px); opacity: 0.5; }
  100% { transform: translate(-420px, -240px); opacity: 0; }
}
@keyframes gv-pendulum { from { transform: rotate(-16deg); } to { transform: rotate(16deg); } }
@keyframes gv-rise { 0%,100% { transform: translateY(0); } 25% { transform: translateY(-7px); } 60% { transform: translateY(2px); } }
@keyframes gv-fall { 0% { transform: translateY(-150px) rotate(0deg); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(0px) rotate(26deg); opacity: 1; } }
@keyframes gv-takeoff { 0% { transform: translateY(70px) rotate(0deg); opacity: 0; } 10% { opacity: 1; } 85% { transform: translateY(-290px) rotate(-14deg); opacity: 1; } 100% { transform: translateY(-310px) rotate(-14deg); opacity: 0.6; } }
@keyframes gv-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes gv-orbit { to { transform: rotate(360deg); } }
@keyframes gv-float { 0%,100% { transform: translateY(0) rotate(0deg); } 25% { transform: translateY(-10px) rotate(-5deg); } 50% { transform: translateY(0) rotate(0deg); } 75% { transform: translateY(10px) rotate(5deg); } }
@keyframes gv-caption {
  0% { opacity: 0; transform: translateY(10px); }
  10% { opacity: 1; transform: translateY(0); }
  88% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-6px); }
}
`;

/* ---- 复用引擎：确定性随机 + 形状 ---- */
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

/* 纸飞机（俯视图） */
function paperPlane(x: number, y: number, s: number, color: string, opacity = 1) {
  return (
    <g transform={"translate(" + x + "," + y + ") scale(" + s + ")"} opacity={opacity}>
      <path d="M 20 0 L -18 10 L -6 -12 L -18 -10 Z" fill={color} />
      <line x1="20" y1="0" x2="-6" y2="-12" stroke={color} strokeWidth="1.2" opacity="0.55" />
    </g>
  );
}

/* 人形剪影 */
function person(x: number, y: number, color: string, tilt = 0) {
  return (
    <g transform={"translate(" + x + "," + y + ") rotate(" + tilt + ")"}>
      <circle cx="0" cy="-17" r="9" fill={color} />
      <rect x="-7" y="-8" width="14" height="16" fill={color} />
      <rect x="-7" y="8" width="5" height="10" fill={color} />
      <rect x="2" y="8" width="5" height="10" fill={color} />
    </g>
  );
}

/* ---- 八幕场景 ---- */

function Scene0Childhood({ theme }: any) {
  return (
    <g>
      <rect width="960" height="540" fill={theme.bg.chrome} />
      {/* 云 */}
      {[[140, 90, 70], [300, 140, 54], [700, 80, 64]].map(([cx, cy, r], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={r * 1.8} ry={r} fill={theme.fill.primary} opacity="0.45" />
      ))}
      {/* 纸飞机 ×3，各自漂浮 */}
      <g style={{ animation: "gv-float 5s ease-in-out 0s infinite", transformBox: "fill-box", transformOrigin: "center" }}>{paperPlane(240, 240, 1.6, theme.category.blue)}</g>
      <g style={{ animation: "gv-float 6.5s ease-in-out -2s infinite", transformBox: "fill-box", transformOrigin: "center" }}>{paperPlane(620, 300, 1.2, theme.category.cyan)}</g>
      <g style={{ animation: "gv-float 5.8s ease-in-out -4s infinite", transformBox: "fill-box", transformOrigin: "center" }}>{paperPlane(760, 170, 0.9, theme.category.pink)}</g>
      {/* 闪烁小星 */}
      {[[110, 160], [430, 110], [560, 90], [860, 240]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={theme.category.yellow} style={{ animation: "gv-twinkle 3s ease-in-out " + i * 0.8 + "s infinite" }} />
      ))}
    </g>
  );
}

function Scene1City({ theme }: any) {
  const buildings = [40, 70, 50, 90, 62, 110, 46, 78, 58, 96];
  return (
    <g>
      <rect width="960" height="540" fill={theme.fill.tertiary} />
      {/* 天际线 */}
      {buildings.map((h, i) => (
        <rect key={i} x={i * 96 + 6} y={430 - h * 2.6} width="84" height={h * 2.6 + 10} fill={i % 2 ? theme.fill.primary : theme.fill.secondary} />
      ))}
      {/* 路灯 */}
      {[96, 480, 864].map((x, i) => (
        <g key={i}>
          <line x1={x} y1="430" x2={x} y2="360" stroke={theme.stroke.secondary} strokeWidth="3" />
          <circle cx={x} cy="356" r="5" fill={theme.category.yellow} style={{ animation: "gv-twinkle 2.4s ease-in-out " + i * 0.7 + "s infinite" }} />
        </g>
      ))}
      {/* 行走的方块人 */}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} style={{ animation: "gv-walk 9s linear " + -i * 2.1 + "s infinite", transformBox: "fill-box", transformOrigin: "center" }}>
          {person(i % 2 ? -40 : 40, 410, i === 2 ? theme.accent.primary : theme.text.primary)}
        </g>
      ))}
      {/* 地面线 */}
      <line x1="0" y1="430" x2="960" y2="430" stroke={theme.stroke.secondary} strokeWidth="2" />
    </g>
  );
}

function Scene2LookUp({ theme }: any) {
  return (
    <g>
      <rect width="960" height="540" fill={theme.bg.chrome} />
      {/* 星群 */}
      {[[120, 90], [300, 60], [520, 110], [700, 70], [880, 140], [240, 200], [640, 190]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 4.5 : 2.6} fill={i % 2 ? theme.category.cyan : theme.category.yellow} style={{ animation: "gv-twinkle 2.6s ease-in-out " + i * 0.5 + "s infinite" }} />
      ))}
      {/* 主角仰望的那颗星 */}
      <circle cx="620" cy="150" r="9" fill={theme.accent.primary} style={{ animation: "gv-pulse 2.8s ease-in-out 0s infinite", transformBox: "fill-box", transformOrigin: "center" }} />
      {/* 视线虚线 */}
      <line x1="470" y1="300" x2="600" y2="165" stroke={theme.stroke.tertiary} strokeWidth="1.5" strokeDasharray="5 6" opacity="0.7" />
      {/* 剪影人仰望 */}
      {person(470, 380, theme.fill.primary, -8)}
      {/* 流星 */}
      <line x1="820" y1="60" x2="760" y2="96" stroke={theme.category.yellow} strokeWidth="3" strokeLinecap="round" style={{ animation: "gv-meteor 4.5s linear 0.5s infinite" }} />
    </g>
  );
}

function Scene3Sleepless({ theme }: any) {
  return (
    <g>
      <rect width="960" height="540" fill={theme.bg.chrome} />
      {/* 窗框 */}
      <rect x="300" y="70" width="360" height="340" fill={theme.fill.tertiary} stroke={theme.stroke.primary} strokeWidth="8" />
      <line x1="480" y1="70" x2="480" y2="410" stroke={theme.stroke.primary} strokeWidth="6" />
      <line x1="300" y1="240" x2="660" y2="240" stroke={theme.stroke.primary} strokeWidth="6" />
      {/* 窗外月亮 */}
      <circle cx="620" cy="150" r="34" fill={theme.category.yellow} style={{ animation: "gv-pulse 4s ease-in-out 0s infinite", transformBox: "fill-box", transformOrigin: "center" }} />
      {/* 摆钟（挂在窗内，绕顶部摆） */}
      <g transform="translate(390,150)">
        <g style={{ animation: "gv-pendulum 2.4s ease-in-out 0s infinite alternate", transformBox: "fill-box", transformOrigin: "50% 0%" }}>
          <line x1="0" y1="0" x2="0" y2="46" stroke={theme.stroke.primary} strokeWidth="2.5" />
          <circle cx="0" cy="54" r="10" fill={theme.category.red} />
        </g>
        <circle cx="0" cy="0" r="5" fill={theme.fill.primary} />
      </g>
      {/* 桌上小物：水杯 */}
      <rect x="540" y="330" width="26" height="34" fill="none" stroke={theme.stroke.secondary} strokeWidth="3" />
      <text x="553" y="354" fill={theme.text.tertiary} fontSize="14" textAnchor="middle">水</text>
    </g>
  );
}

function Scene4Weight({ theme }: any) {
  return (
    <g>
      <rect width="960" height="540" fill={theme.bg.chrome} />
      {/* 地面 */}
      <rect x="0" y="420" width="960" height="120" fill={theme.fill.tertiary} />
      <line x1="0" y1="420" x2="960" y2="420" stroke={theme.stroke.secondary} strokeWidth="2" />
      {/* 三只挣扎的气球（被压住，只在小幅抖动） */}
      {[280, 480, 680].map((x, i) => (
        <g key={i} transform={"translate(" + x + ",330)"} style={{ animation: "gv-rise 1.8s ease-in-out " + i * 0.4 + "s infinite" }}>
          <line x1="0" y1="18" x2="0" y2="86" stroke={theme.stroke.tertiary} strokeWidth="1.5" strokeDasharray="3 3" />
          <circle cx="0" cy="-6" r="20" fill={[theme.category.red, theme.category.green, theme.category.blue][i]} />
        </g>
      ))}
      {/* 压住它们的重块 */}
      <rect x="440" y="300" width="120" height="120" fill={theme.category.purple} opacity="0.92" />
      <text x="500" y="366" fill={theme.text.onAccent} fontSize="26" textAnchor="middle" fontWeight="700">重</text>
    </g>
  );
}

function Scene5Landing({ theme }: any) {
  return (
    <g>
      <rect width="960" height="540" fill={theme.bg.chrome} />
      {/* 黄昏色带 */}
      <rect x="0" y="0" width="960" height="300" fill={theme.fill.secondary} opacity="0.35" />
      {/* 地面 */}
      <line x1="0" y1="430" x2="960" y2="430" stroke={theme.stroke.secondary} strokeWidth="2" />
      <rect x="0" y="430" width="960" height="110" fill={theme.fill.tertiary} />
      {/* 纸飞机缓缓坠落落地 */}
      <g transform="translate(480,430)" style={{ animation: "gv-fall 3.6s ease-in 0s 1 forwards", transformBox: "fill-box", transformOrigin: "center" }}>
        {paperPlane(0, 0, 1.8, theme.category.blue)}
      </g>
      {/* 落地后留在原地的淡淡影子 */}
      <ellipse cx="560" cy="432" rx="40" ry="6" fill={theme.fill.primary} opacity="0.5" />
    </g>
  );
}

function Scene6Galaxy({ theme }: any) {
  const orbits = [
    { r: 90, dur: 13, stars: 3 },
    { r: 150, dur: 20, stars: 4 },
    { r: 210, dur: 30, stars: 5 },
  ];
  const rnd = mulberry32(9);
  const colors = [theme.category.cyan, theme.category.yellow, theme.category.pink, theme.category.blue];
  return (
    <g>
      <rect width="960" height="540" fill={theme.bg.chrome} />
      <g transform="translate(480,270)">
        {orbits.map((o, oi) => (
          <g key={oi}>
            <circle r={o.r} fill="none" stroke={theme.stroke.tertiary} strokeWidth="1" opacity="0.35" />
            {Array.from({ length: o.stars }).map((_, si) => {
              const a = (si / o.stars) * Math.PI * 2;
              return (
                <g key={si} style={{ animation: "gv-orbit " + o.dur + "s linear " + -((a / (Math.PI * 2)) * o.dur) + "s infinite", transformBox: "view-box", transformOrigin: "50% 50%" }}>
                  <circle cx={Math.cos(a) * o.r} cy={Math.sin(a) * o.r} r={oi === 0 ? 5 : 3.4} fill={colors[(oi + si) % 4]} />
                </g>
              );
            })}
          </g>
        ))}
        {/* 中心亮星 */}
        <circle r="11" fill={theme.accent.primary} style={{ animation: "gv-pulse 3.2s ease-in-out 0s infinite", transformBox: "fill-box", transformOrigin: "center" }} />
      </g>
    </g>
  );
}

function Scene7Dawn({ theme }: any) {
  return (
    <g>
      <rect width="960" height="540" fill={theme.category.orange} />
      {/* 太阳 */}
      <circle cx="720" cy="330" r="80" fill={theme.category.yellow} opacity="0.95" />
      <line x1="0" y1="330" x2="960" y2="330" stroke={theme.text.onAccent} strokeWidth="2" opacity="0.35" />
      {/* 升空的纸飞机 + 两道残影 */}
      <g transform="translate(300,480)" style={{ animation: "gv-takeoff 4.6s ease-out 0s 1 forwards", transformBox: "fill-box", transformOrigin: "center" }}>
        {paperPlane(0, 0, 1.7, theme.category.cyan)}
      </g>
      <g transform="translate(300,480)" opacity="0.3" style={{ animation: "gv-takeoff 4.6s ease-out -0.5s 1 forwards", transformBox: "fill-box", transformOrigin: "center" }}>
        {paperPlane(0, 0, 1.7, theme.category.cyan)}
      </g>
      <g transform="translate(300,480)" opacity="0.15" style={{ animation: "gv-takeoff 4.6s ease-out -1s 1 forwards", transformBox: "fill-box", transformOrigin: "center" }}>
        {paperPlane(0, 0, 1.7, theme.category.cyan)}
      </g>
      {/* 终点星标 */}
      <circle cx="300" cy="120" r="6" fill={theme.category.yellow} />
    </g>
  );
}

/* ---- 舞台：当前幕 + 字幕 + 幕号 ---- */
function Stage({ idx, theme }: any) {
  const scene = SCENES[idx];
  return (
    <svg viewBox="0 0 960 540" width="100%" style={{ display: "block", background: theme.bg.chrome, borderRadius: 4 }} role="img" aria-label={scene.name + "幕动画"}>
      <style>{GV_CSS}</style>
      {idx === 0 && <Scene0Childhood theme={theme} />}
      {idx === 1 && <Scene1City theme={theme} />}
      {idx === 2 && <Scene2LookUp theme={theme} />}
      {idx === 3 && <Scene3Sleepless theme={theme} />}
      {idx === 4 && <Scene4Weight theme={theme} />}
      {idx === 5 && <Scene5Landing theme={theme} />}
      {idx === 6 && <Scene6Galaxy theme={theme} />}
      {idx === 7 && <Scene7Dawn theme={theme} />}
      {/* 幕号 */}
      <text x="24" y="40" fill={theme.text.tertiary} fontSize="15" letterSpacing="2">
        SCENE {String(idx + 1).padStart(2, "0")} / {SCENE_COUNT}
      </text>
      {/* 字幕条 + 歌词 */}
      <g key={idx}>
        <rect x="0" y="470" width="960" height="70" fill={theme.bg.editor} opacity="0.72" />
        <text x="480" y="514" fill={theme.text.primary} fontSize="27" textAnchor="middle" letterSpacing="1" style={{ animation: "gv-caption " + SCENE_DUR + "s ease-in-out 0s 1 forwards" }}>
          {scene.line}
        </text>
      </g>
    </svg>
  );
}

function fmt(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/* ---- 面板主体 ---- */
export default function AdultCantFly() {
  const theme = useHostTheme();
  const [playing, setPlaying] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  const idx = Math.min(Math.floor(elapsed / SCENE_DUR), SCENE_COUNT - 1);
  const finished = elapsed >= TOTAL;

  /* 播放计时 */
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setElapsed((e) => e + 0.25), 250);
    return () => clearInterval(id);
  }, [playing]);

  useEffect(() => {
    if (elapsed >= TOTAL) setPlaying(false);
  }, [elapsed]);

  const toggle = () => {
    if (finished) {
      setElapsed(0);
      setPlaying(true);
    } else {
      setPlaying(!playing);
    }
  };

  const progress = Math.min(elapsed / TOTAL, 1);

  return (
    <Stack gap={20} style={{ padding: 24, background: theme.bg.editor }}>
      <Row justify="space-between" align="center">
        <H1 style={{ margin: 0 }}>成人不会飞 · 动画短片</H1>
        <Pill active>theme: {theme.kind}</Pill>
      </Row>
      <Text tone="secondary">
        8 幕分镜 · 每幕 {SCENE_DUR}s · 共 {TOTAL}s · 打开即自动播放。以「成人不会飞」的歌词意境创作：童年 → 城市 → 仰望 → 失眠 → 责任 → 妥协 → 银河 → 黎明。
      </Text>

      <Card>
        <CardHeader trailing={<Pill>{SCENES[idx].name} · 第 {idx + 1}/{SCENE_COUNT} 幕</Pill>}>视频预览</CardHeader>
        <CardBody>
          <Stack gap={12}>
            <Stage idx={idx} theme={theme} />

            {/* 控制条 */}
            <Row gap={12} align="center">
              <Button variant={playing ? "secondary" : "primary"} onClick={toggle}>
                {finished ? "重播" : playing ? "暂停" : "播放"}
              </Button>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: theme.fill.tertiary, overflow: "hidden" }}>
                <div style={{ height: "100%", width: (progress * 100).toFixed(1) + "%", background: theme.accent.primary, borderRadius: 3 }} />
              </div>
              <Text size="small" tone="secondary" style={{ minWidth: 76, textAlign: "right" }}>
                {fmt(elapsed)} / {fmt(TOTAL)}
              </Text>
              <Spacer />
              {SCENES.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 8, height: 8, borderRadius: 4,
                    background: i === idx ? theme.accent.primary : theme.fill.tertiary,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setElapsed(i * SCENE_DUR + 0.01);
                    setPlaying(true);
                  }}
                />
              ))}
            </Row>

            {/* 分镜表 */}
            <Stack gap={4}>
              {SCENES.map((s, i) => (
                <Row key={i} gap={10} align="center">
                  <Text size="small" tone={i === idx ? "primary" : "tertiary"} style={{ width: 22 }}>
                    {String(i + 1).padStart(2, "0")}
                  </Text>
                  <Text size="small" weight={i === idx ? "bold" : undefined} tone={i === idx ? "primary" : "secondary"} style={{ width: 52 }}>
                    {s.name}
                  </Text>
                  <Text size="small" tone={i === idx ? "primary" : "tertiary"}>{s.line}</Text>
                </Row>
              ))}
            </Stack>
          </Stack>
        </CardBody>
      </Card>

      <Text size="small" tone="tertiary">
        颜色：宿主主题 token · 动画：CSS keyframes 全声明式（无 rAF）· 播放：setInterval 250ms 驱动进度，幕切换自动重挂场景
      </Text>
    </Stack>
  );
}
