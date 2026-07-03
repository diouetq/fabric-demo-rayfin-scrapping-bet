import type { ScrapedOdd } from './types';
import { fromUnixSeconds } from '@/lib/paris-time';
import { isEmbeddedMode } from '@microsoft/fabric-embedded-host';
import { apiBase, filterYesNo, nowParis } from './utils';

interface SlottRunner {
  name?: string;
  price?: number;
  priceStr?: string;
  tags?: string[];
}

interface SlottMarket {
  primary?: boolean;
  runners?: SlottRunner[];
}

interface SlottCompetitor {
  homeAway?: string;
  name?: string;
}

interface SlottLeague {
  id?: string | number;
  name?: string;
}

interface SlottEvent {
  name?: string;
  kickoff?: number;
  league?: SlottLeague;
  competitors?: SlottCompetitor[];
  markets?: SlottMarket[];
}

export interface SlottResponse {
  events?: SlottEvent[];
}

const SLOTT_PARAMS = {
  ctag: 'fr-FR',
  hideClosed: 'true',
  flags: 'reg,urlv2,orn2,mm2,rrc,nodup,cmg',
} as const;

const BASE = apiBase('/api/slott', 'https://slott-france.com/api-2/betline');

function isFabricEmbedContext(): boolean {
  if (import.meta.env.DEV) return false;
  try {
    return typeof window !== 'undefined' && window.parent !== window && isEmbeddedMode({});
  } catch {
    return typeof window !== 'undefined' && window.parent !== window;
  }
}

function slottQuery(regionId: string): URLSearchParams {
  return new URLSearchParams({ ...SLOTT_PARAMS, region_id: regionId });
}

async function fetchSlottRegionDirect(regionId: string): Promise<SlottResponse> {
  const url = `${BASE}/events/all?${slottQuery(regionId)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; ScrappingBet/1.0)',
    },
  });
  if (!response.ok) throw new Error(`Slott HTTP ${response.status}`);
  const text = await response.text();
  if (!text.trim()) throw new Error('Slott : réponse vide');
  return JSON.parse(text) as SlottResponse;
}

function runnerPrice(runner: SlottRunner): number | null {
  if (runner.price != null && Number.isFinite(runner.price)) return runner.price;
  if (runner.priceStr) {
    const n = Number(runner.priceStr.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function parseSlottResponse(data: SlottResponse, extraction: Date, sportId?: string): ScrapedOdd[] {
  const rows: ScrapedOdd[] = [];
  const leagueCache = new Map<string | number, SlottLeague>();

  for (const event of data.events ?? []) {
    const league = event.league ?? {};
    const leagueId = league.id;
    if (league.name && leagueId != null) leagueCache.set(leagueId, league);
    const fullLeague = leagueId != null ? leagueCache.get(leagueId) ?? league : league;
    const competition = fullLeague.name ?? '';

    if ((event.competitors ?? []).length !== 2) continue;

    let market = (event.markets ?? []).find((m) => m.primary);
    if (!market) {
      market = (event.markets ?? []).find((m) => (m.runners ?? []).length === 2);
    }
    if (!market) continue;

    const runners = market.runners ?? [];
    if (runners.length !== 2) continue;

    const competitors = Object.fromEntries(
      (event.competitors ?? [])
        .filter((c) => c.homeAway)
        .map((c) => [c.homeAway!, c.name ?? '']),
    );

    const kickoffRaw = event.kickoff;
    const cutoff = kickoffRaw ? fromUnixSeconds(kickoffRaw / 1000) : null;

    for (const runner of runners) {
      const tags = runner.tags ?? [];
      const tag = tags[0];
      const competiteur = (tag ? competitors[tag] : undefined) ?? runner.name ?? '';
      const cote = runnerPrice(runner);
      if (cote == null) continue;

      rows.push({
        bookmaker: 'Slott',
        competition,
        evenement: event.name ?? '',
        competiteur,
        cote,
        cutoff,
        extraction,
        marche: 'Vainqueur',
        ...(sportId ? { apiId: sportId } : {}),
      });
    }
  }

  return rows;
}

export async function scrapeSlott(regionIds: string[]): Promise<ScrapedOdd[]> {
  const ids = regionIds.length ? regionIds : ['1970324836974625'];

  if (isFabricEmbedContext()) {
    const { scrapeSlottViaWarehouse } = await import('@/services/slott-store-service');
    return filterYesNo(await scrapeSlottViaWarehouse(ids));
  }

  const extraction = nowParis();
  const directRows: ScrapedOdd[] = [];
  for (const regionId of ids) {
    const data = await fetchSlottRegionDirect(regionId);
    directRows.push(...parseSlottResponse(data, extraction, regionId));
  }
  if (!directRows.length) {
    throw new Error('Slott direct : aucun événement parsé.');
  }
  return filterYesNo(directRows);
}
