/**
 * SEMANTIC VERIFICATION PROJECTION (Phase 3C Layer 2 input fidelity).
 *
 * THE one definition of what the independent adversarial reviewer is shown of a compiled candidate. Every field of
 * IRRule / IRDefinition / IRSharedCapacity is classified explicitly:
 *
 *   REVIEW_SEMANTIC            legally material proposed semantics - always projected, verbatim (sanitized of internal ids)
 *   REVIEW_CONTEXTUAL          helps the reviewer locate / situate the proposal (source document, provenance, lineage,
 *                              operative lineage, the compiler-side entity audit) - projected under `reviewContext`,
 *                              labelled so it is never mistaken for source truth
 *   EXCLUDE_INTERNAL_METADATA  identity / versioning / hashing machinery with no legal meaning - never projected
 *
 * The classification maps are `satisfies Record<keyof IRRule, ProjectionClass>` (and the same for the other two unit
 * types): adding a field to the IR without classifying it here is a COMPILE ERROR. That is the anti-regression gate for
 * the defect this module closes - the second certified live run's reviewer was handed a hand-written subset of the IR
 * that predated `sourceDependencies`, so it could not see a typed REQUIRES dependency and reported the requirement as
 * dropped (P3-VP1, docs/phase-3-live-validation/7.2c-rerun-operative-state/).
 *
 * Independence contract: the projection shows WHAT the compiler proposes, never that it is correct. Sufficiency is
 * projected as an explicit compiler CLAIM. No certification status, benchmark answer, verifier status or execution
 * outcome is ever part of the projection. The projection is a faithful view of the exact snapshotted units: it adds,
 * infers, repairs and replaces nothing.
 */
import crypto from "node:crypto";
import type { IRDefinition, IREntityScopeAudit, IRRule, IRSharedCapacity, IRSourceReferenceAudit } from "../../ir/types";

// v2 (governing scope / reference fidelity closure): inherited attributes carry canonicalValue / compatibility / span;
// the entity-scope audit projects the governing-scope derivation and the recorded model discrepancy; the
// source-reference audit (raw model references, their classification, what was excluded or restored) is projected as a
// labelled NON-AUTHORITATIVE diagnostic under reviewContext, never beside the authoritative targets.
// v3 (source-authority closure): every cross-rule / dependency target carries its source-derived `selector`; dependency
// descriptions are status-neutral (no "certified unit" wording reaches Layer 2).
export const SEMANTIC_VERIFICATION_PROJECTION_VERSION = "phase-3c-verification-projection.v3" as const;

export type ProjectionClass = "REVIEW_SEMANTIC" | "REVIEW_CONTEXTUAL" | "EXCLUDE_INTERNAL_METADATA";

/** Every IRRule field, classified. Missing or extra keys fail to compile. */
export const RULE_FIELD_CLASSIFICATION = {
  ruleId: "REVIEW_SEMANTIC",
  irSchemaVersion: "EXCLUDE_INTERNAL_METADATA",
  companyId: "EXCLUDE_INTERNAL_METADATA",
  instrumentKey: "EXCLUDE_INTERNAL_METADATA",
  sourceDocumentId: "REVIEW_CONTEXTUAL",
  sourceSectionRef: "REVIEW_SEMANTIC",
  covenantFamily: "REVIEW_SEMANTIC",
  ruleType: "REVIEW_SEMANTIC",
  posture: "REVIEW_SEMANTIC",
  action: "REVIEW_SEMANTIC",
  entityScope: "REVIEW_SEMANTIC",
  entityScopeExcluded: "REVIEW_SEMANTIC",
  entityScopeAudit: "REVIEW_CONTEXTUAL",
  transactionScope: "REVIEW_SEMANTIC",
  capacityExpression: "REVIEW_SEMANTIC",
  conditions: "REVIEW_SEMANTIC",
  exceptions: "REVIEW_SEMANTIC",
  dependsOn: "REVIEW_SEMANTIC",
  unresolvedDependencies: "REVIEW_SEMANTIC",
  sourceDependencies: "REVIEW_SEMANTIC",
  inheritedAttributes: "REVIEW_SEMANTIC",
  sourceReferenceAudit: "REVIEW_CONTEXTUAL",
  operativeLineage: "REVIEW_CONTEXTUAL",
  sufficiency: "REVIEW_SEMANTIC",
  sufficiencyReasons: "REVIEW_SEMANTIC",
  provenance: "REVIEW_CONTEXTUAL",
  compilerVersion: "EXCLUDE_INTERNAL_METADATA",
  sourceContentVersion: "EXCLUDE_INTERNAL_METADATA",
  inventoryItemIds: "REVIEW_CONTEXTUAL",
} as const satisfies Record<keyof IRRule, ProjectionClass>;

