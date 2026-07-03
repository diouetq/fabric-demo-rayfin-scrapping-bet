import type { BookmakerId } from '@/lib/scrapers/types';
import { VISIBLE_BOOKMAKER_IDS } from '@/lib/scrapers/config';

const STORAGE_KEY = 'scrapping-bet:user-settings';

export type ViewMode = 'global' | 'grouped';

export interface UserSettings {
  kellyFraction: number;
  stakeValue: number;
  tableZoom: number;
  viewMode: ViewMode;
  activeBookmakers: BookmakerId[];
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  kellyFraction: 4,
  stakeValue: 25,
  tableZoom: 80,
  viewMode: 'grouped',
  activeBookmakers: ['betify'],
};

function normalizeActiveBookmakers(ids: BookmakerId[] | undefined): BookmakerId[] {
  const visible = new Set<string>(VISIBLE_BOOKMAKER_IDS);
  const filtered = (ids ?? []).filter((id) => visible.has(id));
  return filtered.length > 0 ? filtered : DEFAULT_USER_SETTINGS.activeBookmakers;
}

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<UserSettings> & { showSavedBets?: boolean };
    return {
      kellyFraction: parsed.kellyFraction ?? DEFAULT_USER_SETTINGS.kellyFraction,
      stakeValue: parsed.stakeValue ?? DEFAULT_USER_SETTINGS.stakeValue,
      tableZoom: parsed.tableZoom ?? DEFAULT_USER_SETTINGS.tableZoom,
      viewMode: parsed.viewMode ?? DEFAULT_USER_SETTINGS.viewMode,
      activeBookmakers: normalizeActiveBookmakers(parsed.activeBookmakers),
    };
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function saveUserSettings(settings: UserSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function patchUserSettings(patch: Partial<UserSettings>): UserSettings {
  const next = { ...loadUserSettings(), ...patch };
  saveUserSettings(next);
  return next;
}
