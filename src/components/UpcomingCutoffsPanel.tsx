import {
  type UpcomingCompetition,
  formatDateTime,
  formatMinutesUntil,
  formatPct,
  isValidTrjBook,
} from '@/lib/betting-calculations';
import { AlertTriangle, Clock } from 'lucide-react';
import { ScraperCollapsibleSection } from '@/components/ScraperCollapsibleSection';
import { InsightList, InsightRow, InsightToolbar } from '@/components/scraper-insight-layout';

interface UpcomingCutoffsPanelProps {
  competitions: UpcomingCompetition[];
  onSelectCompetition: (key: string) => void;
  selectedKey?: string;
  title?: string;
  showTrj?: boolean;
}

const urgencyDot: Record<UpcomingCompetition['urgency'], string> = {
  critical: 'bg-red-500',
  soon: 'bg-amber-500',
  later: 'bg-emerald-500/60',
  past: 'bg-muted-foreground/35',
  unknown: 'bg-muted-foreground/25',
};

const urgencyRow: Record<UpcomingCompetition['urgency'], string> = {
  critical: 'bg-red-500/6',
  soon: 'bg-amber-500/6',
  later: '',
  past: 'opacity-50',
  unknown: '',
};

function formatTrjPlus(value: number): string {
  return `+${formatPct(value)}`;
}

export function UpcomingCutoffsPanel({
  competitions,
  onSelectCompetition,
  selectedKey,
  title = 'Compétitions à venir',
  showTrj = true,
}: UpcomingCutoffsPanelProps) {
  if (competitions.length === 0) return null;

  const critical = competitions.filter((c) => c.urgency === 'critical');
  const soon = competitions.filter((c) => c.urgency === 'soon');

  return (
    <ScraperCollapsibleSection
      title={`${title} (${competitions.length})`}
      icon={<Clock className="h-3.5 w-3.5" />}
      badge={
        critical.length > 0 || soon.length > 0 ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[9px] font-medium text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" />
            {critical.length > 0 ? `${critical.length} < 15 min` : `${soon.length} < 1 h`}
          </span>
        ) : undefined
      }
      toolbar={<InsightToolbar />}
    >
      <InsightList>
        {competitions.map((comp) => {
          const trjOk = showTrj && isValidTrjBook(comp.trjBook);
          const meta = [
            comp.sport,
            comp.bookmaker,
            formatDateTime(comp.cutoff),
            comp.nbCotes > 0 ? `${comp.nbCotes} cotes` : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <InsightRow
              key={comp.key}
              dotClassName={urgencyDot[comp.urgency]}
              trj={trjOk ? formatTrjPlus(comp.trjBook!) : undefined}
              title={comp.competition}
              meta={meta}
              side={formatMinutesUntil(comp.minutesUntil)}
              sideClassName="text-foreground"
              rowClassName={`${urgencyRow[comp.urgency]} ${selectedKey === comp.key ? 'bg-primary/10' : ''}`}
              titleAttr={comp.competition}
              onClick={() => onSelectCompetition(comp.key)}
            />
          );
        })}
      </InsightList>
    </ScraperCollapsibleSection>
  );
}
