/** Saisie décimale FR — accepte virgule et point (pavé numérique). */

export function parseDecimalInput(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '' || normalized === '.') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function isValidDecimalTyping(raw: string): boolean {
  return /^\d*[.,]?\d*$/.test(raw.trim());
}

export function parseOptionalDecimal(raw: string): number | undefined {
  const n = parseDecimalInput(raw);
  return n == null ? undefined : n;
}