/** Every IRDefinition field, classified. */
export const DEFINITION_FIELD_CLASSIFICATION = {
  definitionId: "REVIEW_SEMANTIC",
  irSchemaVersion: "EXCLUDE_INTERNAL_METADATA",
  companyId: "EXCLUDE_INTERNAL_METADATA",
  instrumentKey: "EXCLUDE_INTERNAL_METADATA",
  sourceDocumentId: "REVIEW_CONTEXTUAL",
  termName: "REVIEW_SEMANTIC",
  covenantFamily: "REVIEW_SEMANTIC",
  calculationExpression: "REVIEW_SEMANTIC",
  dependsOnTerms: "REVIEW_SEMANTIC",
  sufficiency: "REVIEW_SEMANTIC",
  sufficiencyReasons: "REVIEW_SEMANTIC",
  provenance: "REVIEW_CONTEXTUAL",
  compilerVersion: "EXCLUDE_INTERNAL_METADATA",
  sourceContentVersion: "EXCLUDE_INTERNAL_METADATA",
  inventoryItemIds: "REVIEW_CONTEXTUAL",
} as const satisfies Record<keyof IRDefinition, ProjectionClass>;

/** Every IRSharedCapacity field, classified. */
export const SHARED_CAPACITY_FIELD_CLASSIFICATION = {
  sharedCapId: "REVIEW_SEMANTIC",
  companyId: "EXCLUDE_INTERNAL_METADATA",
  instrumentKey: "EXCLUDE_INTERNAL_METADATA",
  description: "REVIEW_SEMANTIC",
  capExpression: "REVIEW_SEMANTIC",
  memberRuleIds: "REVIEW_SEMANTIC",
  provenance: "REVIEW_CONTEXTUAL",
  inventoryItemIds: "REVIEW_CONTEXTUAL",
  irSchemaVersion: "EXCLUDE_INTERNAL_METADATA",
  compilerVersion: "EXCLUDE_INTERNAL_METADATA",
  sourceContentVersion: "EXCLUDE_INTERNAL_METADATA",
} as const satisfies Record<keyof IRSharedCapacity, ProjectionClass>;

/** The compiler's own self-assessment is a claim to test, never proof. Projected under this label on every unit. */
export const SUFFICIENCY_CLAIM_NOTE = "CLAIM MADE BY THE COMPILER - a self-assessment to test against the source, never evidence of correctness";
/** The entity-scope guard is deterministic compiler-side machinery; its output is context, not source evidence. */
export const ENTITY_SCOPE_AUDIT_NOTE = "DETERMINISTIC COMPILER-SIDE AUDIT - NOT SOURCE EVIDENCE; compare the final entityScope against the source yourself";
/** The source-reference audit lists raw model references that were excluded or restored; it is never a semantic claim. */
export const SOURCE_REFERENCE_AUDIT_NOTE = "NON-AUTHORITATIVE DIAGNOSTIC - raw model references classified against the references the source states; only the targets listed in conditions / sourceDependencies are the proposed semantics";

/** Internal identity keys that may appear inside nested expressions / provenance machinery and carry no legal meaning. */
const INTERNAL_NESTED_KEYS: ReadonlySet<string> = new Set(["exprId", "irSchemaVersion", "compilerVersion", "sourceContentVersion", "companyId", "instrumentKey"]);

/** Deep copy that drops internal identity keys; values are never altered, only omitted when they are internal metadata. */
export function sanitizeForReview<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => sanitizeForReview(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) { if (INTERNAL_NESTED_KEYS.has(k)) continue; out[k] = sanitizeForReview(v); }
    return out as T;
  }
  return value;
}

