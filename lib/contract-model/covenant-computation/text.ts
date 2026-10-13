/** Whitespace-normalized citation check. Excerpts may wrap; the source may not. */

export function norm(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function citedIn(haystack: string, excerpt: string): boolean {
  const needle = norm(excerpt);
  if (needle.length < 8) return false;
  return norm(haystack).includes(needle);
}

export function excerptFrom(text: string, start: string, endExclusive: string): string {
  const i = text.indexOf(start);
  if (i < 0) throw new Error(`covenant computation: source marker missing: ${start.slice(0, 60)}`);
  const j = text.indexOf(endExclusive, i + start.length);
  if (j < 0) throw new Error(`covenant computation: source end marker missing: ${endExclusive.slice(0, 60)}`);
  return text.slice(i, j);
}

/** Inclusive of `endInclusive`, which must itself appear in `text`. */
export function excerptThrough(text: string, start: string, endInclusive: string): string {
  const body = excerptFrom(text, start, endInclusive);
  return body + endInclusive;
}

/** Dollar token as written. Null when the excerpt does not state one. */
export function dollarToken(excerpt: string): string | null {
  const m = excerpt.match(/\$\s*(-?[\d,]+(?:\.\d+)?)/);
  if (!m?.[1]) return null;
  return m[1].replace(/,/g, "");
}

export function statedAsMillions(excerpt: string): boolean {
  return /\bmillion\b/i.test(excerpt);
}
