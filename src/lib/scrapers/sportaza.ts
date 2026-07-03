import type { ScrapedOdd } from './types';
import { fetchJsonViaCorsProxies } from './cors-fetch';
import { apiBase, filterYesNo, nowParis, toParisDate } from './utils';

interface AltenarOdd {
  id: number;
  name?: string;
  price?: number;
  oddStatus?: number;
}

interface AltenarChamp {
  id: number;
  name?: string;
}

interface AltenarEvent {
  id: number;
  name?: string;
  champId?: number;
  startDate?: string;
  competitorIds?: number[];
  marketIds?: number[];
  sc?: number;
}

interface AltenarMarket {
  id: number;
  name?: string;
  oddIds?: number[];
}

interface AltenarResponse {
  odds?: AltenarOdd[];
  champs?: AltenarChamp[];
  events?: AltenarEvent[];
  markets?: AltenarMarket[];
}

const PROD_BASE = 'https://sb2frontend-altenar2.biahosted.com/api/widget';
const BASE = apiBase('/api/sportaza', PROD_BASE);

const ENDPOINTS = ['GetEvents', 'GetOutrightEvents'] as const;

const WIDGET_PARAMS = {
  culture: 'fr-FR',
  timezoneOffset: '-120',
  integration: 'sportaza',
  deviceType: '1',
  numFormat: 'en-GB',
  countryCode: 'LI',
  eventCount: '0',
} as const;

async function fetchJson(url: string): Promise<AltenarResponse | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    return (await res.json()) as AltenarResponse;
  } catch {
    return null;
  }
}

async function fetchWidget(suffix: string, sportId: string): Promise<AltenarResponse | null> {
  const params = new URLSearchParams({ ...WIDGET_PARAMS, sportId });
  const url = `${BASE}/${suffix}?${params}`;

  const direct = await fetchJson(url);
  if (direct) return direct;

  if (import.meta.env.DEV) return null;

  const prodUrl = `${PROD_BASE}/${suffix}?${params}`;
  return fetchJsonViaCorsProxies<AltenarResponse>(prodUrl);
}

function parseSportazaResponse(data: AltenarResponse, sportId: string, extraction: Date): ScrapedOdd[] {
  const rows: ScrapedOdd[] = [];

  const odds = new Map((data.odds ?? []).map((o) => [o.id, o]));
  const champs = new Map((data.champs ?? []).map((c) => [c.id, c]));
  const events = new Map((data.events ?? []).map((e) => [e.id, e]));

  const marketToEvent = new Map<number, AltenarEvent>();
  for (const ev of events.values()) {
    for (const mid of ev.marketIds ?? []) {
      marketToEvent.set(mid, ev);
    }
  }

  for (const market of data.markets ?? []) {
    const event = marketToEvent.get(market.id);
    if (!event) continue;

    const competitors = event.competitorIds ?? [];
    if (competitors.length !== 2 && event.sc !== 2) continue;

    const oddsList = (market.oddIds ?? [])
      .map((id) => odds.get(id))
      .filter((o): o is AltenarOdd => {
        if (!o) return false;
        if ((o.oddStatus ?? 0) !== 0) return false;
        const price = o.price;
        return price != null && price !== 0;
      });

    if (oddsList.length !== 2) continue;

    const champ = event.champId != null ? champs.get(event.champId) : undefined;
    const cutoff = toParisDate(event.startDate?.replace('Z', '+00:00'));
    const marketName = market.name ?? '';

    for (const odd of oddsList) {
      const issueName = odd.name ?? '';
      rows.push({
        bookmaker: 'Sportaza',
        competition: champ?.name ?? '',
        extraction,
        cutoff,
        evenement: event.name ?? '',
        competiteur: marketName && issueName ? `${marketName} / ${issueName}` : issueName || marketName,
        cote: Number(odd.price),
        apiId: sportId,
        marche: marketName,
        pairKey: `${event.id}|${market.id}`,
      });
    }
  }

  return rows;
}

export async function scrapeSportaza(sportIds: string[]): Promise<ScrapedOdd[]> {
  const ids = sportIds.length ? sportIds : ['68', '89'];
  const extraction = nowParis();
  const rows: ScrapedOdd[] = [];

  for (const sportId of ids) {
    for (const suffix of ENDPOINTS) {
      try {
        const data = await fetchWidget(suffix, sportId);
        if (!data) continue;
        rows.push(...parseSportazaResponse(data, sportId, extraction));
      } catch {
        continue;
      }
    }
  }

  const filtered = filterYesNo(rows);
  if (!filtered.length) {
    throw new Error('Sportaza : aucune cote — vérifiez les IDs sports ou réessayez.');
  }
  return filtered;
}
