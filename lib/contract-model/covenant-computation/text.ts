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

/** Whitespace in source text, including the HTML space entities EDGAR filings use (`&nbsp;`, `&#160;`). */
const HTML_SPACE = String.raw`(?:\s|&nbsp;|&#160;|&#xA0;)`;

/** True when this dollar token is written as "$N million", not as a full dollar figure. */
export function dollarAmountIsMillions(text: string, token: string): boolean {
  // A page marker ("-46-") may sit between the number and the word million.
  // An HTML space entity ("$36.0&nbsp;million") is a separator too: treating it as
  // a full dollar figure would understate the cap a million-fold.
  const re = new RegExp(
    `\\$\\s*([\\d,]+(?:\\.\\d+)?)${HTML_SPACE}+(?:-\\s*\\d{1,3}\\s*-\\s+)?million\\b`,
    "gi",
  );
  for (const match of text.matchAll(re)) {
    if (match[1]!.replace(/,/g, "") === token) return true;
  }
  return false;
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
