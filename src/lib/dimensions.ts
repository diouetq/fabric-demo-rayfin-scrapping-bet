/** Référentiels warehouse — chargés via listDimensions (warehouse scrapping-bet). */

export interface DimBookmaker {
  id: number;
  nom: string;
  typeBookmaker: string;
}

export interface DimSport {
  id: number;
  nom: string;
  typeSport: string;
}

export interface DimTypePari {
  id: number;
  libelle: string;
}

export interface DimResultat {
  id: number;
  libelle: string;
}

export interface DimSportIdAPI {
  bookmaker: string;
  apiId: string;
  nomApi: string | null;
  idSport: number | null;
}

export interface DimensionCatalog {
  bookmakers: DimBookmaker[];
  sports: DimSport[];
  typesPari: DimTypePari[];
  resultats: DimResultat[];
  sportIdsApi: DimSportIdAPI[];
}

export const RESULTAT_EN_COURS_ID = 4;

let cached: DimensionCatalog | null = null;
let loadPromise: Promise<DimensionCatalog> | null = null;

const BM_ALIASES: Record<string, string> = {
  sportaza: 'Sportaza',
  greenluck: 'Greenluck',
  betify: 'CrazyBet',
  mystake: 'MyStake',
};

export async function loadDimensions(): Promise<DimensionCatalog> {
  if (cached) return cached;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const { fetchDimensions } = await import('@/services/dimensions-service');
      cached = await fetchDimensions();
      return cached;
    } catch (err) {
      loadPromise = null;
      throw err;
    }
  })();
  return loadPromise;
}

export function invalidateDimensionsCache(): void {
  cached = null;
  loadPromise = null;
}

export function getDimensions(): DimensionCatalog {
  if (!cached) throw new Error('Dimensions non chargées.');
  return cached;
}

export function setDimensionsForTests(catalog: DimensionCatalog): void {
  cached = catalog;
}

export function findBookmakerById(id: number): DimBookmaker | undefined {
  return cached?.bookmakers.find((b) => b.id === id);
}

export function findSportById(id: number): DimSport | undefined {
  return cached?.sports.find((s) => s.id === id);
}

export function findTypePariById(id: number): DimTypePari | undefined {
  return cached?.typesPari.find((t) => t.id === id);
}

export function findResultatById(id: number): DimResultat | undefined {
  return cached?.resultats.find((r) => r.id === id);
}

export function findBookmakerByName(nom: string): DimBookmaker | undefined {
  const key = nom.trim().toLowerCase();
  if (!key) return undefined;
  return cached?.bookmakers.find((b) => b.nom.toLowerCase() === key);
}

export function findSportByName(nom: string): DimSport | undefined {
  const key = nom.trim().toLowerCase();
  if (!key) return undefined;
  return cached?.sports.find((s) => s.nom.toLowerCase() === key);
}

export function findTypePariByLabel(libelle: string): DimTypePari | undefined {
  const key = libelle.trim().toLowerCase();
  if (!key) return undefined;
  return cached?.typesPari.find((t) => t.libelle.toLowerCase() === key);
}

export function findResultatByLabel(libelle: string): DimResultat | undefined {
  const key = libelle.trim().toLowerCase();
  if (!key) return undefined;
  return cached?.resultats.find((r) => r.libelle.toLowerCase() === key);
}

export function findSportNameByApiId(
  sportIdsApi: DimSportIdAPI[],
  bookmaker: string,
  apiId: string | undefined,
): string | undefined {
  if (!apiId) return undefined;
  const bm = bookmaker.toLowerCase();
  const entry = sportIdsApi.find(
    (s) => s.bookmaker.toLowerCase() === bm && s.apiId === apiId,
  );
  if (!entry) return undefined;
  if (entry.idSport != null) {
    const sport = cached?.sports.find((s) => s.id === entry.idSport);
    if (sport?.nom) return sport.nom;
  }
  return entry.nomApi ?? undefined;
}

export function findSportIdByApiId(
  sportIdsApi: DimSportIdAPI[],
  bookmaker: string,
  apiId: string | undefined,
): number | undefined {
  if (!apiId) return undefined;
  const bm = bookmaker.toLowerCase();
  const entry = sportIdsApi.find(
    (s) => s.bookmaker.toLowerCase() === bm && s.apiId === apiId,
  );
  return entry?.idSport ?? undefined;
}

export function resolveBookmakerIdFromLabel(label: string): number | undefined {
  const key = label.trim().toLowerCase();
  const alias = BM_ALIASES[key];
  if (alias) return findBookmakerByName(alias)?.id;
  return findBookmakerByName(label)?.id;
}

export function suggestTypePariId(boostPct: number | null | undefined): number {
  if (boostPct == null || boostPct <= 0) {
    return cached?.typesPari.find((t) => t.libelle.toLowerCase().includes('classique') && !t.libelle.toLowerCase().includes('boost'))?.id
      ?? cached?.typesPari[0]?.id
      ?? 3;
  }
  if (boostPct >= 0.08) {
    return cached?.typesPari.find((t) => t.libelle.toLowerCase().includes('grosse'))?.id
      ?? cached?.typesPari[0]?.id
      ?? 1;
  }
  return cached?.typesPari.find((t) => t.libelle.toLowerCase().includes('boost'))?.id
    ?? cached?.typesPari[0]?.id
    ?? 2;
}

export function getResultatEnCoursId(): number {
  const found = cached?.resultats.find((r) => r.libelle.toLowerCase().includes('cours'));
  return found?.id ?? RESULTAT_EN_COURS_ID;
}

export function buildLibelleEvenement(evenement: string, competiteur: string): string {
  const parts = [evenement, competiteur].map((p) => p.trim()).filter(Boolean);
  const raw = parts.join(' · ');
  return raw.length > 250 ? raw.slice(0, 247) + '…' : raw;
}

export function truncateCompetition(label: string): string {
  const raw = label.trim();
  return raw.length > 150 ? raw.slice(0, 147) + '…' : raw;
}
