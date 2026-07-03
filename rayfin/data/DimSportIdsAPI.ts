import { entity, authenticated, text, int, boolean } from '@microsoft/rayfin-core';

/** Warehouse `dbo.dim_sport_ids_API` — mapping api_id bookmaker → sport. */
@entity('DimSportIdsAPI')
@authenticated('*')
export class DimSportIdsAPI {
  @text({ max: 50 }) bookmaker!: string;
  @text({ max: 100 }) api_id!: string;
  @text({ max: 200 }) nom_api!: string | undefined;
  @int() id_sport!: number | undefined;
  @boolean() actif!: boolean;
}
