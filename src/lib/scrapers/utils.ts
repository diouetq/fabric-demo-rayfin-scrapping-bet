import { PARIS_TZ, nowParis, fromApiIso, fromUnixSeconds } from '@/lib/paris-time';
import type { ScrapedOdd } from './types';

export { PARIS_TZ, nowParis };

export function toParisDate(iso: string | undefined): Date | null {
  return fromApiIso(iso);
}

export const toParisFromUnix = fromUnixSeconds;
export function filterYesNo(rows: ScrapedOdd[]): ScrapedOdd[] {
  return rows.filter((r) => !['oui', 'non'].includes(r.competiteur.toLowerCase()));
}

export function apiBase(devPath: string, prodUrl: string): string {
  return import.meta.env.DEV ? devPath : prodUrl;
}
