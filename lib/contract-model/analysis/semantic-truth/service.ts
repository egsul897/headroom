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
 */
export async function persistSemanticTruthForInstrument(input: PersistSemanticTruthInput): Promise<PersistSemanticTruthSummary> {
  const summary: PersistSemanticTruthSummary = { upserted: 0, unchanged: 0, byTrustStatus: { COMPILED: 0, VERIFIED: 0, REVIEW_REQUIRED: 0, CONTRADICTED: 0, UNSUPPORTED: 0 } };

  for (const entry of input.objects) {
    const { kind, object, candidateRef, compilerVersions, verification, verifierPromptVersion } = entry;
    const semanticObjectId = objectId(kind, object);
    const sufficiency = sufficiencyOf(object);
    const trustStatus = computeTrustStatus(sufficiency, verification);
    summary.byTrustStatus[trustStatus] += 1;

    const payload = object as unknown as object;
    const contentHash = contentHashOf(payload);
    const provenance = object.provenance ?? null;

    const existing = await prisma.semanticTruthRecord.findUnique({
      where: { companyId_instrumentKey_kind_semanticObjectId: { companyId: input.companyId, instrumentKey: input.instrumentKey, kind, semanticObjectId } },
    });

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

    if (!existing) {
      await prisma.semanticTruthRecord.create({
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
      summary.upserted += 1;
      continue;
    }

    const contentChanged = existing.contentHash !== contentHash;
    await prisma.semanticTruthRecord.update({
      where: { id: existing.id },
      data: {
        ...mutableData,
        ...(contentChanged ? { payload, payloadSchemaVersion: object.irSchemaVersion, contentHash, version: { increment: 1 } } : {}),
      },
    });
    if (contentChanged) summary.upserted += 1;
    else summary.unchanged += 1;
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
