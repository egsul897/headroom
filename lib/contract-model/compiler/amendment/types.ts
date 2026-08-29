/**
 * Phase 2G - Amendment Precedence & Operative Contract State V1.
 *
 * Architecture (task §0's own diagram): Package Graph (Phase 2C) ->
 * Modification Candidates (Phase 2C) -> Amendment Interpretation (this
 * module) -> Precedence/Effective Dating (this module) -> Operative
 * Contract State (this module) -> future AI Covenant Semantic Compiler
 * (NOT this phase). Note this pipeline never mentions ContractRule/
 * DefinedTermNode (the Phase-B DB schema's own extracted-rule level) -
 * deliberately: rule EXTRACTION is the future semantic compiler's own
 * job (task §39 forbids building it here), so this module's "provisions"
 * are STRUCTURAL (a section/clause ref from Phase 2A's structural index)
 * and DEFINITIONAL (a defined term from Phase 2A's structural-
 * definitions detector), never a ContractRule row. The existing DB-level
 * getOperativeContractualState(companyId, asOfDate)
 * (lib/contract-model/service.ts, docs/contract-model-foundation-phase-b
 * .md §I) already solves the READ side of this problem correctly for
 * ContractRule/DefinedTermNode rows that already carry the right
 * effectiveFrom/effectiveTo - this module builds the WRITE side that
 * has never existed: turning real amendment TEXT into a real, source-
 * backed, date-aware operative view, one layer below where a
 * ContractRule would eventually be extracted from.
 *
 * Central invariant (task §1): Headroom must never silently use
 * superseded contractual language as though it were current. Every type
 * below carries an explicit resolution/sufficiency status - never a bare
 * boolean "is this correct" - so uncertainty is always representable and
 * never silently dropped.
 *
 * MODIFY_SCHEDULE was added after real CONMED Document D evidence showed
 * a genuine schedule-modification clause ("the 'Term A-2 Commitments' set
 * forth on Schedule 1 of this Amendment are hereby added to Schedule 1.1
 * of the Credit Agreement") that no other operation in this taxonomy
 * honestly describes - staying silent about it would itself be a form of
 * dangerous silence (§1). MODIFY_EXHIBIT remains unused this V1 - no
 * real or required synthetic scenario needed it (disclosed, not silently
 * ignored, same as MODIFY_RELATIONSHIP/MODIFY_EFFECTIVE_DATE below).
 */
import type { AmendmentEffectType as PrismaAmendmentEffectType } from "@prisma/client";
import type { ResolutionStatus } from "../package-graph/types";

export type { ResolutionStatus };

// ---------------------------------------------------------------------------
// §5 - amendment operation taxonomy (in-memory, mapped onto the real
// Prisma AmendmentEffectType enum 1:1 - never a second, disconnected
// vocabulary). MODIFY_RELATIONSHIP/MODIFY_EFFECTIVE_DATE from the real
// enum are deliberately not used by this V1 - no real or required
// synthetic scenario needed them (disclosed, not silently ignored).
// ---------------------------------------------------------------------------

export type AmendmentOperation =
  | "REPLACE_TEXT"
  | "ADD_TEXT"
  | "DELETE_TEXT"
  | "MODIFY_THRESHOLD"
  | "MODIFY_DEFINITION"
  | "ADD_DEFINITION"
  | "DELETE_DEFINITION"
  | "REPLACE_DEFINITION"
  | "MODIFY_ENTITY_SCOPE"
  | "ADD_EXCEPTION"
  | "REMOVE_EXCEPTION"
  | "ADD_COVENANT"
  | "REMOVE_COVENANT"
  | "RESTATE_AGREEMENT"
  | "REAFFIRM"
  | "NO_TEXTUAL_CHANGE"
  | "MODIFY_PROVISION"
  | "MODIFY_SCHEDULE"
  | "UNKNOWN_CHANGE";

