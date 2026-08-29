/**
 * Evaluation Methodology V2 — artifact writing helpers.
 *
 * Phase 3F.1.5. Everything written by this evaluator goes under
 * docs/evaluation-v2/. No runner may write into any frozen fixture, ground
 * truth, historical scorer output, or phase report; the import-boundary test
 * enforces that mechanically.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { contentHash, currentVersions } from "../identity";
import type { CandidateSemanticRepresentation, EvidencePacket, PairAssessment, UnitEvaluationResult } from "../types";

export const ARTIFACT_DIR = "docs/evaluation-v2";

export function writeArtifact(repoRoot: string, name: string, payload: unknown): { path: string; sha256: string; bytes: number } {
  const dir = join(repoRoot, ARTIFACT_DIR);
  mkdirSync(dir, { recursive: true });
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  const path = join(dir, name);
  writeFileSync(path, body);
  return { path: `${ARTIFACT_DIR}/${name}`, sha256: contentHash(body), bytes: Buffer.byteLength(body) };
}

export function artifactHeader(artifactId: string, purpose: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    artifactId,
    phase: "PHASE_3F_1_5_EVALUATION_METHODOLOGY_V2",
    purpose,
    versions: currentVersions(),
    generatedBy: "lib/contract-model/evaluation-v2/runner",
    ...(extra ?? {}),
  };
}

const EXCERPT_LIMIT = 420;

export interface TrimmedPair {
  candidateId: string;
  representationType: string;
  accountingRole: string;
  candidateSectionRef: string | null;
  generationReasons: string[];
  correspondence: string;
  correspondenceStrength: number;
  dimensionOutcomes: Record<string, string>;
  materialConflicts: { code: string; dimension: string; explanation: string }[];
  missingDimensions: string[];
  candidateExcerpt: string;
  candidateNormalizedSemantics: string;
  provenancePath: string;
  reason: string;
}

export function trimPair(pair: PairAssessment, candidate: CandidateSemanticRepresentation | undefined): TrimmedPair {
  const dimensionOutcomes: Record<string, string> = {};
  for (const d of pair.dimensions) dimensionOutcomes[d.dimension] = d.outcome;
  return {
    candidateId: pair.candidateId,
    representationType: candidate?.representationType ?? "(unresolved)",
    accountingRole: candidate?.accountingRole ?? "(unresolved)",
    candidateSectionRef: candidate?.sectionRef ?? null,
    generationReasons: pair.generationReasons,
    correspondence: pair.correspondence,
    correspondenceStrength: pair.correspondenceStrength,
    dimensionOutcomes,
    materialConflicts: pair.conflicts.filter((c) => c.severity === "MATERIAL_CONFLICT").map((c) => ({ code: c.code, dimension: c.dimension, explanation: c.explanation })),
    missingDimensions: pair.dimensions.filter((d) => d.outcome === "MISSING_REQUIRED_DIMENSION").map((d) => d.dimension),
    candidateExcerpt: (candidate?.excerpts[0] ?? "").slice(0, EXCERPT_LIMIT),
    candidateNormalizedSemantics: (candidate?.normalizedSemantics ?? "").slice(0, EXCERPT_LIMIT),
    provenancePath: candidate?.provenancePath ?? "",
    reason: pair.reason.slice(0, 900),
  };
}

export interface TrimmedUnit {
  gtUnitId: string;
  documentId: string;
  sectionRef: string;
  materiality: string;
  unitType: string;
  semanticFamily: string;
  provisionRole: string;
  matchStatus: string;
  representationStatus: string;
  semanticCorrectness: string;
  dangerousUnaccountedV2: boolean;
  dangerousUnaccountedReason: string | null;
  explicitlySurfacedAsUnsafe: boolean;
  surfacedAsUnsafeBy: string[];
  surfacedByInventoryOnly: string[];
  matchedCandidateIds: string[];
  rejectedCandidateCount: number;
  ambiguousClusters: string[][];
  confidence: string;
  reason: string;
  groundTruthQuality: string;
  groundTruthExcerpt: string;
  groundTruthSemanticDescription: string;
  groundTruthExcerptResolution: string;
  evaluatedPairs: TrimmedPair[];
  evaluatedPairCount: number;
}

export function trimUnit(
  unit: UnitEvaluationResult,
  groundTruthExcerpt: string,
  groundTruthSemanticDescription: string,
  groundTruthExcerptResolution: string,
  candidatesById: Map<string, CandidateSemanticRepresentation>,
  maxPairs = 4,
): TrimmedUnit {
  const ordered = [...unit.pairAssessments].sort((a, b) => {
    const aMatched = unit.matchedCandidateIds.includes(a.candidateId) ? 1 : 0;
    const bMatched = unit.matchedCandidateIds.includes(b.candidateId) ? 1 : 0;
    if (aMatched !== bMatched) return bMatched - aMatched;
    return b.correspondenceStrength - a.correspondenceStrength;
  });
  return {
    gtUnitId: unit.gtUnitId,
    documentId: unit.documentId,
    sectionRef: unit.sectionRef,
    materiality: unit.materiality,
    unitType: unit.unitType,
    semanticFamily: unit.semanticFamily,
    provisionRole: unit.provisionRole,
    matchStatus: unit.matchStatus,
    representationStatus: unit.representationStatus,
    semanticCorrectness: unit.semanticCorrectness,
    dangerousUnaccountedV2: unit.dangerousUnaccountedV2,
    dangerousUnaccountedReason: unit.dangerousUnaccountedReason,
    explicitlySurfacedAsUnsafe: unit.explicitlySurfacedAsUnsafe,
    surfacedAsUnsafeBy: unit.surfacedAsUnsafeBy.slice(0, 5),
    surfacedByInventoryOnly: unit.surfacedByInventoryOnly.slice(0, 5),
    matchedCandidateIds: unit.matchedCandidateIds,
    rejectedCandidateCount: unit.rejectedCandidateIds.length,
    ambiguousClusters: unit.ambiguousClusters,
    confidence: unit.confidence,
    reason: (unit.reasonForCredit ?? unit.reasonForPartialCredit ?? unit.reasonForNoCredit ?? "").slice(0, 1200),
    groundTruthQuality: unit.groundTruthQuality,
    groundTruthExcerpt: groundTruthExcerpt.slice(0, 900),
    groundTruthSemanticDescription,
    groundTruthExcerptResolution,
    evaluatedPairs: ordered.slice(0, maxPairs).map((p) => trimPair(p, candidatesById.get(p.candidateId))),
    evaluatedPairCount: unit.pairAssessments.length,
  };
}

export function packetSummary(packet: EvidencePacket): Record<string, unknown> {
  return {
    packetId: packet.packetId,
    gtUnitId: packet.gtUnitId,
    documentId: packet.documentId,
    sectionRef: packet.sectionRef,
    materiality: packet.materiality,
    groundTruthExcerpt: packet.groundTruthExcerpt,
    groundTruthExcerptResolution: packet.groundTruthExcerptResolution,
    groundTruthSemanticDescription: packet.groundTruthSemanticDescription,
    groundTruthAdjudication: packet.groundTruthAdjudication,
    candidates: packet.candidates,
    deterministicSignalComparison: packet.deterministicSignalComparison,
    semanticJudgeOutputs: packet.semanticJudgeOutputs,
  };
}
