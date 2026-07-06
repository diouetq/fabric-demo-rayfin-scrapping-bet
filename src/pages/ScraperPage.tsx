import { useCallback, useEffect, useMemo, useState } from 'react';

import {

  computeBettingRows,

  buildUpcomingCompetitions,

  groupByCompetition,

  isValidTrjBook,

  formatMinutesUntil,

  type BettingRowInput,

  type ComputedBettingRow,

} from '@/lib/betting-calculations';

import {

  scrapeAllBookmakers,

  BOOKMAKERS,

  type BookmakerId,

  type SportIdConfig,

} from '@/lib/scrapers';

import type { DimSportIdAPI } from '@/lib/dimensions';

import { BookmakerSportBar } from '@/components/BookmakerSportBar';

import {

  computeOddsChanges,

  clearAllScrapeData,

  clearPersistedScrape,

  loadOddsHistory,

  loadPersistedScrape,

  mergeScrapeRows,

  persistScrape,

  preservePs3838OverridesForActiveRows,

  saveOddsHistory,

  type OddsChange,

} from '@/lib/scrape-persistence';

import { formatParisDateTime } from '@/lib/paris-time';

import { findSportNameByApiId } from '@/lib/dimensions';

import { useDimensions } from '@/hooks/use-dimensions';

import { createParis } from '@/services/paris-service';

import { formValuesToParisInput } from '@/lib/paris-form';

import { BettingTable, makeRowKey } from '@/components/BettingTable';

import { ParisForm } from '@/components/ParisForm';

import { UpcomingCutoffsPanel } from '@/components/UpcomingCutoffsPanel';

import { TopTrjPanel } from '@/components/TopTrjPanel';

import type { UserSettings } from '@/lib/user-settings';

import { ChevronDown, ChevronRight, LayoutGrid, List, Loader2, Trash2, Zap } from 'lucide-react';



const SCRAPE_GUIDE_STEPS = [

  'Activer Betify (ou un autre bookmaker)',

  'Vérifier les sports (cyclisme par défaut)',

  'Cliquer « Actualiser les cotes »',

  'Cliquer une compétition à venir ou une ligne TRJ pour focus',

  'Enregistrer un pari depuis le tableau',

] as const;



function formatTimeFR(d: Date): string {

  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

}



interface ScraperPageProps {

  sportConfig: SportIdConfig;

  onSportConfigChange: (config: SportIdConfig) => void;

  sportIdsApi?: DimSportIdAPI[];

  settings: UserSettings;

  onSettingsChange: (patch: Partial<UserSettings>) => void;

}



