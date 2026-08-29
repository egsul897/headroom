/**
 * Evaluation Methodology V2 — matched-evidence persistence.
 *
 * Phase 3F.1.5. MANDATORY, not optional: a future reviewer must be able to
 * audit any match WITHOUT re-running the pipeline. Every packet therefore
 * carries the actual excerpt text on both sides, the deterministic
 * dimension-by-dimension comparison, the numeric comparison detail, every
 * conflict finding, the semantic-judge output where one was consulted, and the
 * adjudication provenance of the ground truth itself.
 */
import { contentHash } from "./identity";
import { detectConflicts } from "./conflicts";
import { signalsForCandidate, signalsForGroundTruth } from "./semantic-correspondence";
import type {
  CandidateSemanticRepresentation,
  EvidencePacket,
  EvidencePacketCandidateView,
  GroundTruthSemanticUnit,
  SemanticJudgeOutput,
  UnitEvaluationResult,
} from "./types";

export interface BuildPacketInput {
  gt: GroundTruthSemanticUnit;
  result: UnitEvaluationResult;
  candidatesById: Map<string, CandidateSemanticRepresentation>;
  /** How many evaluated (not merely generated) candidates to include. All matched candidates are always included. */
  maxCandidates?: number;
  /** Truncate excerpts to keep artifacts readable; 0 = no truncation. */
  excerptCharLimit?: number;
}

function view(candidate: CandidateSemanticRepresentation, limit: number): EvidencePacketCandidateView {
  return {
    candidateId: candidate.candidateId,
    representationType: candidate.representationType,
    accountingRole: candidate.accountingRole,
    sectionRef: candidate.sectionRef,
    excerpts: candidate.excerpts.map((e) => (limit > 0 ? e.slice(0, limit) : e)),
    normalizedSemantics: candidate.normalizedSemantics,
    selfReportedState: candidate.selfReportedState,
    provenancePath: candidate.provenancePath,
  };
}

export function buildEvidencePacket(input: BuildPacketInput): EvidencePacket {
  const { gt, result, candidatesById } = input;
  const limit = input.excerptCharLimit ?? 1200;
  const maxCandidates = input.maxCandidates ?? 6;

  const matched = result.matchedCandidateIds;
  const others = result.pairAssessments
    .map((p) => p.candidateId)
    .filter((id) => !matched.includes(id))
    .slice(0, Math.max(0, maxCandidates - matched.length));
  const includedIds = [...matched, ...others];

  const candidates: EvidencePacketCandidateView[] = [];
  const deterministicSignalComparison: EvidencePacket["deterministicSignalComparison"] = [];
  const semanticJudgeOutputs: SemanticJudgeOutput[] = [];

  const gtSignals = signalsForGroundTruth(gt);
  for (const id of includedIds) {
    const candidate = candidatesById.get(id);
    if (!candidate) continue;
    candidates.push(view(candidate, limit));
    const pair = result.pairAssessments.find((p) => p.candidateId === id);
    const { numericComparisons } = detectConflicts({ gt, candidate, gtSignals, candidateSignals: signalsForCandidate(candidate) });
    deterministicSignalComparison.push({
      candidateId: id,
      dimensions: pair?.dimensions ?? [],
      conflicts: pair?.conflicts ?? [],
      numericComparison: numericComparisons,
    });
    if (pair?.judge) semanticJudgeOutputs.push(pair.judge);
  }

  return {
    packetId: contentHash({ gtUnitId: gt.gtUnitId, includedIds, versions: result.versions }),
    gtUnitId: gt.gtUnitId,
    datasetKey: gt.datasetKey,
    documentId: gt.documentId,
    sectionRef: gt.sectionRef,
    materiality: gt.materiality,
    groundTruthExcerpt: limit > 0 ? gt.sourceExcerpt.slice(0, limit) : gt.sourceExcerpt,
    groundTruthExcerptResolution: gt.sourceExcerptResolution,
    groundTruthSemanticDescription: gt.semanticDescription,
    groundTruthAdjudication: gt.adjudication,
    candidates,
    deterministicSignalComparison,
    semanticJudgeOutputs,
    versions: result.versions,
  };
}

/**
 * The blinded packet handed to the second-pass adjudicator. It deliberately
 * omits this evaluator's own disposition so the reviewer forms an independent
 * judgment; the sealed label file is written separately.
 */
export interface BlindEvidencePacket extends Omit<EvidencePacket, "deterministicSignalComparison"> {
  deterministicSignalComparison: EvidencePacket["deterministicSignalComparison"];
  reviewerQuestion: string;
}

export function blindPacket(packet: EvidencePacket): BlindEvidencePacket {
  return {
    ...packet,
    reviewerQuestion:
      "Does any candidate representation below substantively represent the ground-truth claim above? Answer per candidate (YES / PARTIAL / NO / AMBIGUOUS), then give one overall disposition for the claim (REPRESENTED / PARTIALLY_REPRESENTED / UNREPRESENTED / AMBIGUOUS / HONESTLY_UNRESOLVED / HONESTLY_UNSUPPORTED), citing the excerpt text you relied on. Structural adjacency (same section number, parent/child, nearby figure) is not evidence of correspondence.",
  };
}
