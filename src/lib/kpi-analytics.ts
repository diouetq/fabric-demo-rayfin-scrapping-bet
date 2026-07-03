import type { KpiFilters, ParisDisplayRow } from '@/services/paris-service';
import { rowProfitNet } from '@/lib/kpi-profit';

export type ProfitGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface PeriodBounds {
  from: Date;
  to: Date;
}

export interface PeriodProfitPoint {
  key: string;
  label: string;
  profit: number;
  dateFrom: Date;
  dateTo: Date;
}

export function toDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Date bidon pour les paris en cours — exclue du slicer et des bornes KPI. */
export const PARIS_PLACEHOLDER_DATE_ISO = '1900-01-01';

export function isPlaceholderParisDate(d: Date): boolean {
  if (toDateISO(d) === PARIS_PLACEHOLDER_DATE_ISO) return true;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return y === 1900 && m === 0 && day === 1;
}

export function filterRealParisDates(rows: ParisDisplayRow[]): ParisDisplayRow[] {
  return rows.filter((r) => !isPlaceholderParisDate(r.datePari));
}

export function parseDateISO(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

export function formatDateFR(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateRangeFR(from: Date, to: Date): string {
  return `${formatDateFR(from)} → ${formatDateFR(to)}`;
}

/** Start of ISO week (Monday) for a given date. */
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59, 999);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfQuarter(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

function endOfQuarter(d: Date): Date {
  const s = startOfQuarter(d);
  return new Date(s.getFullYear(), s.getMonth() + 3, 0, 23, 59, 59, 999);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

export function getPeriodBounds(
  periode: KpiFilters['periode'],
  ref: Date = new Date(),
): PeriodBounds | null {
  if (periode === 'all') return null;

  let from: Date;
  let to: Date;

  switch (periode) {
    case 'week': {
      from = startOfWeek(ref);
      to = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
      break;
    }
    case 'month':
      from = startOfMonth(ref);
      to = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
      break;
    case 'prevmonth':
      from = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      to = new Date(ref.getFullYear(), ref.getMonth(), 0, 23, 59, 59, 999);
      break;
    case 'quarter':
      from = startOfQuarter(ref);
      to = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
      break;
    case 'year':
      from = startOfYear(ref);
      to = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
      break;
    case 'prevyear':
      from = new Date(ref.getFullYear() - 1, 0, 1);
      to = new Date(ref.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      break;
    case '30d':
      from = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 29);
      to = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
      break;
    case '90d':
      from = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - 89);
      to = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
      break;
    default:
      return null;
  }

  return { from, to };
}

export function getDataDateBounds(rows: ParisDisplayRow[]): PeriodBounds | null {
  const times = filterRealParisDates(rows).map((r) => r.datePari.getTime());
  if (times.length === 0) return null;
  return {
    from: new Date(Math.min(...times)),
    to: new Date(Math.max(...times)),
  };
}

const PERIODE_VALUES: KpiFilters['periode'][] = [
  'week', 'month', 'prevmonth', 'quarter', 'year', 'prevyear', '30d', '90d',
];

/** Detect preset period if date range matches exactly (calendar days). */
export function detectPeriodFromDates(
  dateFrom: string,
  dateTo: string,
  ref: Date = new Date(),
): KpiFilters['periode'] {
  for (const p of PERIODE_VALUES) {
    const b = getPeriodBounds(p, ref);
    if (b && toDateISO(b.from) === dateFrom && toDateISO(b.to) === dateTo) return p;
  }
  return 'all';
}

function isoWeekYear(d: Date): { week: number; year: number } {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const week1 = new Date(t.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((t.getTime() - week1.getTime()) / 86_400_000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    );
  return { week, year: t.getFullYear() };
}

function bucketMeta(d: Date, g: ProfitGranularity): { key: string; label: string; from: Date; to: Date } {
  switch (g) {
    case 'day': {
      const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      const key = toDateISO(from);
      return { key, label: formatDateFR(from), from, to };
    }
    case 'week': {
      const from = startOfWeek(d);
      const to = endOfWeek(d);
      const key = toDateISO(from);
      const { week, year } = isoWeekYear(from);
      return { key, label: `S${week} ${year}`, from, to };
    }
    case 'month': {
      const from = startOfMonth(d);
      const to = endOfMonth(d);
      const key = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
      const label = from.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
      return { key, label, from, to };
    }
    case 'quarter': {
      const from = startOfQuarter(d);
      const to = endOfQuarter(d);
      const q = Math.floor(from.getMonth() / 3) + 1;
      const key = `${from.getFullYear()}-Q${q}`;
      return { key, label: `T${q} ${from.getFullYear()}`, from, to };
    }
    case 'year': {
      const from = startOfYear(d);
      const to = endOfYear(d);
      const key = String(from.getFullYear());
      return { key, label: key, from, to };
    }
  }
}

export function computePeriodProfits(
  rows: ParisDisplayRow[],
  granularity: ProfitGranularity,
): PeriodProfitPoint[] {
  const map = new Map<string, { profit: number; meta: ReturnType<typeof bucketMeta> }>();

  for (const r of rows) {
    if (isPlaceholderParisDate(r.datePari)) continue;
    if (r.idResultat !== 1 && r.idResultat !== 2 && r.idResultat !== 3) continue;
    const meta = bucketMeta(r.datePari, granularity);
    const e = map.get(meta.key) ?? { profit: 0, meta };
    e.profit += rowProfitNet(r);
    map.set(meta.key, e);
  }

  return [...map.values()]
    .sort((a, b) => a.meta.from.getTime() - b.meta.from.getTime())
    .map(({ profit, meta }) => ({
      key: meta.key,
      label: meta.label,
      profit,
      dateFrom: meta.from,
      dateTo: meta.to,
    }));
}

/** Nice axis ticks for numeric scales. */
export function niceTicks(min: number, max: number, targetCount = 5): number[] {
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    min -= pad;
    max += pad;
  }
  const range = max - min || 1;
  const rough = range / Math.max(targetCount - 1, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let step = mag;
  if (norm <= 1.5) step = mag;
  else if (norm <= 3) step = 2 * mag;
  else if (norm <= 7) step = 5 * mag;
  else step = 10 * mag;

  const tMin = Math.floor(min / step) * step;
  const tMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = tMin; v <= tMax + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

export function fmtAxisEur(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 10000) return `${v >= 0 ? '' : '−'}${(abs / 1000).toFixed(0)}k€`;
  if (abs >= 1000) return `${v >= 0 ? '' : '−'}${(abs / 1000).toFixed(1)}k€`;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}
