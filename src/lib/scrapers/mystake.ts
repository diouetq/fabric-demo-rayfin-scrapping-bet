import type { ScrapedOdd } from './types';
import { nowParis, parseMystakeDate } from '@/lib/paris-time';
import { doubleDecode, mystakeGet } from './mystake-http';

const BATCH_SIZE = 50;
const MAX_WORKERS = 16;
const GAME_FULL_VIEW = '28';
const META_KEYS = new Set(['pos', 'coef', 'res', 'lock', 'hism']);

interface MystakeOutcome {
  pos?: number;
  coef?: number | string;
  lock?: boolean | number;
  h?: number | string;
  [key: string]: unknown;
}

interface MarketDesc {
  name: string;
  ou: boolean;
  h: boolean;
  posById: Record<number, string>;
  sideById: Record<number, number>;
}

interface MarketRow {
  marche: string;
  competiteur: string;
  cote: number;
  /** `${marketId}|${groupKey}` — signature de paire au sein du match (mirrors Python PairSig). */
  pairSig: string;
}

const marketDescsCache = new Map<string, Record<string, MarketDesc>>();
const teamsCache = new Map<string, Record<number, string>>();

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>, concurrency: number): Promise<void> {
  let index = 0;
  async function runOne(): Promise<void> {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  }
  const workers = Math.min(concurrency, items.length);
  if (workers === 0) return;
  await Promise.all(Array.from({ length: workers }, runOne));
}

function chunked<T>(seq: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < seq.length; i += size) out.push(seq.slice(i, i + size));
  return out;
}

async function loadMarketDescriptions(sportId: string): Promise<Record<string, MarketDesc>> {
  const cached = marketDescsCache.get(sportId);
  if (cached) return cached;

  const idx: Record<string, MarketDesc> = {};
  const raw = await mystakeGet(`/getprematchmarketsbysport/en/,${sportId},`, 'prematch');

  let marketDict: Record<string, unknown> = {};
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object' && raw[0]) {
    marketDict = raw[0] as Record<string, unknown>;
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    marketDict = raw as Record<string, unknown>;
  }

  for (const [mid, mRaw] of Object.entries(marketDict)) {
    if (!mRaw || typeof mRaw !== 'object') continue;
    const m = mRaw as Record<string, unknown>;
    const posById: Record<number, string> = {};
    const sideById: Record<number, number> = {};
    for (const o of (m.pos as Array<Record<string, unknown>> | undefined) ?? []) {
      const pid = o.id as number | undefined;
      if (pid == null) continue;
      const label = String(o.nm ?? o.kn ?? pid);
      posById[pid] = label;
      if (label.trim() === '1' || label.trim() === '2') {
        sideById[pid] = Number(label);
      } else if ((o.n === 1 || o.n === 2) && !m.ou) {
        sideById[pid] = Number(o.n);
      }
    }
    idx[String(mid)] = {
      name: String(m.name ?? m.kn ?? mid),
      ou: Boolean(m.ou),
      h: Boolean(m.h),
      posById,
      sideById,
    };
  }

  marketDescsCache.set(sportId, idx);
  return idx;
}

function ordinal(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const suffixes: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };
  return suffixes[v] ?? `${v}th`;
}

function fillMarketName(template: string, spec: Record<string, unknown>): string {
  if (!template) return template;
  let name = template;
  for (const [k, v] of Object.entries(spec)) {
    if (v == null) continue;
    name = name.replace(`{${k}_r}`, ordinal(v));
    name = name.replace(`{${k}}`, String(v));
  }
  return name;
}

function formatOutcomeLabel(baseName: string, outcome: MystakeOutcome, marketDesc: MarketDesc): string {
  let label = baseName;
  const h = outcome.h;
  if (h != null) {
    const hv = Number(h);
    const hvStr = Number.isFinite(hv)
      ? marketDesc.h
        ? `${hv >= 0 ? '+' : ''}${hv}`
        : String(hv)
      : String(h);
    label = marketDesc.h ? `${label} (${hvStr})` : `${label} ${hvStr}`;
  }
  return label;
}

function concatMarcheIssue(marche: string, issue: string): string {
  const m = (marche ?? '').trim();
  const i = (issue ?? '').trim();
  if (m && i) return `${m} / ${i}`;
  return i || m;
}

function groupKey(outcome: MystakeOutcome): string {
  const pairs = Object.entries(outcome)
    .filter(([k]) => !META_KEYS.has(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, String(v)] as const);
  return JSON.stringify(pairs);
}

