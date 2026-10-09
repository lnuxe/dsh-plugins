import { H1, Stack, Text, useHostTheme } from "cursor/canvas";

export default function AbstractComposition() {
  const theme = useHostTheme();
  const t = theme.tokens;

  return (
    <Stack gap={16} style={{ padding: 8 }}>
      <Stack gap={4}>
        <H1>Composition No. 7 — 几何抽象</H1>
        <Text tone="secondary">
          平涂色块、直线与圆弧的几何构成，颜色取自当前编辑器主题（亮色 / 暗色自适应）。
        </Text>
      </Stack>

      <svg
        viewBox="0 0 800 560"
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label="几何抽象画：红黄蓝紫色块、青色圆与线条构成"
      >
        {/* 底色 */}
        <rect x="0" y="0" width="800" height="560" fill={t.bg.chrome} />

        {/* 粗网格线（蒙德里安式分割） */}
        <line x1="220" y1="0" x2="220" y2="560" stroke={t.stroke.primary} strokeWidth="6" />
        <line x1="560" y1="0" x2="560" y2="560" stroke={t.stroke.primary} strokeWidth="6" />
        <line x1="0" y1="140" x2="800" y2="140" stroke={t.stroke.primary} strokeWidth="6" />
        <line x1="0" y1="420" x2="800" y2="420" stroke={t.stroke.primary} strokeWidth="6" />

        {/* 四角色块：红 · 黄 · 蓝 · 紫 */}
        <rect x="0" y="0" width="220" height="140" fill={t.category.red} />
        <rect x="560" y="0" width="240" height="140" fill={t.category.yellow} />
        <rect x="0" y="420" width="220" height="140" fill={t.accent.primary} />
        <rect x="560" y="420" width="240" height="140" fill={t.category.purple} />

        {/* 主视觉：中央大圆 */}
        <circle cx="390" cy="280" r="95" fill={t.category.cyan} />

        {/* 左中：描边小圆，与主圆呼应 */}
        <circle cx="110" cy="280" r="45" fill="none" stroke={t.category.cyan} strokeWidth="8" />

        {/* 右中：中性浮块 */}
        <rect x="620" y="190" width="130" height="180" fill={t.fill.secondary} />

        {/* 中上：细线纹理 */}
        <line x1="250" y1="70" x2="530" y2="70" stroke={t.stroke.secondary} strokeWidth="2" />
        <line x1="250" y1="104" x2="530" y2="104" stroke={t.stroke.tertiary} strokeWidth="2" />

        {/* 中下：圆弧 */}
        <path
          d="M 250 500 Q 390 430 530 500"
          stroke={t.stroke.secondary}
          strokeWidth="6"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </Stack>
  );
}
