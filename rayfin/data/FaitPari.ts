import {

  entity,

  authenticated,

  text,

  decimal,

  date,

  boolean,

  int,

} from '@microsoft/rayfin-core';



/** Table warehouse `fait_paris` — PK SQL `id_pari` (BIGINT IDENTITY). */

@entity('FaitPari')

@authenticated('*')

export class FaitPari {

  // `id` omis intentionnellement : PK `id_pari` générée par la base (BIGINT IDENTITY).
  // rayfin-core exige `id` en string si déclaré — cf. IEntity dans schema.d.ts
  // ("Entities must either omit `id` entirely (database-generated) or declare `id` as a `string`").

  @text({ max: 20 }) source_insertion!: string;



  @date() date_pari!: Date;



  @int() id_bookmaker!: number;



  @int() id_sport!: number;



  @text({ max: 150, optional: true }) libelle_competition?: string;



  @text({ max: 250 }) libelle_evenement!: string;



  @int() id_type_pari!: number;



  @decimal({ precision: 8, scale: 4 }) cote_bookmaker!: number;



  @decimal({ precision: 10, scale: 2 }) mise_engagee!: number;



  @int({ optional: true }) id_resultat?: number;



  @decimal({ precision: 8, scale: 4, optional: true }) cote_marche_reference?: number;



  @decimal({ precision: 8, scale: 4, optional: true }) cote_vraie_mpto?: number;



  @decimal({ precision: 7, scale: 4, optional: true }) probabilite_implicite?: number;



  @decimal({ precision: 7, scale: 4, optional: true }) probabilite_reelle_mpto?: number;



  @decimal({ precision: 7, scale: 4, optional: true }) trj_bookmaker?: number;



  @decimal({ precision: 7, scale: 4, optional: true }) trj_ps3838?: number;



  @decimal({ precision: 7, scale: 4, optional: true }) trj_marche?: number;



  @decimal({ precision: 7, scale: 4, optional: true }) pourcentage_boost?: number;



  @decimal({ precision: 7, scale: 4, optional: true }) critere_kelly?: number;



  @boolean({ optional: true }) flag_surebet?: boolean;



  @date({ optional: true }) date_heure_maj_scrap?: Date;



  @date({ optional: true }) date_heure_modification?: Date;

}


