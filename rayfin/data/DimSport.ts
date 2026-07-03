import { entity, authenticated, text, int, boolean } from '@microsoft/rayfin-core';

/** Warehouse `dbo.dim_sport` — lecture seule. */
@entity('DimSport')
@authenticated('*')
export class DimSport {
  @int() id_sport!: number;
  @text({ max: 100 }) nom!: string;
  @text({ max: 20 }) type_sport!: string;
  @boolean() actif!: boolean;
}
