/**
 * ENTITY-SCOPE CONSISTENCY GUARD (Phase 3 final blocker).
 *
 * Two independent deterministic gaps let an under-inclusive entityScope
 * survive as a confident authoritative field:
 *
 *   A. the normalizer silently dropped any wire tag outside the
 *      EntityClassTag enum (no warning, no sufficiency change), so a tag the
 *      model emitted for a subsidiary class could vanish without trace;
 *   B. nothing compared the normalized entityScope against the binding
 *      language of the rule's OWN source, so "the Borrower shall not, and
 *      shall not permit any Restricted Subsidiary to ..." could carry
 *      entityScope ["BORROWER"] and stay COMPLETE.
 *
 * This module closes both. It is a CONSISTENCY check over text already bound
 * to the rule (its provenance excerpt, else the lead-in of the structural unit
 * it cites) - never a new legal interpretation, never a model call, and never
 * a widening: when the source proves the scope under-inclusive the scope is
 * reset to unspecified ([]) and the rule is limited (COMPLETE -> PARTIAL)
 * with a machine-readable reason. Nothing here references any particular
 * agreement, section number or rule id; the vocabulary is the generic
 * credit-agreement/indenture entity-class vocabulary the source-inventory
 * layer already scans for (semantic-verification/source-inventory.ts
 * ENTITY_SCOPE_TERM), mapped onto the fixed EntityClassTag enum.
 */
import { EntityClassTag as EntityClassTagEnum } from "@prisma/client";
import type { EntityClassTag } from "@prisma/client";
import type { EntityAtom, EntityScopeReasonCode, IREntityScopeAudit, IREntityScopeSignal, IREntityTagNormalization, IRRule } from "../../ir/types";
import type { SourceContextRegion } from "../semantic-accountability/types";

export const ENTITY_SCOPE_GUARD_VERSION = "entity-scope-consistency-guard.v1";

const ENUM_TAGS: readonly string[] = Object.values(EntityClassTagEnum);

// ---------------------------------------------------------------------------
// §4 - tag normalization that fails loudly. Every emitted tag receives exactly
// one outcome. Aliases are spelling/role variants of an EXACT enum class; a
// tag that cannot be mapped to one exact class (e.g. a generic
// "RESTRICTED_SUBSIDIARY", which the enum splits into guarantor /
// non-guarantor / foreign) is UNRECOGNIZED - its meaning is never guessed.
// ---------------------------------------------------------------------------
const TAG_ALIASES: Readonly<Record<string, EntityClassTag>> = {
  // primary-obligor role synonyms (the party the covenant package is written against)
  COMPANY: "BORROWER", ISSUER: "BORROWER", CO_ISSUER: "BORROWER", BORROWERS: "BORROWER", CO_BORROWER: "BORROWER", INITIAL_BORROWER: "BORROWER", PARENT_BORROWER: "BORROWER",
  // spelling variants of exact classes
  SUBSIDIARY: "ANY_SUBSIDIARY", SUBSIDIARIES: "ANY_SUBSIDIARY", ANY_SUBSIDIARIES: "ANY_SUBSIDIARY",
  UNRESTRICTED_SUBSIDIARY: "UNRESTRICTED_SUB", UNRESTRICTED_SUBSIDIARIES: "UNRESTRICTED_SUB", UNRESTRICTED_SUBS: "UNRESTRICTED_SUB",
  MATERIAL_SUB: "MATERIAL_SUBSIDIARY", MATERIAL_SUBSIDIARIES: "MATERIAL_SUBSIDIARY",
  IMMATERIAL_SUBSIDIARY: "IMMATERIAL_SUB", IMMATERIAL_SUBSIDIARIES: "IMMATERIAL_SUB",
  SECURITIZATION_SUBSIDIARY: "SECURITIZATION_SUB", SECURITIZATION_SUBSIDIARIES: "SECURITIZATION_SUB",
  FOREIGN_RESTRICTED_SUBSIDIARY: "FOREIGN_RS", FOREIGN_RESTRICTED_SUBSIDIARIES: "FOREIGN_RS",
  GUARANTOR_RESTRICTED_SUBSIDIARY: "GUARANTOR_RS", GUARANTOR_RESTRICTED_SUBSIDIARIES: "GUARANTOR_RS", GUARANTOR_SUBSIDIARY: "GUARANTOR_RS", SUBSIDIARY_GUARANTOR: "GUARANTOR_RS", SUBSIDIARY_GUARANTORS: "GUARANTOR_RS",
  NON_GUARANTOR_RESTRICTED_SUBSIDIARY: "NON_GUARANTOR_RS", NON_GUARANTOR_RESTRICTED_SUBSIDIARIES: "NON_GUARANTOR_RS", NON_GUARANTOR_SUBSIDIARY: "NON_GUARANTOR_RS",
  LOAN_PARTIES: "LOAN_PARTY", CREDIT_PARTY: "LOAN_PARTY", CREDIT_PARTIES: "LOAN_PARTY", OBLIGOR: "LOAN_PARTY", OBLIGORS: "LOAN_PARTY",
  HOLDINGS: "PARENT", PARENT_COMPANY: "PARENT",
};

function canonicalTagKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

/** Exactly one outcome per emitted tag: RECOGNIZED (exact enum value, or a listed alias of one exact class) or UNRECOGNIZED (kept verbatim in the audit, never guessed). */
export function classifyEntityTag(raw: string, field: IREntityTagNormalization["field"]): IREntityTagNormalization {
  const key = canonicalTagKey(raw);
  if (ENUM_TAGS.includes(key)) return { field, raw, outcome: "RECOGNIZED_ENTITY_TAG", normalized: key as EntityClassTag, viaAlias: key !== raw };
  const alias = TAG_ALIASES[key];
  if (alias) return { field, raw, outcome: "RECOGNIZED_ENTITY_TAG", normalized: alias, viaAlias: true };
  return { field, raw, outcome: "UNRECOGNIZED_ENTITY_TAG", normalized: null, viaAlias: false };
}

export interface EntityTagNormalizationResult {
  entityScope: EntityClassTag[];
  entityScopeExcluded: EntityClassTag[];
  tagNormalization: IREntityTagNormalization[];
  rawEmitted: IREntityScopeAudit["rawEmitted"];
}

/** Rule-level tag normalization: the wire fields when supplied, else the tags the rule's own ENTITY_SCOPE_REFERENCE nodes carry (already classified by the expression normalizer, passed in as `nodeAudit`). */
export function normalizeEntityTags(args: { entityScope: string[] | undefined; entityScopeExcluded: string[] | undefined; nodeInclude: string[]; nodeExclude: string[]; nodeAudit: IREntityTagNormalization[] }): EntityTagNormalizationResult {
  const useRuleInclude = (args.entityScope ?? []).length > 0;
  const useRuleExclude = (args.entityScopeExcluded ?? []).length > 0;
  const tagNormalization: IREntityTagNormalization[] = [...args.nodeAudit];
  const norm = (raw: string[], field: "entityScope" | "entityScopeExcluded"): EntityClassTag[] => {
    const out: EntityClassTag[] = [];
    for (const r of raw) {
      const c = classifyEntityTag(r, field);
      tagNormalization.push(c);
      if (c.normalized && !out.includes(c.normalized)) out.push(c.normalized);
    }
    return out;
  };
  const entityScope = useRuleInclude ? norm(args.entityScope!, "entityScope") : (args.nodeInclude.filter((t) => ENUM_TAGS.includes(t)) as EntityClassTag[]);
  const entityScopeExcluded = useRuleExclude ? norm(args.entityScopeExcluded!, "entityScopeExcluded") : (args.nodeExclude.filter((t) => ENUM_TAGS.includes(t)) as EntityClassTag[]);
  const source: IREntityScopeAudit["rawEmitted"]["source"] = useRuleInclude || useRuleExclude ? "RULE_FIELD" : args.nodeInclude.length + args.nodeExclude.length + args.nodeAudit.length > 0 ? "ENTITY_SCOPE_NODES" : "EMPTY";
  return { entityScope, entityScopeExcluded, tagNormalization, rawEmitted: { entityScope: args.entityScope ?? null, entityScopeExcluded: args.entityScopeExcluded ?? null, source } };
}

