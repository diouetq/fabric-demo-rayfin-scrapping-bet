/**
 * Fetch JSON via public CORS proxies (browser-only fallback).
 * Returns null when all proxies fail.
 */
export async function fetchJsonViaCorsProxies<T>(absoluteUrl: string): Promise<T | null> {
  const enc = encodeURIComponent(absoluteUrl);
  const candidates: Array<{ url: string; parse: (text: string) => T | null }> = [
    {
      url: `https://api.allorigins.win/raw?url=${enc}`,
      parse: parseJsonBody,
    },
    {
      url: `https://api.allorigins.win/get?url=${enc}`,
      parse: (text) => {
        try {
          const wrapper = JSON.parse(text) as { contents?: string; status?: { http_code?: number } };
          if (wrapper.status?.http_code && wrapper.status.http_code >= 400) return null;
          if (wrapper.contents) return parseJsonBody(wrapper.contents);
        } catch {
          /* ignore */
        }
        return null;
      },
    },
    {
      url: `https://corsproxy.io/?${enc}`,
      parse: parseJsonBody,
    },
    {
      url: `https://api.codetabs.com/v1/proxy/?quest=${enc}`,
      parse: parseJsonBody,
    },
  ];

  for (const { url, parse } of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(35_000) });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text.trim()) continue;
      const data = parse(text);
      if (data != null) return data;
    } catch {
      continue;
    }
  }

  return null;
}

function parseJsonBody<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isSlottResponse(data: unknown): data is { events?: unknown[] } {
  return data != null && typeof data === 'object' && 'events' in data;
}

/** Slott-specific proxy fetch — validates response shape. */
export async function fetchSlottViaProxies<T extends { events?: unknown[] }>(
  absoluteUrl: string,
): Promise<T | null> {
  const data = await fetchJsonViaCorsProxies<T>(absoluteUrl);
  if (data && isSlottResponse(data)) return data;
  return null;
}
