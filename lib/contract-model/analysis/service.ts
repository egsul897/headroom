/**
 * Phase 3F.1.6.R Workstream F (BLOCKER-10 remediation), extended by Phase
 * 3F.1.6.RX Workstream H (AUDIT-F2/F3/F7) - persistence lifecycle for
 * AnalysisRun, the live orchestrator's own run-tracking state.
 *
 * Mirrors the dedup/lifecycle discipline this codebase already established
 * for ClaimReviewItem (safe-failure/service.ts) and ExtractionRun/
 * ExtractionStage (lib/extraction/run-stage.ts): at most one row per
 * (companyId, packageKey, analysisAlgorithmVersion) ever exists (the
 * Prisma `@@unique`), and a re-trigger for the SAME identity updates that
 * SAME row rather than creating a duplicate.
 *
 * AUDIT-F2 (concurrency) - see docs/phase-3f1-6-rx-final-blocker-closure/
 * 11-analysis-run-concurrency-design.json for the full design rationale.
 * The original implementation's own findUnique -> check -> upsert sequence
 * was NOT atomic: two concurrent callers could both read a non-RUNNING (or
 * absent) row and both proceed to upsert, since Prisma's own `upsert`
 * compiles to `INSERT ... ON CONFLICT DO UPDATE` - which does not fail on a
 * conflict, it just updates - so BOTH callers would receive `{kind:
 * "STARTED"}` for the identical identity. `startOrResumeAnalysisRun` below
 * instead claims ownership via a real, Postgres-atomic two-step CAS
 * (compare-and-swap) protocol:
 *
 *   1. `prisma.analysisRun.create()` - a plain INSERT. If no row exists yet
 *      for this identity, exactly ONE concurrent caller's INSERT succeeds
 *      (Postgres's own unique-index row lock); every other concurrent
 *      caller's INSERT raises a real P2002 unique-constraint violation.
 *   2. On P2002 (a row already exists - the common case after the first
 *      run), `prisma.analysisRun.updateMany()` with a WHERE clause that
 *      only matches a row that is NOT currently RUNNING, or IS running but
 *      older than STALE_RUNNING_THRESHOLD_MS (abandoned). `updateMany`
 *      compiles to a single atomic `UPDATE ... WHERE ...` statement -
 *      Postgres locks the matching row for the statement's duration, so of
 *      N concurrent callers racing this same UPDATE, the WHERE predicate is
 *      evaluated against the CURRENT committed row state one at a time
 *      (serialized by the row lock, standard READ COMMITTED behavior): the
 *      first to acquire the lock claims it (status flips to RUNNING,
 *      `count: 1`); every other caller's UPDATE then blocks, and once
 *      unblocked re-evaluates its WHERE clause against the now-RUNNING,
 *      now-fresh row and correctly matches zero rows (`count: 0`). Exactly
 *      one caller ever observes `count: 1` for a given identity at a given
 *      moment - this is a real Postgres-level compare-and-swap, not a
 *      process-local mutex (which would do nothing across concurrent
 *      requests hitting different server instances/processes, the case
 *      this fix is actually for).
 *
 * See tests/contract-model/analysis-run-concurrency.test.ts's own
 * `Promise.all` proof (genuinely simultaneous callers hitting real
 * Postgres, not one pre-created RUNNING row before a single call).
 *
 * AUDIT-F3 (partial instrument failure durability) - `recordAnalysisRunIssue`/
 * `clearAnalysisRunIssues` below give the orchestrator a durable place to
 * put a per-instrument failure that used to exist only in an in-memory
 * array (see docs/phase-3f1-6-rx-final-blocker-closure/
 * 13-partial-instrument-failure-design.json). `completeAnalysisRun` now
 * takes `hadInstrumentFailures` and resolves to the new `PARTIAL` status
 * when true, regardless of `openReviewItemCount` - PARTIAL and
 * COMPLETED_WITH_REVIEW are deliberately never conflated (see
 * AnalysisRunStatus's own schema comment).
 *
 * AUDIT-F7 (no log-only failure) - `recordAnalysisFailureLog` gives
 * runContractAnalysis a durable place to record a genuine failure that
 * occurs BEFORE it has claimed a real AnalysisRun row at all (the initial
 * Document query, or `startOrResumeAnalysisRun` itself, throwing) - the one
 * class of failure that previously had no durable trace anywhere except a
 * console.error in app/'s own runExtractionAction.
 */