// ---------------------------------------------------------------------------
// §5 - the source-binding vocabulary. Each EntityClassTag denotes a set of
// atoms (fully, or partially when the tag is a qualified subset such as
// FOREIGN_RS); each source phrase REQUIRES that the scope touch at least one
// of the atoms it denotes. Family-level on purpose: this proves
// inconsistency (a bound class with no representative at all), not precision.
// ---------------------------------------------------------------------------
const RS: EntityAtom[] = ["GUARANTOR_RS", "NON_GUARANTOR_RS"];
const ANY_SUB: EntityAtom[] = ["GUARANTOR_RS", "NON_GUARANTOR_RS", "UNRESTRICTED_SUB"];

export const TAG_DENOTATION: Readonly<Record<EntityClassTag, { full: EntityAtom[]; partial: EntityAtom[] }>> = {
  BORROWER: { full: ["BORROWER"], partial: [] },
  GUARANTOR_RS: { full: ["GUARANTOR_RS"], partial: [] },
  NON_GUARANTOR_RS: { full: ["NON_GUARANTOR_RS"], partial: [] },
  FOREIGN_RS: { full: [], partial: RS },
  UNRESTRICTED_SUB: { full: ["UNRESTRICTED_SUB"], partial: [] },
  SECURITIZATION_SUB: { full: [], partial: ANY_SUB },
  IMMATERIAL_SUB: { full: [], partial: ANY_SUB },
  PARENT: { full: ["PARENT"], partial: [] },
  LOAN_PARTY: { full: ["BORROWER", "GUARANTOR_RS"], partial: ["PARENT"] },
  MATERIAL_SUBSIDIARY: { full: [], partial: ANY_SUB },
  ANY_SUBSIDIARY: { full: ANY_SUB, partial: [] },
};

interface SignalSpec { label: string; re: RegExp; requiresAnyOf: EntityAtom[] }

// Case-sensitive on purpose: these are capitalized defined terms in the source; a lowercase
// "subsidiary" or "company" is ordinary prose, not a binding class. Order matters only for
// the unqualified-Subsidiary rule, which excludes the qualified forms via lookbehind.
const SIGNALS: readonly SignalSpec[] = [
  { label: "Restricted Subsidiary", re: /\bRestricted Subsidiar(?:y|ies)\b/g, requiresAnyOf: RS },
  { label: "Unrestricted Subsidiary", re: /\bUnrestricted Subsidiar(?:y|ies)\b/g, requiresAnyOf: ["UNRESTRICTED_SUB"] },
  { label: "qualified Subsidiary", re: /\b(?:Material|Immaterial|Foreign|Domestic|Excluded|Securitization|Receivables|Insurance|Captive|Wholly[- ]Owned|Significant)\s+Subsidiar(?:y|ies)\b/g, requiresAnyOf: ANY_SUB },
  { label: "Subsidiary", re: /(?<!(?:Restricted|Unrestricted|Material|Immaterial|Foreign|Domestic|Excluded|Securitization|Receivables|Insurance|Captive|Owned|Significant)\s)\bSubsidiar(?:y|ies)\b/g, requiresAnyOf: ANY_SUB },
  { label: "Borrower", re: /\bBorrowers?\b/g, requiresAnyOf: ["BORROWER"] },
  { label: "the Company / the Issuer", re: /\b(?:the|The)\s+(?:Company|Issuer|Co-Issuers?)\b/g, requiresAnyOf: ["BORROWER"] },
  { label: "Guarantor", re: /\bGuarantors?\b/g, requiresAnyOf: ["GUARANTOR_RS", "PARENT"] },
  { label: "Loan Party / Credit Party / Obligor", re: /\b(?:Loan Part(?:y|ies)|Credit Part(?:y|ies)|Obligors?)\b/g, requiresAnyOf: ["BORROWER", "GUARANTOR_RS", "PARENT"] },
];

