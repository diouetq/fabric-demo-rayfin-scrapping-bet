import { getRayfinClient } from '@/lib/rayfin-client';
import { executeMutation } from '@/lib/graphql-client';
import {
  findBookmakerById,
  findResultatById,
  findSportById,
  findTypePariById,
  getResultatEnCoursId,
  loadDimensions,
} from '@/lib/dimensions';
import { getPeriodBounds, isPlaceholderParisDate, toDateISO } from '@/lib/kpi-analytics';
import { effectiveStake, rowProfitNet } from '@/lib/kpi-profit';
import { formValuesToParisInput, scrapRowToFormValues } from '@/lib/paris-form';

export type ParisSourceInsertion = 'Manuel' | 'Scrap' | 'Import';

export interface ParisRecord {
  id: string;
  sourceInsertion: ParisSourceInsertion;
  datePari: Date;
  idBookmaker: number;
  idSport: number;
  libelleCompetition?: string;
  libelleEvenement: string;
  idTypePari: number;
  coteBookmaker: number;
  miseEngagee: number;
  idResultat?: number;
  gainNet?: number;
  coteMarcheReference?: number;
  coteVraieMpto?: number;
  probabiliteImplicite?: number;
  probabiliteReelleMpto?: number;
  trjBookmaker?: number;
  trjPs3838?: number;
  trjMarche?: number;
  pourcentageBoost?: number;
  critereKelly?: number;
  flagSurebet?: boolean;
  dateHeureMajScrap?: Date;
}

export interface ParisDisplayRow extends ParisRecord {
  bookmaker: string;
  typeBookmaker: string;
  sport: string;
  typeSport: string;
  typePari: string;
  resultat: string;
  statutScrap: 'Complet' | 'En attente scrap';
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}

/** Reproduit la colonne SQL calculée `gain_net` (payout, pas profit net). */
export function computeGainNet(row: Pick<ParisRecord, 'idResultat' | 'idTypePari' | 'coteBookmaker' | 'miseEngagee'>): number | undefined {
  const { idResultat, idTypePari, coteBookmaker, miseEngagee } = row;
  if (idResultat == null) return undefined;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  if (idResultat === 1 && idTypePari === 4) return round2(coteBookmaker * miseEngagee - miseEngagee);
  if (idResultat === 2 && idTypePari === 4) return round2(miseEngagee);
  if (idResultat === 1) return round2(coteBookmaker * miseEngagee);
  if (idResultat === 2) return 0;
  if (idResultat === 3) return round2(miseEngagee);
  return undefined;
}

function mapFromEntity(raw: Record<string, unknown>): ParisRecord {
  const idResultat = raw.id_resultat != null ? Number(raw.id_resultat) : undefined;
  const idTypePari = Number(raw.id_type_pari);
  const coteBookmaker = Number(raw.cote_bookmaker);
  const miseEngagee = Number(raw.mise_engagee);
  const gainFromApi = raw.gain_net != null ? Number(raw.gain_net) : undefined;
  const gainNet = gainFromApi ?? computeGainNet({ idResultat, idTypePari, coteBookmaker, miseEngagee });

  return {
    id: String(raw.id ?? raw.id_pari ?? ''),
    sourceInsertion: (raw.source_insertion as ParisSourceInsertion) ?? 'Manuel',
    datePari: new Date(String(raw.date_pari)),
    idBookmaker: Number(raw.id_bookmaker),
    idSport: Number(raw.id_sport),
    libelleCompetition: raw.libelle_competition != null ? String(raw.libelle_competition) : undefined,
    libelleEvenement: String(raw.libelle_evenement),
    idTypePari,
    coteBookmaker,
    miseEngagee,
    idResultat,
    gainNet,
    coteMarcheReference: raw.cote_marche_reference != null ? Number(raw.cote_marche_reference) : undefined,
    coteVraieMpto: raw.cote_vraie_mpto != null ? Number(raw.cote_vraie_mpto) : undefined,
    probabiliteImplicite: raw.probabilite_implicite != null ? Number(raw.probabilite_implicite) : undefined,
    probabiliteReelleMpto: raw.probabilite_reelle_mpto != null ? Number(raw.probabilite_reelle_mpto) : undefined,
    trjBookmaker: raw.trj_bookmaker != null ? Number(raw.trj_bookmaker) : undefined,
    trjPs3838: raw.trj_ps3838 != null ? Number(raw.trj_ps3838) : undefined,
    trjMarche: raw.trj_marche != null ? Number(raw.trj_marche) : undefined,
    pourcentageBoost: raw.pourcentage_boost != null ? Number(raw.pourcentage_boost) : undefined,
    critereKelly: raw.critere_kelly != null ? Number(raw.critere_kelly) : undefined,
    flagSurebet: raw.flag_surebet != null ? Boolean(raw.flag_surebet) : undefined,
    dateHeureMajScrap: raw.date_heure_maj_scrap ? new Date(String(raw.date_heure_maj_scrap)) : undefined,
  };
}