async function extractTwoWayMarkets(
  gameEv: Record<string, Record<string, MystakeOutcome>> | undefined,
  sportId: string,
  competitors: [string, string],
): Promise<MarketRow[]> {
  const marketDescs = await loadMarketDescriptions(sportId);
  const rows: MarketRow[] = [];
  const [name1, name2] = competitors;

  for (const [marketId, outcomes] of Object.entries(gameEv ?? {})) {
    const desc = marketDescs[String(marketId)] ?? {
      name: marketId,
      ou: false,
      h: false,
      posById: {},
      sideById: {},
    };
    const marketTemplate = desc.name;
    const groups = new Map<string, Array<[string, MystakeOutcome]>>();

    for (const [, o] of Object.entries(outcomes ?? {})) {
      if (!o || typeof o !== 'object') continue;
      const coef = o.coef;
      if (coef == null || coef === 0 || coef === '0.0' || o.lock) continue;
      const key = groupKey(o);
      const bucket = groups.get(key) ?? [];
      bucket.push(['', o]);
      groups.set(key, bucket);
    }

    for (const [key, items] of groups) {
      if (items.length !== 2) continue;

      const spec: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(items[0][1])) {
        if (!META_KEYS.has(k)) spec[k] = v;
      }
      const marketLabel = fillMarketName(marketTemplate, spec);
      const pairSig = `${marketId}|${key}`;

      for (const [, o] of items) {
        const pos = o.pos;
        const side = pos != null ? desc.sideById[pos] : undefined;
        let baseName: string;
        if (side === 1) baseName = name1;
        else if (side === 2) baseName = name2;
        else baseName = pos != null ? (desc.posById[pos] ?? String(pos)) : 'Unknown';

        const outcomeLabel = formatOutcomeLabel(baseName, o, desc);
        rows.push({
          marche: marketLabel,
          competiteur: concatMarcheIssue(marketLabel, outcomeLabel),
          cote: Number(o.coef),
          pairSig,
        });
      }
    }
  }

  return rows;
}

async function fetchGamesBatch(
  sportId: string,
  gameIds: string[],
): Promise<{ teams: Record<number, string> }> {
  if (gameIds.length === 0) return { teams: {} };

  const gamesParam = `,${gameIds.join(',')},`;
  const raw = await mystakeGet(`/getprematchgameall/en/${sportId}/?games=${gamesParam}`, 'prematch');
  if (!raw || typeof raw !== 'object') return { teams: {} };

  const outer = raw as Record<string, unknown>;
  const teams: Record<number, string> = {};
  const teamsRaw = doubleDecode(outer.teams);
  if (Array.isArray(teamsRaw)) {
    for (const t of teamsRaw) {
      if (t && typeof t === 'object' && (t as Record<string, unknown>).ID != null) {
        const row = t as Record<string, unknown>;
        teams[Number(row.ID)] = String(row.Name ?? '');
      }
    }
  }
  return { teams };
}

async function fetchGameFull(
  gameId: string,
): Promise<{ game: Record<string, unknown> | null; teams: Record<number, string> }> {
  const raw = await mystakeGet(`/getprematchgamefull/${GAME_FULL_VIEW}/${gameId}`, 'prematch');
  if (!raw || typeof raw !== 'object') return { game: null, teams: {} };

  const outer = raw as Record<string, unknown>;
  const gameRaw = doubleDecode(outer.game);
  if (!gameRaw || typeof gameRaw !== 'object') return { game: null, teams: {} };

  const teams: Record<number, string> = {};
  const teamsRaw = doubleDecode(outer.teams);
  if (Array.isArray(teamsRaw)) {
    for (const t of teamsRaw) {
      if (t && typeof t === 'object' && (t as Record<string, unknown>).ID != null) {
        const row = t as Record<string, unknown>;
        teams[Number(row.ID)] = String(row.Name ?? '');
      }
    }
  }

  return { game: gameRaw as Record<string, unknown>, teams };
}

async function loadTeamsForSport(sportId: string, gameIds: string[]): Promise<Record<number, string>> {
  const cached = teamsCache.get(sportId);
  if (cached) return cached;

  const teams: Record<number, string> = {};
  for (const batch of chunked(gameIds, BATCH_SIZE)) {
    const { teams: t } = await fetchGamesBatch(sportId, batch);
    Object.assign(teams, t);
  }

  teamsCache.set(sportId, teams);
  return teams;
}

