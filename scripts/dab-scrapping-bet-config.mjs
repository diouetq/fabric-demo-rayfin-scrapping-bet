/** Config DAB v7 — entities-only, sans $schema ni x-schema. */
export const CONNECTOR = 'scrapping-bet';

export const SCRAPPING_BET_DAB_CONFIG = {
  entities: {
    FaitPari: {
      source: 'fait_paris',
      'data-source': CONNECTOR,
      permissions: [
        { role: 'authenticated', actions: ['create', 'read', 'update', 'delete'] },
      ],
    },
    DimBookmaker: {
      source: 'dim_bookmaker',
      'data-source': CONNECTOR,
      permissions: [{ role: 'authenticated', actions: ['read'] }],
    },
    DimSport: {
      source: 'dim_sport',
      'data-source': CONNECTOR,
      // create : permet d'ajouter un nouveau sport (ex. badminton) directement depuis le
      // formulaire (cf. ParisForm / createSport), sans passer par une requête SQL manuelle.
      permissions: [{ role: 'authenticated', actions: ['create', 'read'] }],
    },
    DimTypePari: {
      source: 'dim_type_pari',
      'data-source': CONNECTOR,
      permissions: [{ role: 'authenticated', actions: ['read'] }],
    },
    DimResultat: {
      source: 'dim_resultat',
      'data-source': CONNECTOR,
      permissions: [{ role: 'authenticated', actions: ['read'] }],
    },
    DimSportIdsAPI: {
      source: 'dim_sport_ids_API',
      'data-source': CONNECTOR,
      // create/update : permet à l'app de mémoriser un mapping bookmaker+api_id → id_sport
      // quand l'utilisateur le choisit manuellement (cf. ParisForm / upsertSportIdMapping).
      permissions: [{ role: 'authenticated', actions: ['create', 'read', 'update'] }],
    },
    SlottCote: {
      source: 'slott_cotes',
      'data-source': CONNECTOR,
      permissions: [{ role: 'authenticated', actions: ['read'] }],
    },
    SlottJob: {
      source: 'slott_jobs',
      'data-source': CONNECTOR,
      permissions: [{ role: 'authenticated', actions: ['read'] }],
    },
  },
};
