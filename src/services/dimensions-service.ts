import { getRayfinClient } from '@/lib/rayfin-client';
import { executeMutation, executeQuery } from '@/lib/graphql-client';

import { invalidateDimensionsCache, type DimensionCatalog, type DimSportIdAPI } from '@/lib/dimensions';



const TIMEOUT_MS = 15_000;



function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {

  return Promise.race([

    promise,

    new Promise<T>((_, reject) => {

      setTimeout(() => reject(new Error(`${label} — délai dépassé (${ms / 1000}s).`)), ms);

    }),

  ]);

}



type SportIdsApiRow = {
  bookmaker: string;
  api_id: string;
  nom_api: string | null;
  id_sport: number | null;
  actif: boolean | number;
};

/** Requête indépendante dim_sport_ids_API — non-fatale si la table manque encore. */
async function fetchSportIdsApi(): Promise<DimSportIdAPI[]> {

  // DAB pluralise 'DimSportIdsAPI' → 'dimSportIdsAPIS' (observé dans l'erreur GraphQL).

  // Essai 1 : client.data

  try {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (getRayfinClient().data as any).DimSportIdsAPI

      .select(['bookmaker', 'api_id', 'nom_api', 'id_sport', 'actif'])

      .execute() as SportIdsApiRow[];

    return mapSportIdsRows(rows);

  } catch {

    // ignore — essai 2

  }

  // Essai 2 : executeQuery avec le nom de champ exact vu dans l'erreur

  for (const fieldName of ['dimSportIdsAPIS', 'dimSportIdsAPIs', 'dimSportIdsApis']) {

    try {

      const data = await executeQuery<Record<string, { items?: SportIdsApiRow[] }>>(

        `query { ${fieldName}(first: 2000) { items { bookmaker api_id nom_api id_sport actif } } }`,

      );

      const rows = data[fieldName]?.items ?? [];

      if (rows.length > 0 || data[fieldName]) return mapSportIdsRows(rows);

    } catch {

      // essai suivant

    }

  }

  return [];

}

function mapSportIdsRows(rows: SportIdsApiRow[]): DimSportIdAPI[] {

  return rows

    .filter((s) => (s.actif === true || s.actif === 1) && s.bookmaker && s.api_id)

    .map((s) => ({

      bookmaker: s.bookmaker,

      apiId: s.api_id,

      nomApi: s.nom_api ?? null,

      idSport: s.id_sport ?? null,

    }));

}

export type DimSportType = 'Sports de NICHE' | 'Sports MAJEURS';

/**
 * Crée un nouveau sport dans dim_sport (ex. un sport jamais vu comme le badminton).
 * Nécessite que dim_sport ait le droit 'create' côté DAB
 * (cf. scripts/dab-scrapping-bet-config.mjs + `npm run rayfin:db-slott`).
 */
export async function createSport(params: { nom: string; typeSport: DimSportType }): Promise<{ id: number }> {
  const { nom, typeSport } = params;
  const client = getRayfinClient();
  if (!client.auth.getSession().isAuthenticated) {
    throw new Error('Session Fabric requise.');
  }

  const mutation = `mutation {
    createDimSport(item: { nom: ${JSON.stringify(nom)}, type_sport: ${JSON.stringify(typeSport)}, actif: true }) {
      id_sport
    }
  }`;
  const result = await executeMutation<{ createDimSport: { id_sport: number } }>(mutation, {});
  invalidateDimensionsCache();
  return { id: result.createDimSport.id_sport };
}

/**
 * Mémorise le mapping (bookmaker, api_id) → id_sport dans dim_sport_ids_API, pour que
 * les prochains scrapes de ce même ID API se pré-remplissent automatiquement.
 * La ligne n'existe généralement pas encore (nouvel ID API jamais vu) → on tente
 * d'abord un `create` ; si la ligne existe déjà (ex. id_sport encore NULL), on bascule
 * sur `update` (clé composite bookmaker + api_id).
 *
 * Nécessite que dim_sport_ids_API ait les droits 'create'/'update' côté DAB
 * (cf. scripts/dab-scrapping-bet-config.mjs + `npm run rayfin:db-slott`).
 */
