import { entity, authenticated, text, int, boolean } from '@microsoft/rayfin-core';

/** Warehouse `dbo.dim_bookmaker` — lecture seule. */
@entity('DimBookmaker')
@authenticated('*')
export class DimBookmaker {
  @int() id_bookmaker!: number;
  @text({ max: 100 }) nom!: string;
  @text({ max: 20 }) type_bookmaker!: string;
  @boolean() actif!: boolean;
}