/** GraphQL `@date()` fields on FaitPari — YYYY-MM-DD only (no time component). */
const ENTITY_DATE_KEYS = new Set(['date_pari', 'date_heure_maj_scrap', 'date_heure_modification']);

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toEntityDateValue(value: Date): string {
  return toDateOnly(value);
}

const PARIS_RECORD_KEYS = [
  'sourceInsertion',
  'datePari',
  'idBookmaker',
  'idSport',
  'libelleCompetition',
  'libelleEvenement',
  'idTypePari',
  'coteBookmaker',
  'miseEngagee',
  'idResultat',
  'coteMarcheReference',
  'coteVraieMpto',
  'probabiliteImplicite',
  'probabiliteReelleMpto',
  'trjBookmaker',
  'trjPs3838',
  'trjMarche',
  'pourcentageBoost',
  'critereKelly',
  'flagSurebet',
  'dateHeureMajScrap',
] as const satisfies readonly (keyof ParisRecord)[];

/** Strip display-only fields from an inline-edit patch before GraphQL update. */
export function displayPatchToParisRecord(patch: Partial<ParisDisplayRow>): Partial<ParisRecord> {
  const out: Partial<ParisRecord> = {};
  for (const key of PARIS_RECORD_KEYS) {
    if (key in patch && patch[key] !== undefined) {
      (out as Record<string, unknown>)[key] = patch[key];
    }
  }
  return out;
}

function toEntityPayload(record: Partial<ParisRecord>) {
  const payload: Record<string, unknown> = {};
  if (record.sourceInsertion != null) payload.source_insertion = record.sourceInsertion;
  if (record.datePari != null) payload.date_pari = toEntityDateValue(record.datePari);
  if (record.idBookmaker != null) payload.id_bookmaker = record.idBookmaker;
  if (record.idSport != null) payload.id_sport = record.idSport;
  if (record.libelleCompetition !== undefined) payload.libelle_competition = record.libelleCompetition;
  if (record.libelleEvenement != null) payload.libelle_evenement = record.libelleEvenement;
  if (record.idTypePari != null) payload.id_type_pari = record.idTypePari;
  if (record.coteBookmaker != null) payload.cote_bookmaker = record.coteBookmaker;
  if (record.miseEngagee != null) payload.mise_engagee = record.miseEngagee;
  if (record.idResultat !== undefined) payload.id_resultat = record.idResultat;
  if (record.coteMarcheReference !== undefined) payload.cote_marche_reference = record.coteMarcheReference;
  if (record.coteVraieMpto !== undefined) payload.cote_vraie_mpto = record.coteVraieMpto;
  if (record.probabiliteImplicite !== undefined) payload.probabilite_implicite = record.probabiliteImplicite;
  if (record.probabiliteReelleMpto !== undefined) payload.probabilite_reelle_mpto = record.probabiliteReelleMpto;
  if (record.trjBookmaker !== undefined) payload.trj_bookmaker = record.trjBookmaker;
  if (record.trjPs3838 !== undefined) payload.trj_ps3838 = record.trjPs3838;
  if (record.trjMarche !== undefined) payload.trj_marche = record.trjMarche;
  if (record.pourcentageBoost !== undefined) payload.pourcentage_boost = record.pourcentageBoost;
  if (record.critereKelly !== undefined) payload.critere_kelly = record.critereKelly;
  if (record.flagSurebet !== undefined) payload.flag_surebet = record.flagSurebet;
  if (record.dateHeureMajScrap !== undefined) {
    payload.date_heure_maj_scrap = record.dateHeureMajScrap
      ? toEntityDateValue(record.dateHeureMajScrap)
      : null;
  }
  return payload;
}

