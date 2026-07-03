import type { ScrapedOdd } from './types';
import { apiBase, nowParis, toParisFromUnix } from './utils';

const BRAND = '2491953325260546049';
const BASE = apiBase('/api/betify', 'https://api-a-c7818b61-600.sptpub.com/api/v4/prematch/brand');
const BASE_V3 = apiBase(
  '/api/betify-v3',
  'https://api-a-c7818b61-600.sptpub.com/api/v3/descriptions/brand',
);

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.betify.com/',
};

// -------------------------------------------------------------------------
// Raw API shapes
// -------------------------------------------------------------------------

// /v3/descriptions/brand/{BRAND}/markets/{lang}
// Root is directly { [marketId]: RawMarketData } (no "markets" wrapper)
interface RawOutcomeBlock {
  outcomes?: Array<{ id: string; name: string }>;
}
interface RawMarketData {
  name?: string;
  specifiers?: string[];
  market_type?: string;
  // variants: { variantKey: [ { outcomes: [{id, name}] } ] }
  variants?: Record<string, RawOutcomeBlock[]>;
}

// /v3/descriptions/brand/{BRAND}/event/{eventId}/{lang}
// Root: { markets: { [marketId]: { name, variants: { vk: [{outcomes}] } } } }
interface RawEventMarketData {
  name?: string;
  variants?: Record<string, RawOutcomeBlock[]>;
}
interface RawEventDescsResponse {
  markets?: Record<string, RawEventMarketData>;
}

// -------------------------------------------------------------------------
// Processed description caches
// -------------------------------------------------------------------------
interface MarketDesc {
  name: string;
  // variantKey → { outcomeId → name template }
  outcomesByVariant: Record<string, Record<string, string>>;
}
interface EventDesc {
  markets: Record<string, {
    name: string;
    // variantKey → { outcomeId → resolved name }
    variants: Record<string, Record<string, string>>;
  }>;
  // flat fallback: outcomeId → name (all outcomes from all markets of this event)
  outcomes: Record<string, string>;
}

// Session-level cache for global market descriptions (rarely changes)
let marketDescsCache: Record<string, MarketDesc> | null = null;

async function betifyGet(url: string): Promise<Response> {
  return fetch(url, { headers: HEADERS });
}

// -------------------------------------------------------------------------
// (1) Global market descriptions — one call, cached across scrapes
// -------------------------------------------------------------------------
async function loadMarketDescs(): Promise<Record<string, MarketDesc>> {
  if (marketDescsCache) return marketDescsCache;
  try {
    const res = await betifyGet(`${BASE_V3}/${BRAND}/markets/fr`);
    if (!res.ok) { marketDescsCache = {}; return {}; }
    // Root is directly { marketId: data } — no "markets" wrapper
    const raw = (await res.json()) as Record<string, RawMarketData>;
    const result: Record<string, MarketDesc> = {};
    for (const [mid, md] of Object.entries(raw)) {
      if (!md || typeof md !== 'object') continue;
      const obv: Record<string, Record<string, string>> = {};
      for (const [vk, blocks] of Object.entries(md.variants ?? {})) {
        const names: Record<string, string> = {};
        for (const block of blocks) {
          for (const o of block.outcomes ?? []) {
            names[o.id] = o.name;
          }
        }
        obv[vk] = names;
      }
      result[mid] = { name: md.name ?? mid, outcomesByVariant: obv };
    }
    marketDescsCache = result;
  } catch {
    marketDescsCache = {};
  }
  return marketDescsCache;
}

// -------------------------------------------------------------------------
// (2) Per-event descriptions — for dynamic markets (cycling H2H, outrights)
//     Cached per scrape call (fresh Map per scrapeBetify invocation)
// -------------------------------------------------------------------------
async function loadEventDescs(
  eventId: string,
  cache: Map<string, EventDesc>,
): Promise<EventDesc | null> {
  if (cache.has(eventId)) return cache.get(eventId)!;
  const empty: EventDesc = { markets: {}, outcomes: {} };
  try {
    const res = await betifyGet(`${BASE_V3}/${BRAND}/event/${eventId}/fr`);
    if (!res.ok) { cache.set(eventId, empty); return null; }
    const raw = (await res.json()) as RawEventDescsResponse;
    const flatOutcomes: Record<string, string> = {};
    const markets: EventDesc['markets'] = {};
    for (const [mid, md] of Object.entries(raw.markets ?? {})) {
      const variants: Record<string, Record<string, string>> = {};
      for (const [vk, blocks] of Object.entries(md.variants ?? {})) {
        const names: Record<string, string> = {};
        for (const block of blocks) {
          for (const o of block.outcomes ?? []) {
            names[o.id] = o.name;
            flatOutcomes[o.id] = o.name;  // flat fallback for dynamic labels
          }
        }
        variants[vk] = names;
      }
      markets[mid] = { name: md.name ?? mid, variants };
    }
    const desc: EventDesc = { markets, outcomes: flatOutcomes };
    cache.set(eventId, desc);
    return desc;
  } catch {
    cache.set(eventId, empty);
    return null;
  }
}

