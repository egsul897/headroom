/**
 * Phase 3F.1.6.RX Workstream H (AUDIT-F1) - persistence + reload service for
 * SemanticTruthRecord. See prisma/schema.prisma's own model doc comment for
 * the full design rationale (JSON-payload-body decision, idempotency key,
 * trust-gating contract) and
 * docs/phase-3f1-6-rx-final-blocker-closure/09-semantic-truth-persistence-design.json
 * for the design writeup.
 *
 * TRUTH OWNERSHIP (this phase's own charter Section 10 - see
 * 17-truth-ownership.json): `getTrustedSemanticTruth` below is the ONE
 * function any future downstream reader ("what is this instrument's
 * current, trusted semantic contract truth") should call - it is the only
 * function in this module that filters to trustStatus VERIFIED. Every other
 * read function here is explicitly for AUDIT/REVIEW visibility across every
 * trust status, never silently promoted to "current truth."
 */
import { prisma } from "../../../prisma";
import { Prisma } from "@prisma/client";
import { computeStableKey } from "../../stable-keys";
import { canonicalStringify } from "../../ir/identity";
import { computeTrustStatus, summarizeFindings } from "./mapping";
import type { IRDefinition, IRRule, RepresentationSufficiency } from "../../ir/types";
import type { SemanticTruthRecord } from "@prisma/client";
import type { PersistSemanticTruthInput, PersistSemanticTruthSummary, SemanticTruthObjectInput } from "./types";

const MAX_EXCERPT_LENGTH = 2000;

function boundedExcerpt(excerpt: string | null | undefined): string | null {
  if (!excerpt) return null;
  return excerpt.length > MAX_EXCERPT_LENGTH ? `${excerpt.slice(0, MAX_EXCERPT_LENGTH)}... [truncated]` : excerpt;
}

/** Prisma treats a bare `undefined` value in `data` as "leave this field unchanged" on update - the opposite of what a genuinely-null mutable Json field (e.g. this attempt found no verification findings, where a prior attempt had some) must do, which is actually clear it. `Prisma.JsonNull` is the documented idiom for an explicit null write to a nullable Json column (mirrors service.ts's own `fatalError: Prisma.JsonNull` precedent for AnalysisRun). */
function jsonOrExplicitNull(value: object | null): object | typeof Prisma.JsonNull {
  return value ?? Prisma.JsonNull;
}

function objectId(kind: SemanticTruthObjectInput["kind"], object: IRRule | IRDefinition): string {
  return kind === "RULE" ? (object as IRRule).ruleId : (object as IRDefinition).definitionId;
}

function sectionRefFor(kind: SemanticTruthObjectInput["kind"], object: IRRule | IRDefinition): string | null {
  return kind === "RULE" ? (object as IRRule).sourceSectionRef : null;
}

function sufficiencyOf(object: IRRule | IRDefinition): RepresentationSufficiency {
  return object.sufficiency;
}

/** Only IRRule carries operativeLineage (IRDefinition has no direct operative-state lineage concept of its own - a defined term's mechanics are not themselves amended/superseded the way a rule's own operative provision text can be). Null for a definition, never fabricated. */
function operativeLineageOf(kind: SemanticTruthObjectInput["kind"], object: IRRule | IRDefinition): object | null {
  return kind === "RULE" ? ((object as IRRule).operativeLineage as object | null) : null;
}

function contentHashOf(payload: unknown): string {
  return computeStableKey("semantic-truth-payload", canonicalStringify(payload));
}

