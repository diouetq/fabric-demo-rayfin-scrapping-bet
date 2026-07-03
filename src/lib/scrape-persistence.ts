import type { BettingRowInput } from '@/lib/betting-calculations';
import type { PinnacleCompetition } from '@/lib/scrapers/types';
import { isCutoffActive, parseIsoDate, toIso } from '@/lib/paris-time';

const STORAGE_KEY = 'scrapping-bet:last-scrape';
const ODDS_HISTORY_KEY = 'scrapping-bet:odds-history';
const PINNACLE_KEY = 'scrapping-bet:pinnacle-competitions';

export interface PersistedScrape {
  rows: Array<Omit<BettingRowInput, 'extraction' | 'cutoff'> & {
    extraction: string;
    cutoff: string | null;
  }>;
  coteMarcheOverrides: Record<string, number | null>;
  scrapedAt: string;
}

export type OddsDelta = 'up' | 'down' | 'same' | 'new';

export interface OddsChange {
  delta: OddsDelta;
  previous: number | null;
  current: number;
}

export function rowOddsKey(row: {
  bookmaker: string;
  competition: string;
  evenement: string;
  competiteur: string;
}): string {
  return `${row.bookmaker}::${row.competition}::${row.evenement}::${row.competiteur}`;
}

export function loadOddsHistory(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ODDS_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Merge bookmaker odds into history (preserves other bookmakers). */
export function saveOddsHistory(rows: BettingRowInput[]): void {
  const map = loadOddsHistory();
  for (const row of rows) {
    map[rowOddsKey(row)] = row.cote;
  }
  localStorage.setItem(ODDS_HISTORY_KEY, JSON.stringify(map));
}

export function computeOddsChanges(
  rows: BettingRowInput[],
  previous: Record<string, number>,
): Record<string, OddsChange> {
  const changes: Record<string, OddsChange> = {};
  for (const row of rows) {
    const key = rowOddsKey(row);
    const prev = previous[key] ?? null;
    let delta: OddsDelta;
    if (prev == null) {
      delta = 'new';
    } else if (row.cote > prev + 0.001) {
      delta = 'up';
    } else if (row.cote < prev - 0.001) {
      delta = 'down';
    } else {
      delta = 'same';
    }
    changes[key] = { delta, previous: prev, current: row.cote };
  }
  return changes;
}

/** @deprecated use computeOddsChanges */
export function computeOddsDeltas(
  rows: BettingRowInput[],
  previous: Record<string, number>,
): Record<string, OddsDelta> {
  const changes = computeOddsChanges(rows, previous);
  return Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.delta]));
}

export function persistScrape(
  rows: BettingRowInput[],
  coteMarcheOverrides: Record<string, number | null>,
): void {
  const payload: PersistedScrape = {
    rows: rows.map((r) => ({
      ...r,
      extraction: toIso(r.extraction) ?? new Date().toISOString(),
      cutoff: toIso(r.cutoff),
    })),
    coteMarcheOverrides,
    scrapedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function loadPersistedScrape(): {
  rows: BettingRowInput[];
  coteMarcheOverrides: Record<string, number | null>;
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedScrape;
    const rows: BettingRowInput[] = data.rows
      .map((r) => ({
        ...r,
        extraction: parseIsoDate(r.extraction),
        cutoff: r.cutoff ? parseIsoDate(r.cutoff) : null,
        coteMarcheReference: null,
      }))
      .filter((r) => isCutoffActive(r.cutoff));
    if (rows.length === 0) return null;
    return { rows, coteMarcheOverrides: data.coteMarcheOverrides ?? data.ps3838Overrides ?? {} };
  } catch {
    return null;
  }
}

/**
 * Merge new scrape rows: pour les bookmakers re-scrappés, garde les lignes existantes
 * dont le cutoff est encore actif ET qui ne sont pas remplacées par un événement identique
 * dans le nouveau scrape. Cela permet de conserver les données d'un premier sport
 * quand on scrape un second sport pour le même bookmaker.
 */
export function mergeScrapeRows(
  existing: BettingRowInput[],
  incoming: BettingRowInput[],
  replacedBookmakerLabels: string[],
): BettingRowInput[] {
  const replace = new Set(replacedBookmakerLabels);
  const incomingKeys = new Set(incoming.map(rowOddsKey));

  const kept = existing.filter((r) => {
    if (!replace.has(r.bookmaker)) return true;
    if (incomingKeys.has(rowOddsKey(r))) return false;
    return isCutoffActive(r.cutoff);
  });

  return [...kept, ...incoming];
}

export function prunePs3838Overrides(
  overrides: Record<string, number | null>,
  removedBookmakerLabel: string,
): Record<string, number | null> {
  const next = { ...overrides };
  for (const key of Object.keys(next)) {
    if (key.startsWith(`${removedBookmakerLabel}::`)) delete next[key];
  }
  return next;
}

export function prunePs3838ForBookmakers(
  overrides: Record<string, number | null>,
  labels: string[],
): Record<string, number | null> {
  let next = { ...overrides };
  for (const label of labels) {
    next = prunePs3838Overrides(next, label);
  }
  return next;
}

export function persistPinnacleRows(rows: PinnacleCompetition[]): void {
  const payload = rows.map((r) => ({
    ...r,
    extraction: toIso(r.extraction) ?? new Date().toISOString(),
    cutoff: toIso(r.cutoff),
  }));
  localStorage.setItem(PINNACLE_KEY, JSON.stringify(payload));
}

/** Efface uniquement le dernier scrape bookmakers (sans historique ni Pinnacle). */
export function clearPersistedScrape(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Efface toutes les données scrapées persistées (cotes, historique, Pinnacle). */
export function clearAllScrapeData(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ODDS_HISTORY_KEY);
  localStorage.removeItem(PINNACLE_KEY);
}

export function loadPinnacleRows(): PinnacleCompetition[] {
  try {
    const raw = localStorage.getItem(PINNACLE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as Array<Omit<PinnacleCompetition, 'extraction' | 'cutoff'> & {
      extraction: string;
      cutoff: string | null;
    }>;
    return data
      .map((r) => ({
        ...r,
        extraction: parseIsoDate(r.extraction),
        cutoff: r.cutoff ? parseIsoDate(r.cutoff) : null,
      }))
      .filter((r) => isCutoffActive(r.cutoff));
  } catch {
    return [];
  }
}
