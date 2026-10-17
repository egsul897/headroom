/**
 * Deterministic phrase generalization for learned rules.
 *
 * Normalizes case, whitespace, amounts, defined-term slots, synonym/lemma
 * classes, and clause anchors into one signature per drafting shape.
 * No model calls and no per-issuer branches — the lexicon is document-generic.
 */

export interface NormToken {
  id: string;
  pattern: string;
}

export interface GeneralizedPhrase {
  tokens: NormToken[];
  signature: string;
  pattern: string;
  abstractsSlot: boolean;
}

const LEMMAS: ReadonlyArray<{ id: string; forms: readonly string[] }> = [
  { id: "DISTRIBUTION", forms: ["distribution", "distributions", "dividend", "dividends"] },
  { id: "PAYMENT", forms: ["payment", "payments"] },
  { id: "RESTRICT", forms: ["restricted", "restriction", "restrictions"] },
  { id: "DEBT", forms: ["debt", "indebtedness"] },
  { id: "LIEN", forms: ["lien", "liens"] },
  { id: "INVESTMENT", forms: ["investment", "investments"] },
  { id: "EXCEED", forms: ["exceed", "exceeds", "exceeding"] },
  { id: "GREATER", forms: ["greater"] },
  { id: "LIMIT", forms: ["limitation", "limit", "limited", "limits"] },
  { id: "OBLIGOR", forms: ["borrower", "issuer", "company", "parent", "guarantor", "holdings"] },
  { id: "ASSET", forms: ["asset", "assets"] },
  { id: "BASKET", forms: ["basket", "baskets"] },
  { id: "BUILDER", forms: ["builder", "build-up", "buildup"] },
  { id: "AVAILABLE", forms: ["available"] },
  { id: "AMOUNT", forms: ["amount", "amounts"] },
  { id: "INCUR", forms: ["incur", "incurs", "incurrence", "incurred"] },
  { id: "PERMIT", forms: ["permit", "permitted", "permission"] },
  { id: "AGGREGATE", forms: ["aggregate"] },
  { id: "PRINCIPAL", forms: ["principal"] },
  { id: "MAKE", forms: ["make", "makes", "made", "making"] },
  { id: "SUBSIDIARY", forms: ["subsidiary", "subsidiaries"] },
];

const lemmaByForm = new Map<string, { id: string; forms: readonly string[] }>();
for (const lemma of LEMMAS) {
  for (const form of lemma.forms) lemmaByForm.set(form.toLowerCase(), lemma);
}

const ANCHORS: ReadonlyArray<{ id: string; re: RegExp; pattern: string }> = [
  {
    id: "CAP",
    re: /^(?:not\s+to\s+exceed|not\s+exceeding|shall\s+not\s+exceed)\b/i,
    pattern: "(?:not\\s+to\\s+exceed|not\\s+exceeding|shall\\s+not\\s+exceed)",
  },
  {
    id: "GREATER_OF",
    re: /^greater\s+of\b/i,
    pattern: "greater\\s+of",
  },
  {
    id: "SHALL_NOT",
    re: /^shall\s+not\b/i,
    pattern: "shall\\s+not",
  },
  {
    id: "BUILDER_BASKET",
    re: /^(?:builder|build-?up)\s+basket\b/i,
    pattern: "(?:builder\\s+basket|build-?up\\s+basket)",
  },
  {
    id: "AVAILABLE_AMOUNT",
    re: /^available\s+amount\b/i,
    pattern: "available\\s+amount",
  },
  {
    id: "AGGREGATE_PRINCIPAL",
    re: /^aggregate\s+principal\s+amount\b/i,
    pattern: "aggregate\\s+principal\\s+amount",
  },
  {
    id: "SECTION_REF",
    re: /^(?:article|section)\s+(?:[ivxlcdm]+|\d+(?:\.\d+)*)\b/i,
    pattern: "(?:article|section)\\s+(?:[ivxlcdm]+|\\d+(?:\\.\\d+)*)",
  },
];

