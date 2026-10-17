/**
 * Scoreboard self-credit guard (deterministic, no AI).
 *
 * Learned PHRASE_PATTERN rules are synthesized from ledger errors on the scoreboard's own precedent items
 * (learned-rules/synthesize.ts): the rule's seed phrase is the item's whitespace-collapsed excerpt, its family is the
 * item's label. A rule re-finding the item it was seeded from (or anything in that document) is memorization, not
 * discovery, so that credit is refused. Credit in any other document, including other issuers, is kept.
 *
 * Seed provenance, exact (never a pattern match):
 *   1. RECORDED: the rule's own provenance.packageKeys (newer synthesizer output) name the seed sources exactly.
 *   2. EXACT_SEED_TEXT: otherwise the rule's recorded seed text (provenance.note `seed="…"`, the first 60 characters
 *      of the seed phrase) identifies the seed items: precedent items (candidates, conditions, definitions) whose
 *      whitespace-collapsed text starts with exactly that text. If no item does, documents whose collapsed text
 *      contains it exactly (seeds taken from basket citations).
 * Fail closed: a capture rule with no recorded seed, no exact seed match, or a cluster with fewer exact seed items
 * than its recorded cluster size (some members unidentified) has incomplete provenance and earns no credit anywhere.
 * Identical seed text in several documents refuses all of them (we cannot tell which one the rule came from).
 */
import { createHash } from "node:crypto";
import { phrasePatternCaptureRules } from "../learned-rules/apply";
import type { LearnedRule, LearnedRuleSet } from "../learned-rules/types";
import { canonicalJson } from "./integrity";

export const SEED_PROVENANCE_SCHEMA = "clf-rule-seed-provenance/v2" as const;
export const LEARNED_BASKET_PREFIX = "learned-";

/** Credit-refusal reasons (stable strings; they key the report counts). */
export const REFUSED_SELF_SEEDED = "SELF_SEEDED";
export const REFUSED_NO_PROVENANCE = "NO_PROVENANCE";
/** Credit kept for a learned capture outside its seed documents, by issuer relation (report-only). */
export const CREDIT_CROSS_ISSUER = "LEARNED_CROSS_ISSUER";
export const CREDIT_SAME_ISSUER_OTHER_DOC = "LEARNED_SAME_ISSUER_OTHER_DOCUMENT";
export const CREDIT_ISSUER_UNKNOWN = "LEARNED_OTHER_DOCUMENT_ISSUER_UNKNOWN";

export type SeedBasis = "RECORDED_PACKAGE_KEYS" | "EXACT_SEED_TEXT_ITEM" | "EXACT_SEED_TEXT_DOCUMENT" | "NONE";

export interface RuleSeedItem {
  sourceId: string;
  kind: "candidate" | "condition" | "definition" | "document";
  itemId: string;
}

export interface RuleSeedProvenance {
  basis: SeedBasis;
  /** Recorded seed text (from the rule's provenance note), or null. */
  seedText: string | null;
  clusterSize: number | null;
  /** false = some seed is unidentified: the rule earns no credit anywhere. */
  complete: boolean;
  sourceIds: string[];
  contentSha256s: string[];
  /** Normalized issuer CIKs of the seed documents (null entries dropped). */
  issuerCiks: string[];
  items: RuleSeedItem[];
}

export interface SeedProvenanceFile {
  schema: typeof SEED_PROVENANCE_SCHEMA;
  method: string;
  /** Bound to the exact ruleset and inputs it was derived from; any mismatch = every rule lacks provenance. */
  rulesetSha256: string;
  snapshotSha256: string;
  summary: {
    captureRules: number;
    complete: number;
    incomplete: number;
    byBasis: Record<SeedBasis, number>;
    multiDocumentSeed: number;
  };
  rules: Record<string, RuleSeedProvenance>;
}

export const SEED_METHOD =
  "exact: provenance.packageKeys when recorded; else the recorded seed text (note seed=\"…\") as an exact prefix of a " +
  "precedent item's whitespace-collapsed text, else as an exact substring of a document's collapsed text. Complete only " +
  "when every recorded seed (cluster size) is matched by an item; otherwise no credit anywhere.";

export interface SeedInputSource {
  source: { sourceId: string; contentSha256?: string | null; issuerCik?: string | null };
  documentText?: string | null;
  candidates: { candidateId: string; excerpt?: string | null }[];
  conditions: { conditionId: string; excerpt?: string | null }[];
  definitions: { definitionId: string; body?: string | null }[];
}