import { prisma } from "../../prisma";
import { Prisma } from "@prisma/client";
import type { AnalysisRun, AnalysisRunStatus } from "@prisma/client";

/**
 * A RUNNING row younger than this is treated as an active, in-flight run -
 * a concurrent duplicate trigger for the identical identity is skipped
 * rather than started a second time (task step 5's "duplicate triggers
 * don't duplicate semantic state" applied to two REQUESTS racing for the
 * same run, not just their eventual writes). A RUNNING row OLDER than this
 * is treated as abandoned (the process that owned it crashed/was killed
 * mid-run) and is safely re-entered - safe because every downstream write
 * this run's own body performs is independently idempotent (see this
 * model's own schema comment), so resuming/re-running from the top never
 * duplicates state, it only redoes deterministic/cheap work and re-upserts
 * already-upserted rows.
 *
 * 30 minutes was chosen (documented here, not merely asserted) as
 * comfortably longer than any single real analysis run this codebase's own
 * scripted/E2E timing has ever observed (a company's full document set,
 * including real LLM calls under normal provider latency, completes in low
 * single-digit minutes per the existing certification scripts) while still
 * being short enough that a genuinely crashed run does not block a
 * legitimate re-trigger (e.g. a user re-clicking "Run extraction" after an
 * earlier attempt silently died) for an unreasonably long time. It is a
 * deliberate, documented judgment call, not a value with a formal proof
 * behind it - a future phase with real production run-time telemetry
 * should revisit it with real p99 duration data.
 */
const STALE_RUNNING_THRESHOLD_MS = 30 * 60 * 1000;

export type StartAnalysisRunOutcome = { kind: "STARTED"; run: AnalysisRun } | { kind: "ALREADY_RUNNING"; run: AnalysisRun };

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Claims exclusive ownership of the one AnalysisRun row for this
 * (companyId, packageKey, analysisAlgorithmVersion) identity via a real
 * Postgres-atomic compare-and-swap (see this module's own header comment
 * for the full protocol and why the original findUnique->upsert sequence
 * was not atomic), OR reports that another caller already holds an
 * unexpired RUNNING claim for the identical identity.
 */
export async function startOrResumeAnalysisRun(input: { companyId: string; packageKey: string; documentIds: string[]; analysisAlgorithmVersion: string }): Promise<StartAnalysisRunOutcome> {
  const identity = { companyId: input.companyId, packageKey: input.packageKey, analysisAlgorithmVersion: input.analysisAlgorithmVersion };

  // Step 1: plain INSERT - atomic by construction. Wins outright the FIRST
  // time this identity is ever analyzed; every other concurrent caller for
  // a brand-new identity falls through to the P2002 branch below.
  try {
    const run = await prisma.analysisRun.create({
      data: { ...identity, documentIds: input.documentIds, status: "RUNNING", startedAt: new Date(), currentStage: "INGESTION" },
    });
    await clearAnalysisRunIssues(run.id);
    return { kind: "STARTED", run };
  } catch (err) {
    if (!isUniqueConstraintViolation(err)) throw err;
  }

  // Step 2: the row already exists (the common case). Atomically claim it
  // ONLY if it is not currently an unexpired RUNNING owner - a single
  // UPDATE ... WHERE ... statement, real Postgres row-lock serialized
  // compare-and-swap (see this module's own header comment).
  const staleBefore = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS);
  const claim = await prisma.analysisRun.updateMany({
    where: {
      ...identity,
      OR: [{ status: { not: "RUNNING" } }, { AND: [{ status: "RUNNING" }, { updatedAt: { lt: staleBefore } }] }],
    },
    data: {
      documentIds: input.documentIds,
      status: "RUNNING",
      startedAt: new Date(),
      currentStage: "INGESTION",
      completedAt: null,
      // Prisma's own documented idiom for explicitly clearing a nullable
      // Json column via `update`/`updateMany` (a bare `null` is ambiguous
      // with "leave unset" for a Json field) - a re-entered run must not
      // keep showing a PRIOR attempt's fatalError once it starts running
      // again.
      fatalError: Prisma.JsonNull,
    },
  });

  const current = await prisma.analysisRun.findUniqueOrThrow({
    where: { companyId_packageKey_analysisAlgorithmVersion: identity },
  });

  if (claim.count === 1) {
    // This caller's UPDATE actually matched and applied - it is the real,
    // exclusive owner of this re-entry. Clear any stale per-instrument
    // issue rows from a PRIOR attempt at this SAME run row (AUDIT-F3's own
    // "no stale issue after a successful retry" contract - see
    // AnalysisRunIssue's own schema comment) before this attempt's own
    // per-instrument loop begins.
    await clearAnalysisRunIssues(current.id);
    return { kind: "STARTED", run: current };
  }

  // claim.count === 0: another caller already holds (or just claimed) the
  // RUNNING lock for this identity, or a genuine concurrent race meant this
  // caller's own UPDATE simply matched nothing by the time it ran. Either
  // way, this caller must not start a second concurrent execution.
  return { kind: "ALREADY_RUNNING", run: current };
}