/**
 * Persists (upserts) durable state for every compiled IRRule/IRDefinition
 * produced for one instrument during one analysis attempt. Idempotent by
 * construction: `semanticObjectId` (IRRule.ruleId/IRDefinition.definitionId)
 * is itself already stable and content-derived
 * (lib/contract-model/ir/identity.ts's computeRuleId/computeDefinitionId -
 * never sufficiency/verification-status-dependent), so re-running analysis
 * over unchanged source text always resolves to the SAME row here; a real
 * content change (`contentHash` differs from what is already persisted)
 * bumps `version` and `updatedAt`, while a genuine no-op re-persist of
 * identical content updates nothing but the mutable trust/verification
 * fields that legitimately CAN change between attempts without the
 * underlying rule content changing (a later re-run's own verification
 * result, in particular).
 *
 * Phase 3F.1.6.RX-FINAL Workstream E (FINDING-6 - zombie-writer fencing),
 * CLOSED by Phase 3F.1-terminal Part A (OPEN-5 / AUDIT-F2 residual - see
 * docs/phase-3f1-terminal-architecture-decision/07-analysis-run-fencing.json).
 *
 * An earlier version of this function fenced with a single check-then-act
 * read: one `findUnique` against the run's `executionGeneration` at the top
 * of the call, then N independent, unguarded upserts. The Part B
 * independent recertification (docs/phase-3f1-6-rx-final-terminal-closure/
 * 18-part-b-finding6-recertification.json) reproduced, against real
 * Postgres via two separate methods (a deterministic controlled interleave
 * and a genuinely unmocked `Promise.all` timing race, reliable across 6
 * consecutive runs), a superseded writer's own check honestly passing
 * (because it read the row before a concurrent reclaim committed) and then
 * its later, unguarded upsert silently clobbering a NEW owner's
 * already-persisted, fresher content for the identical `semanticObjectId` -
 * the exact "zombie writer overwrites the new owner's live state" defect
 * shape this finding exists to close, just in `SemanticTruthRecord` rather
 * than in the `AnalysisRun` row itself. That check-then-act gate's own
 * accepted-risk rationale ("a genuinely still-racing writer has nothing
 * left to gain") was FALSIFIED: `SemanticTruthRecord` is itself the durable,
 * independently-readable "current truth" (`getTrustedSemanticTruth` reads it
 * directly, regardless of the `AnalysisRun` row's own status), so a stale
 * write landing here corrupts exactly the live state this finding protects.
 *
 * `SemanticTruthRecord` still carries no `executionGeneration` column of its
 * own (adding one remains out of this finding's bounded scope - the fix
 * does not touch prisma/schema.prisma or require a migration). Instead,
 * whenever the caller supplies BOTH a real `analysisRunId` and an
 * `expectedGeneration`, this function:
 *
 *   1. Takes the SAME cheap top-level pre-check as before (a plain
 *      `findUnique`) so an already-superseded call can bail out before
 *      doing any per-object work at all - purely an optimization now, not
 *      the source of the actual guarantee.
 *   2. Wraps EACH object's own read-existing + create/update in its OWN
 *      short `prisma.$transaction`, which FIRST takes a real Postgres row
 *      lock on the parent `analysis_runs` row (`SELECT "executionGeneration"
 *      ... FOR UPDATE`, the identical primitive `recordAnalysisRunIssue`
 *      already uses successfully for its own child-table fencing) and only
 *      proceeds to that object's own upsert if the lock-protected,
 *      freshly-read generation still matches `expectedGeneration`. Because
 *      the check and the write are the SAME transaction, there is no window
 *      between them for a concurrent reclaim to slip into for THAT write -
 *      and because `startOrResumeAnalysisRun`'s own stale-reclaim
 *      `updateMany` needs the identical row lock to apply its own atomic
 *      generation bump, a reclaim racing a single object's transaction
 *      either commits strictly before it (so this check correctly sees the
 *      bumped generation and rejects) or blocks until it commits (so this
 *      object's write, made while still genuinely current, is legitimate
 *      and stands - exactly mirroring what already-committed writes from
 *      `setAnalysisRunStage` et al. mean before a reclaim: a write that
 *      genuinely lands before generation N+1 is issued is correct by
 *      construction; a write attempted after is fenced out).
 *
 * On a stale generation, `skippedSupersededGeneration: true` is returned and
 * the loop stops immediately (generation only ever increases, so every
 * remaining object in this same call would also observe a stale
 * generation) - fails closed, never throws, exactly the no-throw-on-stale-
 * write discipline `setAnalysisRunStage`/`completeAnalysisRun`/
 * `failAnalysisRun` already established.
 */
