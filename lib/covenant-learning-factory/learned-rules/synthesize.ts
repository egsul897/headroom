/**
 * Synthesize executable candidate rules from clustered error-ledger entries.
 * No hand-written per-case patterns — only mechanical clustering + template effects.
 *
 * DISCOVERY_GAP (missed kf_precedent candidates) is the dominant signal: emit
 * PHRASE_PATTERN / SECTION_MAPPING rules from the candidate excerpt the extractor missed.
 */

import { createHash } from "node:crypto";
import type { BasketCategory } from "../../contract-model/covenant-computation/types";
import type { LearnedRule, LearnedRuleKind } from "./types";

export interface LedgerSignal {
  errorId: string;
  class: string;
  message: string;
  packageKey?: string;
  sourceId?: string;
  evidence?: Record<string, unknown>;
}

const CATEGORY_TOKENS: Array<{ re: RegExp; category: BasketCategory }> = [
  { re: /\bgrower|greater\s+of\b/i, category: "GROWER_GREATER_OF" },
  { re: /\bbuilder|available\s+amount|cumulative\s+credit\b/i, category: "BUILDER_AVAILABLE_AMOUNT" },
  { re: /\bfixed\s+dollar|dollar\s+cap|\$\s*[\d,]+\b/i, category: "FIXED_DOLLAR" },
  { re: /\bratio[- ]based|leverage\s+ratio|coverage\s+ratio\b/i, category: "RATIO_BASED" },
  { re: /\bunlimited\b/i, category: "UNLIMITED" },
  { re: /\bpct|percent\s+of|%\s+of\b/i, category: "PCT_OF_METRIC" },
  { re: /\breclass/i, category: "RECLASS" },
];

const FAMILY_TOKENS: Array<{ re: RegExp; family: string }> = [
  { re: /\brestricted\s+payment|dividends?\b/i, family: "RESTRICTED_PAYMENTS" },
  { re: /\bliens?\b/i, family: "LIENS" },
  { re: /\binvestments?\b/i, family: "INVESTMENTS" },
  { re: /\basset\s+sales?|dispositions?\b/i, family: "ASSET_SALES" },
  { re: /\bindebtedness|\bdebt\b/i, family: "DEBT_INCURRENCE" },
];

function rid(parts: string[]): string {
  return `lr:${createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16)}`;
}

/** Escape a short literal excerpt into a safe regex fragment. */
export function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pull a short distinctive phrase from evidence/message for pattern synthesis.
 * Prefers citationExcerpt / expectedPhrase / gotPhrase; falls back to message tokens.
 */
export function extractPhraseSeed(signal: LedgerSignal): string | null {
  const ev = signal.evidence ?? {};
  for (const key of ["citationExcerpt", "expectedPhrase", "gotPhrase", "operativeText", "excerpt"]) {
    const v = ev[key];
    if (typeof v === "string") {
      const cleaned = v.replace(/\s+/g, " ").trim();
      if (cleaned.length >= 12) return cleaned.slice(0, 160);
    }
  }
  const m = signal.message.match(/"([^"]{12,120})"/);
  if (m?.[1]) return m[1];
  return null;
}

/**
 * Choose a distinctive whitespace-flexible pattern from a missed candidate excerpt.
 * Prefer a mid-length token run that is long enough to be specific (≥24 chars).
 */
export function distinctivePatternFromExcerpt(excerpt: string): string {
  const cleaned = excerpt.replace(/\s+/g, " ").trim();
  const slice =
    cleaned.length <= 64 ? cleaned : cleaned.slice(0, 72).replace(/\s+\S*$/, "").trim();
  const base = slice.length >= 24 ? slice : cleaned.slice(0, Math.min(48, cleaned.length));
  // Flexible whitespace so Neon excerpts still match normalized document bytes.
  return base
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegexLiteral)
    .join("\\s+");
}

function familyFromSignal(signal: LedgerSignal, phrase: string): string | null {
  const expected =
    typeof signal.evidence?.expectedFamily === "string" ? signal.evidence.expectedFamily : null;
  if (expected && expected.trim()) return expected.trim();
  const blob = `${signal.message} ${phrase}`;
  for (const tok of FAMILY_TOKENS) {
    if (tok.re.test(blob)) return tok.family;
  }
  return null;
}

function inferDiscoveryGapRules(
  signal: LedgerSignal,
  phrase: string,
): Array<{
  kind: LearnedRuleKind;
  effect: LearnedRule["effect"];
  pattern: string;
  flags: string;
}> {
  const out: Array<{
    kind: LearnedRuleKind;
    effect: LearnedRule["effect"];
    pattern: string;
    flags: string;
  }> = [];
  const family = familyFromSignal(signal, phrase) ?? "OTHER";
  const pattern = distinctivePatternFromExcerpt(phrase);
  if (pattern.length >= 12) {
    out.push({
      kind: "PHRASE_PATTERN",
      effect: { family },
      pattern,
      flags: "i",
    });
  }
  const sectionRef =
    typeof signal.evidence?.sectionRef === "string"
      ? signal.evidence.sectionRef
      : typeof signal.evidence?.sectionTitle === "string"
        ? signal.evidence.sectionTitle
        : null;
  if (sectionRef && sectionRef.trim().length >= 3) {
    out.push({
      kind: "SECTION_MAPPING",
      effect: { sectionFamily: family },
      pattern: escapeRegexLiteral(sectionRef.trim().slice(0, 80)),
      flags: "i",
    });
  }
  return out;
}

