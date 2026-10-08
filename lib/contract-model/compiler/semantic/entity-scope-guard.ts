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
import type { GoverningSemanticContext } from "./governing-scope";

export const ENTITY_SCOPE_GUARD_VERSION = "entity-scope-consistency-guard.v3";

// ---------------------------------------------------------------------------
// v3 - governing-scope precedence (Phase 3 governing scope closure). The
// authoritative scope is decided by, in order:
//   1. the candidate's OWN operative actor language (the lead-in of the unit
//      it cites, or its verbatim excerpt) when it binds an obligor class;
//   2. the authenticated GOVERNING ancestor chain (governing-scope.ts) when
//      the own text binds no obligor class and the chain establishes the
//      applicability exactly;
//   3. the model-emitted scope, which may corroborate but never override
//      contradictory authenticated source.
// A source-derived scope outranks an unrecognized or contradictory model
// scope; the model discrepancy is recorded in the audit, never erased. If no
// authoritative source establishes the scope mechanically, the v2 behaviour
// stands: an unrecognized / under-inclusive scope is reset to unspecified and
// the rule is limited. Nothing is inferred from document type, market
// drafting, covenant family or any benchmark.
// ---------------------------------------------------------------------------

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

/**
 * v3 - source-phrase -> EXACT enum class, for scope DERIVATION from authenticated source text (the consistency check
 * above only needs atoms). A phrase listed with null cannot be named exactly by the enum and blocks derivation - never
 * guessed. An unqualified "Restricted Subsidiary" denotes exactly the two restricted classes the enum splits it into.
 */
export const SOURCE_PHRASE_TAGS: readonly { re: RegExp; tags: EntityClassTag[] | null }[] = [
  { re: /^Unrestricted Subsidiar(?:y|ies)$/, tags: ["UNRESTRICTED_SUB"] },
  { re: /^Restricted Subsidiar(?:y|ies)$/, tags: ["GUARANTOR_RS", "NON_GUARANTOR_RS"] },
  { re: /^Material Subsidiar(?:y|ies)$/, tags: ["MATERIAL_SUBSIDIARY"] },
  { re: /^Immaterial Subsidiar(?:y|ies)$/, tags: ["IMMATERIAL_SUB"] },
  { re: /^Securitization Subsidiar(?:y|ies)$/, tags: ["SECURITIZATION_SUB"] },
  { re: /^(?:Foreign|Domestic|Excluded|Receivables|Insurance|Captive|Wholly[- ]Owned|Significant)\s+Subsidiar(?:y|ies)$/, tags: null },
  { re: /^Subsidiar(?:y|ies)$/, tags: ["ANY_SUBSIDIARY"] },
  { re: /^Borrowers?$/, tags: ["BORROWER"] },
  { re: /^(?:the|The)\s+(?:Company|Issuer|Co-Issuers?)$/, tags: ["BORROWER"] },
  { re: /^(?:Loan Part(?:y|ies)|Credit Part(?:y|ies)|Obligors?)$/, tags: ["LOAN_PARTY"] },
  { re: /^Guarantors?$/, tags: null },
];

/** The exact EntityClassTag value(s) a source binding phrase denotes, or null when the enum cannot name the class exactly. */
export function mapSourcePhraseToTags(phrase: string): EntityClassTag[] | null {
  for (const s of SOURCE_PHRASE_TAGS) if (s.re.test(phrase)) return s.tags;
  return null;
}

/** v3: the exact scope a set of OBLIGOR binding signals establishes, or null when any phrase is not exactly nameable (fail closed). */
export function deriveScopeFromSignals(signals: readonly { phrase: string }[]): EntityClassTag[] | null {
  if (signals.length === 0) return null;
  const out: EntityClassTag[] = [];
  for (const s of signals) {
    const tags = mapSourcePhraseToTags(s.phrase);
    if (!tags) return null;
    for (const t of tags) if (!out.includes(t)) out.push(t);
  }
  return out;
}

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

