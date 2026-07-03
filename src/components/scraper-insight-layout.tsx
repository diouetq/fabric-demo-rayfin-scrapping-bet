import type { ReactNode } from 'react';

/** Layout partagé — colonnes identiques entre les deux panneaux insight. */
export const INSIGHT_MAX_ROWS = 5;
export const INSIGHT_ROW_PX = 44;
export const INSIGHT_TOOLBAR_PX = 29;
export const INSIGHT_LIST_MAX_PX = INSIGHT_MAX_ROWS * INSIGHT_ROW_PX;

export function InsightToolbar({ children }: { children?: ReactNode }) {
  return (
    <div
      className="flex min-h-[29px] items-center gap-2 border-b border-border/50 bg-muted/10 px-2.5 py-1"
      style={{ minHeight: INSIGHT_TOOLBAR_PX }}
    >
      {children ?? <span className="text-[9px] text-muted-foreground/50">&nbsp;</span>}
    </div>
  );
}

interface InsightRowProps {
  dotClassName: string;
  /** TRJ — affiché en discret badge inline devant le titre (pas de mise en avant colorée). */
  trj?: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  side: ReactNode;
  sideClassName?: string;
  rowClassName?: string;
  onClick?: () => void;
  titleAttr?: string;
}

export function InsightRow({
  dotClassName,
  trj,
  title,
  meta,
  side,
  sideClassName = '',
  rowClassName = '',
  onClick,
  titleAttr,
}: InsightRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titleAttr}
      className={`flex w-full items-center gap-2 border-b border-border/40 px-2 py-1.5 text-left last:border-b-0 transition-colors hover:bg-primary/5 ${rowClassName}`}
      style={{ minHeight: INSIGHT_ROW_PX }}
    >
      <div className="flex w-3 shrink-0 items-center justify-center">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} />
      </div>
      <div className="min-w-0 flex-1 pr-2">
        <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold leading-snug text-foreground">
          {trj != null && trj !== '' && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-muted-foreground">
              {trj}
            </span>
          )}
          <span className="truncate">{title}</span>
        </p>
        <p className="truncate text-[10px] leading-snug text-muted-foreground">{meta}</p>
      </div>
      <div
        className={`w-[78px] shrink-0 whitespace-nowrap text-right text-[9px] font-bold tabular-nums leading-none ${sideClassName}`}
      >
        {side}
      </div>
    </button>
  );
}

export function InsightList({ children }: { children: ReactNode }) {
  return (
    <div
      className="overflow-y-auto"
      style={{ height: INSIGHT_LIST_MAX_PX, maxHeight: INSIGHT_LIST_MAX_PX }}
    >
      {children}
    </div>
  );
}