function toEntityPayloadForUpdate(record: Partial<ParisRecord>) {
  return toEntityPayload(record);
}

/** PK SQL `id_pari` = BIGINT — GraphQL attend un entier, pas une chaîne UUID. */
function parseParisId(id: string): number {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error(`Identifiant pari invalide : ${id}`);
  }
  return n;
}

export function enrichParisDisplay(record: ParisRecord): ParisDisplayRow {
  const bm = findBookmakerById(record.idBookmaker);
  const sp = findSportById(record.idSport);
  const tp = findTypePariById(record.idTypePari);
  const res = findResultatById(record.idResultat ?? getResultatEnCoursId());
  return {
    ...record,
    bookmaker: bm?.nom ?? str(record.idBookmaker),
    typeBookmaker: bm?.typeBookmaker ?? '—',
    sport: sp?.nom ?? str(record.idSport),
    typeSport: sp?.typeSport ?? '—',
    typePari: tp?.libelle ?? str(record.idTypePari),
    resultat: res?.libelle ?? 'En cours',
    statutScrap: record.coteVraieMpto != null ? 'Complet' : 'En attente scrap',
  };
}

export async function listParis(): Promise<ParisDisplayRow[]> {
  await loadDimensions().catch(() => undefined);

  const client = getRayfinClient();
  if (!client.auth.getSession().isAuthenticated) {
    throw new Error('Session Fabric requise.');
  }

  const allFields = [
    'id_pari',
    'source_insertion', 'date_pari', 'id_bookmaker', 'id_sport',
    'libelle_competition', 'libelle_evenement', 'id_type_pari',
    'cote_bookmaker', 'mise_engagee', 'id_resultat',
    'cote_marche_reference', 'cote_vraie_mpto', 'probabilite_implicite',
    'probabilite_reelle_mpto', 'trj_bookmaker', 'trj_ps3838', 'trj_marche',
    'pourcentage_boost', 'critere_kelly', 'flag_surebet', 'date_heure_maj_scrap',
  ] as const;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const faitPari = client.data.FaitPari as any;
    let gqlRows: Record<string, unknown>[];

    try {
      const page = await faitPari.select([...allFields]).first(5000).executePaginated();
      gqlRows = (page?.items ?? page ?? []) as Record<string, unknown>[];
    } catch {
      gqlRows = (await faitPari.select([...allFields]).first(5000).execute()) as Record<string, unknown>[];
    }

    return gqlRows
      .map(mapFromEntity)
      .filter((r) => r.id !== '' && r.id !== '0')
      .sort((a, b) => b.datePari.getTime() - a.datePari.getTime())
      .map(enrichParisDisplay);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Impossible de lire dbo.fait_paris via GraphQL : ${msg}. Lancez \`node scripts/patch-dab-scrapping-bet.mjs\` puis réessayez.`,
      { cause: err instanceof Error ? err : undefined },
    );
  }
}

const FAIT_PARI_RETURN_FIELDS = `
    id_pari source_insertion date_pari id_bookmaker id_sport
    libelle_competition libelle_evenement id_type_pari cote_bookmaker
    mise_engagee id_resultat cote_marche_reference cote_vraie_mpto
    probabilite_implicite probabilite_reelle_mpto trj_bookmaker trj_ps3838
    trj_marche pourcentage_boost critere_kelly flag_surebet date_heure_maj_scrap`;

/**
 * Convert a value to an inline GraphQL literal.
 * Avoids typed input variables ($item: CreateFaitPariInput!) which cause
 * System.Text.Json.JsonElement deserialization errors in DAB's .NET runtime.
 */