// -------------------------------------------------------------------------
// Template interpolation (mirrors Python fill_template)
// -------------------------------------------------------------------------
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ordinalFR(s: string): string {
  const n = parseInt(s, 10);
  if (isNaN(n)) return s;
  return n === 1 ? '1er' : `${n}e`;
}

/**
 * Parses "variant=goals=3|score=2:1" → { variant: "goals=3", score: "2:1" }
 * Mirrors Python: split on "|", then split each part on first "=".
 * No stripping of "variant=" prefix (keeps spec consistent with Python).
 */
function parseSpecifier(variantKey: string): Record<string, string> {
  const spec: Record<string, string> = {};
  for (const part of (variantKey ?? '').split('|')) {
    const idx = part.indexOf('=');
    if (idx >= 0) spec[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return spec;
}

/**
 * Fills a Betify description template.
 * Patterns (from Python "{%s}" % k string formatting):
 *   {$competitor1}, {$competitor2}  → competitor name
 *   {goals}   → raw specifier value (e.g. "3")
 *   {!goals}  → French ordinal ("3e")
 *   {+goals}  → signed float ("+3" / "-1.5")
 *   {-goals}  → negated signed float ("-3" / "+1.5")
 */
function fillTemplate(tpl: string, spec: Record<string, string>, competitors: string[]): string {
  if (!tpl) return tpl;
  let r = tpl;
  r = r.replace(/\{\$competitor1\}/g, competitors[0] ?? '');
  r = r.replace(/\{\$competitor2\}/g, competitors[1] ?? '');
  for (const [k, v] of Object.entries(spec)) {
    const ek = escapeRe(k);
    // {k} → value as-is
    r = r.replace(new RegExp(`\\{${ek}\\}`, 'g'), v);
    // {!k} → French ordinal
    r = r.replace(new RegExp(`\\{!${ek}\\}`, 'g'), ordinalFR(v));
    const fv = parseFloat(v);
    if (!isNaN(fv)) {
      const pos = fv >= 0 ? `+${fv}` : `${fv}`;
      const neg = -fv >= 0 ? `+${-fv}` : `${-fv}`;
      r = r.replace(new RegExp(`\\{\\+${ek}\\}`, 'g'), pos);  // {+k}
      r = r.replace(new RegExp(`\\{-${ek}\\}`, 'g'), neg);    // {-k}
    }
  }
  return r.trim();
}

// -------------------------------------------------------------------------
// Unified label resolution (mirrors Python resolve_labels)
// -------------------------------------------------------------------------
interface ResolvedLabels {
  marketLabel: string;
  outcomeLabels: Record<string, string>;
  isDynamic: boolean;
}

/** Mirrors Python _concat_marche_issue: "Marché / issue" pour lever l'ambiguïté des marchés standard. */
function concatMarcheIssue(marche: string, issue: string): string {
  const m = (marche ?? '').trim();
  const i = (issue ?? '').trim();
  if (m && i) return `${m} / ${i}`;
  return i || m;
}

async function resolveLabels(
  marketId: string,
  variantKey: string,
  outcomeIds: string[],
  competitors: string[],
  eventId: string,
  marketDescs: Record<string, MarketDesc>,
  eventCache: Map<string, EventDesc>,
): Promise<ResolvedLabels | null> {
  // Dynamic markets: cycling H2H, outrights with tt:markettext: variant keys
  const isDynamic =
    variantKey.includes('tt:markettext:') ||
    outcomeIds.some((id) => id.startsWith('tt:outcometext:'));

  if (isDynamic) {
    const ev = await loadEventDescs(eventId, eventCache);
    if (!ev) return null;
    const mkt = ev.markets[marketId];
    // Exact variant → flat event outcomes fallback
    const varLabels = mkt?.variants?.[variantKey] ?? ev.outcomes;
    return { marketLabel: mkt?.name ?? marketId, outcomeLabels: varLabels, isDynamic: true };
  }

  // Standard markets: global descriptions + template interpolation
  const md = marketDescs[marketId];
  if (!md) return null;

  const spec = parseSpecifier(variantKey);
  const marketLabel = fillTemplate(md.name, spec, competitors);

  // Try exact variant key, then stripped (without "variant="), then "" default
  const stripped = variantKey.replace(/^variant=/, '');
  const tpls =
    md.outcomesByVariant[variantKey] ||
    md.outcomesByVariant[stripped] ||
    md.outcomesByVariant[''] ||
    {};

  const outcomeLabels: Record<string, string> = {};
  for (const [oid, tpl] of Object.entries(tpls)) {
    outcomeLabels[oid] = fillTemplate(tpl, spec, competitors);
  }
  return { marketLabel, outcomeLabels, isDynamic: false };
}

// -------------------------------------------------------------------------
// Betify event types
// -------------------------------------------------------------------------
interface BetifyOutcome {
  k?: number | string;
  b?: boolean | number;  // blocked/suspended flag
}
interface BetifyEvent {
  desc?: {
    sport?: string;
    slug?: string;
    scheduled?: number;
    tournament?: string;
    competitors?: Array<{ name?: string }>;
  };
  markets?: Record<string, Record<string, Record<string, BetifyOutcome>>>;
}

/** Mirrors Python clean_outcomes: removes suspended (b flag) and invalid odds. */
function cleanOutcomes(
  outcomes: Record<string, BetifyOutcome>,
): Array<[string, BetifyOutcome]> {
  return Object.entries(outcomes).filter(([, odd]) => {
    if (!odd || odd.b) return false;
    const v = Number(odd.k);
    return !isNaN(v) && v > 0;
  });
}

// -------------------------------------------------------------------------
// Main scraper
// -------------------------------------------------------------------------
export async function scrapeBetify(sportIds: string[]): Promise<ScrapedOdd[]> {
  const sportSet = new Set(sportIds);
  const rows: ScrapedOdd[] = [];
  const extraction = nowParis();
  // Event descriptions cache — fresh per scrape call
  const eventCache = new Map<string, EventDesc>();

  // Load global market descriptions (cached across scrapes)
  const marketDescs = await loadMarketDescs();

  const res0 = await betifyGet(`${BASE}/${BRAND}/en/0`);
  if (!res0.ok) throw new Error(`Betify ${res0.status}`);
  const data0 = (await res0.json()) as {
    top_events_versions?: string[] | string[][];
    rest_events_versions?: string[];
  };

  let topVersions = data0.top_events_versions ?? [];
  if (topVersions.length === 1 && Array.isArray(topVersions[0])) {
    topVersions = topVersions[0] as string[];
  }
  const allVersions = [
    ...new Set([...(topVersions as string[]), ...(data0.rest_events_versions ?? [])]),
  ];

  const allEvents: Record<string, BetifyEvent> = {};
  const allTournaments: Record<string, { name?: string }> = {};

  for (const ver of allVersions) {
    try {
      const r = await betifyGet(`${BASE}/${BRAND}/en/${ver}`);
      if (!r.ok) continue;
      const d = (await r.json()) as {
        events?: Record<string, BetifyEvent>;
        tournaments?: Record<string, { name?: string }>;
      };
      Object.assign(allEvents, d.events ?? {});
      Object.assign(allTournaments, d.tournaments ?? {});
    } catch {
      continue;
    }
  }

  for (const [eventId, event] of Object.entries(allEvents)) {
    const desc = event.desc ?? {};
    const sportApiId = String(desc.sport ?? '');
    if (!sportSet.has(sportApiId)) continue;

    const tournamentName = allTournaments[desc.tournament ?? '']?.name;
    const cutoff = desc.scheduled ? toParisFromUnix(desc.scheduled) : null;
    const competitors = (desc.competitors ?? []).map((c) => c.name ?? '');

    for (const [marketId, variants] of Object.entries(event.markets ?? {})) {
      for (const [variantKey, outcomes] of Object.entries(variants)) {
        const clean = cleanOutcomes(outcomes);
        if (clean.length !== 2) continue;

        try {
          const outcomeIds = clean.map(([oid]) => oid);
          const resolved = await resolveLabels(
            marketId, variantKey, outcomeIds, competitors, eventId, marketDescs, eventCache,
          );

          const marketLabel = resolved?.marketLabel;
          const isDynamic = resolved?.isDynamic ?? false;

          // Nom lisible de l'événement :
          //  - marché dynamique (vélo H2H) : le marketLabel porte déjà "...H2H X vs Y"
          //  - marché standard (tennis...) : reconstruit "J1 vs J2" (le slug n'est pas lisible)
          let evenement: string;
          if (isDynamic && marketLabel) {
            evenement = marketLabel;
          } else if (competitors.length >= 2 && competitors[0] && competitors[1]) {
            evenement = `${competitors[0]} vs ${competitors[1]}`;
          } else {
            evenement = marketLabel || desc.slug || '';
          }

          // Stable sort by outcome id (mirrors Python dict iteration order being preserved)
          const sorted = [...clean].sort(([a], [b]) => Number(a) - Number(b));

          for (let idx = 0; idx < sorted.length; idx++) {
            const [oid, odd] = sorted[idx];
            const label = resolved?.outcomeLabels[oid] ?? competitors[idx] ?? oid;
            // vélo/H2H dynamique : Evenement porte déjà tout -> Competiteur = nom seul
            // standard (tennis...) : concatène "Marché / issue" pour lever l'ambiguïté
            const competiteur = isDynamic ? label : concatMarcheIssue(marketLabel ?? '', label);
            rows.push({
              bookmaker: 'Betify',
              competition: tournamentName ?? '',
              extraction,
              cutoff,
              evenement,
              competiteur,
              cote: Number(odd.k),
              apiId: sportApiId,
              marche: marketLabel || marketId,
              pairKey: `${eventId}|${marketId}|${variantKey}`,
            });
          }
        } catch {
          continue;
        }
      }
    }
  }

  return rows;
}