// A phrase in an exclusion window is a carve-out of that class, not a binding of it.
const EXCLUSION_WINDOW = /(?:other than|excluding|except(?:ing)?(?: for)?|that (?:is|are) not|which (?:is|are) not|who (?:is|are) not|not (?:a|an|any)|neither)\s*(?:\(|an?\s+|any\s+|the\s+)?[\w\s,-]{0,40}$/;

/** §5 - every explicit source-binding signal in `text`, with its exclusion context. Pure, deterministic, no interpretation beyond the fixed vocabulary above. */
export function findEntityBindingSignals(text: string): Array<Pick<IREntityScopeSignal, "phrase" | "index" | "excludedContext" | "requiresAnyOf">> {
  const out: Array<Pick<IREntityScopeSignal, "phrase" | "index" | "excludedContext" | "requiresAnyOf">> = [];
  for (const spec of SIGNALS) {
    spec.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = spec.re.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 60), m.index);
      out.push({ phrase: m[0], index: m.index, excludedContext: EXCLUSION_WINDOW.test(before), requiresAnyOf: spec.requiresAnyOf });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

function scopeCoverage(scope: EntityClassTag[]): { full: Set<EntityAtom>; partial: Set<EntityAtom>; by: Map<EntityAtom, EntityClassTag[]> } {
  const full = new Set<EntityAtom>(), partial = new Set<EntityAtom>(), by = new Map<EntityAtom, EntityClassTag[]>();
  for (const t of scope) {
    const d = TAG_DENOTATION[t];
    if (!d) continue;
    for (const a of d.full) { full.add(a); by.set(a, [...(by.get(a) ?? []), t]); }
    for (const a of d.partial) { partial.add(a); by.set(a, [...(by.get(a) ?? []), t]); }
  }
  return { full, partial, by };
}

function evaluateSignals(tier: IREntityScopeSignal["tier"], text: string, scope: EntityClassTag[]): IREntityScopeSignal[] {
  const cov = scopeCoverage(scope);
  return findEntityBindingSignals(text).map((s) => {
    const fullHit = s.requiresAnyOf.some((a) => cov.full.has(a));
    const partialHit = s.requiresAnyOf.some((a) => cov.partial.has(a));
    const satisfiedBy = [...new Set(s.requiresAnyOf.flatMap((a) => cov.by.get(a) ?? []))];
    return { tier, ...s, satisfied: fullHit || partialHit, satisfiedBy, partialOnly: !fullHit && partialHit };
  });
}

// ---------------------------------------------------------------------------
// Witness resolution: the rule's own excerpt, else the lead-in of the
// structural unit the rule cites (deterministic, text already bound to the
// rule through its citation). The lead-in is the unit's opening text up to
// its first child enumerator.
// ---------------------------------------------------------------------------
const ENUM_MARKER = /(?<=^|\s)\((?:[a-z]{1,2}|[ivx]{1,5}|\d{1,3}|[A-Z]{1,2})\)/g;

function refTokens(ref: string): { section: string; path: string[] } {
  const clean = ref.replace(/^[§\s]+/, "").replace(/^Section\s+/i, "").trim();
  const m = clean.match(/^([\d.]+[A-Za-z]?)((?:\([^)]+\))*)$/);
  if (!m) return { section: clean, path: [] };
  return { section: m[1]!, path: (m[2] ?? "").match(/\([^)]+\)/g) ?? [] };
}

/** The opening text of the cited structural unit (through its first child enumerator), located deterministically inside `regionText`; null when the unit cannot be located unambiguously. */
export function citedUnitLeadIn(regionText: string, regionSectionRef: string | null, ruleSectionRef: string | null): string | null {
  if (!ruleSectionRef) return null;
  const rule = refTokens(ruleSectionRef);
  const region = regionSectionRef ? refTokens(regionSectionRef) : { section: rule.section, path: [] as string[] };
  if (rule.section !== region.section) return null;
  if (rule.path.length < region.path.length || region.path.some((p, i) => rule.path[i] !== p)) return null;
  const relative = rule.path.slice(region.path.length);
  let pos = 0;
  for (const token of relative) {
    const esc = token.replace(/[()]/g, "\\$&");
    const lineStart = new RegExp(`(?<=\\n\\s*)${esc}(?=\\s)`, "g");
    lineStart.lastIndex = pos;
    let m = lineStart.exec(regionText);
    if (!m) { const anywhere = new RegExp(`(?<=\\s)${esc}(?=\\s)`, "g"); anywhere.lastIndex = pos; m = anywhere.exec(regionText); }
    if (!m) return null;
    pos = m.index;
  }
  const start = pos;
  ENUM_MARKER.lastIndex = start + (relative.length ? relative[relative.length - 1]!.length : 0);
  const next = ENUM_MARKER.exec(regionText);
  const end = next ? next.index : Math.min(regionText.length, start + 4000);
  const text = regionText.slice(start, end).trim();
  return text.length > 0 ? text : null;
}