function gqlLiteral(key: string, value: unknown): string {
  if (value instanceof Date) {
    const s = ENTITY_DATE_KEYS.has(key) ? toDateOnly(value) : value.toISOString();
    return `${key}: ${JSON.stringify(s)}`;
  }
  if (typeof value === 'string') return `${key}: ${JSON.stringify(value)}`;
  if (typeof value === 'number') return `${key}: ${value}`;
  if (typeof value === 'boolean') return `${key}: ${value}`;
  if (value === null) return `${key}: null`;
  return `${key}: ${JSON.stringify(String(value))}`;
}

function buildCreateMutation(fields: Record<string, unknown>): string {
  const body = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => gqlLiteral(k, v))
    .join(' ');
  return `mutation { createFaitPari(item: { ${body} }) { ${FAIT_PARI_RETURN_FIELDS} } }`;
}

function buildUpdateMutation(id: string, fields: Record<string, unknown>): string {
  const body = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => gqlLiteral(k, v))
    .join(' ');
  const pk = parseParisId(id);
  return `mutation { updateFaitPari(id_pari: ${pk}, item: { ${body} }) { ${FAIT_PARI_RETURN_FIELDS} } }`;
}

function buildDeleteMutation(id: string): string {
  const pk = parseParisId(id);
  return `mutation { deleteFaitPari(id_pari: ${pk}) { id_pari } }`;
}

export async function createParis(input: Omit<ParisRecord, 'id'>): Promise<ParisRecord> {
  const payload = {
    ...input,
    idResultat: input.idResultat ?? getResultatEnCoursId(),
    flagSurebet: input.flagSurebet ?? false,
  };

  if (payload.coteBookmaker >= 1 && payload.probabiliteImplicite == null) {
    payload.probabiliteImplicite = 1 / payload.coteBookmaker;
  }

  const client = getRayfinClient();
  const session = client.auth.getSession();
  if (!session.isAuthenticated) {
    throw new Error('Connexion requise.');
  }

  const fields = toEntityPayload(payload);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await (client.data.FaitPari as any).create(fields).execute();
    return mapFromEntity(created as Record<string, unknown>);
  } catch (sdkErr) {
    console.warn('[createParis] client.data.create failed:', sdkErr);
  }

  try {
    const mutation = buildCreateMutation(fields);
    const result = await executeMutation<{ createFaitPari: Record<string, unknown> }>(mutation, {});
    return mapFromEntity(result.createFaitPari);
  } catch (gqlErr) {
    const msg = gqlErr instanceof Error ? gqlErr.message : String(gqlErr);
    throw new Error(`Enregistrement dans dbo.fait_paris impossible : ${msg}`);
  }
}

export async function updateParis(id: string, updates: Partial<ParisRecord>): Promise<ParisRecord> {
  const pk = parseParisId(id);

  const client = getRayfinClient();
  const patch = toEntityPayloadForUpdate(updates);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = await (client.data.FaitPari as any).update(pk, patch).execute();
    return mapFromEntity(updated as Record<string, unknown>);
  } catch (sdkErr) {
    console.warn('[updateParis] client.data.update failed:', sdkErr);
  }

  try {
    const mutation = buildUpdateMutation(id, patch);
    const result = await executeMutation<{ updateFaitPari: Record<string, unknown> }>(mutation, {});
    return mapFromEntity(result.updateFaitPari);
  } catch (gqlErr) {
    const msg = gqlErr instanceof Error ? gqlErr.message : String(gqlErr);
    throw new Error(`Mise à jour dbo.fait_paris impossible : ${msg}`);
  }
}

export async function deleteParis(id: string): Promise<void> {
  const pk = parseParisId(id);

  const client = getRayfinClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.data.FaitPari as any).delete(pk).execute();
    return;
  } catch (sdkErr) {
    console.warn('[deleteParis] client.data.delete failed:', sdkErr);
  }

  try {
    await executeMutation(buildDeleteMutation(id), {});
  } catch (gqlErr) {
    const msg = gqlErr instanceof Error ? gqlErr.message : String(gqlErr);
    throw new Error(`Suppression dbo.fait_paris impossible : ${msg}`);
  }
}