// SEMANTIC FIDELITY (v2): an entity mention that only names whose statements / metrics / periods a test is computed
// over is MEASUREMENT CONTEXT, not applicability. "fiscal quarter of the Parent Borrower and its Subsidiaries for which
// financial statements are available" names a reporting group; it does not widen who may incur. Generic vocabulary only.
const MEASUREMENT_LEAD = /(?:fiscal\s+(?:quarter|year|period)s?|(?:test|measurement|reporting|calculation)\s+periods?|financial\s+statements?|balance\s+sheet|consolidated\s+[A-Za-z\s]{0,40}?|EBITDA|net\s+income|total\s+assets|revenues?|indebtedness\s+to|leverage\s+ratio|coverage\s+ratio|cash\s+flow)\s+(?:of|for)\s+(?:the\s+)?(?:[A-Z][\w-]*\s+){0,3}$/;
const MEASUREMENT_FOLLOW = /^(?:\s+and\s+(?:its|their)\s+(?:Restricted\s+|Unrestricted\s+)?(?:Subsidiar(?:y|ies)|[A-Z][\w-]*))*\s*(?:,\s*)?(?:for\s+which\s+financial\s+statements|on\s+a\s+consolidated\s+basis|determined\s+on\s+a\s+consolidated|taken\s+as\s+a\s+whole|for\s+the\s+(?:most\s+recently|period|fiscal))/;
const GROUP_TAIL = /^\s+and\s+(?:its|their)\s+(?:Restricted\s+|Unrestricted\s+)?Subsidiar(?:y|ies)\b/;
// v3: a mention that names WHO MUST SATISFY a compliance / delivery / certification test in a proviso ("provided that the
// Borrower shall be in compliance with ...", "so long as the Company has delivered ...") is the subject of a condition,
// not the actor the provision binds or permits; applicability comes from the provision's own actor language or its
// governing chain. Generic vocabulary only.
const CONDITION_SUBJECT_FOLLOW = /^(?:\s+and\s+(?:its|their)\s+(?:Restricted\s+|Unrestricted\s+)?Subsidiar(?:y|ies))?\s+(?:shall|will|would|must|is|are|has|have|had|shall\s+have|will\s+have)\s+(?:be\s+|been\s+)?(?:in\s+(?:pro\s+forma\s+)?compliance|in\s+full\s+compliance|able\s+to|delivered|certif(?:y|ied|ies)|demonstrat(?:e|ed|es)|satisf(?:y|ied|ies))\b/;

/** Classifies one mention by its immediate context: measurement context when it sits inside a metric/period/statements phrase, otherwise an obligor binding. */
export function classifyEntityMentionRole(text: string, index: number, phraseLength: number): "OBLIGOR" | "MEASUREMENT_CONTEXT" | "CONDITION_SUBJECT" {
  const before = text.slice(Math.max(0, index - 90), index);
  const after = text.slice(index + phraseLength, index + phraseLength + 120);
  if (MEASUREMENT_LEAD.test(before)) return "MEASUREMENT_CONTEXT";
  if (MEASUREMENT_FOLLOW.test(after)) return "MEASUREMENT_CONTEXT";
  if (CONDITION_SUBJECT_FOLLOW.test(after)) return "CONDITION_SUBJECT";
  // "<Entity> and its Subsidiaries" immediately followed by a measurement tail: the group is the measurement group; the
  // Subsidiaries mention inside that group is measurement context as well
  const groupBefore = text.slice(Math.max(0, index - 40), index);
  if (/\band\s+(?:its|their)\s+(?:Restricted\s+|Unrestricted\s+)?$/.test(groupBefore)) {
    const head = text.slice(Math.max(0, index - 160), index);
    if (MEASUREMENT_LEAD.test(head.replace(/\s+and\s+(?:its|their)\s+(?:Restricted\s+|Unrestricted\s+)?$/, "")) || MEASUREMENT_FOLLOW.test(after)) return "MEASUREMENT_CONTEXT";
  }
  void GROUP_TAIL;
  return "OBLIGOR";
}

