import type { ScrapedOdd, PinnacleCompetition } from '@/lib/scrapers/types';
import { formatParisDateTime, minutesUntilParis, nowParis } from '@/lib/paris-time';

export interface BettingRowInput extends ScrapedOdd {
  /** Cote marché de référence (saisie manuelle, ex. Pinnacle). */
  coteMarcheReference: number | null;
}

export interface ComputedBettingRow extends BettingRowInput {
  trueOddsMpto: number | null;
  impliedProb: number | null;
  trueProbMpto: number | null;
  trj: number | null;
  boostPct: number | null;
  kelly: number | null;
  stake: number | null;
  potentialPayout: number | null;
  surebet: 'YES' | 'NO' | null;
  trjBook: number | null;
  trjPs3838: number | null;
}

export interface BettingSettings {
  kellyFraction: number;
  stakeValue: number;
}

function crossTrj(oddsA: number | null, oddsB: number | null): number | null {
  if (oddsA == null || oddsB == null || oddsA <= 0 || oddsB <= 0) return null;
  return 1 / (1 / oddsA + 1 / oddsB);
}

function kellyStake(
  cote: number,
  trueOdds: number,
  kellyFraction: number,
  stakeValue: number,
): { kelly: number; stake: number } {
  const h = trueOdds;
  const f = cote;
  const rawKelly = ((f - 1) * (1 / h) - (1 - 1 / h)) / (f - 1) / kellyFraction;
  const stake = rawKelly * stakeValue * 100;
  return { kelly: rawKelly, stake };
}

function computeRowMetrics(
  row: BettingRowInput,
  eventRows: BettingRowInput[],
  settings: BettingSettings,
): Omit<ComputedBettingRow, keyof BettingRowInput | 'trj' | 'surebet' | 'trjBook' | 'trjPs3838'> {
  const g = row.coteMarcheReference;
  const f = row.cote;

  let impliedProb: number | null = null;
  let trueOddsMpto: number | null = null;
  let trueProbMpto: number | null = null;
  let boostPct: number | null = null;
  let kelly: number | null = null;
  let stake: number | null = null;
  let potentialPayout: number | null = null;

  if (g != null && g > 0) {
    impliedProb = 1 / g;

    const countEvent = eventRows.length;
    const sumImplied =
      eventRows.reduce((sum, r) => sum + (r.coteMarcheReference != null && r.coteMarcheReference > 0 ? 1 / r.coteMarcheReference : 0), 0) - 1;

    const denominator = countEvent - sumImplied * g;
    if (denominator !== 0) {
      trueOddsMpto = (countEvent * g) / denominator;
    }

    if (trueOddsMpto != null && trueOddsMpto > 0) {
      trueProbMpto = 1 / trueOddsMpto;
    }
  }

  if (f != null && f > 0 && trueOddsMpto != null && trueOddsMpto > 0) {
    boostPct = f / trueOddsMpto - 1;
    const ks = kellyStake(f, trueOddsMpto, settings.kellyFraction, settings.stakeValue);
    kelly = ks.kelly;
    stake = ks.stake;
    if (stake != null && !Number.isNaN(stake)) {
      potentialPayout = f * stake;
    }
  }

  return {
    trueOddsMpto,
    impliedProb,
    trueProbMpto,
    boostPct,
    kelly,
    stake,
    potentialPayout,
  };
}

/**
 * Clé de marché (Evenement + Marché) — mirrors Excel_builder.py's `_MarketKey`.
 * Apparie les 2 issues d'un MÊME marché, pas les lignes 2 par 2 dans l'ordre :
 * évite d'opposer un Handicap à un Total quand un événement a plusieurs marchés.
 * Utilise `pairKey` (identifiant exact fourni par le scraper) quand disponible ;
 * sinon replie sur competition+evenement+marche (texte, plus fragile en cas de
 * libellés dupliqués).
 */
function marketKey(row: { competition: string; evenement: string; marche?: string; pairKey?: string }): string {
  return row.pairKey ?? `${row.competition}::${row.evenement}::${row.marche ?? ''}`;
}

/**
 * Reproduces Excel formulas from build_excel (columns H–R).
 */