export const AMENDMENT_OPERATIONS: readonly AmendmentOperation[] = [
  "REPLACE_TEXT",
  "ADD_TEXT",
  "DELETE_TEXT",
  "MODIFY_THRESHOLD",
  "MODIFY_DEFINITION",
  "ADD_DEFINITION",
  "DELETE_DEFINITION",
  "REPLACE_DEFINITION",
  "MODIFY_ENTITY_SCOPE",
  "ADD_EXCEPTION",
  "REMOVE_EXCEPTION",
  "ADD_COVENANT",
  "REMOVE_COVENANT",
  "RESTATE_AGREEMENT",
  "REAFFIRM",
  "NO_TEXTUAL_CHANGE",
  "MODIFY_PROVISION",
  "MODIFY_SCHEDULE",
  "UNKNOWN_CHANGE",
] as const satisfies readonly PrismaAmendmentEffectType[];

// ---------------------------------------------------------------------------
// §4 - effective-date resolution. Never assumes execution date always
// equals effective date (task's own explicit instruction) - a
// conditional/unresolved effective date is a real, representable outcome.
// ---------------------------------------------------------------------------

export type EffectiveDateStatus = "EXPLICIT_EFFECTIVE_DATE" | "INFERRED_FROM_EXECUTION_DATE" | "CONDITIONAL_UNRESOLVED" | "UNKNOWN";

export interface EffectiveDateResult {
  date: string | null;
  status: EffectiveDateStatus;
  evidence: string | null;
  reason: string;
}

// ---------------------------------------------------------------------------
// §6 - target model. Every effect identifies its target as specifically
// as evidence allows, never a guessed one (task's own explicit "do not
// apply an effect to a guessed target").
// ---------------------------------------------------------------------------

export type AmendmentTargetKind = "SECTION" | "DEFINITION" | "DOCUMENT" | "UNKNOWN";

export interface AmendmentTarget {
  kind: AmendmentTargetKind;
  targetDocumentId: string | null;
  targetInstrumentKey: string | null;
  targetStructuralNodeKey: string | null;
  targetSectionRef: string | null;
  targetDefinedTermRef: string | null;
  targetHint: string | null;
}

// ---------------------------------------------------------------------------
// §7/§8/§10 - one amendment effect candidate. `resolutionMethod`
// distinguishes deterministic parsing from bounded AI interpretation
// (task §24's own explicit AI-vs-deterministic division); `rawModelOutput`
// preserves the AI's own proposal verbatim for audit (task §10) even
// when deterministic validation (§11) downgrades or rejects it.
// ---------------------------------------------------------------------------

export type AmendmentResolutionMethod = "DETERMINISTIC_EXPLICIT_PATTERN" | "DETERMINISTIC_FULL_RESTATEMENT" | "DETERMINISTIC_REAFFIRMATION" | "SEMANTIC_INTERPRETATION" | "SEMANTIC_INTERPRETATION_REJECTED";

export interface AmendmentEffectCandidate {
  effectId: string;
  amendmentDocumentId: string;
  target: AmendmentTarget;
  operation: AmendmentOperation;
  effectiveDate: EffectiveDateResult;
  /** Verbatim text captured from the amendment's OWN source when it explicitly supplies replacement/added language - never synthesized (task §11's "AI may interpret legal transformation, it may not manufacture source evidence"). Null when the amendment's own text does not supply it. */
  newText: string | null;
  /** The target provision's own real current text, when resolvable, for a DELETE/REPLACE effect - never invented. */
  oldText: string | null;
  sourceCitation: string;
  sourceExcerpt: string;
  confidence: number;
  status: ResolutionStatus;
  unresolvedReason: string | null;
  resolutionMethod: AmendmentResolutionMethod;
  /** Preserved verbatim only when a semantic interpreter call was actually made (task §10) - absent for deterministic effects. */
  rawModelOutput?: unknown;
}

// ---------------------------------------------------------------------------
// §22 - conflict detection.
// ---------------------------------------------------------------------------

export type ConflictType = "AMENDMENT_CONFLICT" | "AMENDMENT_SEQUENCE_UNRESOLVED";

export interface AmendmentConflict {
  conflictType: ConflictType;
  provisionKey: string;
  involvedEffectIds: string[];
  reason: string;
}

// ---------------------------------------------------------------------------
// §19/§20/§23 - the operative view of one provision (a section OR a
// defined term) as of one analysis date, with full source lineage (task
// §20 - "why does this text govern") and an explicit sufficiency status
// (task §23) a future consumer must check before treating this as
// authoritative.
// ---------------------------------------------------------------------------

export type OperativeProvisionKind = "SECTION" | "DEFINITION";

