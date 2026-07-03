/** All display and comparisons use Europe/Paris (handles DST automatically). */
export const PARIS_TZ = 'Europe/Paris';

const parisFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TZ,
  dateStyle: 'short',
  timeStyle: 'short',
});

const parisDateOnly = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TZ,
  dateStyle: 'short',
});

/** Current instant (UTC internally; always format with Paris TZ). */
export function nowParis(): Date {
  return new Date();
}

export function formatParisDateTime(value: Date | null | undefined): string {
  if (!value) return '—';
  return parisFormatter.format(value);
}

export function formatParisDate(value: Date | null | undefined): string {
  if (!value) return '—';
  return parisDateOnly.format(value);
}

export function parseIsoDate(iso: string): Date {
  return new Date(iso);
}

export function isCutoffActive(cutoff: Date | null | undefined, now = nowParis()): boolean {
  if (!cutoff) return true;
  return cutoff.getTime() > now.getTime();
}

export function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function minutesUntilParis(cutoff: Date | null, now = nowParis()): number | null {
  if (!cutoff) return null;
  return (cutoff.getTime() - now.getTime()) / 60_000;
}

/** ISO 8601 with Z or offset → correct UTC instant. */
export function fromApiIso(iso: string | undefined): Date | null {
  if (!iso) return null;
  const normalized = iso.includes('T') && !iso.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(iso)
    ? `${iso}Z`
    : iso.replace('Z', '+00:00');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Unix seconds → UTC instant (display via formatParisDateTime). */
export function fromUnixSeconds(ts: number): Date {
  return new Date(ts * 1000);
}

/**
 * MyStake `st` field: often Unix seconds as string, or ISO UTC without Z.
 * Treat naive ISO as UTC to fix ~1–2h offset vs Paris display.
 */
export function parseMystakeDate(raw: string | number | undefined): Date | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms);
  }
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return new Date(n > 1e12 ? n : n * 1000);
  }
  if (s.startsWith('/Date(')) {
    const m = s.match(/\/Date\((\d+)/);
    if (m) return new Date(Number(m[1]));
  }
  return fromApiIso(s.includes('T') && !s.endsWith('Z') && !/[+-]\d{2}/.test(s) ? `${s}Z` : s);
}

/** Excel serial date (days since 1899-12-30) from a Date instant. */
export function toExcelSerialDate(date: Date): number {
  const epoch = Date.UTC(1899, 11, 30);
  return (date.getTime() - epoch) / 86_400_000;
}

/** Excel serial → Date instant. */
export function fromExcelSerial(serial: number): Date {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + serial * 86_400_000);
}