export async function setAnalysisRunStage(runId: string, currentStage: string): Promise<void> {
  await prisma.analysisRun.update({ where: { id: runId }, data: { currentStage } });
}

export async function completeAnalysisRun(runId: string, input: { openReviewItemCount: number; hadInstrumentFailures: boolean }): Promise<AnalysisRun> {
  // AUDIT-F3: PARTIAL takes priority over COMPLETED_WITH_REVIEW whenever at
  // least one instrument's own analysis threw an unexpected exception this
  // attempt, regardless of whether OTHER, successfully-analyzed instruments
  // also produced real review items - "did every instrument's analysis
  // finish running" and "does something need human review" are two
  // different questions, and this status must answer the first one
  // unambiguously without reconstructing it from AnalysisRunIssue rows or
  // logs (see AnalysisRunStatus's own schema comment).
  const status = input.hadInstrumentFailures ? "PARTIAL" : input.openReviewItemCount > 0 ? "COMPLETED_WITH_REVIEW" : "COMPLETED";
  return prisma.analysisRun.update({
    where: { id: runId },
    data: {
      status,
      completedAt: new Date(),
      currentStage: "COMPLETE",
      reviewItemCount: input.openReviewItemCount,
    },
  });
}

export async function failAnalysisRun(runId: string, fatalError: { stage: string; message: string; errorClass: string }): Promise<AnalysisRun> {
  return prisma.analysisRun.update({
    where: { id: runId },
    data: { status: "FAILED", completedAt: new Date(), fatalError: fatalError as object },
  });
}

export async function getLatestAnalysisRunForCompany(companyId: string): Promise<AnalysisRun | null> {
  return prisma.analysisRun.findFirst({ where: { companyId }, orderBy: { createdAt: "desc" } });
}

// ---------------------------------------------------------------------------
// AUDIT-F3 - durable per-instrument failure records.
// ---------------------------------------------------------------------------

/** Deletes every AnalysisRunIssue row for this run - called once, at the START of every fresh claim of ownership (both the brand-new-row and the reclaimed-row paths above), so a retried run's own issue set always reflects ONLY this attempt's real outcome, never a stale failure from a prior attempt that has since been resolved (this model's own schema comment). */
export async function clearAnalysisRunIssues(runId: string): Promise<void> {
  await prisma.analysisRunIssue.deleteMany({ where: { runId } });
}

export interface RecordAnalysisRunIssueInput {
  runId: string;
  companyId: string;
  instrumentKey: string;
  documentIds: string[];
  failedStage: string;
  errorClass: string;
  message: string;
}

/** Durably persists one instrument's own unexpected failure for this run - upserted (never duplicated) on (runId, instrumentKey), since the orchestrator's own per-instrument loop runs each unit at most once per attempt. */
export async function recordAnalysisRunIssue(input: RecordAnalysisRunIssueInput): Promise<void> {
  await prisma.analysisRunIssue.upsert({
    where: { runId_instrumentKey: { runId: input.runId, instrumentKey: input.instrumentKey } },
    create: {
      runId: input.runId,
      companyId: input.companyId,
      instrumentKey: input.instrumentKey,
      documentIds: input.documentIds,
      failedStage: input.failedStage,
      errorClass: input.errorClass,
      message: input.message,
    },
    update: {
      documentIds: input.documentIds,
      failedStage: input.failedStage,
      errorClass: input.errorClass,
      message: input.message,
    },
  });
}

export async function getAnalysisRunIssues(runId: string) {
  return prisma.analysisRunIssue.findMany({ where: { runId }, orderBy: { createdAt: "asc" } });
}