export function ScraperPage({ sportConfig, onSportConfigChange, sportIdsApi, settings, onSettingsChange }: ScraperPageProps) {

  const { kellyFraction, stakeValue, tableZoom, viewMode, activeBookmakers } = settings;

  const { dims } = useDimensions();



  const [rawRows, setRawRows] = useState<BettingRowInput[]>(() => loadPersistedScrape()?.rows ?? []);

  const [coteMarcheOverrides, setCoteMarcheOverrides] = useState<Record<string, number | null>>(

    () => loadPersistedScrape()?.coteMarcheOverrides ?? {},

  );

  const [oddsChanges, setOddsChanges] = useState<Record<string, OddsChange>>({});

  const [isScrapingBm, setIsScrapingBm] = useState(false);

  const [scrapeErrors, setScrapeErrors] = useState<string[]>([]);

  const [lastScrapeFeedback, setLastScrapeFeedback] = useState<string | null>(null);

  const [expandedCompetitions, setExpandedCompetitions] = useState<Set<string>>(new Set());

  const [focusCompKey, setFocusCompKey] = useState<string | undefined>();

  const [sportFilter, setSportFilter] = useState<string>('');

  const [showClearConfirm, setShowClearConfirm] = useState(false);



  const sportLookup = useCallback(

    (bookmaker: string, apiId: string | undefined) =>

      dims ? findSportNameByApiId(dims.sportIdsApi, bookmaker, apiId) : undefined,

    [dims],

  );



  const toggleCompetitionSelection = useCallback((key: string) => {

    setExpandedCompetitions((prev) => {

      const next = new Set(prev);

      if (next.has(key)) {

        setFocusCompKey(undefined);

        next.delete(key);

      } else {

        setFocusCompKey(key);

        next.add(key);

      }

      return next;

    });

  }, []);



  useEffect(() => {

    if (!focusCompKey || !expandedCompetitions.has(focusCompKey)) return;

    const id = `comp-section-${focusCompKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  }, [focusCompKey, expandedCompetitions]);

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [pendingScrapRow, setPendingScrapRow] = useState<ComputedBettingRow | null>(null);

  const [, tick] = useState(0);



  useEffect(() => {

    const id = setInterval(() => tick((n) => n + 1), 60_000);

    return () => clearInterval(id);

  }, []);



  const activeBookmakerSet = useMemo(() => new Set(activeBookmakers), [activeBookmakers]);



  const rowsWithOverrides = useMemo((): BettingRowInput[] =>

    rawRows.map((row) => ({

      ...row,

      coteMarcheReference: coteMarcheOverrides[makeRowKey(row)] ?? row.coteMarcheReference ?? null,

    })),

  [rawRows, coteMarcheOverrides]);



  const computedRows = useMemo(

    () => computeBettingRows(rowsWithOverrides, { kellyFraction, stakeValue }),

    [rowsWithOverrides, kellyFraction, stakeValue],

  );



  const activeLabels = useMemo(

    () => new Set(activeBookmakers.map((id) => BOOKMAKERS[id].label)),

    [activeBookmakers],

  );

  const filteredRows = useMemo(

    () => computedRows.filter((r) => activeLabels.has(r.bookmaker)),

    [computedRows, activeLabels],

  );



  const availableSports = useMemo(() => {

    const seen = new Map<string, string>();

    for (const row of filteredRows) {

      if (!row.apiId) continue;

      const name = sportLookup(row.bookmaker, row.apiId);

      if (name && !seen.has(name)) seen.set(name, name);

    }

    return [...seen.keys()].sort();

  }, [filteredRows, sportLookup]);



  const sportFilteredRows = useMemo(() => {

    if (!sportFilter) return filteredRows;

    return filteredRows.filter((r) => {

      const name = sportLookup(r.bookmaker, r.apiId);

      return name === sportFilter;

    });

  }, [filteredRows, sportFilter, sportLookup]);



  const byCompetition = useMemo(() => groupByCompetition(sportFilteredRows), [sportFilteredRows]);



  const bySportAndCompetition = useMemo(() => {

    const sportMap = new Map<string, Array<[string, ComputedBettingRow[]]>>();

    for (const [compKey, compRows] of byCompetition.entries()) {

      const firstRow = compRows[0];

      const sport = firstRow

        ? (sportLookup(firstRow.bookmaker, firstRow.apiId) ?? 'Sport inconnu')

        : 'Sport inconnu';

      const list = sportMap.get(sport) ?? [];

      list.push([compKey, compRows]);

      sportMap.set(sport, list);

    }

    return [...sportMap.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));

  }, [byCompetition, sportLookup]);



  const upcomingBm = useMemo(

    () => buildUpcomingCompetitions(sportFilteredRows, sportLookup),

    [sportFilteredRows, sportLookup],

  );



  const handleScrapeBookmakers = async (only?: BookmakerId) => {

    setIsScrapingBm(true);

    setScrapeErrors([]);

    setSaveMessage(null);

    setLastScrapeFeedback(null);

    const targets = only ? [only] : [...activeBookmakerSet];

    const previousOdds = loadOddsHistory();

    const errors: string[] = [];



    try {

      const results = await scrapeAllBookmakers(sportConfig, targets);

      errors.push(...results.filter((r) => r.error).map((r) => `${BOOKMAKERS[r.bookmaker].label}: ${r.error}`));



      const newRows = results.flatMap((r) => r.rows).map((s) => ({ ...s, coteMarcheReference: null }));

      const scrapedLabels = targets.map((id) => BOOKMAKERS[id].label);



      setOddsChanges((prev) => ({ ...prev, ...computeOddsChanges(newRows, previousOdds) }));

      saveOddsHistory(newRows);



      const mergedRows = mergeScrapeRows(rawRows, newRows, scrapedLabels);

      setRawRows(mergedRows);

      setCoteMarcheOverrides((prev) =>
        preservePs3838OverridesForActiveRows(prev, mergedRows, scrapedLabels),
      );



      setExpandedCompetitions(new Set());

      setFocusCompKey(undefined);



      if (errors.length) setScrapeErrors(errors);

      if (newRows.length === 0 && errors.length === 0) {

        setScrapeErrors(['Aucune cote — vérifiez les IDs sports.']);

      } else if (newRows.length > 0) {

        setLastScrapeFeedback(

          `${newRows.length} cote${newRows.length > 1 ? 's' : ''} · ${formatTimeFR(new Date())}`,

        );

      }

    } catch (err) {

      setScrapeErrors([err instanceof Error ? err.message : String(err)]);

    } finally {

      setIsScrapingBm(false);

    }

  };



  useEffect(() => {

    if (rawRows.length > 0) {

      persistScrape(rawRows, coteMarcheOverrides);

    } else {

      clearPersistedScrape();

    }

  }, [coteMarcheOverrides, rawRows]);



  const handleCoteMarcheChange = (key: string, value: number | null) => {

    setCoteMarcheOverrides((prev) => ({ ...prev, [key]: value }));

  };



  const handleSaveBet = (row: ComputedBettingRow) => {

    setPendingScrapRow(row);

    setSaveMessage(null);

  };



  useEffect(() => {

    if (!pendingScrapRow) return;

    document.getElementById('pending-scrap-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  }, [pendingScrapRow]);



  const handleConfirmSave = async (input: ReturnType<typeof formValuesToParisInput>) => {

    await createParis(input);

    setPendingScrapRow(null);

    setSaveMessage('✓ Pari enregistré en BDD');

  };



  const toggleBookmaker = (id: BookmakerId) => {

    const next = new Set(activeBookmakerSet);

    if (next.has(id)) {

      if (next.size > 1) next.delete(id);

    } else {

      next.add(id);

    }

    onSettingsChange({ activeBookmakers: [...next] });

  };



  const handleClearAllScrapeData = () => {

    clearAllScrapeData();

    setRawRows([]);

    setCoteMarcheOverrides({});

    setOddsChanges({});

    setExpandedCompetitions(new Set());

    setFocusCompKey(undefined);

    setSportFilter('');

    setSaveMessage(null);

    setScrapeErrors([]);

    setLastScrapeFeedback(null);

    setShowClearConfirm(false);

  };



  const expandAllCompetitions = useCallback(() => {

    setExpandedCompetitions(new Set(byCompetition.keys()));

  }, [byCompetition]);



  const collapseAllCompetitions = useCallback(() => {

    setExpandedCompetitions(new Set());

    setFocusCompKey(undefined);

  }, []);



  const allCompetitionsExpanded =

    byCompetition.size > 0 && [...byCompetition.keys()].every((k) => expandedCompetitions.has(k));



  const toggleAllCompetitions = useCallback(() => {

    if (allCompetitionsExpanded) {

      collapseAllCompetitions();

    } else {

      expandAllCompetitions();

    }

  }, [allCompetitionsExpanded, collapseAllCompetitions, expandAllCompetitions]);



  const focusCompetitionInGroupedView = useCallback(

    (compKey: string) => {

      if (viewMode !== 'grouped') {

        onSettingsChange({ viewMode: 'grouped' });

      }

      setFocusCompKey(compKey);

      setExpandedCompetitions((prev) => new Set(prev).add(compKey));

    },

    [viewMode, onSettingsChange],

  );



  const renderCompetitionSection = (compKey: string, compRows: ComputedBettingRow[]) => {

    const isExpanded = expandedCompetitions.has(compKey);

    const firstRow = compRows[0];

    const compSport = firstRow ? sportLookup(firstRow.bookmaker, firstRow.apiId) : undefined;

    const nearestCutoff = compRows.reduce<Date | null>((min, r) => {

      if (!r.cutoff) return min;

      return !min || r.cutoff < min ? r.cutoff : min;

    }, null);

    const minutesUntilCutoff = nearestCutoff ? (nearestCutoff.getTime() - Date.now()) / 60_000 : null;

    return (

      <section

        key={compKey}

        id={`comp-section-${compKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`}

        className={`rounded-lg border overflow-hidden transition-shadow ${focusCompKey === compKey ? 'ring-2 ring-primary/50' : ''}`}

      >

        <button

          type="button"

          onClick={() => toggleCompetitionSelection(compKey)}

          className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold bg-muted/40 hover:bg-muted/60"

        >

          {isExpanded

            ? <ChevronDown className="h-4 w-4 shrink-0 text-primary" />

            : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}

          <span className="truncate">

            {compSport && <span className="text-blue-600 dark:text-blue-400 mr-1">[{compSport}]</span>}

            {firstRow?.bookmaker} — {firstRow?.competition}

          </span>

          <span className="ml-auto shrink-0 text-right text-[10px] text-muted-foreground">

            {compRows.length} cotes

            {nearestCutoff && (

              <>

                {' · '}{formatParisDateTime(nearestCutoff)}

                {' · '}{formatMinutesUntil(minutesUntilCutoff)}

              </>

            )}

          </span>

        </button>

        {isExpanded && (

          <BettingTable rows={compRows} onCoteMarcheChange={handleCoteMarcheChange} onSaveBet={handleSaveBet}

            zoom={tableZoom} showCompetition={false} oddsChanges={oddsChanges} />

        )}

      </section>

    );

  };



  return (

    <div className="space-y-4">

      {pendingScrapRow && (

        <div id="pending-scrap-form" className="rounded-xl border border-primary/30 bg-card p-3 shadow-sm">

          <ParisForm

            mode="scrap"

            scrapRow={pendingScrapRow}

            onSave={handleConfirmSave}

            onCancel={() => setPendingScrapRow(null)}

          />

        </div>

      )}



      <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 shadow-sm">

        <p className="mb-1.5 text-[10px] font-semibold text-foreground">Comment récupérer des cotes ?</p>

        <ol className="list-decimal list-inside space-y-0.5 text-[10px] leading-relaxed text-muted-foreground">

          {SCRAPE_GUIDE_STEPS.map((step) => (

            <li key={step}>{step}</li>

          ))}

        </ol>

      </div>



      <div className="rounded-xl border border-border/80 bg-card p-3 shadow-sm">

        <BookmakerSportBar

          activeBookmakers={activeBookmakers}

          onToggleBookmaker={toggleBookmaker}

          onScrapeOne={(id) => handleScrapeBookmakers(id)}

          sportConfig={sportConfig}

          onSportConfigChange={onSportConfigChange}

          sportIdsApi={sportIdsApi}

        />

      </div>



      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card px-3 py-2 shadow-sm">

        <button type="button" onClick={() => handleScrapeBookmakers()} disabled={isScrapingBm}

          className="gradient-brand glow-ring inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white transition-transform hover:scale-[1.03] disabled:opacity-60 disabled:hover:scale-100">

          {isScrapingBm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}

          Actualiser les cotes

        </button>

        {lastScrapeFeedback && !isScrapingBm && (

          <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">

            ✓ {lastScrapeFeedback}

          </span>

        )}

        <button type="button" onClick={() => onSettingsChange({ viewMode: viewMode === 'global' ? 'grouped' : 'global' })}

          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs">

          {viewMode === 'global' ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}

        </button>

        {viewMode === 'grouped' && byCompetition.size > 0 && (

          <button

            type="button"

            onClick={toggleAllCompetitions}

            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"

          >

            {allCompetitionsExpanded ? (

              <>

                <ChevronRight className="h-3.5 w-3.5" />

                Tout replier

              </>

            ) : (

              <>

                <ChevronDown className="h-3.5 w-3.5" />

                Tout déplier

              </>

            )}

          </button>

        )}

        {availableSports.length > 0 && (

          <select

            value={sportFilter}

            onChange={(e) => setSportFilter(e.target.value)}

            className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"

          >

            <option value="">Tous les sports</option>

            {availableSports.map((s) => (

              <option key={s} value={s}>{s}</option>

            ))}

          </select>

        )}

        {!showClearConfirm ? (

          <button

            type="button"

            onClick={() => setShowClearConfirm(true)}

            className="inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"

            title="Effacer toutes les cotes récupérées pour repartir de zéro"

          >

            <Trash2 className="h-3.5 w-3.5" />

            Tout effacer

          </button>

        ) : (

          <span className="inline-flex items-center gap-2 rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs">

            <span className="text-destructive font-medium">Effacer toutes les cotes récupérées ?</span>

            <button

              type="button"

              onClick={handleClearAllScrapeData}

              className="rounded bg-destructive px-2 py-0.5 font-semibold text-destructive-foreground hover:bg-destructive/90"

            >

              Confirmer

            </button>

            <button

              type="button"

              onClick={() => setShowClearConfirm(false)}

              className="rounded border border-border px-2 py-0.5 hover:bg-muted"

            >

              Annuler

            </button>

          </span>

        )}

      </div>



      {scrapeErrors.map((e) => (

        <p key={e} className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">{e}</p>

      ))}

      {saveMessage && (

        <p className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{saveMessage}</p>

      )}



      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">

        {upcomingBm.length > 0 && (

          <div className={`flex flex-col ${sportFilteredRows.some((r) => isValidTrjBook(r.trjBook)) ? '' : 'lg:col-span-2'}`}>

            <UpcomingCutoffsPanel

              title="Compétitions à venir"

              competitions={upcomingBm}

              selectedKey={focusCompKey}

              onSelectCompetition={toggleCompetitionSelection}

            />

          </div>

        )}

        <div className={`flex flex-col ${upcomingBm.length > 0 ? '' : 'lg:col-span-2'}`}>

          <TopTrjPanel

            rows={sportFilteredRows}

            onFocusCompetition={focusCompetitionInGroupedView}

            sportLookup={sportLookup}

          />

        </div>

      </div>



      <div className="rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden">

        {sportFilteredRows.length === 0 ? (

          <p className="text-center text-[11px] text-muted-foreground py-12">

            {filteredRows.length > 0

              ? `Aucune donnée pour le sport « ${sportFilter} ».`

              : 'Activez un bookmaker et cliquez « Actualiser les cotes » pour commencer.'}

          </p>

        ) : viewMode === 'global' ? (

          <BettingTable

            rows={sportFilteredRows}

            onCoteMarcheChange={handleCoteMarcheChange}

            onSaveBet={handleSaveBet}

            zoom={tableZoom}

            focusCompetitionKey={focusCompKey}

            oddsChanges={oddsChanges}

          />

        ) : (

          <div className="space-y-3 p-2">

            {bySportAndCompetition.map(([sportName, competitions]) => (

              <div key={sportName} className="space-y-2">

                <h3 className="sticky top-0 z-10 border-b border-border bg-card/95 px-2 py-1 text-xs font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">

                  {sportName}

                </h3>

                <div className="space-y-2">

                  {competitions.map(([compKey, compRows]) => renderCompetitionSection(compKey, compRows))}

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

    </div>

  );

}


