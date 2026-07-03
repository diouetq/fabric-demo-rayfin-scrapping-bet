import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOOKMAKERS,
  DEFAULT_SPORT_IDS,
  VISIBLE_BOOKMAKER_IDS,
  formatSportIdInput,
  parseSportIdInput,
  type BookmakerId,
  type SportIdConfig,
} from '@/lib/scrapers';
import type { DimSportIdAPI } from '@/lib/dimensions';
import { ChevronDown, RotateCcw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Slicer multi-select identique au pattern KPI — clic simple, recherche, tout sélectionner. */
function SportSlicer({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: DimSportIdAPI[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const sortedOptions = useMemo(
    () =>
      [...options].sort((a, b) => {
        const labelA = (a.nomApi ?? a.apiId).toLocaleLowerCase('fr');
        const labelB = (b.nomApi ?? b.apiId).toLocaleLowerCase('fr');
        return labelA.localeCompare(labelB, 'fr');
      }),
    [options],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = search
    ? sortedOptions.filter(
        (o) =>
          o.apiId.includes(search) ||
          (o.nomApi ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : sortedOptions;

  const toggle = (apiId: string) =>
    onChange(selected.includes(apiId) ? selected.filter((s) => s !== apiId) : [...selected, apiId]);

  const allSelected = sortedOptions.length > 0 && sortedOptions.every((o) => selected.includes(o.apiId));

  const toggleAll = () =>
    onChange(allSelected ? [] : sortedOptions.map((o) => o.apiId));

  const selectedNames = useMemo(
    () =>
      sortedOptions
        .filter((o) => selected.includes(o.apiId))
        .map((o) => o.nomApi ?? o.apiId),
    [sortedOptions, selected],
  );

  const btnLabel =
    selected.length === 0
      ? 'Tous sports'
      : selected.length === sortedOptions.length
      ? `${label} (Tous)`
      : selectedNames.length <= 3
      ? selectedNames.join(', ')
      : `${selectedNames.slice(0, 2).join(', ')} +${selectedNames.length - 2}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={selectedNames.length > 0 ? selectedNames.join(', ') : undefined}
        className={cn(
          'inline-flex w-full items-center justify-between gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors',
          selected.length > 0
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-input bg-background text-muted-foreground hover:bg-muted',
        )}
      >
        <span className="truncate">{btnLabel}</span>
        <div className="flex shrink-0 items-center gap-1">
          {selected.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onChange([]); } }}
              className="rounded hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-max min-w-full max-w-xs max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-2xl">
          {/* Recherche */}
          <div className="sticky top-0 bg-popover border-b border-border px-2 py-1.5 flex items-center gap-1.5">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full bg-transparent text-[11px] text-popover-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          {/* Tout sélectionner */}
          <label className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-3 w-3 accent-primary"
            />
            Tout sélectionner
          </label>
          {/* Options */}
          {filtered.map((opt) => (
            <label
              key={opt.apiId}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.apiId)}
                onChange={() => toggle(opt.apiId)}
                className="h-3 w-3 accent-primary shrink-0"
              />
              {opt.nomApi && <span className="text-popover-foreground truncate flex-1">{opt.nomApi}</span>}
              <span className="font-mono text-muted-foreground shrink-0 text-[10px]">{opt.apiId}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">Aucun résultat</p>
          )}
        </div>
      )}
    </div>
  );
}

interface BookmakerSportBarProps {
  activeBookmakers: BookmakerId[];
  onToggleBookmaker: (id: BookmakerId) => void;
  onScrapeOne: (id: BookmakerId) => void;
  sportConfig: SportIdConfig;
  onSportConfigChange: (config: SportIdConfig) => void;
  sportIdsApi?: DimSportIdAPI[];
}

export function BookmakerSportBar({
  activeBookmakers,
  onToggleBookmaker,
  onScrapeOne,
  sportConfig,
  onSportConfigChange,
  sportIdsApi,
}: BookmakerSportBarProps) {
  // Tant que les référentiels Fabric n'ont pas fini de charger, `sportIdsApi` vaut `undefined` —
  // à distinguer d'un tableau chargé mais vide (bookmaker non référencé dans dim_sport_ids_API),
  // sinon on affiche à tort la vieille saisie manuelle « IDs séparés par virgule » pendant le chargement.
  const dimsLoading = sportIdsApi === undefined;
  const activeSet = useMemo(() => new Set(activeBookmakers), [activeBookmakers]);

  const handleSportChange = (id: BookmakerId, ids: string[]) => {
    onSportConfigChange({ ...sportConfig, [id]: ids });
  };

  const handleReset = (id: BookmakerId) => {
    onSportConfigChange({ ...sportConfig, [id]: DEFAULT_SPORT_IDS[id] ?? [] });
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">
        <strong className="text-foreground">Clic</strong> = activer le bookmaker ·{' '}
        <strong className="text-foreground">Double-clic</strong> = récupérer les cotes de celui-ci seul · Choisissez les sports (cyclisme par défaut)
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {VISIBLE_BOOKMAKER_IDS.map((id) => {
          const bmId = id.toLowerCase();
          const available = (sportIdsApi ?? []).filter((s) => s.bookmaker.toLowerCase() === bmId);
          const selected = sportConfig[id] ?? [];
          const isActive = activeSet.has(id);

          return (
            <div
              key={id}
              className={cn(
                'flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-1.5 transition-colors',
                isActive ? 'border-primary/40 bg-primary/5' : 'border-input bg-muted/30',
              )}
            >
              <button
                type="button"
                onClick={() => onToggleBookmaker(id)}
                onDoubleClick={() => onScrapeOne(id)}
                title="Clic : activer/désactiver · Double-clic : récupérer seul"
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {BOOKMAKERS[id].label}
              </button>

              {isActive && (
                <div className="w-36">
                  {dimsLoading ? (
                    <span className="block w-full animate-pulse rounded-full border border-input bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                      Chargement…
                    </span>
                  ) : available.length > 0 ? (
                    <SportSlicer
                      label={BOOKMAKERS[id].label}
                      options={available}
                      selected={selected}
                      onChange={(ids) => handleSportChange(id, ids)}
                    />
                  ) : (
                    <input
                      type="text"
                      value={formatSportIdInput(selected)}
                      onChange={(e) => handleSportChange(id, parseSportIdInput(e.target.value))}
                      placeholder="IDs séparés par virgule"
                      title="Ce bookmaker n'a pas encore d'IDs sport référencés dans dim_sport_ids_API — saisie manuelle en attendant."
                      className="w-full rounded-full border border-input bg-background px-2 py-0.5 text-[10px] text-foreground font-mono"
                    />
                  )}
                </div>
              )}
              {isActive && (
                <button
                  type="button"
                  onClick={() => handleReset(id)}
                  title="Réinitialiser aux IDs par défaut"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