export async function createParisFromFormInput(input: Omit<ParisRecord, 'id'>): Promise<ParisRecord> {
  return createParis(input);
}

export { formValuesToParisInput, scrapRowToFormValues };

export interface KpiSummary {
  totalParis: number;
  enCours: number;
  gagnes: number;
  perdus: number;
  rembourses: number;
  miseTotale: number;
  profitEstime: number;
  bySport: Array<{ sport: string; count: number }>;
}

export function computeParisKpis(rows: ParisDisplayRow[]): KpiSummary {
  const bySport = new Map<string, number>();
  let enCours = 0;
  let gagnes = 0;
  let perdus = 0;
  let rembourses = 0;
  let miseTotale = 0;
  let profitEstime = 0;

  for (const r of rows) {
    miseTotale += r.miseEngagee;
    if (r.gainNet != null) profitEstime += r.gainNet - r.miseEngagee;
    bySport.set(r.sport, (bySport.get(r.sport) ?? 0) + 1);
    switch (r.idResultat) {
      case 1: gagnes += 1; break;
      case 2: perdus += 1; break;
      case 3: rembourses += 1; break;
      default: enCours += 1;
    }
  }

  return {
    totalParis: rows.length,
    enCours,
    gagnes,
    perdus,
    rembourses,
    miseTotale,
    profitEstime,
    bySport: [...bySport.entries()].map(([sport, count]) => ({ sport, count })),
  };
}

export interface KpiFilters {
  bookmakers: string[];
  sports: string[];
  typesPari: string[];
  periode: 'all' | 'week' | 'month' | 'prevmonth' | 'quarter' | 'year' | 'prevyear' | '30d' | '90d';
  resultat: 'all' | 'encours' | 'termines';
  dateFrom?: string;
  dateTo?: string;
  coteMin?: number;
  coteMax?: number;
}

export const DEFAULT_KPI_FILTERS: KpiFilters = {
  bookmakers: [],
  sports: [],
  typesPari: [],
  periode: 'all',
  resultat: 'all',
};

export interface BreakdownRow {
  label: string;
  paris: number;
  gagnes: number;
  perdus: number;
  winRate: number | null;
  miseTotale: number;
  coteMoyenne: number | null;
  profitNet: number;
  roi: number | null;
}

export interface OddsDistributionRow {
  range: string;
  paris: number;
  gagnes: number;
  winRate: number | null;
}

export interface PeriodBreakdownRow {
  label: string;
  dateFrom: string;
  dateTo: string;
  paris: number;
  gagnes: number;
  winPct: number | null;
  mise: number;
  coteMoyenne: number | null;
  profitNet: number;
  roi: number | null;
}

export interface KpiInsight {
  icon: string;
  text: string;
  type: 'positive' | 'negative' | 'neutral';
}

export interface FullKpiData {
  totalParis: number;
  enCours: number;
  gagnes: number;
  perdus: number;
  rembourses: number;
  miseTotale: number;
  profitNetTotal: number;
  roi: number | null;
  winRate: number | null;
  coteMoyenne: number | null;
  byBookmaker: BreakdownRow[];
  bySport: BreakdownRow[];
  byTypePari: BreakdownRow[];
  oddsDistribution: OddsDistributionRow[];
  bankrollTimeline: { date: Date; profit: number }[];
  monthlyProfits: { month: string; profit: number }[];
  periodBreakdown: PeriodBreakdownRow[];
  insights: KpiInsight[];
}

/** @deprecated use rowProfitNet from @/lib/kpi-profit */
export { rowProfitNet, effectiveStake, isFreebet, FREEBET_TYPE_ID } from '@/lib/kpi-profit';

