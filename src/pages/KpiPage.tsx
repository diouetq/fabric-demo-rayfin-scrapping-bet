import { useEffect, useMemo, useRef, useState } from 'react';
import {
  listParis,
  computeFullKpis,
  applyKpiFilters,
  DEFAULT_KPI_FILTERS,
  type BreakdownRow,
  type FullKpiData,
  type KpiFilters,
  type ParisDisplayRow,
  type PeriodBreakdownRow,
} from '@/services/paris-service';
import {
  computePeriodProfits,
  formatDateFR,
  type PeriodProfitPoint,
  type ProfitGranularity,
} from '@/lib/kpi-analytics';
import {
  BankrollChart,
  GranularitySelect,
  PeriodProfitChart,
} from '@/components/kpi/KpiCharts';
import {
  initDateFilters,
  KpiDateSlicer,
  syncFiltersWithPeriod,
} from '@/components/kpi/KpiDateSlicer';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, X, TrendingUp, TrendingDown, Target, Wallet, Percent, BarChart3, LineChart, CalendarRange, Trophy, CheckCircle2, XCircle, Clock, Table2, PieChart, type LucideIcon } from 'lucide-react';

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtEur = (v: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

const signedFmtEur = (v: number): string => (v > 0 ? `+${fmtEur(v)}` : fmtEur(v));

const fmtPct = (v: number | null, digits = 1): string =>
  v != null ? `${(v * 100).toFixed(digits)}%` : '—';

const signedFmtPct = (v: number | null, digits = 1): string => {
  if (v == null) return '—';
  const pct = (v * 100).toFixed(digits);
  return Number(pct) >= 0 ? `+${pct}%` : `${pct}%`;
};

const fmtOdds = (v: number | null): string => (v != null ? v.toFixed(2) : '—');

// ─── Filter controls ──────────────────────────────────────────────────────────

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);

  const btnLabel =
    selected.length === 0 ? label : selected.length === 1 ? selected[0] : `${label} (${selected.length})`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
          selected.length > 0
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-input bg-background hover:bg-muted',
        )}
      >
        <span className="max-w-[120px] truncate">{btnLabel}</span>
        {selected.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange([]); } }}
          >
            <X className="h-3 w-3" />
          </span>
        )}
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[160px] max-h-[240px] overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
          {options.map((opt) => (
            <label key={opt} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-accent">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="h-3 w-3 accent-primary" />
              <span className="truncate">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const PERIODE_OPTIONS: { value: KpiFilters['periode']; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'prevmonth', label: 'Mois précédent' },
  { value: 'quarter', label: 'Ce trimestre' },
  { value: 'year', label: 'Cette année' },
  { value: 'prevyear', label: 'Année précédente' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
];

function PeriodSelect({
  value,
  onChange,
}: {
  value: KpiFilters['periode'];
  onChange: (v: KpiFilters['periode']) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = PERIODE_OPTIONS.find((o) => o.value === value)?.label ?? 'Période';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
          value !== 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-input bg-background hover:bg-muted',
        )}
      >
        {label}
        <ChevronDown className={cn('h-3 w-3', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[170px] rounded-lg border border-border bg-popover shadow-xl py-1">
          {PERIODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                'w-full px-3 py-1.5 text-left text-[11px] hover:bg-accent',
                opt.value === value && 'font-semibold text-primary',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SegmentControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-input bg-muted/40 p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
            value === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

type PeriodView = 'graph' | 'table';

function ViewToggle({ value, onChange }: { value: PeriodView; onChange: (v: PeriodView) => void }) {
  const options: { value: PeriodView; label: string; icon: LucideIcon }[] = [
    { value: 'graph', label: 'Graph', icon: BarChart3 },
    { value: 'table', label: 'Tableau', icon: Table2 },
  ];
  return (
    <div className="inline-flex rounded-full border border-input bg-muted/40 p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          title={opt.label}
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
            value === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <opt.icon className="h-3 w-3" />
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Layout pieces ────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'negative';
  icon: LucideIcon;
}) {
  return (
    <div className="group flex items-center gap-3 px-4 py-3.5 transition-transform hover:scale-[1.02]">
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset transition-colors',
          tone === 'positive' && 'bg-emerald-500/12 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400',
          tone === 'negative' && 'bg-red-500/12 text-red-600 ring-red-500/20 dark:text-red-400',
          !tone && 'bg-primary/10 text-primary ring-primary/15',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p
          className={cn(
            'text-xl font-bold tabular-nums tracking-tight sm:text-2xl',
            tone === 'positive' && 'text-emerald-600 dark:text-emerald-400',
            tone === 'negative' && 'text-red-600 dark:text-red-400',
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function KpiChip({
  icon: Icon,
  label,
  variant = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  variant?: 'neutral' | 'success' | 'danger' | 'warning';
}) {
  const styles = {
    neutral: 'bg-background text-foreground ring-border/60',
    success: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-400',
    danger: 'bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-400',
    warning: 'bg-amber-500/10 text-amber-800 ring-amber-500/20 dark:text-amber-300',
  }[variant];

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tabular-nums ring-1', styles)}>
      <Icon className="h-3 w-3 opacity-80" />
      {label}
    </span>
  );
}

function ChartCard({
  title,
  children,
  headerRight,
  icon: Icon,
}: {
  title: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-gradient-to-r from-muted/40 to-transparent px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-xs font-bold text-foreground">
          {Icon && (
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
          {title}
        </h3>
        {headerRight}
      </div>
      <div className="p-2 sm:p-3">{children}</div>
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-2 text-left text-xs font-semibold hover:bg-muted/50 transition-colors"
      >
        {title}
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-border/60">{children}</div>}
    </div>
  );
}

// ─── Tables ───────────────────────────────────────────────────────────────────

function BreakdownTabs({
  byBookmaker,
  bySport,
  byTypePari,
}: {
  byBookmaker: BreakdownRow[];
  bySport: BreakdownRow[];
  byTypePari: BreakdownRow[];
}) {
  const tabs = [
    { id: 'bm' as const, label: 'Bookmaker', rows: byBookmaker },
    { id: 'sport' as const, label: 'Sport', rows: bySport },
    { id: 'type' as const, label: 'Type de pari', rows: byTypePari },
  ];
  const [active, setActive] = useState<(typeof tabs)[number]['id']>('bm');
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div className="flex gap-1 mb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={cn(
              'rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors',
              active === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <BreakdownTable rows={current.rows} />
    </div>
  );
}

type SortKey = keyof Pick<BreakdownRow, 'label' | 'paris' | 'gagnes' | 'perdus' | 'winRate' | 'miseTotale' | 'coteMoyenne' | 'profitNet' | 'roi'>;

const BREAKDOWN_COLS: { key: SortKey; label: string }[] = [
  { key: 'label', label: 'Nom' },
  { key: 'paris', label: 'Paris' },
  { key: 'gagnes', label: 'Gagnés' },
  { key: 'perdus', label: 'Perdus' },
  { key: 'winRate', label: 'Win%' },
  { key: 'miseTotale', label: 'Mise' },
  { key: 'coteMoyenne', label: 'Cote moy.' },
  { key: 'profitNet', label: 'Profit net' },
  { key: 'roi', label: 'ROI' },
];

function BreakdownTable({ rows }: { rows: BreakdownRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'roi', dir: 'desc' });

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = (av as number | null) ?? (sort.dir === 'desc' ? -Infinity : Infinity);
      const bn = (bv as number | null) ?? (sort.dir === 'desc' ? -Infinity : Infinity);
      return sort.dir === 'desc' ? bn - an : an - bn;
    });
  }, [rows, sort]);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Aucune donnée</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border/80">
      <table className="w-full border-collapse text-[11px] [&_td]:align-middle [&_th]:align-middle">
        <thead className="bg-primary text-primary-foreground">
          <tr>
            {BREAKDOWN_COLS.map((col) => (
              <th
                key={col.key}
                onClick={() => setSort((s) => (s.key === col.key ? { key: col.key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key: col.key, dir: 'desc' }))}
                className="cursor-pointer select-none whitespace-nowrap px-2 py-1.5 font-semibold text-center"
              >
                <span className="inline-flex items-center gap-0.5">
                  {col.label}
                  {sort.key === col.key && (sort.dir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.label} className={cn('border-t border-border hover:bg-muted/30', i % 2 === 0 && 'bg-muted/5')}>
              <td className="px-2 py-1 text-center font-medium">{row.label}</td>
              <td className="px-2 py-1 text-center tabular-nums">{row.paris}</td>
              <td className="px-2 py-1 text-center tabular-nums text-emerald-600">{row.gagnes}</td>
              <td className="px-2 py-1 text-center tabular-nums text-red-600">{row.perdus}</td>
              <td className="px-2 py-1 text-center tabular-nums">{fmtPct(row.winRate)}</td>
              <td className="px-2 py-1 text-center tabular-nums text-muted-foreground">{fmtEur(row.miseTotale)}</td>
              <td className="px-2 py-1 text-center tabular-nums">{fmtOdds(row.coteMoyenne)}</td>
              <td className={cn('px-2 py-1 text-center tabular-nums font-medium', row.profitNet > 0 ? 'text-emerald-600' : row.profitNet < 0 ? 'text-red-600' : '')}>
                {signedFmtEur(row.profitNet)}
              </td>
              <td className={cn('px-2 py-1 text-center tabular-nums font-semibold', row.roi != null && row.roi > 0 ? 'text-emerald-600' : row.roi != null && row.roi < 0 ? 'text-red-600' : '')}>
                {signedFmtPct(row.roi)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodBreakdownTable({ rows }: { rows: PeriodBreakdownRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px] [&_td]:align-middle [&_th]:align-middle">
        <thead className="bg-muted/50">
          <tr>
            {['Période', 'Du', 'Au', 'Paris', 'Gagnés', 'Win%', 'Mise', 'Cote moy.', 'Profit net', 'ROI'].map((h) => (
              <th key={h} className="px-2 py-1.5 font-semibold text-center whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.label} className={cn('border-t border-border hover:bg-muted/20', i % 2 === 0 && 'bg-muted/5')}>
              <td className="px-2 py-1 text-center font-medium whitespace-nowrap">{row.label}</td>
              <td className="px-2 py-1 text-center tabular-nums whitespace-nowrap">{row.dateFrom ? formatDateFR(new Date(`${row.dateFrom}T12:00:00`)) : '—'}</td>
              <td className="px-2 py-1 text-center tabular-nums whitespace-nowrap">{row.dateTo ? formatDateFR(new Date(`${row.dateTo}T12:00:00`)) : '—'}</td>
              <td className="px-2 py-1 text-center tabular-nums">{row.paris || '—'}</td>
              <td className="px-2 py-1 text-center tabular-nums text-emerald-600">{row.gagnes || '—'}</td>
              <td className="px-2 py-1 text-center tabular-nums">{fmtPct(row.winPct)}</td>
              <td className="px-2 py-1 text-center tabular-nums text-muted-foreground">{row.mise > 0 ? fmtEur(row.mise) : '—'}</td>
              <td className="px-2 py-1 text-center tabular-nums">{row.paris > 0 ? fmtOdds(row.coteMoyenne) : '—'}</td>
              <td className={cn('px-2 py-1 text-center tabular-nums font-medium', row.profitNet > 0 ? 'text-emerald-600' : row.profitNet < 0 ? 'text-red-600' : '')}>
                {row.paris > 0 ? signedFmtEur(row.profitNet) : '—'}
              </td>
              <td className={cn('px-2 py-1 text-center tabular-nums font-semibold', row.roi != null && row.roi > 0 ? 'text-emerald-600' : row.roi != null && row.roi < 0 ? 'text-red-600' : '')}>
                {signedFmtPct(row.roi)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodProfitTable({ data }: { data: PeriodProfitPoint[] }) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Aucun profit sur cette période</p>;
  }
  return (
    <div className="max-h-[260px] overflow-y-auto overflow-x-auto rounded-xl border border-border/80">
      <table className="w-full border-collapse text-[11px] [&_td]:align-middle [&_th]:align-middle">
        <thead className="sticky top-0 bg-primary text-primary-foreground">
          <tr>
            {['Période', 'Du', 'Au', 'Profit net'].map((h) => (
              <th key={h} className="whitespace-nowrap px-2 py-1.5 text-center font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...data].reverse().map((d, i) => (
            <tr key={d.key} className={cn('border-t border-border hover:bg-muted/30', i % 2 === 0 && 'bg-muted/5')}>
              <td className="whitespace-nowrap px-2 py-1 text-center font-medium">{d.label}</td>
              <td className="whitespace-nowrap px-2 py-1 text-center tabular-nums text-muted-foreground">{formatDateFR(d.dateFrom)}</td>
              <td className="whitespace-nowrap px-2 py-1 text-center tabular-nums text-muted-foreground">{formatDateFR(d.dateTo)}</td>
              <td className={cn('px-2 py-1 text-center tabular-nums font-semibold', d.profit > 0 ? 'text-emerald-600' : d.profit < 0 ? 'text-red-600' : '')}>
                {signedFmtEur(d.profit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfitByTypeBars({ rows }: { rows: BreakdownRow[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Aucune donnée</p>;
  }
  const sorted = [...rows].sort((a, b) => b.profitNet - a.profitNet);
  const maxAbs = Math.max(...sorted.map((r) => Math.abs(r.profitNet)), 1);
  const totalAbs = sorted.reduce((s, r) => s + Math.abs(r.profitNet), 0) || 1;

  return (
    <div className="space-y-2.5 p-1">
      {sorted.map((r) => {
        const widthPct = (Math.abs(r.profitNet) / maxAbs) * 100;
        const sharePct = (Math.abs(r.profitNet) / totalAbs) * 100;
        const positive = r.profitNet >= 0;
        return (
          <div key={r.label} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-[11px] font-medium" title={r.label}>{r.label}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted/40">
              <div
                className={cn('h-full rounded-md transition-all', positive ? 'bg-emerald-500/70' : 'bg-red-500/70')}
                style={{ width: `${Math.max(widthPct, 2)}%` }}
              />
            </div>
            <span className={cn('w-16 shrink-0 text-right text-[11px] font-semibold tabular-nums', positive ? 'text-emerald-600' : 'text-red-600')}>
              {signedFmtEur(r.profitNet)}
            </span>
            <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
              {sharePct.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function KpiPageSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-40 rounded-xl bg-muted" />
      <div className="h-16 rounded-xl bg-muted" />
      <div className="h-24 rounded-xl bg-muted" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-72 rounded-xl bg-muted" />
        <div className="h-72 rounded-xl bg-muted" />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const RESULTAT_OPTIONS: { value: KpiFilters['resultat']; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'encours', label: 'En cours' },
  { value: 'termines', label: 'Terminés' },
];

export function KpiPage() {
  const [allRows, setAllRows] = useState<ParisDisplayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<KpiFilters>(DEFAULT_KPI_FILTERS);
  const [granularity, setGranularity] = useState<ProfitGranularity>('month');
  const [periodView, setPeriodView] = useState<PeriodView>('graph');
  const [datesReady, setDatesReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const rows = await listParis();
        setAllRows(rows);
        if (rows.length > 0) {
          setFilters((f) => ({ ...f, ...initDateFilters(rows) }));
        }
        setDatesReady(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const options = useMemo(() => ({
    bookmakers: [...new Set(allRows.map((r) => r.bookmaker))].filter(Boolean).sort(),
    sports: [...new Set(allRows.map((r) => r.sport))].filter(Boolean).sort(),
    typesPari: [...new Set(allRows.map((r) => r.typePari))].filter(Boolean).sort(),
  }), [allRows]);

  const kpis: FullKpiData | null = useMemo(
    () => (allRows.length > 0 && datesReady ? computeFullKpis(allRows, filters) : null),
    [allRows, filters, datesReady],
  );

  const filteredForChart = useMemo(
    () => (datesReady ? applyKpiFilters(allRows, filters) : []),
    [allRows, filters, datesReady],
  );

  const periodProfits = useMemo(
    () => computePeriodProfits(filteredForChart, granularity),
    [filteredForChart, granularity],
  );

  const hasActiveFilters =
    filters.bookmakers.length > 0 ||
    filters.sports.length > 0 ||
    filters.typesPari.length > 0 ||
    filters.periode !== 'all' ||
    filters.resultat !== 'all';

  const handlePeriodChange = (periode: KpiFilters['periode']) => {
    setFilters((f) => ({ ...f, ...syncFiltersWithPeriod(periode, allRows) }));
  };

  const handleDateChange = (patch: Pick<KpiFilters, 'dateFrom' | 'dateTo' | 'periode'>) => {
    setFilters((f) => ({ ...f, ...patch }));
  };

  const resetFilters = () => {
    const base = { ...DEFAULT_KPI_FILTERS, ...initDateFilters(allRows) };
    setFilters(base);
  };

  if (loading) return <KpiPageSkeleton />;
  if (!kpis || !filters.dateFrom || !filters.dateTo) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Aucune donnée disponible.</p>;
  }

  const profitTone = kpis.profitNetTotal > 0 ? 'positive' : kpis.profitNetTotal < 0 ? 'negative' : undefined;
  const roiTone = kpis.roi != null && kpis.roi > 0 ? 'positive' : kpis.roi != null && kpis.roi < 0 ? 'negative' : undefined;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-primary/8 via-card to-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold text-foreground">Tableau de bord KPI</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Performance de vos paris · ROI, bankroll et analyses par dimension
            </p>
          </div>
          {hasActiveFilters && (
            <button type="button" onClick={resetFilters} className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
              Réinitialiser les filtres
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/80 bg-card px-4 py-3 shadow-sm space-y-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Filtres</p>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelect value={filters.periode} onChange={handlePeriodChange} />
          <SegmentControl options={RESULTAT_OPTIONS} value={filters.resultat} onChange={(v) => setFilters((f) => ({ ...f, resultat: v }))} />
          <MultiSelect label="Bookmaker" options={options.bookmakers} selected={filters.bookmakers} onChange={(v) => setFilters((f) => ({ ...f, bookmakers: v }))} />
          <MultiSelect label="Sport" options={options.sports} selected={filters.sports} onChange={(v) => setFilters((f) => ({ ...f, sports: v }))} />
          <MultiSelect label="Type" options={options.typesPari} selected={filters.typesPari} onChange={(v) => setFilters((f) => ({ ...f, typesPari: v }))} />
        </div>
        <KpiDateSlicer
          rows={allRows}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          periode={filters.periode}
          onChange={handleDateChange}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
        <div className="h-1 gradient-brand" />
        <div className="grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x divide-border/60">
          <Stat
            label="Profit net"
            value={signedFmtEur(kpis.profitNetTotal)}
            tone={profitTone}
            icon={profitTone === 'negative' ? TrendingDown : TrendingUp}
          />
          <Stat
            label="ROI"
            value={kpis.roi != null ? signedFmtPct(kpis.roi) : '—'}
            tone={roiTone}
            icon={Target}
          />
          <Stat label="Win rate" value={fmtPct(kpis.winRate)} icon={Percent} />
          <Stat label="Mise totale" value={fmtEur(kpis.miseTotale)} icon={Wallet} />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border/60 bg-muted/20 px-4 py-2.5">
          <KpiChip icon={Trophy} label={`${kpis.totalParis} paris`} />
          <KpiChip icon={CheckCircle2} label={`${kpis.gagnes} gagnés`} variant="success" />
          <KpiChip icon={XCircle} label={`${kpis.perdus} perdus`} variant="danger" />
          <KpiChip icon={Clock} label={`${kpis.enCours} en cours`} variant="warning" />
          {kpis.coteMoyenne != null && (
            <KpiChip icon={Target} label={`Cote moy. ${fmtOdds(kpis.coteMoyenne)}`} />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Évolution du profit cumulé" icon={LineChart}>
          <BankrollChart data={kpis.bankrollTimeline} />
        </ChartCard>
        <ChartCard
          title="Profit par période"
          icon={CalendarRange}
          headerRight={
            <div className="flex flex-wrap items-center gap-2">
              <GranularitySelect value={granularity} onChange={setGranularity} />
              <ViewToggle value={periodView} onChange={setPeriodView} />
            </div>
          }
        >
          {periodView === 'graph' ? (
            <PeriodProfitChart data={periodProfits} granularity={granularity} />
          ) : (
            <PeriodProfitTable data={periodProfits} />
          )}
        </ChartCard>
      </div>

      <ChartCard title="Répartition du profit par type de pari" icon={PieChart}>
        <ProfitByTypeBars rows={kpis.byTypePari} />
      </ChartCard>

      <CollapsibleSection title="Bilan par période" defaultOpen>
        <div className="p-3">
          <PeriodBreakdownTable rows={kpis.periodBreakdown} />
        </div>
      </CollapsibleSection>

      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-foreground">Analyse par dimension</h3>
        <BreakdownTabs byBookmaker={kpis.byBookmaker} bySport={kpis.bySport} byTypePari={kpis.byTypePari} />
      </div>
    </div>
  );
}