function inferKindAndEffect(signal: LedgerSignal, phrase: string): {
  kind: LearnedRuleKind;
  effect: LearnedRule["effect"];
  pattern: string;
  flags: string;
} | null {
  // DISCOVERY_GAP handled separately (may emit multiple drafts)
  if (signal.class === "DISCOVERY_GAP") return null;

  const blob = `${signal.class} ${signal.message} ${phrase}`;
  for (const tok of CATEGORY_TOKENS) {
    if (tok.re.test(blob)) {
      const kind: LearnedRuleKind =
        tok.category === "GROWER_GREATER_OF" ? "GROWER_FORM" : "CATEGORY_HINT";
      const tokenMatch = phrase.match(
        /\b(?:greater\s+of|available\s+amount|builder\s+basket|without\s+limitation|shall\s+not\s+exceed|%\s+of|to\s+1\.00)\b/i,
      );
      const pattern = tokenMatch
        ? escapeRegexLiteral(tokenMatch[0]!)
        : escapeRegexLiteral(phrase.slice(0, 48).trim());
      if (pattern.length < 6) continue;
      return { kind, effect: { category: tok.category }, pattern, flags: "i" };
    }
  }
  for (const tok of FAMILY_TOKENS) {
    if (tok.re.test(blob)) {
      const pattern = distinctivePatternFromExcerpt(phrase);
      if (pattern.length < 6) continue;
      return {
        kind: "PHRASE_PATTERN",
        effect: { family: tok.family },
        pattern,
        flags: "i",
      };
    }
  }
  const alias = blob.match(/alias\s+(\w[\w\s-]{2,40})\s*[→=]\s*(\w[\w\s-]{2,40})/i);
  if (alias) {
    return {
      kind: "DEFINITION_ALIAS",
      effect: { aliasOf: alias[2]!.trim() },
      pattern: `^${escapeRegexLiteral(alias[1]!.trim())}$`,
      flags: "i",
    };
  }
  const sectionTitle = typeof signal.evidence?.sectionTitle === "string" ? signal.evidence.sectionTitle : null;
  const sectionFamily = typeof signal.evidence?.expectedFamily === "string" ? signal.evidence.expectedFamily : null;
  if (sectionTitle && sectionFamily) {
    return {
      kind: "SECTION_MAPPING",
      effect: { sectionFamily },
      pattern: escapeRegexLiteral(sectionTitle.slice(0, 80)),
      flags: "i",
    };
  }
  return null;
}

/**
 * Cluster ledger signals by (class + inferred effect) and emit one candidate rule per cluster.
 */
export function synthesizeCandidateRules(args: {
  signals: LedgerSignal[];
  epoch: number;
  now?: string;
}): LearnedRule[] {
  const now = args.now ?? new Date().toISOString();
  const clusters = new Map<
    string,
    { draft: { kind: LearnedRuleKind; effect: LearnedRule["effect"]; pattern: string; flags: string }; errorIds: string[]; phrase: string }
  >();

  const add = (
    draft: { kind: LearnedRuleKind; effect: LearnedRule["effect"]; pattern: string; flags: string },
    signal: LedgerSignal,
    phrase: string,
  ) => {
    const key = `${draft.kind}|${draft.effect.category ?? ""}|${draft.effect.family ?? ""}|${draft.effect.aliasOf ?? ""}|${draft.effect.sectionFamily ?? ""}|${draft.pattern}`;
    const existing = clusters.get(key);
    if (existing) existing.errorIds.push(signal.errorId);
    else clusters.set(key, { draft, errorIds: [signal.errorId], phrase });
  };

  for (const signal of args.signals) {
    const phrase = extractPhraseSeed(signal);
    if (!phrase) continue;
    if (signal.class === "DISCOVERY_GAP") {
      for (const draft of inferDiscoveryGapRules(signal, phrase)) add(draft, signal, phrase);
      continue;
    }
    const draft = inferKindAndEffect(signal, phrase);
    if (draft) add(draft, signal, phrase);
  }

  const out: LearnedRule[] = [];
  for (const [, cluster] of [...clusters.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const { kind, effect, pattern, flags } = cluster.draft;
    out.push({
      ruleId: rid([kind, pattern, effect.category ?? "", effect.family ?? "", effect.sectionFamily ?? "", String(args.epoch)]),
      version: 0,
      kind,
      pattern,
      flags,
      effect,
      provenance: {
        ledgerErrorIds: [...new Set(cluster.errorIds)].sort(),
        synthesizedAt: now,
        epoch: args.epoch,
        note: `cluster size ${cluster.errorIds.length}; seed="${cluster.phrase.slice(0, 60)}"`,
      },
      state: "PROPOSED",
    });
  }
  // Prefer DISCOVERY_GAP-derived phrase/section rules first (dominant error class).
  return out.sort((a, b) => {
    const score = (r: LearnedRule) =>
      r.kind === "PHRASE_PATTERN" ? 0 : r.kind === "SECTION_MAPPING" ? 1 : 2;
    const d = score(a) - score(b);
    if (d !== 0) return d;
    return b.provenance.ledgerErrorIds.length - a.provenance.ledgerErrorIds.length;
  });
}