export function buildBankrollTimeline(
  allRows: ParisDisplayRow[],
  filters: KpiFilters,
): { date: Date; profit: number }[] {
  const dimFiltered = applyKpiFilters(allRows, {
    ...filters,
    periode: 'all',
    dateFrom: undefined,
    dateTo: undefined,
  });

  const settled = dimFiltered
    .filter((r) => !isPlaceholderParisDate(r.datePari))
    .filter((r) => r.idResultat === 1 || r.idResultat === 2 || r.idResultat === 3)
    .sort((a, b) => a.datePari.getTime() - b.datePari.getTime());

  if (settled.length === 0) return [];

  const rangeFrom = filters.dateFrom
    ? new Date(`${filters.dateFrom}T00:00:00`)
    : filters.periode !== 'all'
      ? getPeriodBounds(filters.periode)?.from ?? settled[0].datePari
      : settled[0].datePari;
  const rangeTo = filters.dateTo
    ? new Date(`${filters.dateTo}T23:59:59`)
    : filters.periode !== 'all'
      ? getPeriodBounds(filters.periode)?.to ?? settled[settled.length - 1].datePari
      : settled[settled.length - 1].datePari;

  let startCum = 0;
  for (const r of settled) {
    if (r.datePari < rangeFrom) startCum += rowProfitNet(r);
    else break;
  }

  const inRange = settled.filter((r) => r.datePari >= rangeFrom && r.datePari <= rangeTo);
  if (inRange.length === 0 && startCum === 0) return [];

  const timeline: { date: Date; profit: number }[] = [];
  timeline.push({ date: rangeFrom, profit: startCum });

  let cum = startCum;
  for (const r of inRange) {
    cum += rowProfitNet(r);
    timeline.push({ date: r.datePari, profit: cum });
  }

  return timeline.length >= 2 ? timeline : timeline.length === 1 ? [...timeline, { ...timeline[0], date: rangeTo }] : timeline;
}

export function filterByPeriod(
  rows: ParisDisplayRow[],
  periode: KpiFilters['periode'],
): ParisDisplayRow[] {
  if (periode === 'all') return rows;
  const now = new Date();
  let start: Date;
  let end: Date | null = null;

  switch (periode) {
    case 'week': {
      const diff = (now.getDay() + 6) % 7; // Mon=0 offset
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      break;
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'prevmonth':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      break;
    }
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'prevyear':
      start = new Date(now.getFullYear() - 1, 0, 1);
      end = new Date(now.getFullYear(), 0, 1);
      break;
    case '30d':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      return rows;
  }

  return rows.filter(
    (r) => r.datePari >= start && (end == null || r.datePari < end),
  );
}

export function applyKpiFilters(rows: ParisDisplayRow[], filters: KpiFilters): ParisDisplayRow[] {
  let out = rows;
  if (filters.bookmakers.length) out = out.filter((r) => filters.bookmakers.includes(r.bookmaker));
  if (filters.sports.length)     out = out.filter((r) => filters.sports.includes(r.sport));
  if (filters.typesPari.length)  out = out.filter((r) => filters.typesPari.includes(r.typePari));
  if (filters.dateFrom || filters.dateTo) {
    if (filters.dateFrom) {
      const from = new Date(`${filters.dateFrom}T00:00:00`);
      out = out.filter((r) => r.datePari >= from);
    }
    if (filters.dateTo) {
      const to = new Date(`${filters.dateTo}T23:59:59`);
      out = out.filter((r) => r.datePari <= to);
    }
  } else {
    out = filterByPeriod(out, filters.periode);
  }
  if (filters.coteMin != null) out = out.filter((r) => r.coteBookmaker >= filters.coteMin!);
  if (filters.coteMax != null) out = out.filter((r) => r.coteBookmaker <= filters.coteMax!);
  if (filters.resultat === 'encours') {
    out = out.filter((r) => r.idResultat !== 1 && r.idResultat !== 2 && r.idResultat !== 3);
  } else if (filters.resultat === 'termines') {
    out = out.filter((r) => r.idResultat === 1 || r.idResultat === 2 || r.idResultat === 3);
  }
  return out;
}

