/**
 * Shared date helpers for operative-authority resolution.
 * Never invents a calendar date that is not present in source text or
 * already-extracted identity fields.
 */

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

const LONG_DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b/i;

/** Convert "September 27, 2023" / "2023-09-27" → ISO date, or null. */
export function toIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = LONG_DATE_RE.exec(trimmed);
  if (!m) return null;
  const month = MONTHS[m[1]!.toLowerCase()];
  if (!month) return null;
  const day = m[2]!.padStart(2, "0");
  return `${m[3]}-${month}-${day}`;
}

export function compareIsoDates(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function truncateExcerpt(text: string, max = 240): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length <= max ? collapsed : `${collapsed.slice(0, max - 1)}…`;
}

export function excerptAt(text: string, start: number, length: number, pad = 40): { excerpt: string; charStart: number } {
  const from = Math.max(0, start - pad);
  const to = Math.min(text.length, start + length + pad);
  return { excerpt: truncateExcerpt(text.slice(from, to)), charStart: start };
}
