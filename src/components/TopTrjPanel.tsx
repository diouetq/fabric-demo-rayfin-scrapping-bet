import { useMemo, useState } from 'react';
import {
  buildTopTrjEvents,
  formatOdds,
  formatPct,
  isValidTrjBook,
  type ComputedBettingRow,
} from '@/lib/betting-calculations';
import { TrendingUp } from 'lucide-react';
import { ScraperCollapsibleSection } from '@/components/ScraperCollapsibleSection';
import { InsightList, InsightRow, InsightToolbar } from '@/components/scraper-insight-layout';

const MIN_TRJ_OPTIONS = [
  { value: 0, label: 'Tous TRJ' },
  { value: 0.94, label: '≥ 94 %' },
  { value: 0.95, label: '≥ 95 %' },
  { value: 0.96, label: '≥ 96 %' },
  { value: 0.97, label: '≥ 97 %' },
  { value: 0.98, label: '≥ 98 %' },
] as const;

interface TopTrjPanelProps {
  rows: ComputedBettingRow[];
  onFocusCompetition: (compKey: string) => void;
  sportLookup?: (bookmaker: string, apiId: string | undefined) => string | undefined;
}

export function TopTrjPanel({ rows, onFocusCompetition, sportLookup }: TopTrjPanelProps) {
  const [minTrj, setMinTrj] = useState(0);

  const rowsWithTrj = useMemo(
    () => rows.filter((r) => isValidTrjBook(r.trjBook)),
    [rows],
  );

  const topEvents = useMemo(
    () =>
      buildTopTrjEvents(rows, {
        minTrj: minTrj > 0 ? minTrj : undefined,
        getSportName: sportLookup,
        limit: 50,
      }),
    [rows, minTrj, sportLookup],
  );

  if (rowsWithTrj.length === 0) return null;

  return (
    <ScraperCollapsibleSection
      title={`Meilleurs TRJ (${topEvents.length})`}
      icon={<TrendingUp className="h-3.5 w-3.5" />}
      toolbar={
        <InsightToolbar>
          <span className="text-[9px] text-muted-foreground">Seuil</span>
          <select
            value={minTrj}
            onChange={(e) => setMinTrj(Number(e.target.value))}
            className="rounded border border-border bg-background px-1.5 py-0.5 text-[9px] text-foreground"
          >
            {MIN_TRJ_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </InsightToolbar>
      }
    >
      {topEvents.length === 0 ? (
        <p className="px-2.5 py-2 text-[10px] text-muted-foreground">
          Aucun événement avec TRJ valide pour cette sélection.
        </p>
      ) : (
        <InsightList>
          {topEvents.map((ev, idx) => (
            <InsightRow
              key={`${ev.compKey}::${ev.competiteur}::${ev.evenement}::${idx}`}
              dotClassName="bg-emerald-500/50"
              trj={`+${formatPct(ev.trjBook)}`}
              title={`${ev.evenement} · ${ev.competiteur}`}
              meta={[ev.sport, ev.bookmaker, ev.competition].filter(Boolean).join(' · ')}
              side={formatOdds(ev.cote)}
              sideClassName="text-primary"
              rowClassName={idx % 2 === 1 ? 'bg-muted/8' : ''}
              titleAttr={`${ev.evenement} · ${ev.competiteur}`}
              onClick={() => onFocusCompetition(ev.compKey)}
            />
          ))}
        </InsightList>
      )}
    </ScraperCollapsibleSection>
  );
}