/** §5 - every explicit source-binding signal in `text`, with its exclusion context and its role. Pure, deterministic, no interpretation beyond the fixed vocabulary above. */
export function findEntityBindingSignals(text: string): Array<Pick<IREntityScopeSignal, "phrase" | "index" | "excludedContext" | "requiresAnyOf" | "role">> {
  const out: Array<Pick<IREntityScopeSignal, "phrase" | "index" | "excludedContext" | "requiresAnyOf" | "role">> = [];
  for (const spec of SIGNALS) {
    spec.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = spec.re.exec(text)) !== null) {
      const before = text.slice(Math.max(0, m.index - 60), m.index);
      out.push({ phrase: m[0], index: m.index, excludedContext: EXCLUSION_WINDOW.test(before), requiresAnyOf: spec.requiresAnyOf, role: classifyEntityMentionRole(text, m.index, m[0].length) });
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
    // the enumerator at a line start - or at the very start of the text (a sharded primary slice, or a region that begins at the cited unit)
    const lineStart = new RegExp(`(?<=(?:^|\\n)\\s*)${esc}(?=\\s)`, "g");
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

export interface EntityScopeWitness {
  ownExcerpt: string | null;
  citedUnitLeadIn: string | null;
  parentScopeLeadIn?: string | null;
  /** v3: the authenticated governing ancestor chain (governing-scope.ts); null when not resolved. */
  governingScope?: GoverningSemanticContext | null;
  /** v3: the candidate's operative text, so an own excerpt is admitted for DERIVATION only when it is verbatim source. */
  operativeText?: string | null;
}

/** Picks the source region bound to the rule by citation (longest matching sectionRef prefix, OPERATIVE preferred) and derives the cited-unit lead-in. `parentScopeTexts` (PARENT_SCOPE context items) supply the governing provision's lead-in as an INHERITED witness. */
export function entityScopeWitnessFor(rule: Pick<IRRule, "sourceSectionRef" | "provenance">, regions: readonly SourceContextRegion[] | null | undefined, parentScopeTexts?: readonly string[] | null, governingScope?: GoverningSemanticContext | null, operativeText?: string | null): EntityScopeWitness {
  const parentScopeLeadIn = (() => { const t = parentScopeTexts?.find((x) => x && x.trim().length > 0) ?? null; if (!t) return null; ENUM_MARKER.lastIndex = 0; const m = ENUM_MARKER.exec(t); return (m ? t.slice(0, m.index) : t.slice(0, 1500)).trim() || null; })();
  const ownExcerpt = rule.provenance?.excerpt?.trim() || null;
  let leadIn: string | null = null;
  if (regions && rule.sourceSectionRef) {
    const rt = refTokens(rule.sourceSectionRef);
    const candidates = regions
      .filter((r) => r.sectionRef && refTokens(r.sectionRef).section === rt.section)
      .sort((a, b) => (b.kind === "OPERATIVE" ? 1 : 0) - (a.kind === "OPERATIVE" ? 1 : 0) || refTokens(b.sectionRef!).path.length - refTokens(a.sectionRef!).path.length);
    for (const r of candidates) { leadIn = citedUnitLeadIn(r.text, r.sectionRef, rule.sourceSectionRef); if (leadIn) break; }
  }
  return { ownExcerpt, citedUnitLeadIn: leadIn, parentScopeLeadIn, governingScope: governingScope ?? null, operativeText: operativeText ?? null };
}

// ---------------------------------------------------------------------------
// §5-§9 - the guard itself. Pure: returns a new rule; never mutates input.
// ---------------------------------------------------------------------------
export interface EntityScopeGuardInput { tagNormalization: IREntityTagNormalization[]; rawEmitted: IREntityScopeAudit["rawEmitted"] }

const reasonText = (code: EntityScopeReasonCode, detail: string) => `${code}: ${detail}`;

const normWs = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function applyEntityScopeGuard(rule: IRRule, witness: EntityScopeWitness, tags: EntityScopeGuardInput): IRRule {
  const before = { entityScope: [...rule.entityScope], entityScopeExcluded: [...rule.entityScopeExcluded], sufficiency: rule.sufficiency };
  const reasons: string[] = [];
  const diagnostics: string[] = [];
  const codes: EntityScopeReasonCode[] = [];
  let entityScope = [...rule.entityScope];
  let entityScopeExcluded = [...rule.entityScopeExcluded];
  let sufficiency = rule.sufficiency;
  let status: IREntityScopeAudit["status"];
  let precedence: NonNullable<IREntityScopeAudit["precedence"]> = "NONE";
  let modelDiscrepancy: IREntityScopeAudit["modelDiscrepancy"] = null;
  const clip = (t: string | null) => (t && t.length > 1500 ? `${t.slice(0, 1500)} ...` : t);
  const gov = witness.governingScope ?? null;
  const govBasis = gov?.inheritedEntityScopeBasis ?? null;
  const govRegion = govBasis ? gov!.ancestorRegions.find((r) => r.regionId === govBasis.regionId) ?? null : null;
  const governingDerived: EntityClassTag[] | null = gov?.inheritedEntityScope ?? null;
  let witnessOut: IREntityScopeAudit["witness"] = {
    ownExcerpt: clip(witness.ownExcerpt), citedUnitLeadIn: clip(witness.citedUnitLeadIn), parentScopeLeadIn: clip(witness.parentScopeLeadIn ?? null), decidedBy: "NONE", signals: [],
    governingScope: gov ? { derivedScope: governingDerived, basisSectionRef: govBasis?.sectionRef ?? null, basisRole: govBasis?.role ?? null, ancestorDistance: govRegion?.ancestorDistance ?? null, phrases: govBasis?.phrases ?? [], evidence: govBasis?.evidence ?? null } : null,
  };

  const limit = (code: EntityScopeReasonCode, detail: string) => {
    codes.push(code);
    reasons.push(reasonText(code, detail));
    if (sufficiency === "COMPLETE") { sufficiency = "PARTIAL"; }
  };
  const tiersOf = (xs: IREntityScopeSignal[]): IREntityScopeAudit["witness"]["decidedBy"] => { const t = new Set(xs.map((x) => x.tier)); return t.size >= 2 ? "BOTH" : t.has("OWN_EXCERPT") ? "OWN_EXCERPT" : t.has("CITED_UNIT_LEAD_IN") ? "CITED_UNIT_LEAD_IN" : t.has("PARENT_SCOPE") ? "PARENT_SCOPE" : t.has("GOVERNING_SCOPE") ? "GOVERNING_SCOPE" : "NONE"; };
  const relationOf = (model: EntityClassTag[], source: EntityClassTag[]): NonNullable<IREntityScopeAudit["modelDiscrepancy"]>["relation"] => sameSet(model, source) ? "AGREES" : model.every((t) => source.includes(t)) ? "MODEL_NARROWER" : source.every((t) => model.includes(t)) ? "MODEL_WIDER" : "MODEL_DIFFERENT";

  // The rule's OWN bound texts are evaluated against the (pre-guard) model scope. Only OBLIGOR mentions bind
  // applicability; MEASUREMENT_CONTEXT and CONDITION_SUBJECT mentions are recorded but never widen, narrow or contradict it.
  const scopeForSignals = entityScope;
  const ownSignals = [
    ...(witness.ownExcerpt ? evaluateSignals("OWN_EXCERPT", witness.ownExcerpt, scopeForSignals) : []),
    ...(witness.citedUnitLeadIn ? evaluateSignals("CITED_UNIT_LEAD_IN", witness.citedUnitLeadIn, scopeForSignals) : []),
  ];
  const binding = ownSignals.filter((s) => !s.excludedContext && s.role !== "MEASUREMENT_CONTEXT" && s.role !== "CONDITION_SUBJECT");
  // v3 derivation from OWN source: the cited unit's lead-in is deterministic source; the excerpt is admitted only when it is verbatim operative text.
  const excerptVerbatim = !!witness.ownExcerpt && !!witness.operativeText && normWs(witness.operativeText).includes(normWs(witness.ownExcerpt));
  const ownDerivable = binding.filter((s) => s.tier === "CITED_UNIT_LEAD_IN" || (s.tier === "OWN_EXCERPT" && excerptVerbatim));
  const ownDerived = binding.length > 0 && ownDerivable.length === binding.length ? deriveScopeFromSignals(binding) : null;
  const parentSignals = witness.parentScopeLeadIn ? evaluateSignals("PARENT_SCOPE", witness.parentScopeLeadIn, scopeForSignals).filter((s) => !s.excludedContext && s.role !== "MEASUREMENT_CONTEXT" && s.role !== "CONDITION_SUBJECT") : [];
  const governingSignals: IREntityScopeSignal[] = govRegion && govRegion.role !== "PARENT_SCOPE" ? evaluateSignals("GOVERNING_SCOPE", govRegion.text, scopeForSignals).filter((s) => !s.excludedContext && s.role !== "MEASUREMENT_CONTEXT" && s.role !== "CONDITION_SUBJECT") : [];
  witnessOut = { ...witnessOut, signals: [...ownSignals, ...parentSignals, ...governingSignals] };
  const govTier: IREntityScopeAudit["witness"]["decidedBy"] = govBasis?.role === "PARENT_SCOPE" ? "PARENT_SCOPE" : "GOVERNING_SCOPE";

  const unrecognized = tags.tagNormalization.filter((t) => t.outcome === "UNRECOGNIZED_ENTITY_TAG");
  const rawEmitted = [...(tags.rawEmitted.entityScope ?? []), ...(tags.rawEmitted.entityScopeExcluded ?? [])];
  const inInclude = unrecognized.some((u) => u.field !== "entityScopeExcluded" && u.field !== "ENTITY_SCOPE_REFERENCE.exclude");
  const inExclude = unrecognized.some((u) => u.field === "entityScopeExcluded" || u.field === "ENTITY_SCOPE_REFERENCE.exclude");

  // v3 precedence: a mechanically established source scope (own actor language, else governing chain) decides.
  const sourceDerived: { scope: EntityClassTag[]; precedence: "OWN_OPERATIVE_LANGUAGE" | "GOVERNING_SCOPE_SOURCE"; decidedBy: IREntityScopeAudit["witness"]["decidedBy"]; detail: string } | null =
    ownDerived ? { scope: ownDerived, precedence: "OWN_OPERATIVE_LANGUAGE", decidedBy: tiersOf(binding), detail: `the rule's own actor language (${[...new Set(binding.map((s) => `"${s.phrase}"`))].join(", ")}) establishes the applicability exactly` }
    : binding.length === 0 && governingDerived && govBasis ? { scope: governingDerived, precedence: "GOVERNING_SCOPE_SOURCE", decidedBy: govTier, detail: `the rule's own text binds no obligor class; the authenticated governing ${govBasis.role === "PARENT_SCOPE" ? "parent provision" : "ancestor scope"} ${govBasis.sectionRef} (${govBasis.phrases.map((p) => `"${p}"`).join(", ")}) establishes the applicability exactly` }
    : null;

  if (unrecognized.length > 0 && inInclude && !inExclude && sourceDerived) {
    // §4 + v3: the unrecognized model tag is never guessed - but it does not control the result when authenticated source
    // establishes the applicability on its own. The raw tag and the discrepancy are preserved; the scope is source-derived.
    status = "SOURCE_SCOPE_DERIVED";
    precedence = sourceDerived.precedence;
    entityScope = [...sourceDerived.scope];
    witnessOut.decidedBy = sourceDerived.decidedBy;
    modelDiscrepancy = { modelScope: [...before.entityScope], rawEmitted, governingScope: [...sourceDerived.scope], relation: "MODEL_UNRECOGNIZED" };
    codes.push("ENTITY_SCOPE_UNRECOGNIZED_TAG", "ENTITY_SCOPE_SOURCE_DERIVED", "ENTITY_SCOPE_MODEL_DISCREPANCY_RECORDED");
    diagnostics.push(`ENTITY_SCOPE_UNRECOGNIZED_TAG: wire entity tag(s) ${unrecognized.map((u) => `"${u.raw}" (${u.field})`).join(", ")} are not EntityClassTag values; preserved verbatim in entityScopeAudit, not guessed - outranked by the source-derived scope`);
    reasons.push(reasonText("ENTITY_SCOPE_SOURCE_DERIVED", `entityScope ${JSON.stringify(entityScope)} - ${sourceDerived.detail}; the model's emitted scope ${JSON.stringify(rawEmitted)} is recorded as a discrepancy and did not control the result`));
  } else if (unrecognized.length > 0) {
    // §4: never a silent drop. The affected field is made non-authoritative (unspecified) and the rule limited; the raw tag is preserved in the audit, its meaning never guessed.
    status = "UNRECOGNIZED_TAG";
    precedence = "NONE";
    if (inInclude) entityScope = [];
    if (inExclude) entityScopeExcluded = [];
    limit("ENTITY_SCOPE_UNRECOGNIZED_TAG", `wire entity tag(s) ${unrecognized.map((u) => `"${u.raw}" (${u.field})`).join(", ")} are not EntityClassTag values; the affected scope field is reset to unspecified and the tag is preserved verbatim in entityScopeAudit - its meaning is not guessed${gov ? "; no authenticated source established the applicability exactly" : ""}`);
  } else if (entityScope.length === 0 && sourceDerived?.precedence === "GOVERNING_SCOPE_SOURCE") {
    // The clause's own text binds no obligor and the model named nobody. The authenticated
    // governing chain is the applicability. Own-excerpt or cited-unit derivation is not
    // applied to an empty submission: that would add tags the submission did not carry,
    // including a prohibition lead-in's obligor set onto a permission that named nobody.
    // A later pass over a scope this guard already reset must not refill those tags.
    status = "SOURCE_SCOPE_DERIVED";
    precedence = sourceDerived.precedence;
    entityScope = [...sourceDerived.scope];
    witnessOut.decidedBy = sourceDerived.decidedBy;
    modelDiscrepancy = { modelScope: [], rawEmitted, governingScope: [...sourceDerived.scope], relation: "MODEL_NARROWER" };
    codes.push("ENTITY_SCOPE_SOURCE_DERIVED", "ENTITY_SCOPE_MODEL_DISCREPANCY_RECORDED");
    reasons.push(reasonText("ENTITY_SCOPE_SOURCE_DERIVED", `entityScope ${JSON.stringify(entityScope)} - ${sourceDerived.detail}; the model emitted no scope`));
  } else if (entityScope.length === 0) {
    status = "UNSPECIFIED";
    codes.push("ENTITY_SCOPE_UNSPECIFIED");
  } else {
    const unmet = binding.filter((s) => !s.satisfied);
    if (binding.length === 0 && sourceDerived?.precedence === "GOVERNING_SCOPE_SOURCE") {
      // v3 §11: the governing chain establishes the applicability exactly; the model's scope corroborates or is outranked.
      const relation = relationOf(entityScope, sourceDerived.scope);
      modelDiscrepancy = { modelScope: [...before.entityScope], rawEmitted, governingScope: [...sourceDerived.scope], relation };
      if (relation === "AGREES") {
        status = "SOURCE_MATCH_CONFIRMED";
        precedence = "GOVERNING_SCOPE_SOURCE";
        witnessOut.decidedBy = sourceDerived.decidedBy;
        codes.push("ENTITY_SCOPE_SOURCE_MATCH_CONFIRMED");
        reasons.push(reasonText("ENTITY_SCOPE_SOURCE_MATCH_CONFIRMED", `applicability inherited from the governing ${govBasis!.role === "PARENT_SCOPE" ? "provision's lead-in (PARENT_SCOPE witness)" : `ancestor scope ${govBasis!.sectionRef} (GOVERNING_SCOPE witness)`} - the rule's own text binds no obligor class; the model's scope agrees`));
      } else {
        status = "SOURCE_SCOPE_DERIVED";
        precedence = "GOVERNING_SCOPE_SOURCE";
        entityScope = [...sourceDerived.scope];
        witnessOut.decidedBy = sourceDerived.decidedBy;
        codes.push("ENTITY_SCOPE_SOURCE_DERIVED", "ENTITY_SCOPE_MODEL_DISCREPANCY_RECORDED");
        reasons.push(reasonText("ENTITY_SCOPE_SOURCE_DERIVED", `entityScope ${JSON.stringify(entityScope)} - ${sourceDerived.detail}; the model's scope ${JSON.stringify(before.entityScope)} (${relation}) is recorded as a discrepancy and did not control the result`));
      }
    } else if (binding.length === 0 && parentSignals.length > 0 && parentSignals.every((s) => s.satisfied) && !parentSignals.some((s) => s.partialOnly)) {
      // v2 §7 (inheritance, kept): the parent lead-in witnesses the model scope when no exact derivation is available.
      status = "SOURCE_MATCH_CONFIRMED";
      precedence = "MODEL_EMITTED";
      witnessOut.decidedBy = "PARENT_SCOPE";
      codes.push("ENTITY_SCOPE_SOURCE_MATCH_CONFIRMED");
      reasons.push(reasonText("ENTITY_SCOPE_SOURCE_MATCH_CONFIRMED", `applicability inherited from the governing provision's lead-in (PARENT_SCOPE witness) - the rule's own text binds no obligor class`));
    } else if (binding.length === 0) {
      // §10 case F: no explicit entity-binding language in any bound source - no invented correction.
      status = "UNWITNESSED";
      precedence = "MODEL_EMITTED";
      codes.push("ENTITY_SCOPE_UNWITNESSED");
    } else if (unmet.length > 0 && ownDerived) {
      const relation = relationOf(entityScope, ownDerived);
      modelDiscrepancy = { modelScope: [...before.entityScope], rawEmitted, governingScope: [...ownDerived], relation };
      if (relation === "MODEL_NARROWER" || relation === "MODEL_DIFFERENT") {
        // The cited text names classes the submitted scope does not cover. Adopting that
        // wider set would turn a borrower-only permission into the governing prohibition's
        // obligor set. Reset. Do not add a tag the submission did not carry.
        status = "UNDERINCLUSIVE_VS_SOURCE";
        precedence = "NONE";
        witnessOut.decidedBy = tiersOf(unmet);
        entityScope = [];
        const where = witnessOut.decidedBy === "OWN_EXCERPT" ? "the rule's own provenance excerpt" : witnessOut.decidedBy === "CITED_UNIT_LEAD_IN" ? `the lead-in of the cited unit ${rule.sourceSectionRef ?? ""}` : `the rule's own excerpt and the lead-in of the cited unit ${rule.sourceSectionRef ?? ""}`;
        limit("ENTITY_SCOPE_UNDERINCLUSIVE_VS_SOURCE", `entityScope ${JSON.stringify(before.entityScope)} does not cover source binding ${[...new Set(unmet.map((s) => `"${s.phrase}"`))].join(", ")} (witness: ${where}); the cited text names ${JSON.stringify(ownDerived)} and that wider set was not adopted`);
      } else {
        // The clause's own actor language is a narrower exact set. Use it, and do not leave the rule COMPLETE.
        status = "SOURCE_SCOPE_DERIVED";
        precedence = "OWN_OPERATIVE_LANGUAGE";
        entityScope = [...ownDerived];
        witnessOut.decidedBy = tiersOf(binding);
        codes.push("ENTITY_SCOPE_MODEL_DISCREPANCY_RECORDED");
        limit("ENTITY_SCOPE_SOURCE_DERIVED", `entityScope ${JSON.stringify(entityScope)} - ${sourceDerived!.detail}; the model's scope ${JSON.stringify(before.entityScope)} touched no class for source binding ${[...new Set(unmet.map((s) => `"${s.phrase}"`))].join(", ")} and is recorded as a discrepancy`);
      }
    } else if (unmet.length > 0) {
      // §6: provable under-inclusion. Remove the false precision; never widen by guess.
      status = "UNDERINCLUSIVE_VS_SOURCE";
      precedence = "NONE";
      witnessOut.decidedBy = tiersOf(unmet);
      entityScope = [];
      const where = witnessOut.decidedBy === "OWN_EXCERPT" ? "the rule's own provenance excerpt" : witnessOut.decidedBy === "CITED_UNIT_LEAD_IN" ? `the lead-in of the cited unit ${rule.sourceSectionRef ?? ""}` : `the rule's own excerpt and the lead-in of the cited unit ${rule.sourceSectionRef ?? ""}`;
      limit("ENTITY_SCOPE_UNDERINCLUSIVE_VS_SOURCE", `entityScope ${JSON.stringify(before.entityScope)} touches no class for source binding ${[...new Set(unmet.map((s) => `"${s.phrase}"`))].join(", ")} (witness: ${where}); scope reset to unspecified, not widened by guess`);
    } else if (binding.some((s) => s.partialOnly)) {
      status = "AMBIGUOUS_VS_SOURCE";
      precedence = "MODEL_EMITTED";
      witnessOut.decidedBy = tiersOf(binding.filter((s) => s.partialOnly));
      codes.push("ENTITY_SCOPE_AMBIGUOUS_VS_SOURCE");
      reasons.push(reasonText("ENTITY_SCOPE_AMBIGUOUS_VS_SOURCE", `entityScope ${JSON.stringify(entityScope)} covers source binding ${[...new Set(binding.filter((s) => s.partialOnly).map((s) => `"${s.phrase}"`))].join(", ")} only through a qualified subset class; not provably inconsistent, so the scope is kept but is not safe to rely on`));
    } else if (ownDerived && relationOf(entityScope, ownDerived) === "MODEL_WIDER") {
      // The clause's own actor language is an exact set. A submitted scope that adds classes the clause
      // does not name is wider than that set, even when every required atom is touched. Covering the
      // narrower set is not confirmation of the wider set. The governing lead-in does not widen it.
      status = "SOURCE_SCOPE_DERIVED";
      precedence = "OWN_OPERATIVE_LANGUAGE";
      modelDiscrepancy = { modelScope: [...before.entityScope], rawEmitted, governingScope: [...ownDerived], relation: "MODEL_WIDER" };
      entityScope = [...ownDerived];
      witnessOut.decidedBy = tiersOf(binding);
      codes.push("ENTITY_SCOPE_MODEL_DISCREPANCY_RECORDED");
      limit("ENTITY_SCOPE_SOURCE_DERIVED", `entityScope ${JSON.stringify(entityScope)} - the clause's own operative language names a narrower obligor set than the submitted scope ${JSON.stringify(before.entityScope)}; the wider scope is recorded as a discrepancy and did not control the result`);
    } else {
      status = "SOURCE_MATCH_CONFIRMED";
      precedence = ownDerived ? "OWN_OPERATIVE_LANGUAGE" : "MODEL_EMITTED";
      witnessOut.decidedBy = tiersOf(binding);
      codes.push("ENTITY_SCOPE_SOURCE_MATCH_CONFIRMED");
    }
  }

  const audit: IREntityScopeAudit = {
    guardVersion: ENTITY_SCOPE_GUARD_VERSION,
    status: status!,
    safeToRely: status! === "SOURCE_MATCH_CONFIRMED" || status! === "UNSPECIFIED" || status! === "SOURCE_SCOPE_DERIVED",
    reasonCodes: codes,
    rawEmitted: tags.rawEmitted,
    tagNormalization: tags.tagNormalization,
    before,
    witness: witnessOut,
    precedence,
    modelDiscrepancy,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
  return { ...rule, entityScope, entityScopeExcluded, sufficiency, sufficiencyReasons: [...rule.sufficiencyReasons, ...reasons], entityScopeAudit: audit };
}

/** Replay helper (zero-cost): guard an already-normalized rule against its bound source regions. The raw wire is not available on a replay, which the audit says explicitly. */
export function replayEntityScopeGuard(rule: IRRule, regions: readonly SourceContextRegion[] | null | undefined): IRRule {
  return applyEntityScopeGuard(rule, entityScopeWitnessFor(rule, regions), { tagNormalization: [], rawEmitted: { entityScope: null, entityScopeExcluded: null, source: "NOT_PERSISTED" } });
}