export type OperativeStateStatus = "OPERATIVE_STATE_RESOLVED" | "OPERATIVE_STATE_PARTIAL" | "OPERATIVE_STATE_REVIEW_REQUIRED" | "OPERATIVE_STATE_CONFLICTED";

// ---------------------------------------------------------------------------
// Phase 3F.1.4 Workstream D (§6A/§6B) - the real target-resolution status of
// a provision's OWN base reference (a SECTION legal reference or a
// DEFINITION term), independently derived from the structural index. This
// is the field the audit's P0 finding required: `newText` on an applied
// amendment effect is never, by itself, evidence that a target exists or
// is unique - only this status may gate a confidently-attached
// currentText.
// ---------------------------------------------------------------------------

export type ProvisionTargetResolutionStatus = "UNIQUE" | "AMBIGUOUS" | "NOT_FOUND";

// ---------------------------------------------------------------------------
// Phase 3F.1.5.R (sub-task 3) - fail-closed composition with the structural
// index's OWN health diagnostics (structural-index.ts's healthDiagnostics(),
// I1-I16). Orthogonal to ProvisionTargetResolutionStatus above: a base
// reference can be a genuinely UNIQUE legal-reference match (exactly one
// physical occurrence carries this section/definition) while that SAME
// physical occurrence is independently flagged by the structural index as
// corrupted (e.g. INVALID_SOURCE_SPAN, OVERLAPPING_INCOMPATIBLE_SPAN,
// CYCLE - any ERROR-severity finding, never an INFO one, which the index's
// own header comment already treats as a normal, expected drafting
// reality never worth gating on). Before this fix, operative-state.ts never
// called healthDiagnostics() at all, so a section already known-corrupted
// at the structural layer could still be confidently reported
// OPERATIVE_STATE_RESOLVED once a real amendment targeted it - the two
// subsystems never composed (docs/foundation-remediation/
// 13-remaining-foundation-risks.json's "operativeStateHealthDiagnosticsGap",
// reproduced by tests/foundation-audit/combined-failures.test.ts's first
// describe block). OPERATIVE_CONFIDENCE now requires
// STRUCTURAL_HEALTH_SUFFICIENT, not merely a unique target match.
// ---------------------------------------------------------------------------

export type ProvisionStructuralHealthStatus = "STRUCTURAL_HEALTH_SUFFICIENT" | "STRUCTURAL_HEALTH_UNSAFE";

export interface AmendmentChainEntry {
  effectId: string;
  amendmentDocumentId: string;
  operation: AmendmentOperation;
  effectiveDate: EffectiveDateResult;
  sourceCitation: string;
  appliedAsOfQuery: boolean;
}