export function computeBettingRows(
  rows: BettingRowInput[],
  settings: BettingSettings,
): ComputedBettingRow[] {
  const byMarket = new Map<string, BettingRowInput[]>();
  for (const row of rows) {
    const key = marketKey(row);
    const group = byMarket.get(key) ?? [];
    group.push(row);
    byMarket.set(key, group);
  }

  const computed: ComputedBettingRow[] = rows.map((row) => {
    const marketRows = byMarket.get(marketKey(row)) ?? [row];
    const metrics = computeRowMetrics(row, marketRows, settings);

    return {
      ...row,
      ...metrics,
      trj: null,
      surebet: null,
      trjBook: null,
      trjPs3838: null,
    };
  });

  // Pair-level formulas (TRJ, Surebet, TRJ_Book, TRJ_PS3838)
  // On n'apparie que les marchés à EXACTEMENT 2 issues (comme Excel_builder.py).
  for (const [, marketRows] of byMarket) {
    if (marketRows.length !== 2) continue;
    const [rowA, rowB] = marketRows;

    const idxA = computed.findIndex(
      (r) => r.competiteur === rowA.competiteur && r.evenement === rowA.evenement && r.marche === rowA.marche,
    );
    const idxB = computed.findIndex(
      (r) => r.competiteur === rowB.competiteur && r.evenement === rowB.evenement && r.marche === rowB.marche,
    );
    if (idxA < 0 || idxB < 0) continue;

    const a = computed[idxA];
    const b = computed[idxB];

    const trjA = crossTrj(a.cote, b.coteMarcheReference);
    const trjB = crossTrj(b.cote, a.coteMarcheReference);
    a.trj = trjA;
    b.trj = trjB;

    a.surebet = trjA != null ? (trjA > 1 ? 'YES' : 'NO') : null;
    b.surebet = trjB != null ? (trjB > 1 ? 'YES' : 'NO') : null;

    const trjBook = crossTrj(a.cote, b.cote);
    a.trjBook = trjBook;
    b.trjBook = trjBook;

    const trjPs = crossTrj(a.coteMarcheReference, b.coteMarcheReference);
    a.trjPs3838 = trjPs;
    b.trjPs3838 = trjPs;
  }

  return computed;
}

export function competitionGroupKey(row: { bookmaker: string; competition: string }): string {
  return `${row.bookmaker}::${row.competition}`;
}

export function groupByCompetition(rows: ComputedBettingRow[]): Map<string, ComputedBettingRow[]> {
  const map = new Map<string, ComputedBettingRow[]>();
  for (const row of rows) {
    const key = competitionGroupKey(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }

  // Sort competitions by nearest cutoff (same logic as Excel summary)
  const sorted = new Map(
    [...map.entries()].sort(([, aRows], [, bRows]) => {
      const aCutoff = aRows.find((r) => r.cutoff)?.cutoff?.getTime() ?? Infinity;
      const bCutoff = bRows.find((r) => r.cutoff)?.cutoff?.getTime() ?? Infinity;
      return aCutoff - bCutoff;
    }),
  );

  return sorted;
}

export type RowHighlight = 'surebet' | 'boost' | 'neutral';

export function getRowHighlight(row: ComputedBettingRow): RowHighlight {
  if (row.surebet === 'YES') return 'surebet';
  if (row.surebet === 'NO' && row.boostPct != null && row.boostPct < 0) return 'neutral';
  if (row.boostPct != null && row.boostPct > 0 && row.surebet !== 'YES') return 'boost';
  return 'neutral';
}

/** TRJ bookmaker en fraction (0,95 = 95 %). Au-delà de 100 % = donnée incohérente. */
export const MAX_VALID_TRJ_BOOK = 1;

export function isValidTrjBook(value: number | null | undefined): value is number {
  return value != null && !Number.isNaN(value) && value > 0 && value <= MAX_VALID_TRJ_BOOK;
}

export function formatPct(value: number | null, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatOdds(value: number | null, digits = 3): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toFixed(digits);
}

export function formatEuro(value: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
}

/** @deprecated use formatParisDateTime from paris-time */
export function formatDateTime(value: Date | null): string {
  return formatParisDateTime(value);
}

export type CutoffUrgency = 'past' | 'critical' | 'soon' | 'later' | 'unknown';

export interface UpcomingCompetition {
  key: string;
  bookmaker: string;
  competition: string;
  sport?: string;
  cutoff: Date | null;
  nbCotes: number;
  minutesUntil: number | null;
  urgency: CutoffUrgency;
  /** TRJ bookmaker moyen sur la compétition (0–1+, affiché en %) */
  trjBook: number | null;
}

export function getCutoffUrgency(cutoff: Date | null, now = new Date()): CutoffUrgency {
  if (!cutoff) return 'unknown';
  const ms = cutoff.getTime() - now.getTime();
  if (ms < 0) return 'past';
  const minutes = ms / 60_000;
  if (minutes <= 15) return 'critical';
  if (minutes <= 60) return 'soon';
  return 'later';
}

export function formatMinutesUntil(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 0) return 'Passé';
  if (minutes < 60) return `dans ${Math.round(minutes)} min`;
  if (minutes < 1440) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m > 0 ? `dans ${h}h${m.toString().padStart(2, '0')}` : `dans ${h}h`;
  }
  const totalH = Math.floor(minutes / 60);
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  return h > 0 ? `dans ${d}j ${h}h` : `dans ${d}j`;
}

