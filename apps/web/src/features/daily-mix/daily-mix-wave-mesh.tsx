import { useId, useMemo, type ReactElement } from "react";

export interface DailyMixWaveMeshProps {
  amplitude?: number;
  brightness?: {
    ambient: number;
    primary: number;
    secondary: number;
  };
  className?: string;
  fadeRange?: number;
  lineCount?: number;
  lineWidth?: number;
  peakCount?: 2 | 3;
}

interface MeshPoint {
  x: number;
  y: number;
}

const meshWidth = 600;
const meshHeight = 236;
const sampleCount = 44;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function bell(value: number, center: number, spread: number): number {
  return Math.exp(-((value - center) ** 2) / spread);
}

function meshPoint(
  progress: number,
  depth: number,
  rowIndex: number,
  family: 0 | 1 | 2,
  peakCount: 2 | 3,
  amplitude: number,
): MeshPoint {
  // 三组线束共享低频节奏，但使用错开的峰位与相位，形成同一声场里的前后穿插。
  const turns = peakCount === 3 ? 1 : 0.82;
  const theta = progress * Math.PI * 2;
  const sharedDrift = Math.sin(theta * 0.52 + 0.9) * 8 - bell(progress, 0.71, 0.026) * 14;
  const centers = [
    meshHeight * 0.54 +
      Math.sin(theta * 1.16 * turns - 0.72 + depth * 0.42) * 31 +
      Math.sin(theta * 2.04 * turns + 0.38) * 7,
    meshHeight * 0.49 +
      Math.sin(theta * 0.86 * turns + 1.12 + depth * 0.5) * 42 -
      bell(progress, 0.7, 0.02) * 34 +
      bell(progress, 0.9, 0.025) * 25,
    meshHeight * 0.58 +
      Math.sin(theta * 1.38 * turns + 2.2 + depth * 0.56) * 35 +
      Math.sin(theta * 0.64 - 0.3) * 11 +
      bell(progress, 0.55, 0.026) * 18,
  ] as const;
  const thicknesses = [
    15 + bell(progress, 0.3, 0.045) * 9 + bell(progress, 0.75, 0.04) * 13,
    11 + bell(progress, 0.68, 0.04) * 18,
    14 + bell(progress, 0.5, 0.05) * 12 + bell(progress, 0.86, 0.04) * 8,
  ] as const;
  const localVariation =
    Math.sin(theta * 1.7 + rowIndex * 0.27 + family * 0.8) * 1.35 +
    Math.sin(theta * 3.2 - rowIndex * 0.17) * 0.55;

  return {
    x:
      -24 +
      progress * (meshWidth + 48) +
      depth * (7 + bell(progress, 0.7, 0.055) * (family === 1 ? 24 : 13)) +
      Math.sin(theta * 0.72 + depth * 1.25 + family) * 4,
    y:
      centers[family] +
      sharedDrift +
      depth * thicknesses[family] * amplitude +
      localVariation * (0.45 + Math.abs(depth) * 0.55),
  };
}