export interface OperativeProvisionView {
  instrumentKey: string;
  provisionKey: string;
  kind: OperativeProvisionKind;
  documentId: string;
  sectionRef: string | null;
  definedTermRef: string | null;
  asOfDate: string;
  /** The document currently governing this provision at asOfDate - the base document when no in-scope effect has yet applied. */
  currentSourceDocumentId: string;
  /** @deprecated legacy label-shaped key, kept for backward-compatible display/logging only. Use `currentSourceNodeId` for identity. */
  currentSourceNodeKey: string | null;
  /** Phase 3F.1.2 - the real physical occurrence identity of the node currently governing this provision (null iff currentSourceNodeKey is null). */
  currentSourceNodeId: string | null;
  /** Best-effort operative text - null whenever it cannot be deterministically derived from real source evidence alone (task §19: never fabricated), even if the provision itself is otherwise RESOLVED. */
  currentText: string | null;
  /** Full amendment chain affecting this provision, oldest to newest, regardless of asOfDate - task §13's own "historical versions remain queryable." */
  fullChain: AmendmentChainEntry[];
  /** Subset of fullChain whose effectiveDate is on or before asOfDate - what was actually APPLIED for this query. */
  appliedChain: AmendmentChainEntry[];
  /** @deprecated legacy label-shaped keys. Use `supersededSourceNodeIds`. */
  supersededSourceNodeKeys: string[];
  /** Phase 3F.1.2 - occurrence-safe counterpart of supersededSourceNodeKeys. */
  supersededSourceNodeIds: string[];
  status: OperativeStateStatus;
  unresolvedIssues: string[];
  conflicts: AmendmentConflict[];
  /** Phase 3F.1.4 §6A - the real, independently-derived resolution status of this provision's own base reference (never inferred from whether an effect happened to carry newText). Only "UNIQUE" may support a confidently-attached currentText. */
  targetResolutionStatus: ProvisionTargetResolutionStatus;
  /** Populated only when targetResolutionStatus !== "UNIQUE" - explains AMBIGUOUS vs NOT_FOUND explicitly (the audit's own disclosure-quality finding: a reviewer must be told WHY, not just THAT). Null when UNIQUE. */
  targetResolutionReason: string | null;
  /** Phase 3F.1.4 §6B - the real physical occurrence (SECTION) or definition (DEFINITION) identities the base reference matched when AMBIGUOUS (2+ genuinely distinct candidates) - never a guessed pick among them. Always empty when targetResolutionStatus is UNIQUE or NOT_FOUND. */
  candidateSourceNodeIds: string[];
  /** Phase 3F.1.5.R (sub-task 3) - whether the structural index's OWN health diagnostics consider this provision's resolved physical occurrence (or a structural descendant of it) safe to trust. Independent of targetResolutionStatus: a target can be UNIQUE and still STRUCTURAL_HEALTH_UNSAFE. Always STRUCTURAL_HEALTH_SUFFICIENT (vacuously - no physical occurrence was resolved to check) when targetResolutionStatus is not UNIQUE. Only a UNIQUE target AND a SUFFICIENT structural health verdict may ever produce a confidently-attached currentText/OPERATIVE_STATE_RESOLVED status. */
  structuralHealthStatus: ProvisionStructuralHealthStatus;
  /** Populated only when structuralHealthStatus is STRUCTURAL_HEALTH_UNSAFE - names the real ERROR-severity structural-index finding(s) (code + message) that blocked confidence, matching targetResolutionReason's own "tell the reviewer WHY" discipline. Empty when SUFFICIENT. */
  structuralHealthIssues: string[];
  /** Phase 3F.1.4 §6B - the most recent applied effect's own captured newText, preserved for reviewer visibility EVEN WHEN targetResolutionStatus is not UNIQUE. "We know what the amendment says" (this field, once any effect supplies newText) is never conflated with "we know exactly what operative provision it changes" (currentText, gated on targetResolutionStatus === "UNIQUE"). Null when no applied effect ever supplied newText, or the most recent applied effect was a deletion. */
  attemptedText: string | null;
  /** Explicit review-required signal (the audit's own required "review flag" disclosure) - true whenever status is not OPERATIVE_STATE_RESOLVED, so a consumer never needs to enumerate every non-RESOLVED status value itself. */
  reviewRequired: boolean;
  /** Phase 3F.1.4 §6D - populated ONLY when status is OPERATIVE_STATE_CONFLICTED: the genuinely competing candidate texts, sorted by effectId (never by array/ingestion order), so no downstream consumer can mistake iteration order for legal precedence. currentText is null whenever this is populated. Empty otherwise. */
  candidateTexts: string[];
}

export interface OperativeContractState {
  instrumentKey: string;
  asOfDate: string;
  provisions: OperativeProvisionView[];
  status: OperativeStateStatus;
  summary: string;
  /**
   * Phase 3F.1 §29-32/F3 - effects that reference this instrument's own
   * document family but could not be attached to any specific provision
   * (an unresolved section/definition/instrument target - see
   * groupEffectsByProvision's own unattachedEffects). NEVER silently
   * discarded: their presence is exactly what prevents `status` from
   * defaulting to OPERATIVE_STATE_RESOLVED merely because `provisions` came
   * back empty (root cause of the DSGR first-blind F3 finding - a status
   * literally named RESOLVED coexisting with zero provisions and 4 real,
   * known, unresolved amendment effects for the same instrument).
   */
  unattachedEffects: AmendmentEffectCandidate[];
}

// ---------------------------------------------------------------------------
// Pipeline-level run summary (matches discovery/pipeline.ts's own
// DiscoveryRunSummary convention).
// ---------------------------------------------------------------------------

export interface AmendmentPipelineSummary {
  documentsProcessed: number;
  deterministicEffectsFound: number;
  semanticCallsMade: number;
  semanticEffectsFound: number;
  semanticEffectsRejectedByValidation: number;
  conflictsDetected: number;
  wallClockMs: number;
  inputTokens: number;
  outputTokens: number;
}
