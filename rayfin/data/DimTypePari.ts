import { entity, authenticated, text, int, boolean } from '@microsoft/rayfin-core';

/** Warehouse `dbo.dim_type_pari` — lecture seule. */
@entity('DimTypePari')
@authenticated('*')
export class DimTypePari {
  @int() id_type_pari!: number;
  @text({ max: 100 }) libelle!: string;
  @boolean() actif!: boolean;
}
