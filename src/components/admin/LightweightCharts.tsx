type LinePoint = { label: string; value: number };
type BarPoint = { label: string; values: number[] };
type DonutPoint = { label: string; value: number; color: string };

const chartBox = { left: 52, right: 620, top: 20, bottom: 228 };

export function LineTrendChart({
  data,
  color,
  label,
}: {
  data: LinePoint[];
  color: string;
  label: string;
}) {
  const maxValue = Math.max(1, ...data.map((point) => point.value));
  const xFor = (index: number) =>
    data.length < 2
      ? (chartBox.left + chartBox.right) / 2
      : chartBox.left + (index / (data.length - 1)) * (chartBox.right - chartBox.left);
  const yFor = (value: number) =>
    chartBox.bottom - (value / maxValue) * (chartBox.bottom - chartBox.top);
  const points = data.map((point, index) => `${xFor(index)},${yFor(point.value)}`).join(" ");

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 640 270"
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {[0, 1, 2, 3, 4].map((tick) => {
        const y = chartBox.top + (tick / 4) * (chartBox.bottom - chartBox.top);
        return (
          <line
            key={tick}
            x1={chartBox.left}
            x2={chartBox.right}
            y1={y}
            y2={y}
            stroke="var(--border)"
            strokeDasharray="4 5"
          />
        );
      })}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((point, index) => (
        <g key={point.label}>
          <circle cx={xFor(index)} cy={yFor(point.value)} r="5" fill={color} />
          <text
            x={xFor(index)}
            y="258"
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="12"
          >
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function BarTrendChart({
  data,
  colors,
  label,
}: {
  data: BarPoint[];
  colors: string[];
  label: string;
}) {
  const maxValue = Math.max(1, ...data.flatMap((point) => point.values));
  const groupWidth = (chartBox.right - chartBox.left) / Math.max(data.length, 1);
  const seriesCount = Math.max(1, colors.length);
  const barWidth = Math.min(28, (groupWidth * 0.72) / seriesCount);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 640 270"
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {[0, 1, 2, 3, 4].map((tick) => {
        const y = chartBox.top + (tick / 4) * (chartBox.bottom - chartBox.top);
        return (
          <line
            key={tick}
            x1={chartBox.left}
            x2={chartBox.right}
            y1={y}
            y2={y}
            stroke="var(--border)"
            strokeDasharray="4 5"
          />
        );
      })}
      {data.map((point, index) => {
        const centerX = chartBox.left + (index + 0.5) * groupWidth;
        const startX = centerX - (seriesCount * barWidth) / 2;
        return (
          <g key={point.label}>
            {point.values.map((value, seriesIndex) => {
              const height = (value / maxValue) * (chartBox.bottom - chartBox.top);
              return (
                <rect
                  key={`${point.label}-${seriesIndex}`}
                  x={startX + seriesIndex * barWidth}
                  y={chartBox.bottom - height}
                  width={Math.max(4, barWidth - 4)}
                  height={height}
                  rx="4"
                  fill={colors[seriesIndex % colors.length]}
                />
              );
            })}
            <text
              x={centerX}
              y="258"
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize="12"
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function DonutTrendChart({ data }: { data: DonutPoint[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let current = 0;
  const stops = data.map((item) => {
    const start = current;
    current += total ? (item.value / total) * 100 : 0;
    return `${item.color} ${start}% ${current}%`;
  });

  return (
    <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[minmax(140px,1fr)_minmax(0,1fr)]">
      <div
        role="img"
        aria-label={`Category distribution across ${total} reports`}
        className="mx-auto flex aspect-square w-full max-w-48 items-center justify-center rounded-full p-8"
        style={{ backgroundImage: `conic-gradient(${stops.join(",")})` }}
      >
        <div className="flex h-full w-full items-center justify-center rounded-full bg-card text-center">
          <span className="text-2xl font-bold">{total}</span>
        </div>
      </div>
      <ul className="space-y-3">
        {data.map((item) => (
          <li key={item.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="font-medium tabular-nums">{item.value}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
