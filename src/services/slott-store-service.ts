import { getRayfinClient } from '@/lib/rayfin-client';
import { executeQuery } from '@/lib/graphql-client';
import type { ScrapedOdd } from '@/lib/scrapers/types';
import { nowParis } from '@/lib/scrapers/utils';

const SLOTT_FIELDS = [
  'id',
  'competition',
  'evenement',
  'competiteur',
  'cote',
  'cutoff',
  'extraction',
  'api_id',
] as const;

function mapRowToScrapedOdd(row: Record<string, unknown>): ScrapedOdd {
  const cutoffRaw = row.cutoff;
  const extractionRaw = row.extraction;
  const apiIdRaw = row.api_id;
  return {
    bookmaker: 'Slott',
    competition: String(row.competition ?? ''),
    evenement: String(row.evenement ?? ''),
    competiteur: String(row.competiteur ?? ''),
    cote: Number(row.cote),
    cutoff: cutoffRaw != null && String(cutoffRaw) !== '' ? new Date(String(cutoffRaw)) : null,
    extraction: extractionRaw != null ? new Date(String(extractionRaw)) : nowParis(),
    ...(apiIdRaw != null && String(apiIdRaw) !== '' ? { apiId: String(apiIdRaw) } : {}),
  };
}

/** Lit dbo.slott_cotes via GraphQL (entité SlottCote). */
export async function fetchSlottCotesFromWarehouse(): Promise<ScrapedOdd[]> {
  const client = getRayfinClient();
  if (!client.auth.getSession().isAuthenticated) {
    throw new Error('Session Fabric requise.');
  }

  let gqlRows: Record<string, unknown>[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slottCote = (client.data as any).SlottCote;
    try {
      const page = await slottCote.select([...SLOTT_FIELDS]).first(5000).executePaginated();
      gqlRows = (page?.items ?? page ?? []) as Record<string, unknown>[];
    } catch {
      gqlRows = (await slottCote.select([...SLOTT_FIELDS]).first(5000).execute()) as Record<string, unknown>[];
    }
  } catch {
    const data = await executeQuery<{
      slottCotes?: { items?: Record<string, unknown>[] };
    }>(`query {
      slottCotes(first: 5000) {
        items { id competition evenement competiteur cote cutoff extraction }
      }
    }`);
    gqlRows = data.slottCotes?.items ?? [];
  }

  return gqlRows
    .filter((r) => r.cote != null && Number(r.cote) > 0)
    .map(mapRowToScrapedOdd);
}

/** Slott en embed Fabric : lecture SQL via GraphQL (alimenté par UDF planifiée scrapeAndStoreSlott). */
export async function scrapeSlottViaWarehouse(_regionIds: string[]): Promise<ScrapedOdd[]> {
  const rows = await fetchSlottCotesFromWarehouse();
  if (rows.length) return rows;

  throw new Error(
    'Aucune cote Slott en base. Vérifiez la planification UDF scrapeAndStoreSlott (fc_scrapping-bet).',
  );
}
