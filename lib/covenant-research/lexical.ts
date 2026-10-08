/**
 * Lexical retrieval — token/phrase overlap over source-backed searchText.
 * No embeddings / paid vector infra.
 */

const STOP = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "by",
  "as", "at", "is", "are", "be", "that", "this", "from", "any", "such", "may",
  "shall", "will", "not", "no", "find", "examples", "containing", "agreements",
  "agreement", "credit", "show", "list", "me", "please", "search", "query",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9$%.\-]+/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function normalizeMoneyToken(amountUsd: number): string[] {
  const n = Math.round(amountUsd);
  const withCommas = n.toLocaleString("en-US");
  return [`$${withCommas}`, `$${n}`, String(n), `${n / 1_000_000} million`, `$${n / 1_000_000} million`];
}

export interface LexicalScore {
  score: number;
  matched: string[];
}

/**
 * Score a document against query terms/phrases.
 * Phrase hits outweigh bare tokens; money-form variants are treated as phrases.
 */
export function scoreLexical(
  searchText: string,
  terms: readonly string[],
  phrases: readonly string[] = [],
): LexicalScore {
  const hay = searchText.toLowerCase();
  const docTokens = new Set(tokenize(searchText));
  const matched: string[] = [];
  let score = 0;

  for (const phrase of phrases) {
    const p = phrase.toLowerCase().trim();
    if (!p) continue;
    if (hay.includes(p)) {
      score += 2.5;
      matched.push(`phrase:${p}`);
    }
  }

  let termHits = 0;
  for (const term of terms) {
    const t = term.toLowerCase().trim();
    if (!t || STOP.has(t)) continue;
    if (docTokens.has(t) || hay.includes(t)) {
      termHits += 1;
      matched.push(`term:${t}`);
    }
  }
  if (terms.length > 0) {
    score += (termHits / terms.length) * 3;
  }

  return { score, matched };
}
