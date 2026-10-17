/**
 * Pure ISO calendar-date validation. Shared by the simulate
 * handoff (rule 44), the effective-date hint (rule 53), and Ask
 * draft parsing (rule 54) — one canonical implementation
 * instead of three copies that could drift.
 */

/** True for a real YYYY-MM-DD calendar date (rejects 2024-02-30, 2026-13-01). */
export function isValidIsoDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
