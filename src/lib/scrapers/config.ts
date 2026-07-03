import type { BookmakerId } from './types';

/** Bookmakers affichés dans l’UI (Pinnacle / Slott / Greenluck masqués pour l’instant). */
export const VISIBLE_BOOKMAKER_IDS: BookmakerId[] = ['betify', 'mystake', 'sportaza'];

/** IDs sport « cyclisme » par défaut (slicer initial). */
export const CYCLING_SPORT_IDS: Record<BookmakerId, string[]> = {
  sportaza: ['923'],
  greenluck: [],
  betify: ['17'],
  mystake: ['16'],
  slott: [],
};

export const BOOKMAKERS: Record<
  BookmakerId,
  { label: string; description: string; sportIdHint: string }
> = {
  sportaza: {
    label: 'Sportaza',
    description: 'API Altenar — catIds (sports)',
    sportIdHint: 'IDs catégorie Altenar, ex: 1248, 1596, 923. Visible dans l’URL ou les requêtes réseau du site.',
  },
  greenluck: {
    label: 'Greenluck',
    description: 'Cache SBX — sportId dans sports-info.json',
    sportIdHint: 'ID sport (sportId), ex: 15, 16, 27, 28, 32. Visible dans sports-info.json ou DevTools Greenluck.',
  },
  betify: {
    label: 'Betify',
    description: 'API sptpub — sport ID numérique',
    sportIdHint: 'ID sport dans desc.sport, ex: 17, 43, 44. Inspecter les requêtes réseau sur betify.com.',
  },
  mystake: {
    label: 'MyStake',
    description: 'Analytics API — sport ID EN.Sports',
    sportIdHint: 'Clé sport dans getheader, ex: 16 (cyclisme), 8. Visible dans la structure JSON du header.',
  },
  slott: {
    label: 'Slott',
    description: 'API betline — region_id (1 sport par requête)',
    sportIdHint: 'region_id Slott, ex: 1970324836974625 (Cyclisme International). Visible dans DevTools sur l’appel betline/events/all.',
  },
};

export const DEFAULT_SPORT_IDS: Record<BookmakerId, string[]> = {
  sportaza: [...CYCLING_SPORT_IDS.sportaza],
  greenluck: [],
  betify: [...CYCLING_SPORT_IDS.betify],
  mystake: [...CYCLING_SPORT_IDS.mystake],
  slott: [],
};

const STORAGE_KEY = 'scrapping-bet:sport-ids';

export type SportIdConfig = Record<BookmakerId, string[]>;

export function loadSportIdConfig(): SportIdConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SPORT_IDS };
    const parsed = JSON.parse(raw) as Partial<SportIdConfig>;
    return {
      sportaza: parsed.sportaza ?? DEFAULT_SPORT_IDS.sportaza,
      greenluck: parsed.greenluck ?? DEFAULT_SPORT_IDS.greenluck,
      betify: parsed.betify ?? DEFAULT_SPORT_IDS.betify,
      mystake: parsed.mystake ?? DEFAULT_SPORT_IDS.mystake,
      slott: parsed.slott ?? DEFAULT_SPORT_IDS.slott,
    };
  } catch {
    return { ...DEFAULT_SPORT_IDS };
  }
}

export function saveSportIdConfig(config: SportIdConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function parseSportIdInput(text: string): string[] {
  return text
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatSportIdInput(ids: string[]): string {
  return ids.join(', ');
}
