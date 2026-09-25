/**
 * FORENSIC NUMERIC GROUNDING - the harness's single source of truth, and it is production's.
 *
 * The forensic runners used to answer "is this asserted figure sourced?" with their own
 * attributionCheck: a substring test over the anchor plus the Pass C linked nodes. That helper was
 * materially weaker than the production verifier in four separate ways - it never saw authenticated
 * tool retrieval, it could not equate "$50 million" with "$50,000,000", it had no way to express
 * evidence scoped to a retrieved definition, and it had only two buckets to put an answer in. It is
 * what produced the historical `unsourced: ["100%"]` for 7.2(f), a figure that is in fact real
 * source text in the authenticated "Subsidiary Guarantor" definition the compiler had retrieved.
 *
 * This module does not reimplement any of that. It assembles the evidence universe exactly as
 * verify.ts does and then calls the SAME production functions - collectNumericAssertions and
 * groundNumericAssertions - so there is one grounding implementation, one evidence relation and one
 * result vocabulary across production and forensics. A future change to the relation reaches the
 * forensic reports automatically, which is the whole point.
 *
 * Deterministic and free: it reads a preserved or in-memory compilation and calls nothing.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import { EMPTY_SUPERSESSION_INDEX, buildNodeSupersessionIndex } from "../../lib/contract-model/compiler/amendment/operative-state";
import { buildIrInventory } from "../../lib/contract-model/compiler/semantic-verification/ir-inventory";
import { collectAdmissibleEvidence } from "../../lib/contract-model/compiler/semantic-verification/retrieved-evidence";
import { collectNumericAssertions, groundNumericAssertions } from "../../lib/contract-model/compiler/semantic-verification/numeric-assertion";
import type { NumericAssertionEvidenceText, NumericGroundingStatus } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult, SemanticCompilerInput } from "../../lib/contract-model/compiler/semantic/types";

export const FORENSIC_GROUNDING_VERSION = "forensic-grounding.v1 (production Fix B + R2 semantics)";

export const GROUNDING_STATUSES: NumericGroundingStatus[] = ["GROUNDED_OPERATIVE", "GROUNDED_CONTEXT", "GROUNDED_TOOL_EVIDENCE", "NORMALIZED_EQUIVALENT", "UNGROUNDED", "AMBIGUOUS"];

export interface ForensicGroundingRow {
  value: string;
  normalizedValue: number | null;
  kind: string;
  unit: string | null;
  ruleOrDefinitionId: string;
  fieldPath: string;
  fieldClass: string;
  status: NumericGroundingStatus;
  groundedIn: "OPERATIVE" | "CONTEXT" | null;
  matchedEvidenceId: string | null;
  matchedText: string | null;
  relation: string | null;
  unrelatedEvidenceIds: string[];
  reason: string;
}

/**
 * The pre-R1 vocabulary, DERIVED from the authoritative grounding result and kept only so older
 * report readers stay readable. Nothing decides anything from these.
 * @deprecated read `assertions[].status` instead.
 */
export interface DeprecatedLegacyAttributionView {
  deprecated: true;
  derivedFrom: string;
  assertedAmounts: string[];
  /** groundedIn === OPERATIVE - the candidate's own anchor really states it. */
  supportedByAnchor: string[];
  /** Grounded, but not by the anchor. The old field called this an "operative attribution violation"; it is the same set. */
  violations: string[];
  /** UNGROUNDED or AMBIGUOUS. The old field of this name ALSO swept up everything the narrow universe simply could not see. */
  unsourced: string[];
}

export interface ForensicGroundingResult {
  candidateRef: string;
  version: string;
  assertions: ForensicGroundingRow[];
  countsByStatus: Record<NumericGroundingStatus, number>;
  /** Every figure the IR asserts that is NOT owned by the candidate's own anchor - grounded elsewhere or not grounded at all. */
  notAnchorOwned: string[];
  authenticatedEvidence: { evidenceId: string; requestKind: string; requestKey: string; contentHash: string }[];
  rejectedEvidence: { requestKind: string; requestKey: string; claimedByCompiler: boolean; reason: string }[];
  legacy: DeprecatedLegacyAttributionView;
}

/**
 * The evidence universe, assembled to production's own admissibility rules.
 *
 * OPERATIVE is the candidate's own window. AUTHENTICATED retrieved sources come from
 * collectAdmissibleEvidence, which independently re-resolves each retrieval and hash-checks it -
 * so a refused, unresolved, stale or unauthenticated tool result is excluded by construction
 * rather than by a filter written here. Context-bundle excerpts are included as CONTEXT-scope text
 * carrying NO retrieval identity, which under R2 means they can never establish a relation and so
 * can never ground an assertion; they can only ever contribute to an AMBIGUOUS verdict. Prompt and
 * few-shot text, model prose and diagnostic notes are never part of this list at all.
 */
