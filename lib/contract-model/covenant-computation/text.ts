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

/** True when this dollar token is written as "$N million", not as a full dollar figure. */
export function dollarAmountIsMillions(text: string, token: string): boolean {
  const re = /\$\s*([\d,]+(?:\.\d+)?)\s+million\b/gi;
  for (const match of text.matchAll(re)) {
    if (match[1]!.replace(/,/g, "") === token) return true;
  }
  return false;
}

/**
 * "15%", "fifteen percent (15%)", or "one hundred five percent (105%)", then "of …".
 * The parenthetical figure is the percent. The words are kept so the phrase is not cut at "five".
 */
export function percentOfPhrase(text: string): { pct: string; base: string; phrase: string } | null {
  const match = norm(text).match(
    /(?:(\d+(?:\.\d+)?)\s*%|(?:[a-z]+(?:-[a-z]+)?(?:\s+[a-z]+){0,5}\s+)?percent\s*\(\s*(\d+(?:\.\d+)?)\s*%\s*\))\s+of\s+(?:the\s+)?([^.;]{3,180})/i,
  );
  const pct = match?.[1] ?? match?.[2];
  if (!pct || !match?.[3] || match.index == null) return null;
  const base = match[3].split(/\bprovided\b|,|\band the\b|\sas\b/i)[0]!.trim().replace(/[,:]$/, "");
  if (base.length < 3) return null;
  return { pct, base, phrase: match[0].slice(0, match[0].length - (match[3].length - base.length)).trim() };
}

/** "$1,300.0 million" → "1300000000". The scale is the word in the citation, not an assumed unit conversion. */
export function millionsToUsd(token: string): string {
  const [whole, frac = ""] = token.split(".");
  if (!whole || !/^\d+$/.test(whole) || (frac !== "" && !/^\d+$/.test(frac))) {
    throw new Error(`covenant computation: bad million token: ${token}`);
  }
  const scale = 6 - frac.length;
  if (scale < 0) throw new Error(`covenant computation: million token has more than 6 decimals: ${token}`);
  return (BigInt(whole + frac) * 10n ** BigInt(scale)).toString();
}
