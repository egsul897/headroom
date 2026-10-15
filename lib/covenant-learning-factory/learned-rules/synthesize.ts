/**
 * Synthesize executable candidate rules from clustered error-ledger entries.
 * No hand-written per-case patterns — only mechanical clustering + template effects.
 *
 * DISCOVERY_GAP (missed kf_precedent candidates) is the dominant signal.
 * Phrase rules are generalized (amounts, defined terms, lemma classes, anchors)
 * and one rule is emitted per cross-source cluster. Multi-source clusters sort first.
 */

import { createHash } from "node:crypto";
import type { BasketCategory } from "../../contract-model/covenant-computation/types";
import {
  generalizePhrase,
  patternAbstractsSlot,
  patternFromTokens,
  sharedTokens,
  tokenJaccard,
  type NormToken,
} from "./generalize";
import type { LearnedRule, LearnedRuleEffect, LearnedRuleKind } from "./types";

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
      const generalized = generalizePhrase(phrase);
      if (generalized.pattern.length < 6 || generalized.tokens.length < 4) continue;
      return {
        kind: "PHRASE_PATTERN",
        effect: { family: tok.family },
        pattern: generalized.pattern,
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

const PHRASE_MERGE_JACCARD = 0.72;

function effectKey(effect: LearnedRuleEffect): string {
  return `${effect.category ?? ""}|${effect.family ?? ""}|${effect.aliasOf ?? ""}|${effect.sectionFamily ?? ""}`;
}

function packageOf(signal: LedgerSignal): string | null {
  const key = signal.packageKey?.trim() || signal.sourceId?.trim() || "";
  return key.length > 0 ? key : null;
}

interface PhraseProto {
  effect: LearnedRuleEffect;
  errorId: string;
  phrase: string;
  packageKey: string | null;
  tokens: NormToken[];
  ids: string[];
}

interface OtherCluster {
  draft: { kind: LearnedRuleKind; effect: LearnedRuleEffect; pattern: string; flags: string };
  errorIds: string[];
  phrase: string;
  packageKeys: string[];
}

function clusterPhraseProtos(protos: PhraseProto[]): PhraseProto[][] {
  const sorted = [...protos].sort((a, b) => {
    const sig = a.ids.join(">").localeCompare(b.ids.join(">"));
    if (sig !== 0) return sig;
    const pkg = (a.packageKey ?? "").localeCompare(b.packageKey ?? "");
    if (pkg !== 0) return pkg;
    const effect = effectKey(a.effect).localeCompare(effectKey(b.effect));
    if (effect !== 0) return effect;
    return a.errorId.localeCompare(b.errorId);
  });
  const clusters: PhraseProto[][] = [];
  for (const proto of sorted) {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < clusters.length; i++) {
      const rep = clusters[i]![0]!;
      if (effectKey(rep.effect) !== effectKey(proto.effect)) continue;
      const score = tokenJaccard(rep.ids, proto.ids);
      if (score >= PHRASE_MERGE_JACCARD && (best < 0 || score > bestScore)) {
        best = i;
        bestScore = score;
      }
    }
    if (best >= 0) clusters[best]!.push(proto);
    else clusters.push([proto]);
  }
  return clusters;
}

/**
 * Cluster ledger signals into executable candidates.
 * Phrase errors collapse to one generalized rule per skeleton, preferring
 * clusters that span more packages.
 */
