import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { INSIGHT_LIST_MAX_PX, INSIGHT_TOOLBAR_PX } from '@/components/scraper-insight-layout';

interface ScraperCollapsibleSectionProps {
  title: string;
  icon: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  toolbar?: ReactNode;
  children: ReactNode;
}

/** Bandeau repliable partagé — compétitions à venir, meilleurs TRJ, etc. */
export function ScraperCollapsibleSection({
  title,
  icon,
  badge,
  defaultOpen = true,
  toolbar,
  children,
}: ScraperCollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyHeight = INSIGHT_TOOLBAR_PX + INSIGHT_LIST_MAX_PX;

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full shrink-0 items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 text-primary">{icon}</span>
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{title}</h2>
        {badge}
      </button>
      {open && (
        <div className="flex flex-1 flex-col" style={{ minHeight: bodyHeight }}>
          {toolbar}
          {children}
        </div>
      )}
    </section>
  );
}