function smoothPath(points: MeshPoint[]): string {
  const first = points[0];
  if (first === undefined) return "";
  let path = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)] ?? first;
    const current = points[index] ?? first;
    const next = points[index + 1] ?? current;
    const following = points[Math.min(points.length - 1, index + 2)] ?? next;
    const controlOneX = current.x + (next.x - previous.x) / 6;
    const controlOneY = current.y + (next.y - previous.y) / 6;
    const controlTwoX = next.x - (following.x - current.x) / 6;
    const controlTwoY = next.y - (following.y - current.y) / 6;
    path += ` C ${controlOneX.toFixed(2)} ${controlOneY.toFixed(2)}, ${controlTwoX.toFixed(2)} ${controlTwoY.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
  }

  return path;
}

function surfacePath(upper: MeshPoint[], lower: MeshPoint[]): string {
  const returnPath = smoothPath([...lower].reverse()).replace(/^M /, "L ");
  return `${smoothPath(upper)} ${returnPath} Z`;
}

function toneForLine(index: number, count: number): "ambient" | "primary" | "secondary" {
  if (index === 0 || index === count - 1 || index === Math.floor(count / 2)) return "primary";
  if (index % 3 === 0 || index % 5 === 0) return "secondary";
  return "ambient";
}

export function DailyMixWaveMesh({
  amplitude = 1,
  brightness = { ambient: 0.18, primary: 0.58, secondary: 0.34 },
  className,
  fadeRange = 0.2,
  lineCount = 72,
  lineWidth = 0.72,
  peakCount = 3,
}: DailyMixWaveMeshProps): ReactElement {
  const maskId = useId().replaceAll(":", "");
  const safeLineCount = Math.round(clamp(lineCount, 48, 72));
  const safeFadeRange = clamp(fadeRange, 0.12, 0.34);
  const safeAmplitude = clamp(amplitude, 0.65, 1.35);
  const paths = useMemo(() => {
    const primaryCount = Math.round(safeLineCount * 0.42);
    const highCount = Math.round(safeLineCount * 0.28);
    const familyCounts = [primaryCount, highCount, safeLineCount - primaryCount - highCount];
    return familyCounts.flatMap((count, familyIndex) =>
      Array.from({ length: count }, (_, rowIndex) => {
        const depth = -1 + (rowIndex / Math.max(1, count - 1)) * 2;
        const family = familyIndex as 0 | 1 | 2;
        const points = Array.from({ length: sampleCount + 1 }, (_, columnIndex) =>
          meshPoint(columnIndex / sampleCount, depth, rowIndex, family, peakCount, safeAmplitude),
        );
        return { depth, family, path: smoothPath(points), tone: toneForLine(rowIndex, count) };
      }),
    );
  }, [peakCount, safeAmplitude, safeLineCount]);
  const surfaces = useMemo(
    () =>
      ([0, 1, 2] as const).map((family) => {
        const upper = Array.from({ length: sampleCount + 1 }, (_, columnIndex) =>
          meshPoint(columnIndex / sampleCount, -1, 0, family, peakCount, safeAmplitude),
        );
        const lower = Array.from({ length: sampleCount + 1 }, (_, columnIndex) =>
          meshPoint(columnIndex / sampleCount, 1, safeLineCount, family, peakCount, safeAmplitude),
        );
        return surfacePath(upper, lower);
      }),
    [peakCount, safeAmplitude, safeLineCount],
  );
  const classes = ["daily-mix-soundfield", className].filter(Boolean).join(" ");

  return (
    <svg
      aria-hidden="true"
      className={classes}
      preserveAspectRatio="xMidYMid slice"
      viewBox={[0, 0, meshWidth, meshHeight].join(" ")}
    >
      <defs>
        <linearGradient id={`${maskId}-horizontal`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="black" />
          <stop offset={safeFadeRange} stopColor="white" />
          <stop offset={1 - safeFadeRange} stopColor="white" />
          <stop offset="1" stopColor="black" />
        </linearGradient>
        <linearGradient id={`${maskId}-vertical`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="black" />
          <stop offset="0.14" stopColor="white" />
          <stop offset="0.84" stopColor="white" />
          <stop offset="1" stopColor="black" />
        </linearGradient>
        <linearGradient
          id={`${maskId}-stroke`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          x2={meshWidth}
          y1="0"
          y2="0"
        >
          <stop offset="0" stopColor="#747d87" />
          <stop offset="0.34" stopColor="#aeb6be" />
          <stop offset="0.7" stopColor="#f1f3f5" />
          <stop offset="1" stopColor="#8b949d" />
        </linearGradient>
        <linearGradient
          id={`${maskId}-surface`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          x2={meshWidth}
          y1="0"
          y2="0"
        >
          <stop offset="0" stopColor="#75808a" stopOpacity="0.012" />
          <stop offset="0.64" stopColor="#e4e8eb" stopOpacity="0.048" />
          <stop offset="1" stopColor="#939ca5" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id={`${maskId}-glint`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="white" stopOpacity="0.66" />
          <stop offset="0.2" stopColor="white" stopOpacity="0.52" />
          <stop offset="0.48" stopColor="white" stopOpacity="0.2" />
          <stop offset="0.74" stopColor="white" stopOpacity="0.05" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={`${maskId}-horizontal-mask`} maskUnits="userSpaceOnUse">
          <rect width={meshWidth} height={meshHeight} fill={`url(#${maskId}-horizontal)`} />
        </mask>
        <mask id={`${maskId}-vertical-mask`} maskUnits="userSpaceOnUse">
          <rect width={meshWidth} height={meshHeight} fill={`url(#${maskId}-vertical)`} />
        </mask>
        <mask
          id={`${maskId}-glint-mask`}
          height={meshHeight + 200}
          maskUnits="userSpaceOnUse"
          width={meshWidth + 720}
          x="-360"
          y="-100"
        >
          <g className="daily-mix-soundfield__glint-window">
            <ellipse
              cx="-180"
              cy={meshHeight * 0.52}
              fill={`url(#${maskId}-glint)`}
              rx="180"
              ry="92"
              transform={`rotate(-8 -180 ${String(meshHeight * 0.52)})`}
            />
          </g>
        </mask>
      </defs>
      {/* 水平与垂直 mask 分层相乘，消除 SVG 自身的矩形边界。 */}
      <g mask={`url(#${maskId}-horizontal-mask)`}>
        <g mask={`url(#${maskId}-vertical-mask)`}>
          {([0, 1, 2] as const).map((family) => (
            <g
              className={`daily-mix-soundfield__family daily-mix-soundfield__family--${String(family)}`}
              key={`family-${String(family)}`}
            >
              <path
                className="daily-mix-soundfield__surface"
                d={surfaces[family] ?? ""}
                fill={`url(#${maskId}-surface)`}
              />
              {paths
                .filter((line) => line.family === family)
                .map(({ depth, path, tone }, index) => {
                  const edgeAttenuation = 1 - Math.abs(depth) * 0.22;
                  return (
                    <path
                      className={`daily-mix-soundfield__line daily-mix-soundfield__line--${tone}`}
                      d={path}
                      key={index}
                      opacity={brightness[tone] * edgeAttenuation}
                      stroke={`url(#${maskId}-stroke)`}
                      strokeWidth={lineWidth}
                    />
                  );
                })}
            </g>
          ))}
          <g className="daily-mix-soundfield__glint" mask={`url(#${maskId}-glint-mask)`}>
            {paths.map(({ depth, path }, index) => (
              <path
                className="daily-mix-soundfield__line"
                d={path}
                key={`glint-${String(index)}`}
                opacity={(1 - Math.abs(depth) * 0.3) * 0.32}
                stroke="#f3f5f6"
                strokeWidth={lineWidth}
              />
            ))}
          </g>
        </g>
      </g>
    </svg>
  );
}