// ---------------------------------------------------------------------------
// AUDIT-F7 - durable pre-identity failure trace.
// ---------------------------------------------------------------------------

export interface RecordAnalysisFailureLogInput {
  companyId: string;
  triggeringDocumentId?: string | null;
  stage: string;
  errorClass: string;
  message: string;
}

/** Durably records a failure that occurred BEFORE runContractAnalysis had claimed a real AnalysisRun row (see this module's own header comment) - the one failure class this table exists for. Never used once a runId exists; that case uses failAnalysisRun/recordAnalysisRunIssue instead, which are scoped to a real run's own identity. */
export async function recordAnalysisFailureLog(input: RecordAnalysisFailureLogInput): Promise<void> {
  await prisma.analysisFailureLog.create({
    data: {
      companyId: input.companyId,
      triggeringDocumentId: input.triggeringDocumentId ?? null,
      stage: input.stage,
      errorClass: input.errorClass,
      message: input.message,
    },
  });
}

export async function getAnalysisFailureLogsForCompany(companyId: string) {
  return prisma.analysisFailureLog.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
}

// ---------------------------------------------------------------------------
// Phase 3F.1.6.RX-FINAL Workstream F (FINDING-7 - live product-flow gating).
// ---------------------------------------------------------------------------

/**
 * The only two AnalysisRunStatus values that represent authoritative,
 * "actually completed appropriately" contract-model truth - see
 * docs/phase-3f1-6-rx-final-terminal-closure/08-product-flow-gating.json.
 * PENDING/RUNNING/PARTIAL/FAILED (and no row at all) are all deliberately
 * excluded: PARTIAL means at least one instrument's analysis durably FAILED
 * (AUDIT-F3) and must not be presented as "review-ready," matching this
 * phase's own required invariant verbatim.
 */
const ANALYSIS_READY_STATUSES = new Set<AnalysisRunStatus>(["COMPLETED", "COMPLETED_WITH_REVIEW"]);

export type AnalysisReadinessReason = "NO_DOCUMENTS" | "NEVER_ANALYZED" | "RUN_IN_PROGRESS" | "RUN_NOT_READY" | "STALE_DOCUMENTS_SINCE_LAST_RUN" | "READY";

export interface AnalysisReadiness {
  /** True only when a real, current AnalysisRun genuinely covers every document this company currently has, with a status this phase's own invariant treats as "completed appropriately." */
  ready: boolean;
  run: AnalysisRun | null;
  reason: AnalysisReadinessReason;
}

/**
 * The single gate predicate FINDING-7 requires: "a document/package must not
 * be presented in the UI as analysis-complete / review-ready / usable
 * contract truth unless an authoritative AnalysisRun for the current
 * document package + algorithm version has actually completed appropriately
 * (COMPLETED or COMPLETED_WITH_REVIEW, not PENDING/RUNNING/FAILED/absent)."
 *
 * A company with zero documents at all is treated as trivially "ready" -
 * there is nothing to analyze, and gating an empty onboarding company would
 * only block the pre-existing "no candidates yet" empty state, not close any
 * real bypass. Once at least one Document exists, this requires BOTH a
 * completed-appropriately run AND that every current document id is covered
 * by that run's own documentIds - a document uploaded after the last
 * completed run (before a fresh analysis has run over it) is the same
 * bypass shape as never having analyzed at all, and must not read as ready
 * either.
 */
export async function getAnalysisReadinessForCompany(companyId: string): Promise<AnalysisReadiness> {
  const [documentIds, run] = await Promise.all([prisma.document.findMany({ where: { companyId }, select: { id: true } }), getLatestAnalysisRunForCompany(companyId)]);

  if (documentIds.length === 0) return { ready: true, run, reason: "NO_DOCUMENTS" };
  if (!run) return { ready: false, run: null, reason: "NEVER_ANALYZED" };
  if (run.status === "PENDING" || run.status === "RUNNING") return { ready: false, run, reason: "RUN_IN_PROGRESS" };
  if (!ANALYSIS_READY_STATUSES.has(run.status)) return { ready: false, run, reason: "RUN_NOT_READY" };

  const coveredIds = new Set(run.documentIds);
  const stale = documentIds.some((d) => !coveredIds.has(d.id));
  if (stale) return { ready: false, run, reason: "STALE_DOCUMENTS_SINCE_LAST_RUN" };

  return { ready: true, run, reason: "READY" };
}