export function computeFullKpis(rows: ParisDisplayRow[], filters: KpiFilters): FullKpiData {
  const filtered = applyKpiFilters(rows, filters);

  let enCours = 0, gagnes = 0, perdus = 0, rembourses = 0;
  let miseTotale = 0, profitNetTotal = 0, miseSettled = 0;
  let sumCotes = 0;

  for (const r of filtered) {
    miseTotale += effectiveStake(r);
    sumCotes += r.coteBookmaker;
    if (r.idResultat === 1) {
      gagnes++;
      miseSettled += effectiveStake(r);
      profitNetTotal += rowProfitNet(r);
    } else if (r.idResultat === 2) {
      perdus++;
      miseSettled += effectiveStake(r);
      profitNetTotal += rowProfitNet(r);
    } else if (r.idResultat === 3) {
      rembourses++;
      miseSettled += effectiveStake(r);
    } else {
      enCours++;
    }
  }

  const roi = miseSettled > 0 ? profitNetTotal / miseSettled : null;
  const winRate = (gagnes + perdus) > 0 ? gagnes / (gagnes + perdus) : null;
  const coteMoyenne = filtered.length > 0 ? sumCotes / filtered.length : null;

  // ── Breakdown helper ──────────────────────────────────────────────────────
  function buildBreakdown(keyFn: (r: ParisDisplayRow) => string): BreakdownRow[] {
    const map = new Map<string, {
      paris: number; gagnes: number; perdus: number;
      miseTotale: number; profitNet: number; miseSettled: number;
      sumCotes: number;
    }>();

    for (const r of filtered) {
      const k = keyFn(r);
      const e = map.get(k) ?? { paris: 0, gagnes: 0, perdus: 0, miseTotale: 0, profitNet: 0, miseSettled: 0, sumCotes: 0 };
      e.paris++;
      e.miseTotale += effectiveStake(r);
      e.sumCotes += r.coteBookmaker;
      if (r.idResultat === 1) {
        e.gagnes++;
        e.miseSettled += effectiveStake(r);
        e.profitNet += rowProfitNet(r);
      } else if (r.idResultat === 2) {
        e.perdus++;
        e.miseSettled += effectiveStake(r);
        e.profitNet += rowProfitNet(r);
      } else if (r.idResultat === 3) {
        e.miseSettled += effectiveStake(r);
      }
      map.set(k, e);
    }

    return [...map.entries()]
      .map(([label, d]) => ({
        label,
        paris: d.paris,
        gagnes: d.gagnes,
        perdus: d.perdus,
        winRate: (d.gagnes + d.perdus) > 0 ? d.gagnes / (d.gagnes + d.perdus) : null,
        miseTotale: d.miseTotale,
        coteMoyenne: d.paris > 0 ? d.sumCotes / d.paris : null,
        profitNet: d.profitNet,
        roi: d.miseSettled > 0 ? d.profitNet / d.miseSettled : null,
      }))
      .sort((a, b) => (b.roi ?? -Infinity) - (a.roi ?? -Infinity));
  }

  // ── Odds distribution ─────────────────────────────────────────────────────
  const oddsDistribution: OddsDistributionRow[] = [
    { range: '1.00–1.50', min: 1.00, max: 1.50 },
    { range: '1.50–2.00', min: 1.50, max: 2.00 },
    { range: '2.00–3.00', min: 2.00, max: 3.00 },
    { range: '3.00+',     min: 3.00, max: Infinity },
  ].map(({ range, min, max }) => {
    const inRange = filtered.filter((r) => r.coteBookmaker >= min && r.coteBookmaker < max);
    const g = inRange.filter((r) => r.idResultat === 1).length;
    const p = inRange.filter((r) => r.idResultat === 2).length;
    return { range, paris: inRange.length, gagnes: g, winRate: (g + p) > 0 ? g / (g + p) : null };
  });

  // ── Bankroll timeline (profit cumulé depuis le début, ancré au début de la période) ─
  const bankrollTimeline = buildBankrollTimeline(rows, filters);

  // ── Monthly profits ───────────────────────────────────────────────────────
  const monthMap = new Map<string, number>();
  for (const r of filtered) {
    const d = r.datePari;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(key, (monthMap.get(key) ?? 0) + rowProfitNet(r));
  }
  const monthlyProfits = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, profit]) => ({ month, profit }));

  // ── Period breakdown (dimension filters only — no period filter) ──────────
  const baseForPeriod = applyKpiFilters(rows, { ...filters, periode: 'all', resultat: 'all' });

  const PERIOD_DEFS: { label: string; periode: KpiFilters['periode'] }[] = [
    { label: 'Cette semaine',   periode: 'week'      },
    { label: 'Ce mois',        periode: 'month'     },
    { label: 'Mois précédent', periode: 'prevmonth' },
    { label: 'Ce trimestre',   periode: 'quarter'   },
    { label: 'Cette année',    periode: 'year'      },
  ];

  const periodBreakdown: PeriodBreakdownRow[] = PERIOD_DEFS.map(({ label, periode }) => {
    const bounds = getPeriodBounds(periode);
    const pr = filterByPeriod(baseForPeriod, periode);
    const g = pr.filter((r) => r.idResultat === 1).length;
    const p = pr.filter((r) => r.idResultat === 2).length;
    const mise = pr.reduce((s, r) => s + effectiveStake(r), 0);
    const pNet = pr.reduce((s, r) => s + rowProfitNet(r), 0);
    const ms = pr
      .filter((r) => r.idResultat === 1 || r.idResultat === 2 || r.idResultat === 3)
      .reduce((s, r) => s + effectiveStake(r), 0);
    const sumCotesPr = pr.reduce((s, r) => s + r.coteBookmaker, 0);
    return {
      label,
      dateFrom: bounds ? toDateISO(bounds.from) : '',
      dateTo: bounds ? toDateISO(bounds.to) : '',
      paris: pr.length,
      gagnes: g,
      winPct: (g + p) > 0 ? g / (g + p) : null,
      mise,
      coteMoyenne: pr.length > 0 ? sumCotesPr / pr.length : null,
      profitNet: pNet,
      roi: ms > 0 ? pNet / ms : null,
    };
  });

  // ── Build breakdowns (needed for insights too) ────────────────────────────
  const byBookmaker = buildBreakdown((r) => r.bookmaker);
  const bySport     = buildBreakdown((r) => r.sport);
  const byTypePari  = buildBreakdown((r) => r.typePari);

  // ── Insights ──────────────────────────────────────────────────────────────
  const insights: KpiInsight[] = [];

  const bestBk = [...byBookmaker]
    .filter((r) => r.paris >= 3 && r.roi != null)
    .sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))[0];
  if (bestBk) {
    const roiPct = ((bestBk.roi ?? 0) * 100).toFixed(1);
    const sign = Number(roiPct) >= 0 ? '+' : '';
    insights.push({
      icon: '🏆',
      text: `Meilleur bookmaker : ${bestBk.label} (ROI ${sign}${roiPct}%)`,
      type: Number(roiPct) >= 0 ? 'positive' : 'negative',
    });
  }

  const worstType = [...byTypePari]
    .filter((r) => r.paris >= 3 && r.roi != null)
    .sort((a, b) => (a.roi ?? 0) - (b.roi ?? 0))[0];
  if (worstType && (worstType.roi ?? 0) < 0) {
    const roiPct = ((worstType.roi ?? 0) * 100).toFixed(1);
    insights.push({
      icon: '⚠️',
      text: `Type de pari le moins rentable : ${worstType.label} (ROI ${roiPct}%)`,
      type: 'negative',
    });
  }

  if (monthlyProfits.length > 0) {
    const best = [...monthlyProfits].sort((a, b) => b.profit - a.profit)[0];
    if (best.profit > 0) {
      const [y, m] = best.month.split('-');
      const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', {
        month: 'long',
        year: 'numeric',
      });
      insights.push({
        icon: '📈',
        text: `Mois le plus rentable : ${monthName} (+${Math.round(best.profit)}€)`,
        type: 'positive',
      });
    }
  }

  return {
    totalParis: filtered.length,
    enCours,
    gagnes,
    perdus,
    rembourses,
    miseTotale,
    profitNetTotal,
    roi,
    winRate,
    coteMoyenne,
    byBookmaker,
    bySport,
    byTypePari,
    oddsDistribution,
    bankrollTimeline,
    monthlyProfits,
    periodBreakdown,
    insights,
  };
}