export interface ProjectedSufficiencyClaim { sufficiency: string; sufficiencyReasons: string[]; note: typeof SUFFICIENCY_CLAIM_NOTE }
export interface ProjectedEntityScopeAudit {
  note: typeof ENTITY_SCOPE_AUDIT_NOTE; guardVersion: string; status: string; safeToRely: boolean; reasonCodes: string[]; decidedBy: string | null;
  precedence: string | null;
  governingScope: { derivedScope: string[] | null; basisSectionRef: string | null; basisRole: string | null; ancestorDistance: number | null; phrases: string[]; evidence: string | null } | null;
  modelDiscrepancy: { modelScope: string[]; rawEmitted: string[]; governingScope: string[]; relation: string } | null;
  signals: { phrase: string; index: number; role: string | null; tier: string; satisfied: boolean }[];
}
export interface ProjectedSourceReferenceAudit { note: typeof SOURCE_REFERENCE_AUDIT_NOTE; version: string; statedReferences: { raw: string; normalized: string | null; origin: string }[]; entries: { path: string; emitted: string; classification: string; authoritative: boolean; restoredTo: string | null; statedRefs: string[]; detail: string }[] }

export interface ProjectedRule {
  unitKind: "RULE";
  ruleId: string; sourceSectionRef: string | null; covenantFamily: string; ruleType: string; posture: string; action: string | null;
  entityScope: string[]; entityScopeExcluded: string[]; transactionScope: string[] | null;
  capacityExpression: unknown; conditions: unknown[]; exceptions: unknown[]; dependsOn: unknown[]; unresolvedDependencies: unknown[]; sourceDependencies: unknown[]; inheritedAttributes: unknown[];
  compilerSufficiencyClaim: ProjectedSufficiencyClaim;
  reviewContext: { sourceDocumentId: string; operativeLineage: unknown; provenance: unknown; inventoryItemIds: string[]; entityScopeAudit: ProjectedEntityScopeAudit | null; sourceReferenceAudit: ProjectedSourceReferenceAudit | null };
}
export interface ProjectedDefinition {
  unitKind: "DEFINITION";
  definitionId: string; termName: string; covenantFamily: string; calculationExpression: unknown; dependsOnTerms: string[];
  compilerSufficiencyClaim: ProjectedSufficiencyClaim;
  reviewContext: { sourceDocumentId: string; provenance: unknown; inventoryItemIds: string[] };
}
export interface ProjectedSharedCapacity {
  unitKind: "SHARED_CAPACITY";
  sharedCapId: string; description: string; capExpression: unknown; memberRuleIds: string[];
  reviewContext: { provenance: unknown; inventoryItemIds: string[] };
}
export interface SemanticVerificationProjection {
  projectionVersion: typeof SEMANTIC_VERIFICATION_PROJECTION_VERSION;
  independence: string;
  rules: ProjectedRule[];
  definitions: ProjectedDefinition[];
  sharedCapacities: ProjectedSharedCapacity[];
}

const INDEPENDENCE_STATEMENT = "This is the complete proposed representation. It states what the compiler proposes, not that the proposal is correct. Nothing here is an answer key; every sufficiency value is the compiler's own claim.";

function projectEntityScopeAudit(a: IREntityScopeAudit | undefined): ProjectedEntityScopeAudit | null {
  if (!a) return null;
  const w = a.witness as { decidedBy?: string | null; signals?: { phrase: string; index: number; role?: string | null; tier: string; satisfied: boolean }[]; governingScope?: ProjectedEntityScopeAudit["governingScope"] } | undefined;
  return {
    note: ENTITY_SCOPE_AUDIT_NOTE, guardVersion: a.guardVersion, status: a.status, safeToRely: a.safeToRely, reasonCodes: [...a.reasonCodes], decidedBy: w?.decidedBy ?? null,
    precedence: a.precedence ?? null,
    governingScope: w?.governingScope ? { derivedScope: w.governingScope.derivedScope ? [...w.governingScope.derivedScope] : null, basisSectionRef: w.governingScope.basisSectionRef, basisRole: w.governingScope.basisRole, ancestorDistance: w.governingScope.ancestorDistance, phrases: [...w.governingScope.phrases], evidence: w.governingScope.evidence } : null,
    modelDiscrepancy: a.modelDiscrepancy ? { modelScope: [...a.modelDiscrepancy.modelScope], rawEmitted: [...a.modelDiscrepancy.rawEmitted], governingScope: [...a.modelDiscrepancy.governingScope], relation: a.modelDiscrepancy.relation } : null,
    signals: (w?.signals ?? []).map((s) => ({ phrase: s.phrase, index: s.index, role: s.role ?? null, tier: s.tier, satisfied: s.satisfied })),
  };
}
function projectSourceReferenceAudit(a: IRSourceReferenceAudit | undefined): ProjectedSourceReferenceAudit | null {
  if (!a) return null;
  return { note: SOURCE_REFERENCE_AUDIT_NOTE, version: a.version, statedReferences: a.statedReferences.map((r) => ({ raw: r.raw, normalized: r.normalized, origin: r.origin })), entries: a.entries.map((e) => ({ path: e.path, emitted: e.emitted, classification: e.classification, authoritative: e.authoritative, restoredTo: e.restoredTo, statedRefs: [...e.statedRefs], detail: e.detail })) };
}

