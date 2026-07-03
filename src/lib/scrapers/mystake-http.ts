import { fetchJsonViaCorsProxies } from './cors-fetch';
import { apiBase } from './utils';

const MYSTAKE_ORIGIN = 'https://analytics-sp.googleserv.tech';
const SPORT_BASE = apiBase('/api/mystake', `${MYSTAKE_ORIGIN}/api/sport`);
const PREMATCH_BASE = apiBase('/api/mystake-pm', `${MYSTAKE_ORIGIN}/api/prematch`);

export const MYSTAKE_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

export function doubleDecode(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Fetch direct MyStake (comme l'ancienne version) — proxy CORS seulement en secours. */
export async function mystakeGet(path: string, kind: 'sport' | 'prematch'): Promise<unknown | null> {
  const base = kind === 'sport' ? SPORT_BASE : PREMATCH_BASE;
  const direct = await fetchJson(`${base}${path}`, MYSTAKE_HEADERS);
  if (direct != null) return doubleDecode(direct);

  if (import.meta.env.DEV) return null;

  const prodPath = kind === 'sport' ? `/api/sport${path}` : `/api/prematch${path}`;
  const viaProxy = await fetchJsonViaCorsProxies<unknown>(`${MYSTAKE_ORIGIN}${prodPath}`);
  return viaProxy != null ? doubleDecode(viaProxy) : null;
}