export async function upsertSportIdMapping(params: {
  bookmaker: string;
  apiId: string;
  idSport: number;
  nomApi?: string;
}): Promise<void> {
  const { bookmaker, apiId, idSport, nomApi } = params;
  const client = getRayfinClient();
  if (!client.auth.getSession().isAuthenticated) {
    throw new Error('Session Fabric requise.');
  }

  const itemFields = [
    `bookmaker: ${JSON.stringify(bookmaker)}`,
    `api_id: ${JSON.stringify(apiId)}`,
    `id_sport: ${idSport}`,
    nomApi ? `nom_api: ${JSON.stringify(nomApi)}` : null,
    `actif: true`,
  ].filter(Boolean).join(' ');

  try {
    await executeMutation(
      `mutation { createDimSportIdsAPI(item: { ${itemFields} }) { bookmaker api_id id_sport } }`,
      {},
    );
    invalidateDimensionsCache();
    return;
  } catch {
    // La ligne existe probablement déjà (duplicate key) — on bascule sur update.
  }

  await executeMutation(
    `mutation {
      updateDimSportIdsAPI(bookmaker: ${JSON.stringify(bookmaker)}, api_id: ${JSON.stringify(apiId)}, item: { ${itemFields} }) {
        bookmaker api_id id_sport
      }
    }`,
    {},
  );
  invalidateDimensionsCache();
}

/**

 * Référentiels depuis le warehouse SQL scrapping-bet (tables dim_*) via GraphQL client.data.

 */

export async function fetchDimensions(): Promise<DimensionCatalog> {

  const client = getRayfinClient();

  if (!client.auth.getSession().isAuthenticated) {

    throw new Error('Session Fabric requise.');

  }



  try {

    const [bookmakers, sports, typesPari, resultats] = await withTimeout(

      Promise.all([

        client.data.DimBookmaker.select(['id_bookmaker', 'nom', 'type_bookmaker']).execute(),

        client.data.DimSport.select(['id_sport', 'nom', 'type_sport']).execute(),

        client.data.DimTypePari.select(['id_type_pari', 'libelle']).execute(),

        client.data.DimResultat.select(['id_resultat', 'libelle']).execute(),

      ]),

      TIMEOUT_MS,

      'client.data (dim_*)',

    );

    const sportIdsApiRaw = await fetchSportIdsApi();



    const catalog: DimensionCatalog = {

      bookmakers: bookmakers

        .filter((b) => b.id_bookmaker > 0 && b.nom)

        .map((b) => ({ id: b.id_bookmaker, nom: b.nom, typeBookmaker: b.type_bookmaker ?? '—' })),

      sports: sports

        .filter((s) => s.id_sport > 0 && s.nom)

        .map((s) => ({ id: s.id_sport, nom: s.nom, typeSport: s.type_sport ?? '—' })),

      typesPari: typesPari

        .filter((t) => t.id_type_pari > 0 && t.libelle)

        .map((t) => ({ id: t.id_type_pari, libelle: t.libelle })),

      resultats: resultats

        .filter((r) => r.id_resultat > 0 && r.libelle)

        .map((r) => ({ id: r.id_resultat, libelle: r.libelle })),

      sportIdsApi: sportIdsApiRaw,

    };



    const hasData =

      catalog.bookmakers.length > 0 ||

      catalog.sports.length > 0 ||

      catalog.typesPari.length > 0 ||

      catalog.resultats.length > 0;



    if (!hasData) {

      throw new Error('Référentiels vides — vérifiez le connecteur scrapping-bet et le DAB config.');

    }



    return catalog;

  } catch (err) {

    const msg = err instanceof Error ? err.message : String(err);

    throw new Error(

      `Référentiels indisponibles via GraphQL : ${msg}. Lancez \`node scripts/patch-dab-scrapping-bet.mjs\` puis réessayez.`,

    );

  }

}