export function buildForensicEvidence(compilerInput: SemanticCompilerInput, compilationResult: SemanticCompilationResult) {
  const irInventory = buildIrInventory(compilerInput.candidateRef, compilationResult.rules ?? [], compilationResult.definitions ?? []);
  const supersessionIndex = compilerInput.toolAccess?.operativeState
    ? buildNodeSupersessionIndex([{ baseDocumentId: compilerInput.sourceDocumentId, state: compilerInput.toolAccess.operativeState }])
    : EMPTY_SUPERSESSION_INDEX;
  const admissible = collectAdmissibleEvidence({ compilerInput, compilationResult }, irInventory, { supersessionIndex });

  const evidence: NumericAssertionEvidenceText[] = [
    { scope: "OPERATIVE", evidenceId: "PRIMARY_LOCAL", label: "the candidate's own operative source window", text: compilerInput.operativeSourceText },
    ...admissible.authenticated.map((e) => ({
      scope: (e.duplicatesLocalWindow ? "OPERATIVE" : "CONTEXT") as "OPERATIVE" | "CONTEXT",
      evidenceId: e.evidenceId,
      label: `authenticated ${e.requestKind === "DEFINITION" ? `definition of "${e.requestKey}"` : `section ${e.requestKey}`} (document ${e.documentId}, sha256 ${e.contentHash.slice(0, 12)}...)`,
      text: e.rawText,
      requestKind: e.requestKind,
      scopeKey: e.scopeKey,
      requestKey: e.requestKey,
    })),
    ...((compilerInput.contextBundle?.items ?? []) as { itemId: string; type: string; normalizedRef: string | null; excerptText: string }[])
      .filter((i) => typeof i.excerptText === "string" && i.excerptText.trim().length > 0)
      .map((i) => ({ scope: "CONTEXT" as const, evidenceId: `BUNDLE:${i.itemId}`, label: `context bundle item ${i.type} ${i.normalizedRef ?? ""} (unauthenticated - cannot establish a relation)`, text: i.excerptText })),
  ];

  return { evidence, admissible };
}

/** One compiled candidate, graded by the production grounder. */
export function groundCompiledResult(compilerInput: SemanticCompilerInput, compilationResult: SemanticCompilationResult): ForensicGroundingResult {
  const { evidence, admissible } = buildForensicEvidence(compilerInput, compilationResult);
  const inventory = collectNumericAssertions(compilerInput.candidateRef, compilationResult.rules ?? [], compilationResult.definitions ?? []);
  const groundings = groundNumericAssertions(inventory, evidence);

  const assertions: ForensicGroundingRow[] = groundings.map((g) => ({
    value: g.assertion.rawText,
    normalizedValue: g.assertion.normalizedValue,
    kind: g.assertion.kind,
    unit: g.assertion.unit,
    ruleOrDefinitionId: g.assertion.ruleOrDefinitionId,
    fieldPath: g.assertion.fieldPath,
    fieldClass: g.assertion.fieldClass,
    status: g.status,
    groundedIn: g.groundedIn,
    matchedEvidenceId: g.matchedEvidenceId,
    matchedText: g.matchedText,
    relation: g.relation,
    unrelatedEvidenceIds: g.unrelatedEvidenceIds,
    reason: g.reason,
  }));

  const countsByStatus = Object.fromEntries(GROUNDING_STATUSES.map((s) => [s, assertions.filter((a) => a.status === s).length])) as Record<NumericGroundingStatus, number>;
  const anchorOwned = assertions.filter((a) => a.groundedIn === "OPERATIVE");
  const groundedElsewhere = assertions.filter((a) => a.groundedIn === "CONTEXT");
  const notGrounded = assertions.filter((a) => a.status === "UNGROUNDED" || a.status === "AMBIGUOUS");

  return {
    candidateRef: compilerInput.candidateRef,
    version: FORENSIC_GROUNDING_VERSION,
    assertions,
    countsByStatus,
    notAnchorOwned: [...new Set([...groundedElsewhere, ...notGrounded].map((a) => a.value))],
    authenticatedEvidence: admissible.authenticated.map((e) => ({ evidenceId: e.evidenceId, requestKind: e.requestKind, requestKey: e.requestKey, contentHash: e.contentHash })),
    rejectedEvidence: admissible.rejected.map((r) => ({ requestKind: r.requestKind, requestKey: r.requestKey, claimedByCompiler: r.claimedByCompiler, reason: r.reason })),
    legacy: {
      deprecated: true,
      derivedFrom: "mechanically derived from assertions[].status / groundedIn - never computed independently",
      assertedAmounts: [...new Set(assertions.map((a) => a.value))],
      supportedByAnchor: [...new Set(anchorOwned.map((a) => a.value))],
      violations: [...new Set(groundedElsewhere.map((a) => a.value))],
      unsourced: [...new Set(notGrounded.map((a) => a.value))],
    },
  };
}

/** The empty result a failed/timed-out execution gets, so a row shape never depends on success. */
export function emptyForensicGrounding(candidateRef: string): ForensicGroundingResult {
  return {
    candidateRef,
    version: FORENSIC_GROUNDING_VERSION,
    assertions: [],
    countsByStatus: Object.fromEntries(GROUNDING_STATUSES.map((s) => [s, 0])) as Record<NumericGroundingStatus, number>,
    notAnchorOwned: [],
    authenticatedEvidence: [],
    rejectedEvidence: [],
    legacy: { deprecated: true, derivedFrom: "no compilation to grade", assertedAmounts: [], supportedByAnchor: [], violations: [], unsourced: [] },
  };
}
