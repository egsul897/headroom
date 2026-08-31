/**
 * Phase 3F.1.6.R Workstream F (BLOCKER-10 remediation) - domain types for the
 * live contract-analysis orchestration boundary. See orchestrator.ts for the
 * composed pipeline itself and docs/phase-3f1-6-r-blocker-remediation/
 * 14-live-contract-analysis-architecture.json for the design rationale.
 */
import type { AnalysisRunStatus } from "@prisma/client";
import type { DocumentAuditOutput } from "../compiler/semantic-coverage/pipeline";
import type { PackageCoverageResult } from "../compiler/semantic-coverage/types";
import type { RecordClaimReviewsFromCoverageResult } from "../compiler/safe-failure/integrate";
import type { PersistSemanticTruthSummary } from "./semantic-truth/types";
import type { StructuralReviewSignal, StructuralAmbiguityResolutionRateMetrics } from "../compiler/structural-ambiguity-resolution";

export type { AnalysisRunStatus };

export const CONTRACT_DOCUMENT_TYPES = [
  "CREDIT_AGREEMENT",
  "INDENTURE",
  "AMENDMENT",
  "INTERCREDITOR_AGREEMENT",
  "AMENDED_AND_RESTATED_AGREEMENT",
  "SUPPLEMENTAL_INDENTURE",
  "JOINDER",
  "SECURITY_AGREEMENT",
  "GUARANTEE",
  "SIDE_LETTER",
  "FEE_LETTER",
  "OTHER_DEBT_DOCUMENT",
  "GUARANTEE_AND_SECURITY_AGREEMENT",
  "UNKNOWN",
] as const;

/**
 * Deliberately excluded: `OTHER` (a human explicitly declared this document
 * is not a debt/credit document at all - task's own "do not force uncertain
 * classification" applied to scope, not just labeling) and
 * `COMPLIANCE_CERTIFICATE` (a periodic reporting artifact ABOUT an
 * instrument's covenants, never itself the source of covenant TEXT the
 * compiler pipeline is built to parse - running structural/discovery
 * analysis over one would only produce noise, never a real covenant claim).
 * This is a disclosed, bounded scoping choice - see
 * 19-contract-truth-ownership-map.json.
 */
export const CONTRACT_DOCUMENT_TYPE_SET = new Set<string>(CONTRACT_DOCUMENT_TYPES);

export interface RunContractAnalysisInput {
  companyId: string;
  /** Optional trigger provenance for observability only (e.g. the just-uploaded document's id) - never changes which documents are analyzed (always the company's FULL current contract-document set, per this phase's own disclosed single-package-per-company scoping decision). */
  triggeringDocumentId?: string | null;
}

/**
 * `SKIPPED_SUPERSEDED` (Phase 3F.1.6.RX-FINAL Workstream E, FINDING-6 -
 * zombie-writer fencing): this execution held a real AnalysisRun claim and
 * made genuine progress, but a NEWER execution reclaimed the same `runId`
 * (the original claim was misclassified stale - the prior owner was slow,
 * not dead) before this execution finished. Every one of this execution's
 * OWN mutating writes from the point of supersession onward was rejected/
 * no-op (see lib/contract-model/analysis/service.ts's own
 * executionGeneration fencing) - this outcome is this (now-stale) caller's
 * own honest report of that, never a claim about the run's real, current
 * state (which the newer owner alone now controls and reports on its own
 * eventual return). Distinct from `SKIPPED_ALREADY_RUNNING` (that is
 * reported at CLAIM time, before any work began; this is reported after
 * real work began and was then superseded mid-flight).
 */
export type AnalysisRunOutcome = "STARTED_TO_COMPLETION" | "SKIPPED_ALREADY_RUNNING" | "SKIPPED_NO_CONTRACT_DOCUMENTS" | "SKIPPED_SUPERSEDED" | "FAILED";

export interface InstrumentAnalysisOutcome {
  instrumentKey: string;
  baseDocumentId: string | null;
  documentIds: string[];
  discoveredCandidateCount: number;
  compiledCount: number;
  verifiedCount: number;
  packageCoverage: PackageCoverageResult;
  documentDetails: DocumentAuditOutput[];
  claimReviewOutcomes: RecordClaimReviewsFromCoverageResult[];
  /** AUDIT-F1 - durable semantic-truth persistence outcome for this instrument's own compiled rules/definitions (lib/contract-model/analysis/semantic-truth/service.ts). */
  semanticTruthSummary: PersistSemanticTruthSummary;
}