/** Runtime guard mirroring the compile-time `satisfies`: a unit carrying a key the classification does not know is a projection gap. */
function assertClassified(unit: object, classification: Record<string, ProjectionClass>, kind: string): void {
  const unknown = Object.keys(unit).filter((k) => !(k in classification));
  if (unknown.length > 0) throw new Error(`semantic verification projection: ${kind} carries unclassified field(s) ${unknown.join(", ")} - classify them in projection.ts before any review`);
}

export function projectRule(r: IRRule): ProjectedRule {
  assertClassified(r, RULE_FIELD_CLASSIFICATION, "IRRule");
  return {
    unitKind: "RULE",
    ruleId: r.ruleId, sourceSectionRef: r.sourceSectionRef, covenantFamily: r.covenantFamily, ruleType: r.ruleType, posture: r.posture, action: r.action,
    entityScope: [...r.entityScope], entityScopeExcluded: [...r.entityScopeExcluded], transactionScope: r.transactionScope ? [...r.transactionScope] : null,
    capacityExpression: sanitizeForReview(r.capacityExpression), conditions: sanitizeForReview(r.conditions), exceptions: sanitizeForReview(r.exceptions),
    dependsOn: sanitizeForReview(r.dependsOn), unresolvedDependencies: sanitizeForReview(r.unresolvedDependencies ?? []), sourceDependencies: sanitizeForReview(r.sourceDependencies ?? []), inheritedAttributes: sanitizeForReview(r.inheritedAttributes ?? []),
    compilerSufficiencyClaim: { sufficiency: r.sufficiency, sufficiencyReasons: [...r.sufficiencyReasons], note: SUFFICIENCY_CLAIM_NOTE },
    reviewContext: { sourceDocumentId: r.sourceDocumentId, operativeLineage: sanitizeForReview(r.operativeLineage), provenance: sanitizeForReview(r.provenance), inventoryItemIds: [...(r.inventoryItemIds ?? [])], entityScopeAudit: projectEntityScopeAudit(r.entityScopeAudit), sourceReferenceAudit: projectSourceReferenceAudit(r.sourceReferenceAudit) },
  };
}

export function projectDefinition(d: IRDefinition): ProjectedDefinition {
  assertClassified(d, DEFINITION_FIELD_CLASSIFICATION, "IRDefinition");
  return {
    unitKind: "DEFINITION",
    definitionId: d.definitionId, termName: d.termName, covenantFamily: d.covenantFamily, calculationExpression: sanitizeForReview(d.calculationExpression), dependsOnTerms: [...d.dependsOnTerms],
    compilerSufficiencyClaim: { sufficiency: d.sufficiency, sufficiencyReasons: [...d.sufficiencyReasons], note: SUFFICIENCY_CLAIM_NOTE },
    reviewContext: { sourceDocumentId: d.sourceDocumentId, provenance: sanitizeForReview(d.provenance), inventoryItemIds: [...(d.inventoryItemIds ?? [])] },
  };
}