/** Same normalization the synthesizer applies to a seed phrase (extractPhraseSeed). */
export const collapse = (t: string | null | undefined): string => (t ?? "").replace(/\s+/g, " ").trim();

const normCikOf = (c: string | null | undefined): string | null => {
  const d = (c ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d.length ? d : null;
};

/** Parse the synthesizer's provenance note: `cluster size N; [sourcesSpanned=M; ]seed="…"`. */
export function parseSeedNote(rule: LearnedRule): { clusterSize: number; seedText: string } | null {
  const note = (rule.provenance as { note?: unknown } | undefined)?.note;
  if (typeof note !== "string") return null;
  const m = /^cluster size (\d+);(?: sourcesSpanned=\d+;)? seed="([\s\S]*)"$/.exec(note);
  if (!m) return null;
  const seedText = collapse(m[2]);
  return seedText.length >= 12 ? { clusterSize: Number(m[1]), seedText } : null;
}

const SWEEP_PACKAGE_PREFIX = "clf-sweep:";

/** Derive seed provenance for every learned capture rule (the only rules that create match-earning baskets). */
export function deriveSeedProvenance(
  rules: LearnedRuleSet,
  sources: readonly SeedInputSource[],
  ids: { rulesetSha256: string; snapshotSha256: string },
): SeedProvenanceFile {
  const byId = new Map(sources.map((s) => [s.source.sourceId, s] as const));
  const collapsed = sources.map((s) => ({
    s,
    items: [
      ...s.candidates.map((c) => ({ kind: "candidate" as const, itemId: c.candidateId, text: collapse(c.excerpt) })),
      ...s.conditions.map((c) => ({ kind: "condition" as const, itemId: c.conditionId, text: collapse(c.excerpt) })),
      ...s.definitions.map((d) => ({ kind: "definition" as const, itemId: d.definitionId, text: collapse(d.body) })),
    ],
    doc: collapse(s.documentText),
  }));
  const out: Record<string, RuleSeedProvenance> = {};
  const byBasis: Record<SeedBasis, number> = { RECORDED_PACKAGE_KEYS: 0, EXACT_SEED_TEXT_ITEM: 0, EXACT_SEED_TEXT_DOCUMENT: 0, NONE: 0 };
  let complete = 0;
  let multi = 0;
  const capture = phrasePatternCaptureRules(rules);
  for (const rule of capture) {
    const note = parseSeedNote(rule);
    const recorded = (rule.provenance as { packageKeys?: unknown } | undefined)?.packageKeys;
    let basis: SeedBasis = "NONE";
    let items: RuleSeedItem[] = [];
    let isComplete = false;
    if (Array.isArray(recorded) && recorded.length > 0 && recorded.every((k) => typeof k === "string")) {
      basis = "RECORDED_PACKAGE_KEYS";
      const sids = (recorded as string[]).map((k) => (k.startsWith(SWEEP_PACKAGE_PREFIX) ? k.slice(SWEEP_PACKAGE_PREFIX.length) : k));
      items = sids.map((sourceId) => ({ sourceId, kind: "document" as const, itemId: sourceId }));
      isComplete = true;
    } else if (note) {
      for (const c of collapsed) for (const it of c.items) if (it.text.startsWith(note.seedText)) items.push({ sourceId: c.s.source.sourceId, kind: it.kind, itemId: it.itemId });
      if (items.length) {
        basis = "EXACT_SEED_TEXT_ITEM";
        isComplete = items.length >= note.clusterSize;
      } else {
        for (const c of collapsed) if (c.doc.includes(note.seedText)) items.push({ sourceId: c.s.source.sourceId, kind: "document", itemId: c.s.source.sourceId });
        if (items.length) {
          basis = "EXACT_SEED_TEXT_DOCUMENT";
          isComplete = items.length >= note.clusterSize;
        }
      }
    }
    const sourceIds = [...new Set(items.map((i) => i.sourceId))].sort();
    const contentSha256s = [...new Set(sourceIds.map((id) => byId.get(id)?.source.contentSha256 ?? null).filter((x): x is string => Boolean(x)))].sort();
    const issuerCiks = [...new Set(sourceIds.map((id) => normCikOf(byId.get(id)?.source.issuerCik)).filter((x): x is string => Boolean(x)))].sort();
    if (!sourceIds.length) isComplete = false;
    byBasis[basis] += 1;
    if (isComplete) complete += 1;
    if (sourceIds.length > 1) multi += 1;
    out[rule.ruleId] = { basis, seedText: note?.seedText ?? null, clusterSize: note?.clusterSize ?? null, complete: isComplete, sourceIds, contentSha256s, issuerCiks, items };
  }
  return {
    schema: SEED_PROVENANCE_SCHEMA,
    method: SEED_METHOD,
    rulesetSha256: ids.rulesetSha256,
    snapshotSha256: ids.snapshotSha256,
    summary: { captureRules: capture.length, complete, incomplete: capture.length - complete, byBasis, multiDocumentSeed: multi },
    rules: out,
  };
}

export interface GuardSource {
  sourceId: string;
  contentSha256?: string | null;
  issuerCik?: string | null;
}

export interface SelfCreditGuard {
  /** null = the basket may earn credit in this source; otherwise the refusal reason. */
  refusal(basket: { stableKey: string }, source: GuardSource): string | null;
  /** For a learned basket that may earn credit here: how it relates to its seed (issuer); null for other baskets. */
  creditTag(basket: { stableKey: string }, source: GuardSource): string | null;
  /** Capture rules with no usable provenance (none, incomplete, or the file is bound to another ruleset/snapshot). */
  rulesWithoutProvenance: number;
  /** Why provenance is unusable as a whole (null when it is bound to this ruleset and snapshot). */
  unboundReason: string | null;
}

/**
 * Build the guard for one evaluation. Provenance that is missing, malformed, or bound to a different ruleset or
 * snapshot is treated as absent for every rule (fail closed: learned captures earn no credit at all).
 */
export function selfCreditGuard(
  rules: LearnedRuleSet,
  provenance: SeedProvenanceFile | null,
  ids: { rulesetSha256: string; snapshotSha256: string | null },
): SelfCreditGuard {
  const captureIds = new Set(phrasePatternCaptureRules(rules).map((r) => r.ruleId));
  let unboundReason: string | null = null;
  if (!provenance) unboundReason = "no seed provenance supplied";
  else if (provenance.schema !== SEED_PROVENANCE_SCHEMA) unboundReason = `unsupported provenance schema ${String(provenance.schema)}`;
  else if (provenance.rulesetSha256 !== ids.rulesetSha256) unboundReason = `provenance ruleset ${String(provenance.rulesetSha256).slice(0, 12)} ≠ scored ruleset ${ids.rulesetSha256.slice(0, 12)}`;
  else if (!ids.snapshotSha256 || provenance.snapshotSha256 !== ids.snapshotSha256) unboundReason = `provenance snapshot ${String(provenance.snapshotSha256).slice(0, 12)} ≠ scored inputs ${(ids.snapshotSha256 ?? "NONE").slice(0, 12)}`;
  const table = unboundReason ? {} : provenance!.rules;
  const seeded = new Map<string, { ids: Set<string>; shas: Set<string>; ciks: Set<string> }>();
  for (const id of captureIds) {
    const p = table[id];
    if (p && p.complete === true && Array.isArray(p.sourceIds) && p.sourceIds.length > 0) {
      seeded.set(id, { ids: new Set(p.sourceIds), shas: new Set(p.contentSha256s ?? []), ciks: new Set(p.issuerCiks ?? []) });
    }
  }
  const ruleOf = (b: { stableKey: string }) => (b.stableKey.startsWith(LEARNED_BASKET_PREFIX) ? b.stableKey.slice(LEARNED_BASKET_PREFIX.length) : null);
  const refusal = (basket: { stableKey: string }, source: GuardSource): string | null => {
    const ruleId = ruleOf(basket);
    if (ruleId == null) return null;
    const p = seeded.get(ruleId);
    if (!p) return REFUSED_NO_PROVENANCE;
    if (p.ids.has(source.sourceId) || (source.contentSha256 && p.shas.has(source.contentSha256))) return REFUSED_SELF_SEEDED;
    return null;
  };
  return {
    rulesWithoutProvenance: captureIds.size - seeded.size,
    unboundReason,
    refusal,
    creditTag(basket, source) {
      const ruleId = ruleOf(basket);
      if (ruleId == null || refusal(basket, source) != null) return null;
      const p = seeded.get(ruleId)!;
      const cik = normCikOf(source.issuerCik);
      if (!cik || p.ciks.size === 0) return CREDIT_ISSUER_UNKNOWN;
      return p.ciks.has(cik) ? CREDIT_SAME_ISSUER_OTHER_DOC : CREDIT_CROSS_ISSUER;
    },
  };
}

/** sha256 of a provenance file's canonical JSON (recorded in reports for traceability). */
export function provenanceSha256(p: SeedProvenanceFile): string {
  return createHash("sha256").update(canonicalJson(p)).digest("hex");
}