export function buildUpcomingCompetitions(
  rows: ComputedBettingRow[],
  getSportName?: (bookmaker: string, apiId: string | undefined) => string | undefined,
): UpcomingCompetition[] {
  const map = new Map<string, UpcomingCompetition & { trjBooks: number[] }>();
  const now = nowParis();

  for (const row of rows) {
    const key = `${row.bookmaker}::${row.competition}`;
    const existing = map.get(key);
    if (!existing) {
      const sport = getSportName?.(row.bookmaker, row.apiId);
      map.set(key, {
        key,
        bookmaker: row.bookmaker,
        competition: row.competition,
        sport,
        cutoff: row.cutoff,
        nbCotes: 1,
        minutesUntil: minutesUntilParis(row.cutoff, now),
        urgency: getCutoffUrgency(row.cutoff, now),
        trjBook: isValidTrjBook(row.trjBook) ? row.trjBook : null,
        trjBooks: isValidTrjBook(row.trjBook) ? [row.trjBook] : [],
      });
    } else {
      existing.nbCotes += 1;
      if (isValidTrjBook(row.trjBook)) existing.trjBooks.push(row.trjBook);
      if (!existing.sport && getSportName) {
        existing.sport = getSportName(row.bookmaker, row.apiId);
      }
      if (row.cutoff && (!existing.cutoff || row.cutoff < existing.cutoff)) {
        existing.cutoff = row.cutoff;
        existing.minutesUntil = minutesUntilParis(row.cutoff, now);
        existing.urgency = getCutoffUrgency(row.cutoff, now);
      }
    }
  }

  return [...map.values()]
    .map(({ trjBooks, ...rest }) => {
      const valid = trjBooks.filter(isValidTrjBook);
      return {
        ...rest,
        trjBook: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
      };
    })
    .filter((c) => c.urgency !== 'past')
    .sort((a, b) => {
      const aT = a.cutoff?.getTime() ?? Infinity;
      const bT = b.cutoff?.getTime() ?? Infinity;
      return aT - bT;
    });
}

export interface TopTrjEvent {
  trjBook: number;
  bookmaker: string;
  competition: string;
  evenement: string;
  competiteur: string;
  cote: number;
  compKey: string;
  sport?: string;
}

export function buildTopTrjEvents(
  rows: ComputedBettingRow[],
  options?: {
    sportFilter?: (bookmaker: string, apiId: string | undefined) => boolean;
    getSportName?: (bookmaker: string, apiId: string | undefined) => string | undefined;
    minTrj?: number;
    limit?: number;
  },
): TopTrjEvent[] {
  let filtered = rows.filter((r) => isValidTrjBook(r.trjBook));
  if (options?.sportFilter) {
    filtered = filtered.filter((r) => options.sportFilter!(r.bookmaker, r.apiId));
  }
  if (options?.minTrj != null) {
    filtered = filtered.filter((r) => r.trjBook! >= options.minTrj!);
  }
  return filtered
    .sort((a, b) => (b.trjBook ?? 0) - (a.trjBook ?? 0))
    .slice(0, options?.limit ?? 50)
    .map((r) => ({
      trjBook: r.trjBook!,
      bookmaker: r.bookmaker,
      competition: r.competition,
      evenement: r.evenement,
      competiteur: r.competiteur,
      cote: r.cote,
      compKey: competitionGroupKey(r),
      sport: options?.getSportName?.(r.bookmaker, r.apiId),
    }));
}

export function buildUpcomingPinnacle(rows: PinnacleCompetition[]): UpcomingCompetition[] {
  const now = nowParis();
  const map = new Map<string, UpcomingCompetition>();

  for (const row of rows) {
    const key = `Pinnacle::${row.competition}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        bookmaker: 'Pinnacle',
        competition: row.competition,
        sport: row.sport,
        cutoff: row.cutoff,
        nbCotes: 0,
        minutesUntil: minutesUntilParis(row.cutoff, now),
        urgency: getCutoffUrgency(row.cutoff, now),
        trjBook: null,
      });
    } else if (row.cutoff && (!existing.cutoff || row.cutoff < existing.cutoff)) {
      existing.cutoff = row.cutoff;
      existing.minutesUntil = minutesUntilParis(row.cutoff, now);
      existing.urgency = getCutoffUrgency(row.cutoff, now);
    }
  }

  return [...map.values()]
    .filter((c) => c.urgency !== 'past')
    .sort((a, b) => (a.cutoff?.getTime() ?? Infinity) - (b.cutoff?.getTime() ?? Infinity));
}