const PERCENT_RE = /^\d+(?:\.\d+)?\s*%/;
const RATIO_RE = /^\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?/;
const AMOUNT_RE = /^\$(?:\s*\d{1,3}(?:,\d{3})+|\s*\d+)(?:\.\d+)?|^(?:\d{1,3}(?:,\d{3})+)(?:\.\d+)?/;
const WORD_RE = /^[A-Za-z][A-Za-z0-9'’-]*/;
const TOKEN_GAP = "(?:\\s*[,:;()\"'“”]*\\s+)";

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lemmaPattern(forms: readonly string[]): string {
  const uniq = [...new Set(forms.map((f) => f.toLowerCase()))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  );
  if (uniq.length === 1) return escapeRegexLiteral(uniq[0]!);
  return `(?:${uniq.map(escapeRegexLiteral).join("|")})`;
}

const TERM_PATTERN =
  "[A-Za-z][A-Za-z0-9'’-]{1,40}(?:\\s+[A-Za-z][A-Za-z0-9'’-]{1,40}){0,3}";

/** True when a regex abstracts a slot instead of quoting one excerpt. */
export function patternAbstractsSlot(pattern: string): boolean {
  if (/\(\?:[^)\\]{1,80}\|/.test(pattern)) return true;
  if (/\\d/.test(pattern)) return true;
  if (/\[[A-Za-z0-9\\-]/.test(pattern)) return true;
  return false;
}

export function patternFromTokens(tokens: readonly NormToken[]): string {
  return tokens.map((t) => t.pattern).join(TOKEN_GAP);
}

/**
 * Normalize one excerpt into a clause skeleton and a matching regex.
 * Case is handled by the rule flag; this function lowercases literal tokens.
 */
export function generalizePhrase(raw: string): GeneralizedPhrase {
  const s = raw.replace(/\s+/g, " ").trim();
  const tokens: NormToken[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch) || /[,:;()[\]{}"“”']/.test(ch)) {
      i += 1;
      continue;
    }
    const rest = s.slice(i);
    let consumed = 0;
    for (const anchor of ANCHORS) {
      const m = anchor.re.exec(rest);
      if (m && m[0]) {
        tokens.push({ id: `A:${anchor.id}`, pattern: anchor.pattern });
        consumed = m[0].length;
        break;
      }
    }
    if (consumed > 0) {
      i += consumed;
      continue;
    }
    const percent = PERCENT_RE.exec(rest);
    if (percent?.[0]) {
      tokens.push({ id: "PERCENT", pattern: "\\d+(?:\\.\\d+)?\\s*%" });
      i += percent[0].length;
      continue;
    }
    const ratio = RATIO_RE.exec(rest);
    if (ratio?.[0]) {
      tokens.push({ id: "RATIO", pattern: "\\d+(?:\\.\\d+)?\\s+to\\s+\\d+(?:\\.\\d+)?" });
      i += ratio[0].length;
      continue;
    }
    const amount = AMOUNT_RE.exec(rest);
    if (amount?.[0]) {
      tokens.push({
        id: "AMOUNT",
        pattern: "\\$?\\s*(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?",
      });
      i += amount[0].length;
      continue;
    }
    const word = WORD_RE.exec(rest);
    if (word?.[0]) {
      const surface = word[0];
      const lemma = lemmaByForm.get(surface.toLowerCase());
      if (lemma) {
        tokens.push({ id: `L:${lemma.id}`, pattern: lemmaPattern(lemma.forms) });
        i += surface.length;
        continue;
      }
      if (/^[A-Z]/.test(surface)) {
        let j = i + surface.length;
        while (j < s.length) {
          const gap = /^\s+/.exec(s.slice(j));
          if (!gap) break;
          const next = WORD_RE.exec(s.slice(j + gap[0].length));
          if (!next?.[0] || !/^[A-Z]/.test(next[0])) break;
          if (lemmaByForm.has(next[0].toLowerCase())) break;
          j += gap[0].length + next[0].length;
        }
        tokens.push({ id: "TERM", pattern: TERM_PATTERN });
        i = j;
        continue;
      }
      tokens.push({ id: `W:${surface.toLowerCase()}`, pattern: escapeRegexLiteral(surface.toLowerCase()) });
      i += surface.length;
      continue;
    }
    i += 1;
  }

  const signature = tokens.map((t) => t.id).join(">");
  const pattern = patternFromTokens(tokens);
  return {
    tokens,
    signature,
    pattern,
    abstractsSlot: patternAbstractsSlot(pattern),
  };
}

/** Token-id Jaccard. Used to merge near-duplicate skeletons across sources. */
export function tokenJaccard(a: readonly string[], b: readonly string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  let inter = 0;
  for (const id of left) if (right.has(id)) inter += 1;
  const union = left.size + right.size - inter;
  return union === 0 ? 1 : inter / union;
}

/**
 * Tokens from `base` that every member still has, preserving base order.
 * Extra function words in only some excerpts drop out of the shared rule.
 */
export function sharedTokens(members: ReadonlyArray<readonly NormToken[]>): NormToken[] {
  if (members.length === 0) return [];
  const budgets = members.map((tokens) => {
    const counts = new Map<string, number>();
    for (const tok of tokens) counts.set(tok.id, (counts.get(tok.id) ?? 0) + 1);
    return counts;
  });
  const out: NormToken[] = [];
  for (const tok of members[0]!) {
    if (budgets.every((b) => (b.get(tok.id) ?? 0) > 0)) {
      for (const b of budgets) b.set(tok.id, (b.get(tok.id) ?? 0) - 1);
      out.push(tok);
    }
  }
  return out;
}