export interface RunContractAnalysisResult {
  outcome: AnalysisRunOutcome;
  runId: string | null;
  status: AnalysisRunStatus | null;
  companyId: string;
  packageKey: string | null;
  documentIds: string[];
  analysisAlgorithmVersion: string;
  instruments: InstrumentAnalysisOutcome[];
  openReviewItemCount: number;
  fatalError: { stage: string; message: string; errorClass: string } | null;
  /** AUDIT-F3 - every instrument-level failure this attempt recorded (durably persisted as AnalysisRunIssue rows - this is a convenience in-memory mirror of that, never the sole record of it). Empty when every instrument succeeded, or when the run never reached the per-instrument stage at all. */
  instrumentFailures: { instrumentKey: string; errorClass: string; message: string }[];
  /**
   * Phase 3F.1 Human Architecture Decision (Workstream OPEN-1, REAL-
   * orchestrator wiring fix - docs/phase-3f1-human-architecture-decision/
   * 04-structural-implementation.json's own "workstreamOPEN1RealOrchestratorWiringFix"
   * section). Every genuinely AMBIGUOUS structural candidate (across the
   * whole package - the STRUCTURE stage runs once for `packageDocs`, before
   * any per-instrument split) that the bounded structural-ambiguity
   * classifier could not confidently resolve (UNCERTAIN verdict, a real
   * provider failure, or the no-credential synthetic fallback) - fail-closed
   * EXCLUDED from the structural nodes every downstream stage sees, never
   * silently dropped from this audit trail. Mirrors
   * CompilerRunSummary.structuralReviewSignals in the (quarantined)
   * lib/contract-model/compiler/orchestrator.ts exactly (same field name/
   * shape - see StructuralReviewSignal's own doc comment). Empty on every
   * return path that never reaches the STRUCTURE stage at all (e.g.
   * SKIPPED_NO_CONTRACT_DOCUMENTS/SKIPPED_ALREADY_RUNNING/the
   * PRE_RUN_IDENTITY FAILED case), never on a genuine completed run with
   * zero ambiguous candidates (that case is `[]` too, but for the honest
   * reason of nothing to report, not because the stage never ran).
   */
  structuralReviewSignals: StructuralReviewSignal[];
  /** Aggregate cost-discipline/rate metrics for the SAME STRUCTURE-stage classifier run `structuralReviewSignals` reports on above - `null` under the identical "never reached STRUCTURE" condition documented there, non-null (including for a package with zero ambiguous candidates, where every rate is simply 0) for every run that reached the STRUCTURE stage. See `StructuralAmbiguityResolutionRateMetrics`'s own doc comment (structural-ambiguity-resolution.ts) for each field's meaning. */
  structuralAmbiguityMetrics: StructuralAmbiguityResolutionRateMetrics | null;
  /**
   * Part B AUDIT-F7 recertification (FINDING-8, "failure-recording itself
   * must not fail silently") - applies ONLY to the PRE_RUN_IDENTITY fatalError
   * case (the one call site with no runId yet to attach a durable trace to
   * via the normal failAnalysisRun/AnalysisRunIssue path instead):
   *   - `true`  - the ORIGINAL failure above was durably recorded via
   *               recordAnalysisFailureLog (a real AnalysisFailureLog row
   *               exists). This is the ordinary, expected case.
   *   - `false` - recordAnalysisFailureLog's OWN write itself also failed
   *               (a materially cheaper trigger than a total Postgres
   *               outage - see docs/phase-3f1-6-rx-final-blocker-closure/
   *               29-part-b-auditf3-f6-f7-recertification.json's AUDIT_F7
   *               section). The ORIGINAL error is still fully reported via
   *               `fatalError` above (never masked/replaced), and a
   *               structured console.error fallback ran as a deliberately
   *               terminal, non-recursive last resort - see orchestrator.ts's
   *               own comment at the call site. `false` here means NO
   *               durable Postgres trace of the original failure exists
   *               anywhere; a caller/operator should treat this more
   *               urgently than the `true` case.
   *   - `null`  - not applicable: either this attempt did not fail at the
   *               PRE_RUN_IDENTITY stage at all (fatalError is null, or is
   *               set for a different stage, which durably records via
   *               failAnalysisRun against a real AnalysisRun row instead -
   *               a different, already-robust mechanism out of this
   *               finding's scope), or this outcome predates a fatalError
   *               entirely (SKIPPED_* or STARTED_TO_COMPLETION).
   *
   * Together with `outcome` (always `"FAILED"`, never anything
   * success-shaped, for every case this field is non-null), this is this
   * result's ANALYSIS_FAILED_AND_RECORDED (`true`) vs.
   * ANALYSIS_FAILED_BUT_DURABLE_RECORD_FAILED (`false`) distinction - the
   * second is an infrastructure-degraded condition that must never be read
   * as, or confused with, analysis completion/success in any field.
   */
  failureRecordPersisted: boolean | null;
  /**
   * Phase 3F.1-terminal (OPEN-6 / AUDIT-F7 residual, Part B FINDING-8
   * falsification construction 3) - the SECONDARY tier of the
   * PRE_RUN_IDENTITY fallback hierarchy: when `failureRecordPersisted` is
   * `false`, this carries the failure-persistence write's OWN classified
   * error (never the original failure - that is always `fatalError` above,
   * never masked or replaced), so a caller/operator has BOTH the original
   * fatal error and the reason no durable AnalysisFailureLog row exists for
   * it, without needing to parse the last-resort console line. `null`
   * whenever `failureRecordPersisted` is `true` or `null` (nothing to
   * report - either the write succeeded, or this stage never failed).
   */
  failureRecordError: { message: string; errorClass: string } | null;
  /**
   * Phase 3F.1-terminal (OPEN-6 / AUDIT-F7 residual) - the TERTIARY,
   * genuinely-last-resort tier: whether the `console.error` fallback that
   * runs when `failureRecordPersisted` is `false` itself completed without
   * throwing.
   *   - `true`  - the durable write failed, but the last-resort console
   *               trace was emitted successfully (the ordinary degraded
   *               case).
   *   - `false` - the durable write failed AND the console.error fallback
   *               itself threw (e.g. a wrapped/instrumented `console` in an
   *               observability integration) - even that last-ditch trace
   *               could not be emitted. The function still returns this
   *               structured `FAILED` result rather than throwing uncaught
   *               (see orchestrator.ts's own try/catch around this call);
   *               there is deliberately no further/deeper tier - a caller
   *               seeing `false` here has the same original `fatalError`
   *               and `failureRecordError` as any other degraded case, just
   *               with zero trace of any kind left behind anywhere else.
   *   - `null`  - not applicable: `failureRecordPersisted` is `true` or
   *               `null` (the fallback never ran).
   */
  failureRecordFallbackLogged: boolean | null;
}