async function fetchOutrightRows(
  outrightId: string,
  champName: string,
  extraction: Date,
  sportId: string,
): Promise<ScrapedOdd[]> {
  const rows: ScrapedOdd[] = [];
  const raw = await mystakeGet(`/GetOutrightFull/en/${outrightId}`, 'sport');
  if (!raw || typeof raw !== 'object') return rows;

  const fData = raw as Record<string, unknown>;
  const names: Record<string, string> = {};
  for (const src of [fData.Teams, fData.OutrighOtherDirectory]) {
    if (!src || typeof src !== 'object') continue;
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      if (v && typeof v === 'object' && (v as Record<string, unknown>).Name != null) {
        names[k] = String((v as Record<string, unknown>).Name);
      }
    }
  }

  const outrights = (fData.Outrights ?? {}) as Record<string, Record<string, unknown>>;
  for (const [outKey, outVal] of Object.entries(outrights)) {
    const eventName = String(
      (outVal.OutrighNameItem as Record<string, unknown> | undefined)?.Name ?? '',
    );
    const cutoff = parseMystakeDate(outVal.st as string | undefined);
    const games = (outVal.Game ?? {}) as Record<string, Record<string, unknown>>;
    if (Object.keys(games).length !== 2) continue;
    const pairKey = `outright|${outrightId}|${outKey}`;

    for (const gVal of Object.values(games)) {
      const competiteurId = String(gVal.t1);
      const name = names[competiteurId] ?? 'Inconnu';

      let coef: number | undefined;
      for (const ev of Object.values((gVal.ev ?? {}) as Record<string, MystakeOutcome>)) {
        if (ev?.lock || ev?.coef == null || ev.coef === 0) continue;
        coef = Number(ev.coef);
        break;
      }
      if (coef == null || !Number.isFinite(coef)) continue;

      rows.push({
        bookmaker: 'MyStake',
        competition: champName,
        extraction,
        cutoff,
        evenement: eventName,
        competiteur: concatMarcheIssue('Vainqueur', name),
        cote: coef,
        apiId: sportId,
        marche: 'Vainqueur',
        pairKey,
      });
    }
  }

  return rows;
}

async function scrapeMystakeBrowser(sportIds: string[]): Promise<ScrapedOdd[]> {
  const rows: ScrapedOdd[] = [];
  const extraction = nowParis();

  const headerRaw = await mystakeGet('/getheader/en', 'sport');
  if (!headerRaw || typeof headerRaw !== 'object') {
    throw new Error('MyStake : header API inaccessible — vérifiez le réseau ou le proxy UDF mystakeFetch.');
  }

  const enSports = ((headerRaw as Record<string, unknown>).EN as Record<string, unknown> | undefined)
    ?.Sports as Record<string, Record<string, unknown>> | undefined;
  if (!enSports) {
    throw new Error('MyStake : structure header invalide.');
  }

  const gamesBySport = new Map<string, string[]>();
  const champByGame = new Map<string, string>();
  const outrightTasks: Array<[string, string, string]> = [];

  for (const sId of sportIds) {
    const sportNode = enSports[sId];
    if (!sportNode) continue;

    for (const reg of Object.values((sportNode.Regions ?? {}) as Record<string, Record<string, unknown>>)) {
      for (const champ of Object.values((reg.Champs ?? {}) as Record<string, Record<string, unknown>>)) {
        const champName = String(champ.Name ?? '');
        for (const [gId, gRaw] of Object.entries(
          (champ.GameSmallItems ?? {}) as Record<string, Record<string, unknown>>,
        )) {
          if (String(gId).startsWith('-')) {
            outrightTasks.push([String(gId).replace(/^-/, ''), champName, sId]);
            continue;
          }
          if (!gRaw || !('t2' in gRaw)) continue;
          const list = gamesBySport.get(sId) ?? [];
          list.push(String(gId));
          gamesBySport.set(sId, list);
          champByGame.set(String(gId), champName);
        }
      }
    }
  }

  for (const [sportId, gameIds] of gamesBySport) {
    const sportTeams = await loadTeamsForSport(sportId, gameIds);
    await loadMarketDescriptions(sportId);

    await runPool(
      gameIds,
      async (gid) => {
        const { game, teams: teamsFull } = await fetchGameFull(gid);
        if (!game) return;

        const teams = { ...sportTeams, ...teamsFull };
        const t1 = game.t1 as number | undefined;
        const t2 = game.t2 as number | undefined;
        const name1 = t1 != null ? (teams[t1] ?? `Team_${t1}`) : 'Team_1';
        const name2 = t2 != null ? (teams[t2] ?? `Team_${t2}`) : 'Team_2';
        const evenement = `${name1} - ${name2}`;
        const cutoff = parseMystakeDate(game.st as string | undefined);
        const realSport = String(game.sport ?? sportId);

        const marketRows = await extractTwoWayMarkets(
          game.ev as Record<string, Record<string, MystakeOutcome>> | undefined,
          realSport,
          [name1, name2],
        );

        for (const mr of marketRows) {
          rows.push({
            bookmaker: 'MyStake',
            competition: champByGame.get(gid) ?? '',
            extraction,
            cutoff,
            evenement,
            competiteur: mr.competiteur,
            cote: mr.cote,
            apiId: realSport,
            marche: mr.marche,
            pairKey: `${gid}|${mr.pairSig}`,
          });
        }
      },
      MAX_WORKERS,
    );
  }

  await runPool(
    outrightTasks,
    async ([oid, cname, sId]) => {
      rows.push(...(await fetchOutrightRows(oid, cname, extraction, sId)));
    },
    MAX_WORKERS,
  );

  return rows;
}

export async function scrapeMystake(sportIds: string[]): Promise<ScrapedOdd[]> {
  const ids = sportIds.length ? sportIds : ['16'];
  const rows = await scrapeMystakeBrowser(ids);
  if (!rows.length) {
    throw new Error('MyStake : aucune cote — vérifiez les IDs sports ou réessayez.');
  }
  return rows;
}
