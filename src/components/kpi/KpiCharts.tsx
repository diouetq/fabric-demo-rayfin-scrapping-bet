import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  fmtAxisEur,
  niceTicks,
  type PeriodProfitPoint,
  type ProfitGranularity,
} from '@/lib/kpi-analytics';

const W = 640;
const H = 260;
const PAD = { t: 28, r: 20, b: 44, l: 64 };

function fmtLabelEur(v: number): string {
  const n = Math.round(v);
  const s = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.abs(n));
  if (n > 0) return `+${s}`;
  if (n < 0) return `−${s}`;
  return s;
}

/** Courbe lissée (splines cubiques) à partir de points [x, y]. */
function smoothLinePath(points: [number, number][]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(i + 2, points.length - 1)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

function findExtremaIndices(values: number[]): { maxIdx: number; minIdx: number } {
  let maxIdx = 0;
  let minIdx = 0;
  values.forEach((v, i) => {
    if (v > values[maxIdx]) maxIdx = i;
    if (v < values[minIdx]) minIdx = i;
  });
  return { maxIdx, minIdx };
}

function ChartTooltip({
  x,
  y,
  visible,
  children,
}: {
  x: number;
  y: number;
  visible: boolean;
  children: ReactNode;
}) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none fixed z-[9999] rounded-lg border border-border bg-popover/95 backdrop-blur-sm px-3 py-2 text-xs shadow-xl"
      style={{ left: x + 14, top: y - 12 }}
    >
      {children}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function BankrollChart({ data }: { data: { date: Date; profit: number }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; date: Date; profit: number; cx: number } | null>(null);

  if (data.length < 2) return <EmptyChart message="Pas assez de paris terminés pour tracer la courbe" />;

  const pw = W - PAD.l - PAD.r;
  const ph = H - PAD.t - PAD.b;

  const profits = data.map((d) => d.profit);
  const rawMin = Math.min(...profits, 0);
  const rawMax = Math.max(...profits, 0);
  const yTicks = niceTicks(rawMin, rawMax, 6);
  const minP = yTicks[0];
  const maxP = yTicks[yTicks.length - 1];
  const pRange = maxP - minP || 1;

  const minT = data[0].date.getTime();
  const maxT = data[data.length - 1].date.getTime();
  const tRange = maxT - minT || 1;

  const sx = (t: number) => PAD.l + ((t - minT) / tRange) * pw;
  const sy = (p: number) => PAD.t + ph - ((p - minP) / pRange) * ph;
  const zeroY = sy(0);

  const last = data[data.length - 1].profit;
  const positive = last >= 0;
  const stroke = positive ? 'var(--color-emerald-500, #10b981)' : 'var(--color-red-500, #ef4444)';

  const pts: [number, number][] = data.map((d) => [sx(d.date.getTime()), sy(d.profit)]);
  const linePath = smoothLinePath(pts);

  const areaPath = [
    `M${pts[0][0].toFixed(2)},${zeroY.toFixed(2)}`,
    ...pts.slice(1).map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`),
    `L${pts[pts.length - 1][0].toFixed(2)},${zeroY.toFixed(2)}`,
    'Z',
  ].join(' ');

  const { maxIdx, minIdx } = findExtremaIndices(profits);
  const labelIndices = new Set<number>([maxIdx, minIdx]);
  if (maxIdx === minIdx && data.length > 2) {
    labelIndices.add(data.length - 1);
  }

  const xTickCount = Math.min(6, data.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) =>
    data[Math.round((i / Math.max(xTickCount - 1, 1)) * (data.length - 1))],
  );

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    data.forEach((d, i) => {
      const dist = Math.abs(sx(d.date.getTime()) - mx);
      if (dist < bestDist) { bestDist = dist; best = i; }
    });
    const cx = sx(data[best].date.getTime());
    setTip({ x: e.clientX, y: e.clientY, date: data[best].date, profit: data[best].profit, cx });
  };

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        style={{ height: 260 }}
        onMouseMove={onMove}
        onMouseLeave={() => setTip(null)}
      >
        <defs>
          <linearGradient id="bankroll-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((v) => {
          const y = sy(v);
          return (
            <g key={v}>
              <line
                x1={PAD.l}
                y1={y}
                x2={W - PAD.r}
                y2={y}
                stroke="currentColor"
                className="text-border"
                strokeWidth={v === 0 ? 1.25 : 0.75}
                strokeOpacity={v === 0 ? 0.55 : 0.28}
                strokeDasharray={v === 0 ? '5 4' : undefined}
              />
              <text
                x={PAD.l - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 10, fontFamily: 'var(--font-numeric, ui-monospace)' }}
              >
                {fmtAxisEur(v)}
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill="url(#bankroll-fill)" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

        {data.map((d, i) => {
          if (!labelIndices.has(i)) return null;
          const cx = sx(d.date.getTime());
          const cy = sy(d.profit);
          const labelY = i === minIdx && i !== maxIdx ? cy + 14 : cy - 10;
          return (
            <text
              key={`lbl-${i}`}
              x={cx}
              y={labelY}
              textAnchor="middle"
              className={cn(d.profit >= 0 ? 'fill-emerald-600' : 'fill-red-600')}
              style={{ fontSize: 9, fontWeight: 600, fontFamily: 'var(--font-numeric, ui-monospace)' }}
            >
              {fmtLabelEur(d.profit)}
            </text>
          );
        })}

        {tip && (
          <line
            x1={tip.cx}
            y1={PAD.t}
            x2={tip.cx}
            y2={H - PAD.b}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.6}
          />
        )}

        {/* Zone invisible pour le survol (sans points visibles) */}
        <path
          d={linePath}
          fill="none"
          stroke="transparent"
          strokeWidth={12}
          pointerEvents="stroke"
        />

        {xTicks.map((d, i) => (
          <text
            key={i}
            x={sx(d.date.getTime())}
            y={H - 14}
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
            className="fill-muted-foreground"
            style={{ fontSize: 10 }}
          >
            {d.date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
          </text>
        ))}
      </svg>

      <ChartTooltip x={tip?.x ?? 0} y={tip?.y ?? 0} visible={tip != null}>
        {tip && (
          <>
            <p className="font-semibold text-foreground">{tip.date.toLocaleDateString('fr-FR')}</p>
            <p className={cn('tabular-nums font-medium', tip.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {fmtLabelEur(tip.profit)}
            </p>
          </>
        )}
      </ChartTooltip>
    </div>
  );
}

const GRANULARITY_LABELS: Record<ProfitGranularity, string> = {
  day: 'Jour',
  week: 'Semaine',
  month: 'Mois',
  quarter: 'Trimestre',
  year: 'Année',
};

export function GranularitySelect({
  value,
  onChange,
}: {
  value: ProfitGranularity;
  onChange: (v: ProfitGranularity) => void;
}) {
  const options: ProfitGranularity[] = ['day', 'week', 'month', 'quarter', 'year'];
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 gap-0.5">
      {options.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onChange(g)}
          className={cn(
            'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
            value === g ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {GRANULARITY_LABELS[g]}
        </button>
      ))}
    </div>
  );
}

export function PeriodProfitChart({
  data,
  granularity,
}: {
  data: PeriodProfitPoint[];
  granularity: ProfitGranularity;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; pt: PeriodProfitPoint; cx: number } | null>(null);

  if (data.length === 0) return <EmptyChart message="Aucun profit sur cette période" />;

  const pw = W - PAD.l - PAD.r;
  const ph = H - PAD.t - PAD.b;

  const profits = data.map((d) => d.profit);
  const rawMin = Math.min(...profits, 0);
  const rawMax = Math.max(...profits, 0);
  const yTicks = niceTicks(rawMin, rawMax, 6);
  const minP = yTicks[0];
  const maxP = yTicks[yTicks.length - 1];
  const pRange = maxP - minP || 1;
  const zeroY = PAD.t + ph - ((0 - minP) / pRange) * ph;

  const barGap = granularity === 'day' ? 1 : 4;
  const slotW = pw / data.length;
  const barW =
    granularity === 'day'
      ? Math.max(1, Math.min(3, slotW * 0.55))
      : Math.max(8, Math.min(48, slotW * 0.72 - barGap));
  const barRx = granularity === 'day' ? 0.5 : 3;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    data.forEach((d, i) => {
      const cx = PAD.l + (i + 0.5) * (pw / data.length);
      if (Math.abs(cx - mx) < bestDist) { bestDist = Math.abs(cx - mx); best = i; }
    });
    const cx = PAD.l + (best + 0.5) * (pw / data.length);
    setTip({ x: e.clientX, y: e.clientY, pt: data[best], cx });
  };

  const labelEvery = data.length > 14 ? Math.ceil(data.length / 8) : data.length > 8 ? 2 : 1;
  const showValueLabels = granularity === 'day' ? data.length <= 31 : data.length <= 16 && barW >= 12;
  const { maxIdx, minIdx } = findExtremaIndices(profits);
  const valueLabelIndices = showValueLabels
    ? new Set(data.map((_, i) => i))
    : new Set([maxIdx, minIdx].filter((i) => profits[i] !== 0));

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full select-none"
        style={{ height: 260 }}
        onMouseMove={onMove}
        onMouseLeave={() => setTip(null)}
      >
        {yTicks.map((v) => {
          const y = PAD.t + ph - ((v - minP) / pRange) * ph;
          return (
            <g key={v}>
              <line
                x1={PAD.l}
                y1={y}
                x2={W - PAD.r}
                y2={y}
                stroke="currentColor"
                className="text-border"
                strokeWidth={v === 0 ? 1.25 : 0.75}
                strokeOpacity={v === 0 ? 0.55 : 0.28}
                strokeDasharray={v === 0 ? '5 4' : undefined}
              />
              <text
                x={PAD.l - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 10, fontFamily: 'var(--font-numeric, ui-monospace)' }}
              >
                {fmtAxisEur(v)}
              </text>
            </g>
          );
        })}

        {tip && (
          <line
            x1={tip.cx}
            y1={PAD.t}
            x2={tip.cx}
            y2={H - PAD.b}
            stroke="currentColor"
            className="text-muted-foreground"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.6}
          />
        )}

        {data.map((d, i) => {
          const cx = PAD.l + (i + 0.5) * (pw / data.length);
          const h = (Math.abs(d.profit) / pRange) * ph;
          const isPos = d.profit >= 0;
          const y = isPos ? zeroY - h : zeroY;
          const fill = isPos ? '#10b981' : '#ef4444';
          const active = tip?.pt.key === d.key;
          return (
            <g key={d.key}>
              <rect
                x={cx - barW / 2}
                y={y}
                width={barW}
                height={Math.max(h, d.profit !== 0 ? 3 : 0)}
                fill={fill}
                opacity={active ? 1 : 0.82}
                rx={barRx}
              />
              {valueLabelIndices.has(i) && d.profit !== 0 && (
                <text
                  x={cx}
                  y={isPos ? y - 4 : y + h + 12}
                  textAnchor="middle"
                  className={cn(isPos ? 'fill-emerald-700' : 'fill-red-700')}
                  style={{ fontSize: granularity === 'day' ? 7 : 8, fontWeight: 600, fontFamily: 'var(--font-numeric, ui-monospace)' }}
                >
                  {fmtLabelEur(d.profit)}
                </text>
              )}
            </g>
          );
        })}

        {data.map((d, i) => {
          if (i % labelEvery !== 0 && i !== data.length - 1) return null;
          const cx = PAD.l + (i + 0.5) * (pw / data.length);
          const shortLabel =
            granularity === 'day'
              ? d.dateFrom.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
              : d.label;
          return (
            <text
              key={`lbl-${d.key}`}
              x={cx}
              y={H - 14}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: 9 }}
            >
              {shortLabel}
            </text>
          );
        })}
      </svg>

      <ChartTooltip x={tip?.x ?? 0} y={tip?.y ?? 0} visible={tip != null}>
        {tip && (
          <>
            <p className="font-semibold text-foreground">{tip.pt.label}</p>
            <p className="text-[10px] text-muted-foreground">
              {tip.pt.dateFrom.toLocaleDateString('fr-FR')} — {tip.pt.dateTo.toLocaleDateString('fr-FR')}
            </p>
            <p className={cn('tabular-nums font-medium', tip.pt.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
              {fmtLabelEur(tip.pt.profit)}
            </p>
          </>
        )}
      </ChartTooltip>
    </div>
  );
}
