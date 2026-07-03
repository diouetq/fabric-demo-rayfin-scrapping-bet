import { entity, authenticated, text, int, boolean } from '@microsoft/rayfin-core';

/** Warehouse `dbo.dim_resultat` — lecture seule. */
@entity('DimResultat')
@authenticated('*')
export class DimResultat {
  @int() id_resultat!: number;
  @text({ max: 50 }) libelle!: string;
  @boolean() actif!: boolean;
}
