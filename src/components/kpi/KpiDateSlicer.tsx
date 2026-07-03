import { Calendar } from 'lucide-react';
import {
  detectPeriodFromDates,
  formatDateFR,
  getDataDateBounds,
  getPeriodBounds,
  toDateISO,
} from '@/lib/kpi-analytics';
import type { KpiFilters, ParisDisplayRow } from '@/services/paris-service';

interface KpiDateSlicerProps {
  rows: ParisDisplayRow[];
  dateFrom: string;
  dateTo: string;
  periode: KpiFilters['periode'];
  onChange: (patch: Pick<KpiFilters, 'dateFrom' | 'dateTo' | 'periode'>) => void;
}

export function KpiDateSlicer({ rows, dateFrom, dateTo, periode, onChange }: KpiDateSlicerProps) {
  const dataBounds = getDataDateBounds(rows);
  const min = dataBounds ? toDateISO(dataBounds.from) : '2020-01-01';
  const max = dataBounds ? toDateISO(dataBounds.to) : toDateISO(new Date());

  const setRange = (from: string, to: string) => {
    let f = from;
    let t = to;
    if (f > t) [f, t] = [t, f];
    onChange({
      dateFrom: f,
      dateTo: t,
      periode: detectPeriodFromDates(f, t),
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground shrink-0">
          <Calendar className="h-3.5 w-3.5" />
          Plage de dates
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">Du</span>
            <input
              type="date"
              value={dateFrom}
              min={min}
              max={dateTo}
              onChange={(e) => setRange(e.target.value, dateTo)}
              className="rounded-md border border-input bg-background px-2 py-1 text-[11px] tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">Au</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={max}
              onChange={(e) => setRange(dateFrom, e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-[11px] tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {formatDateFR(new Date(`${dateFrom}T12:00:00`))} → {formatDateFR(new Date(`${dateTo}T12:00:00`))}
          {periode !== 'all' && (
            <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-primary font-medium">
              preset actif
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export function syncFiltersWithPeriod(
  periode: KpiFilters['periode'],
  rows: ParisDisplayRow[],
): Pick<KpiFilters, 'dateFrom' | 'dateTo' | 'periode'> {
  if (periode === 'all') {
    const b = getDataDateBounds(rows);
    if (b) return { periode, dateFrom: toDateISO(b.from), dateTo: toDateISO(b.to) };
    return { periode };
  }
  const b = getPeriodBounds(periode);
  if (b) return { periode, dateFrom: toDateISO(b.from), dateTo: toDateISO(b.to) };
  return { periode };
}

export function initDateFilters(rows: ParisDisplayRow[]): Pick<KpiFilters, 'dateFrom' | 'dateTo'> {
  const b = getDataDateBounds(rows);
  if (!b) return {};
  return { dateFrom: toDateISO(b.from), dateTo: toDateISO(b.to) };
}