export async function persistSemanticTruthForInstrument(input: PersistSemanticTruthInput): Promise<PersistSemanticTruthSummary> {
  const summary: PersistSemanticTruthSummary = { upserted: 0, unchanged: 0, byTrustStatus: { COMPILED: 0, VERIFIED: 0, REVIEW_REQUIRED: 0, CONTRADICTED: 0, UNSUPPORTED: 0 }, skippedSupersededGeneration: false };

  const fence = input.analysisRunId != null && input.expectedGeneration != null ? { analysisRunId: input.analysisRunId, expectedGeneration: input.expectedGeneration } : null;

  if (fence) {
    // Cheap top-level pre-check - purely an optimization (skip the whole
    // call, including opening any per-object transaction, when this
    // execution is ALREADY known-superseded before doing any work). The
    // actual fencing guarantee lives in the per-object transaction below,
    // never here alone - see this function's own doc comment.
    const run = await prisma.analysisRun.findUnique({ where: { id: fence.analysisRunId }, select: { executionGeneration: true } });
    if (!run || run.executionGeneration !== fence.expectedGeneration) {
      summary.skippedSupersededGeneration = true;
      return summary;
    }
  }

  for (const entry of input.objects) {
    const { kind, object, candidateRef, compilerVersions, verification, verifierPromptVersion } = entry;
    const semanticObjectId = objectId(kind, object);
    const sufficiency = sufficiencyOf(object);
    const trustStatus = computeTrustStatus(sufficiency, verification);

    const payload = object as unknown as object;
    const contentHash = contentHashOf(payload);
    const provenance = object.provenance ?? null;

    const mutableData = {
      packageKey: input.packageKey,
      analysisRunId: input.analysisRunId,
      candidateRef,
      sourceDocumentId: object.sourceDocumentId,
      sourceSectionRef: sectionRefFor(kind, object),
      sourceCitation: provenance?.sourceCitation ?? null,
      sourceExcerpt: boundedExcerpt(provenance?.excerpt ?? null),
      irSchemaVersion: compilerVersions.irSchemaVersion,
      compilerAlgorithmVersion: compilerVersions.compilerAlgorithmVersion,
      compilerPromptVersion: compilerVersions.compilerPromptVersion,
      toolPolicyVersion: compilerVersions.toolPolicyVersion,
      verifierAlgorithmVersion: verification?.verifierAlgorithmVersion ?? null,
      verifierPromptVersion: verification ? verifierPromptVersion : null,
      verificationStatus: verification?.status ?? null,
      trustStatus,
      sufficiency,
      sufficiencyReasons: object.sufficiencyReasons,
      operativeLineage: jsonOrExplicitNull(operativeLineageOf(kind, object)),
      findingsSummary: jsonOrExplicitNull(summarizeFindings(verification) as unknown as object | null),
    };

    // FINDING-6 (OPEN-5 closure): the generation re-check (when `fence` is
    // set) and this object's own read-existing + create/update all run
    // inside ONE transaction. `SELECT ... FOR UPDATE` takes a real row lock
    // on the SAME `analysis_runs` row `startOrResumeAnalysisRun`'s own
    // stale-reclaim `updateMany` needs to apply its atomic generation bump -
    // so a concurrent reclaim either commits strictly before this check
    // (correctly observed as stale here) or is blocked until this
    // transaction commits (this object's write was made while genuinely
    // still current, and stands). Never a separate read-then-write: there is
    // no window between "checked current" and "wrote" for THIS object.
    const outcome = await prisma.$transaction(async (tx) => {
      if (fence) {
        const rows = await tx.$queryRaw<{ executionGeneration: number }[]>`SELECT "executionGeneration" FROM "analysis_runs" WHERE id = ${fence.analysisRunId} FOR UPDATE`;
        const current = rows[0]?.executionGeneration;
        if (current === undefined || current !== fence.expectedGeneration) {
          return { kind: "STALE" as const };
        }
      }

      const existing = await tx.semanticTruthRecord.findUnique({
        where: { companyId_instrumentKey_kind_semanticObjectId: { companyId: input.companyId, instrumentKey: input.instrumentKey, kind, semanticObjectId } },
      });

      if (!existing) {
        await tx.semanticTruthRecord.create({
          data: {
            companyId: input.companyId,
            instrumentKey: input.instrumentKey,
            kind,
            semanticObjectId,
            ...mutableData,
            payloadSchemaVersion: object.irSchemaVersion,
            payload,
            contentHash,
            version: 1,
          },
        });
        return { kind: "CREATED" as const };
      }

      const contentChanged = existing.contentHash !== contentHash;
      await tx.semanticTruthRecord.update({
        where: { id: existing.id },
        data: {
          ...mutableData,
          ...(contentChanged ? { payload, payloadSchemaVersion: object.irSchemaVersion, contentHash, version: { increment: 1 } } : {}),
        },
      });
      return { kind: contentChanged ? ("CONTENT_CHANGED" as const) : ("UNCHANGED" as const) };
    });

    if (outcome.kind === "STALE") {
      // Fail closed, never throw - an ordinary, expected outcome of losing a
      // race, exactly like a stale `setAnalysisRunStage`/`completeAnalysisRun`
      // /`failAnalysisRun` call returning `false`/`null`. Generation only
      // ever increases, so every remaining object in this same call would
      // also observe a stale generation - stop here rather than opening
      // (and losing) N more pointless per-object transactions/locks.
      summary.skippedSupersededGeneration = true;
      break;
    }

    summary.byTrustStatus[trustStatus] += 1;
    if (outcome.kind === "UNCHANGED") summary.unchanged += 1;
    else summary.upserted += 1;
  }

  return summary;
}

/**
 * The ONE authoritative "current trusted semantic contract truth" read for
 * an instrument - filters to trustStatus VERIFIED only (this phase's own
 * charter Section 19's trust-gating requirement: unverified/review-required
 * state must never be silently promoted to trusted). Every returned row's
 * `payload` deserializes to the exact IRRule/IRDefinition the compiler
 * produced, matched against `payloadSchemaVersion` for forward-compat.
 */
export async function getTrustedSemanticTruth(companyId: string, instrumentKey: string): Promise<SemanticTruthRecord[]> {
  return prisma.semanticTruthRecord.findMany({ where: { companyId, instrumentKey, trustStatus: "VERIFIED" }, orderBy: { updatedAt: "desc" } });
}

/** Every persisted semantic-truth row for an instrument, at ANY trust status - for audit/review UIs only, never to be read as "current truth" (see this module's own header comment). */
export async function getAllSemanticTruthForInstrument(companyId: string, instrumentKey: string): Promise<SemanticTruthRecord[]> {
  return prisma.semanticTruthRecord.findMany({ where: { companyId, instrumentKey }, orderBy: [{ kind: "asc" }, { updatedAt: "desc" }] });
}

export async function getSemanticTruthForRun(analysisRunId: string): Promise<SemanticTruthRecord[]> {
  return prisma.semanticTruthRecord.findMany({ where: { analysisRunId }, orderBy: { updatedAt: "desc" } });
}
