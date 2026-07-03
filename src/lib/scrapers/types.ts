export interface ScrapedOdd {
  bookmaker: string;
  competition: string;
  extraction: Date;
  cutoff: Date | null;
  evenement: string;
  competiteur: string;
  cote: number;
  /** ID sport dans l'API du bookmaker — sert au filtre et au lookup dim_sport_ids_API. */
  apiId?: string;
  /** Marché (ex. "Total", "Handicap", "Vainqueur") — sert à apparier les 2 issues
   *  d'un même marché plutôt que de supposer un ordre, quand un événement a
   *  plusieurs marchés à 2 issues (cf. Excel_builder.py / _MarketKey). */
  marche?: string;
  /** Identifiant exact de la paire (event + marché + ligne), équivalent du PairKey /
   *  _MarketKey des scrapers Python de référence. Quand présent, prime sur le fallback
   *  texte (competition+evenement+marche) pour apparier les 2 issues — évite les
   *  collisions quand plusieurs lignes distinctes partagent le même intitulé de marché. */
  pairKey?: string;
}

/** Pinnacle reference row — competition/event only, no odds. */
export interface PinnacleCompetition {
  bookmaker: 'Pinnacle';
  sport: string;
  competition: string;
  evenement: string;
  cutoff: Date | null;
  extraction: Date;
}

export type BookmakerId = 'sportaza' | 'greenluck' | 'betify' | 'mystake' | 'slott';

export interface BookmakerDefinition {
  id: BookmakerId;
  label: string;
  description: string;
  /** Hint shown in settings — how to find sport IDs */
  sportIdHint: string;
}

export interface ScraperResult {
  bookmaker: BookmakerId;
  rows: ScrapedOdd[];
  error?: string;
}