export interface EntityScopeWitness { ownExcerpt: string | null; citedUnitLeadIn: string | null }

/** Picks the source region bound to the rule by citation (longest matching sectionRef prefix, OPERATIVE preferred) and derives the cited-unit lead-in. */
export function entityScopeWitnessFor(rule: Pick<IRRule, "sourceSectionRef" | "provenance">, regions: readonly SourceContextRegion[] | null | undefined): EntityScopeWitness {
  const ownExcerpt = rule.provenance?.excerpt?.trim() || null;
  let leadIn: string | null = null;
  if (regions && rule.sourceSectionRef) {
    const rt = refTokens(rule.sourceSectionRef);
    const candidates = regions
      .filter((r) => r.sectionRef && refTokens(r.sectionRef).section === rt.section)
      .sort((a, b) => (b.kind === "OPERATIVE" ? 1 : 0) - (a.kind === "OPERATIVE" ? 1 : 0) || refTokens(b.sectionRef!).path.length - refTokens(a.sectionRef!).path.length);
    for (const r of candidates) { leadIn = citedUnitLeadIn(r.text, r.sectionRef, rule.sourceSectionRef); if (leadIn) break; }
  }
  return { ownExcerpt, citedUnitLeadIn: leadIn };
}

// ---------------------------------------------------------------------------
// §5-§9 - the guard itself. Pure: returns a new rule; never mutates input.
// ---------------------------------------------------------------------------
export interface EntityScopeGuardInput { tagNormalization: IREntityTagNormalization[]; rawEmitted: IREntityScopeAudit["rawEmitted"] }

const reasonText = (code: EntityScopeReasonCode, detail: string) => `${code}: ${detail}`;