export function synthesizeCandidateRules(args: {
  signals: LedgerSignal[];
  epoch: number;
  now?: string;
}): LearnedRule[] {
  const now = args.now ?? new Date().toISOString();
  const phraseProtos: PhraseProto[] = [];
  const other = new Map<string, OtherCluster>();

  const addOther = (
    draft: { kind: LearnedRuleKind; effect: LearnedRuleEffect; pattern: string; flags: string },
    signal: LedgerSignal,
    phrase: string,
  ) => {
    const key = `${draft.kind}|${effectKey(draft.effect)}|${draft.pattern}`;
    const pkg = packageOf(signal);
    const existing = other.get(key);
    if (existing) {
      existing.errorIds.push(signal.errorId);
      if (pkg && !existing.packageKeys.includes(pkg)) existing.packageKeys.push(pkg);
    } else {
      other.set(key, {
        draft,
        errorIds: [signal.errorId],
        phrase,
        packageKeys: pkg ? [pkg] : [],
      });
    }
  };

  const addPhrase = (signal: LedgerSignal, phrase: string, effect: LearnedRuleEffect) => {
    const generalized = generalizePhrase(phrase);
    if (generalized.pattern.length < 12 || generalized.tokens.length < 4) return;
    phraseProtos.push({
      effect,
      errorId: signal.errorId,
      phrase,
      packageKey: packageOf(signal),
      tokens: generalized.tokens,
      ids: generalized.tokens.map((t) => t.id),
    });
  };

  for (const signal of args.signals) {
    const phrase = extractPhraseSeed(signal);
    if (!phrase) continue;
    if (signal.class === "DISCOVERY_GAP") {
      const family = familyFromSignal(signal, phrase) ?? "OTHER";
      addPhrase(signal, phrase, { family });
      const sectionRef =
        typeof signal.evidence?.sectionRef === "string"
          ? signal.evidence.sectionRef
          : typeof signal.evidence?.sectionTitle === "string"
            ? signal.evidence.sectionTitle
            : null;
      if (sectionRef && sectionRef.trim().length >= 3) {
        addOther(
          {
            kind: "SECTION_MAPPING",
            effect: { sectionFamily: family },
            pattern: escapeRegexLiteral(sectionRef.trim().slice(0, 80)),
            flags: "i",
          },
          signal,
          phrase,
        );
      }
      continue;
    }
    const draft = inferKindAndEffect(signal, phrase);
    if (!draft) continue;
    if (draft.kind === "PHRASE_PATTERN") addPhrase(signal, phrase, draft.effect);
    else addOther(draft, signal, phrase);
  }

  const out: LearnedRule[] = [];

  for (const members of clusterPhraseProtos(phraseProtos)) {
    const tokens = sharedTokens(members.map((m) => m.tokens));
    const use = tokens.length >= 4 ? tokens : members[0]!.tokens;
    const pattern = patternFromTokens(use);
    if (pattern.length < 12) continue;
    const signature = use.map((t) => t.id).join(">");
    const effect = members[0]!.effect;
    const packageKeys = [...new Set(members.map((m) => m.packageKey).filter((k): k is string => Boolean(k)))].sort();
    const errorIds = [...new Set(members.map((m) => m.errorId))].sort();
    const generalized = patternAbstractsSlot(pattern);
    out.push({
      ruleId: rid([
        "PHRASE_PATTERN",
        signature,
        effect.family ?? "",
        effect.category ?? "",
        effect.sectionFamily ?? "",
        String(args.epoch),
      ]),
      version: 0,
      kind: "PHRASE_PATTERN",
      pattern,
      flags: "i",
      effect,
      provenance: {
        ledgerErrorIds: errorIds,
        synthesizedAt: now,
        epoch: args.epoch,
        packageKeys,
        sourcesSpanned: packageKeys.length,
        generalized,
        normalizedSignature: signature,
        note: `cluster size ${errorIds.length}; sourcesSpanned=${packageKeys.length}; seed="${members[0]!.phrase.slice(0, 60)}"`,
      },
      state: "PROPOSED",
    });
  }

  for (const [, cluster] of [...other.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const { kind, effect, pattern, flags } = cluster.draft;
    const packageKeys = [...cluster.packageKeys].sort();
    out.push({
      ruleId: rid([
        kind,
        pattern,
        effect.category ?? "",
        effect.family ?? "",
        effect.sectionFamily ?? "",
        String(args.epoch),
      ]),
      version: 0,
      kind,
      pattern,
      flags,
      effect,
      provenance: {
        ledgerErrorIds: [...new Set(cluster.errorIds)].sort(),
        synthesizedAt: now,
        epoch: args.epoch,
        packageKeys,
        sourcesSpanned: packageKeys.length,
        generalized: patternAbstractsSlot(pattern),
        note: `cluster size ${cluster.errorIds.length}; sourcesSpanned=${packageKeys.length}; seed="${cluster.phrase.slice(0, 60)}"`,
      },
      state: "PROPOSED",
    });
  }

  return out.sort((a, b) => {
    const span = (b.provenance.sourcesSpanned ?? 0) - (a.provenance.sourcesSpanned ?? 0);
    if (span !== 0) return span;
    const score = (r: LearnedRule) =>
      r.kind === "PHRASE_PATTERN" ? 0 : r.kind === "SECTION_MAPPING" ? 1 : 2;
    const d = score(a) - score(b);
    if (d !== 0) return d;
    const gen = Number(b.provenance.generalized === true) - Number(a.provenance.generalized === true);
    if (gen !== 0) return gen;
    const n = b.provenance.ledgerErrorIds.length - a.provenance.ledgerErrorIds.length;
    if (n !== 0) return n;
    return a.ruleId.localeCompare(b.ruleId);
  });
}
