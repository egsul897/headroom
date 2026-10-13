/**
 * Synthesize executable candidate rules from clustered error-ledger entries.
 * No hand-written per-case patterns — only mechanical clustering + template effects.
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
      if (cleaned.length >= 12 && cleaned.length <= 160) return cleaned.slice(0, 120);
    }
  }
  const m = signal.message.match(/"([^"]{12,120})"/);
  if (m?.[1]) return m[1];
  return null;
}

function inferKindAndEffect(signal: LedgerSignal, phrase: string): {
  kind: LearnedRuleKind;
  effect: LearnedRule["effect"];
  pattern: string;
  flags: string;
} | null {
  const blob = `${signal.class} ${signal.message} ${phrase}`;
  for (const tok of CATEGORY_TOKENS) {
    if (tok.re.test(blob)) {
      const kind: LearnedRuleKind =
        tok.category === "GROWER_GREATER_OF" ? "GROWER_FORM" : "CATEGORY_HINT";
      // Prefer a compact distinctive token from the phrase rather than the whole phrase
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
      const pattern = escapeRegexLiteral(phrase.slice(0, 48).trim());
      if (pattern.length < 6) continue;
      return {
        kind: "PHRASE_PATTERN",
        effect: { family: tok.family },
        pattern,
        flags: "i",
      };
    }
  }
  // Definition alias: "X means Y" style messages
  const alias = blob.match(/alias\s+(\w[\w\s-]{2,40})\s*[→=]\s*(\w[\w\s-]{2,40})/i);
  if (alias) {
    return {
      kind: "DEFINITION_ALIAS",
      effect: { aliasOf: alias[2]!.trim() },
      pattern: `^${escapeRegexLiteral(alias[1]!.trim())}$`,
      flags: "i",
    };
  }
  // Section mapping from evidence
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
    { draft: ReturnType<typeof inferKindAndEffect>; errorIds: string[]; phrase: string }
  >();

  for (const signal of args.signals) {
    const phrase = extractPhraseSeed(signal);
    if (!phrase) continue;
    const draft = inferKindAndEffect(signal, phrase);
    if (!draft) continue;
    const key = `${draft.kind}|${draft.effect.category ?? ""}|${draft.effect.family ?? ""}|${draft.effect.aliasOf ?? ""}|${draft.effect.sectionFamily ?? ""}|${draft.pattern}`;
    const existing = clusters.get(key);
    if (existing) {
      existing.errorIds.push(signal.errorId);
    } else {
      clusters.set(key, { draft, errorIds: [signal.errorId], phrase });
    }
  }

  const out: LearnedRule[] = [];
  for (const [, cluster] of [...clusters.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!cluster.draft) continue;
    // Require at least 1 supporting error; prefer clusters with 2+ but allow singleton for NEEDS_INPUT gaps
    const { kind, effect, pattern, flags } = cluster.draft;
    out.push({
      ruleId: rid([kind, pattern, effect.category ?? "", effect.family ?? "", String(args.epoch)]),
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
  return out;
}