export function applyEntityScopeGuard(rule: IRRule, witness: EntityScopeWitness, tags: EntityScopeGuardInput): IRRule {
  const before = { entityScope: [...rule.entityScope], entityScopeExcluded: [...rule.entityScopeExcluded], sufficiency: rule.sufficiency };
  const reasons: string[] = [];
  const codes: EntityScopeReasonCode[] = [];
  let entityScope = [...rule.entityScope];
  let entityScopeExcluded = [...rule.entityScopeExcluded];
  let sufficiency = rule.sufficiency;
  let status: IREntityScopeAudit["status"];
  const clip = (t: string | null) => (t && t.length > 1500 ? `${t.slice(0, 1500)} ...` : t);
  let witnessOut: IREntityScopeAudit["witness"] = { ownExcerpt: clip(witness.ownExcerpt), citedUnitLeadIn: clip(witness.citedUnitLeadIn), decidedBy: "NONE", signals: [] };

  const limit = (code: EntityScopeReasonCode, detail: string) => {
    codes.push(code);
    reasons.push(reasonText(code, detail));
    if (sufficiency === "COMPLETE") { sufficiency = "PARTIAL"; }
  };

  const unrecognized = tags.tagNormalization.filter((t) => t.outcome === "UNRECOGNIZED_ENTITY_TAG");
  if (unrecognized.length > 0) {
    // §4: never a silent drop. The affected field is made non-authoritative (unspecified) and the rule limited; the raw tag is preserved in the audit, its meaning never guessed.
    status = "UNRECOGNIZED_TAG";
    const inInclude = unrecognized.some((u) => u.field !== "entityScopeExcluded" && u.field !== "ENTITY_SCOPE_REFERENCE.exclude");
    const inExclude = unrecognized.some((u) => u.field === "entityScopeExcluded" || u.field === "ENTITY_SCOPE_REFERENCE.exclude");
    if (inInclude) entityScope = [];
    if (inExclude) entityScopeExcluded = [];
    limit("ENTITY_SCOPE_UNRECOGNIZED_TAG", `wire entity tag(s) ${unrecognized.map((u) => `"${u.raw}" (${u.field})`).join(", ")} are not EntityClassTag values; the affected scope field is reset to unspecified and the tag is preserved verbatim in entityScopeAudit - its meaning is not guessed`);
  } else if (entityScope.length === 0) {
    status = "UNSPECIFIED";
    codes.push("ENTITY_SCOPE_UNSPECIFIED");
  } else {
    // Both bound texts are evaluated together. The lead-in of the cited unit governs every fragment under it, so an
    // incidental mention in the excerpt (e.g. a discretion clause) can never mask the unit's own binding language.
    const signals = [
      ...(witness.ownExcerpt ? evaluateSignals("OWN_EXCERPT", witness.ownExcerpt, entityScope) : []),
      ...(witness.citedUnitLeadIn ? evaluateSignals("CITED_UNIT_LEAD_IN", witness.citedUnitLeadIn, entityScope) : []),
    ];
    const binding = signals.filter((s) => !s.excludedContext);
    const unmet = binding.filter((s) => !s.satisfied);
    const tiersOf = (xs: IREntityScopeSignal[]): IREntityScopeAudit["witness"]["decidedBy"] => { const t = new Set(xs.map((x) => x.tier)); return t.size === 2 ? "BOTH" : t.has("OWN_EXCERPT") ? "OWN_EXCERPT" : t.has("CITED_UNIT_LEAD_IN") ? "CITED_UNIT_LEAD_IN" : "NONE"; };
    witnessOut = { ...witnessOut, signals };
    if (binding.length === 0) {
      // §10 case F: no explicit entity-binding language in any bound source - no invented correction.
      status = "UNWITNESSED";
      codes.push("ENTITY_SCOPE_UNWITNESSED");
    } else if (unmet.length > 0) {
      // §6: provable under-inclusion. Remove the false precision; never widen by guess.
      status = "UNDERINCLUSIVE_VS_SOURCE";
      witnessOut.decidedBy = tiersOf(unmet);
      entityScope = [];
      const where = witnessOut.decidedBy === "OWN_EXCERPT" ? "the rule's own provenance excerpt" : witnessOut.decidedBy === "CITED_UNIT_LEAD_IN" ? `the lead-in of the cited unit ${rule.sourceSectionRef ?? ""}` : `the rule's own excerpt and the lead-in of the cited unit ${rule.sourceSectionRef ?? ""}`;
      limit("ENTITY_SCOPE_UNDERINCLUSIVE_VS_SOURCE", `entityScope ${JSON.stringify(before.entityScope)} touches no class for source binding ${[...new Set(unmet.map((s) => `"${s.phrase}"`))].join(", ")} (witness: ${where}); scope reset to unspecified, not widened by guess`);
    } else if (binding.some((s) => s.partialOnly)) {
      status = "AMBIGUOUS_VS_SOURCE";
      witnessOut.decidedBy = tiersOf(binding.filter((s) => s.partialOnly));
      codes.push("ENTITY_SCOPE_AMBIGUOUS_VS_SOURCE");
      reasons.push(reasonText("ENTITY_SCOPE_AMBIGUOUS_VS_SOURCE", `entityScope ${JSON.stringify(entityScope)} covers source binding ${[...new Set(binding.filter((s) => s.partialOnly).map((s) => `"${s.phrase}"`))].join(", ")} only through a qualified subset class; not provably inconsistent, so the scope is kept but is not safe to rely on`));
    } else {
      status = "SOURCE_MATCH_CONFIRMED";
      witnessOut.decidedBy = tiersOf(binding);
      codes.push("ENTITY_SCOPE_SOURCE_MATCH_CONFIRMED");
    }
  }

  const audit: IREntityScopeAudit = {
    guardVersion: ENTITY_SCOPE_GUARD_VERSION,
    status: status!,
    safeToRely: status! === "SOURCE_MATCH_CONFIRMED" || status! === "UNSPECIFIED",
    reasonCodes: codes,
    rawEmitted: tags.rawEmitted,
    tagNormalization: tags.tagNormalization,
    before,
    witness: witnessOut,
  };
  return { ...rule, entityScope, entityScopeExcluded, sufficiency, sufficiencyReasons: [...rule.sufficiencyReasons, ...reasons], entityScopeAudit: audit };
}

/** Replay helper (zero-cost): guard an already-normalized rule against its bound source regions. The raw wire is not available on a replay, which the audit says explicitly. */
export function replayEntityScopeGuard(rule: IRRule, regions: readonly SourceContextRegion[] | null | undefined): IRRule {
  return applyEntityScopeGuard(rule, entityScopeWitnessFor(rule, regions), { tagNormalization: [], rawEmitted: { entityScope: null, entityScopeExcluded: null, source: "NOT_PERSISTED" } });
}