export function projectSharedCapacity(c: IRSharedCapacity): ProjectedSharedCapacity {
  assertClassified(c, SHARED_CAPACITY_FIELD_CLASSIFICATION, "IRSharedCapacity");
  return {
    unitKind: "SHARED_CAPACITY",
    sharedCapId: c.sharedCapId, description: c.description, capExpression: sanitizeForReview(c.capExpression), memberRuleIds: [...c.memberRuleIds],
    reviewContext: { provenance: sanitizeForReview(c.provenance), inventoryItemIds: [...(c.inventoryItemIds ?? [])] },
  };
}

export interface ProjectableUnits { rules: readonly IRRule[]; definitions: readonly IRDefinition[]; sharedCapacities?: readonly IRSharedCapacity[] | null }

/** The one semantic review projection: every unit the compilation proposes, exhaustively classified, nothing inferred. */
export function buildSemanticVerificationProjection(units: ProjectableUnits): SemanticVerificationProjection {
  return {
    projectionVersion: SEMANTIC_VERIFICATION_PROJECTION_VERSION,
    independence: INDEPENDENCE_STATEMENT,
    rules: units.rules.map(projectRule),
    definitions: units.definitions.map(projectDefinition),
    sharedCapacities: (units.sharedCapacities ?? []).map(projectSharedCapacity),
  };
}

/** Deterministic JSON: object keys sorted recursively, arrays in order. No timestamps exist in a projection. */
export function canonicalProjectionJson(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(value));
}

/** sha256 over the canonical projection JSON: proof of exactly what Layer 2 was shown. */
export function computeSemanticVerificationProjectionHash(projection: SemanticVerificationProjection): string {
  return crypto.createHash("sha256").update(canonicalProjectionJson(projection)).digest("hex");
}

/** Diagnostic Markdown rendering of the projection (runners / evidence). Renders the projection, never a separate field list. */
export function renderSemanticVerificationProjectionMarkdown(projection: SemanticVerificationProjection, header: Record<string, string | null> = {}): string {
  const j = (v: unknown) => JSON.stringify(v);
  const lines = ["# Proposed semantics (semantic verification projection)", "", `projectionVersion: ${projection.projectionVersion}`, `projectionHash: ${computeSemanticVerificationProjectionHash(projection)}`];
  for (const [k, v] of Object.entries(header)) lines.push(`${k}: ${v ?? "null"}`);
  lines.push("", `_${projection.independence}_`, "");
  for (const r of projection.rules) {
    lines.push(`## RULE ${r.ruleId}`, `- sourceSectionRef: ${r.sourceSectionRef}  ruleType: ${r.ruleType}  posture: ${r.posture}  action: ${r.action}`, `- covenantFamily: ${r.covenantFamily}  entityScope: ${j(r.entityScope)}  excluded: ${j(r.entityScopeExcluded)}  transactionScope: ${j(r.transactionScope)}`, `- capacityExpression: ${j(r.capacityExpression)}`, `- conditions: ${j(r.conditions)}`, `- exceptions: ${j(r.exceptions)}`, `- dependsOn: ${j(r.dependsOn)}`, `- sourceDependencies: ${j(r.sourceDependencies)}`, `- unresolvedDependencies: ${j(r.unresolvedDependencies)}`, `- inheritedAttributes: ${j(r.inheritedAttributes)}`, `- compilerSufficiencyClaim: ${j(r.compilerSufficiencyClaim)}`, `- reviewContext: ${j(r.reviewContext)}`, "");
  }
  for (const d of projection.definitions) lines.push(`## DEFINITION ${d.definitionId} "${d.termName}"`, `- covenantFamily: ${d.covenantFamily}  dependsOnTerms: ${j(d.dependsOnTerms)}`, `- calculationExpression: ${j(d.calculationExpression)}`, `- compilerSufficiencyClaim: ${j(d.compilerSufficiencyClaim)}`, `- reviewContext: ${j(d.reviewContext)}`, "");
  for (const c of projection.sharedCapacities) lines.push(`## SHARED_CAPACITY ${c.sharedCapId}`, `- description: ${c.description}`, `- capExpression: ${j(c.capExpression)}`, `- memberRuleIds: ${j(c.memberRuleIds)}`, `- reviewContext: ${j(c.reviewContext)}`, "");
  if (projection.rules.length + projection.definitions.length + projection.sharedCapacities.length === 0) lines.push("(no units)");
  return lines.join("\n");
}
