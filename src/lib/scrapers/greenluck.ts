import { fetchJsonViaCorsProxies } from './cors-fetch';
import type { ScrapedOdd } from './types';
import { filterYesNo, nowParis, toParisDate } from './utils';

const PROD_BASE = 'https://pre-161o-sp.sbx.bet/cache/161/fr/li';
const HIDENSEEK = '8ce92afecb8a002f7471da5a79231725cddaf6a9';

const GL_HEADERS: Record<string, string> = {
  accept: '*/*',
  'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  origin: 'https://greenluck.com',
  referer: 'https://greenluck.com/',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
};

interface GreenluckOdd {
  team_name?: string;
  team_side?: number;
  odd_value?: number;
}

interface GreenluckEvent {
  tournament_name?: string;
  date_start?: string;
  main_odds?: { main?: Record<string, GreenluckOdd> };
}

interface GreenluckTournament {
  sportId?: number | string;
  name?: string;
  hasOutright?: boolean;
}

interface SportsInfoResponse {
  tournaments?: Record<string, GreenluckTournament>;
}

type JsonFetcher = (path: string) => Promise<unknown | null>;

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Même stratégie que Pinnacle : proxy Vite en dev, proxies CORS puis direct en prod. */
async function fetchGreenluckJson(path: string): Promise<unknown | null> {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const absoluteUrl = `${PROD_BASE}${normalized}`;

  if (import.meta.env.DEV) {
    const data = await fetchJson(`/api/greenluck${normalized}`, GL_HEADERS);
    if (data) return data;
  }

  const viaProxy = await fetchJsonViaCorsProxies<unknown>(absoluteUrl);
  if (viaProxy) return viaProxy;

  return fetchJson(absoluteUrl, GL_HEADERS);
}

function parseGreenluckEvents(
  sportIds: string[],
  info: SportsInfoResponse,
  fetchJsonPath: JsonFetcher,
  extraction: Date,
): Promise<ScrapedOdd[]> {
  const sportSet = new Set(sportIds.map(String));
  const tournaments = Object.entries(info.tournaments ?? {}).filter(([, t]) =>
    sportSet.has(String(t.sportId)),
  );

  return (async () => {
    const allRows: ScrapedOdd[] = [];

    for (const [tid, tournament] of tournaments) {
      if (tournament.hasOutright) continue;
      const sportApiId = String(tournament.sportId ?? '');

      const prematchRaw = await fetchJsonPath(
        `/${tid}/prematch-by-tournaments.json?hidenseek=${HIDENSEEK}`,
      );
      if (!prematchRaw) continue;

      const data = prematchRaw as { events?: GreenluckEvent[] };

      for (const event of data.events ?? []) {
        const mainOdds = event.main_odds?.main ?? {};
        if (Object.keys(mainOdds).length !== 2) continue;

        const sorted = Object.values(mainOdds).sort(
          (a, b) => (a.team_side ?? 0) - (b.team_side ?? 0),
        );

        const dateRaw = event.date_start;
        const cutoff = dateRaw ? toParisDate(dateRaw.replace('Z', '+00:00')) : null;

        const nom1 = (sorted[0].team_name ?? '').trim();
        const nom2 = (sorted[1].team_name ?? '').trim();
        const evenement = `${nom1} vs ${nom2}`;
        const competition = event.tournament_name ?? tournament.name ?? '';

        for (const odd of sorted) {
          const competiteur = (odd.team_name ?? '').trim();
          const cote = odd.odd_value;
          if (cote == null) continue;

          allRows.push({
            bookmaker: 'Greenluck',
            competition,
            evenement,
            competiteur,
            cote,
            cutoff,
            extraction,
            apiId: sportApiId,
            marche: 'Vainqueur',
          });
        }
      }
    }

    return filterYesNo(allRows);
  })();
}

/** sports-info.json → prematch-by-tournaments par tournoi (comme Scrap_Greenluck.py). */
async function scrapeGreenluckWithFetcher(
  sportIds: string[],
  fetchJsonPath: JsonFetcher,
): Promise<ScrapedOdd[]> {
  const infoRaw = await fetchJsonPath('/Europe-Paris/sports-info.json');
  if (!infoRaw) {
    throw new Error(
      'Greenluck : API inaccessible — vérifiez votre connexion ou utilisez npm run dev (proxy local).',
    );
  }

  const extraction = nowParis();
  const rows = await parseGreenluckEvents(
    sportIds,
    infoRaw as SportsInfoResponse,
    fetchJsonPath,
    extraction,
  );

  if (rows.length === 0) {
    const sportSet = new Set(sportIds.map(String));
    const tournaments = Object.entries((infoRaw as SportsInfoResponse).tournaments ?? {}).filter(
      ([, t]) => sportSet.has(String(t.sportId)),
    );
    if (tournaments.length === 0) {
      throw new Error(
        'Greenluck : aucun tournoi pour les IDs sports sélectionnés — ajustez les IDs dans Paramètres.',
      );
    }
    throw new Error(
      'Greenluck : tournois trouvés mais aucune cote — réessayez plus tard ou vérifiez les IDs sports.',
    );
  }

  return rows;
}

export async function scrapeGreenluck(sportIds: string[]): Promise<ScrapedOdd[]> {
  const ids = sportIds.length ? sportIds : ['14', '15', '16', '17', '27', '28', '29', '31', '32'];
  return scrapeGreenluckWithFetcher(ids, fetchGreenluckJson);
}
