/**
 * Evaluation Methodology V2 — reconciliation against the historical scorers.
 *
 * Phase 3F.1.5. This module NEVER imports a historical scorer. It reads their
 * FROZEN RECORDED OUTPUT as data (what they concluded, per unit) and re-judges
 * the same ground-truth units independently with the V2 engine.
 *
 * The central operation is the known-false-credit reconciliation. The corrected
 * Phase 3F.1 scorer credited a ground-truth unit as "safely flagged" whenever
 * ANY member of the union {exact-address match} ∪ {all lettered descendants}
 * appeared in the coverage auditor's dangerous-unaccounted list. Its own
 * recorded `matchedUnitIds` therefore names the exact candidate set that
 * carried the credit. V2 re-evaluates each of those candidates against the
 * ground-truth claim on content alone — bypassing candidate generation entirely
 * so no per-unit cap can excuse a candidate from scrutiny — and asks whether
 * the credit-bearing candidate actually represents the claim.
 */
import { evaluatePair, signalsForCandidate, signalsForGroundTruth } from "./semantic-correspondence";
import type { CandidateSemanticRepresentation, GroundTruthSemanticUnit, PairAssessment, UnitEvaluationResult } from "./types";

export interface HistoricalScorerRow {
  gtUnitId: string;
  documentId: string;
  sectionRef: string;
  gtMateriality: string;
  unitType: string;
  auditMatch: string;
  auditMatchChapeauOnly?: boolean;
  auditMaterialityAssigned: string | null;
  coverageState: string | null;
  inDangerousUnaccounted: boolean;
  classification: string;
  matchedUnitIds?: string[];
}

export interface BridgeCase {
  gtUnitId: string;
  oldScorerResult: string;
  correctedScorerResult: string;
  isFalseCreditSuspect: boolean;
  sourceFact: string;
  whyCorrectedIsMoreOrLessFaithful: string;
}

export type FalseCreditVerdict = "FALSE_CREDIT_CONFIRMED_AND_REJECTED" | "GENUINE_CREDIT_UPHELD" | "AMBIGUOUS_NEEDS_REVIEW";

export interface CandidateJudgment {
  candidateId: string;
  candidateSectionRef: string | null;
  candidateExcerpt: string;
  candidateNormalizedSemantics: string;
  carriedTheOldCredit: boolean;
  correspondence: PairAssessment["correspondence"];
  correspondenceStrength: number;
  materialConflictCodes: string[];
  reason: string;
}

export interface FalseCreditReconciliationCase {
  gtUnitId: string;
  documentId: string;
  sectionRef: string;
  gtMateriality: string;
  groundTruthExcerpt: string;
  groundTruthSemanticDescription: string;
  bridgeSourceFact: string;
  previouslyConfirmedFalseCreditSuspect: boolean;

  oldScorerResult: string;
  correctedScorerResult: string;
  oldCreditReason: string;
  oldUnionSize: number;
  oldCreditBearingCandidateIds: string[];

  v2CandidateSetSize: number;
  v2JudgmentsOfOldCreditPath: CandidateJudgment[];
  v2IndependentDisposition: {
    matchStatus: string;
    representationStatus: string;
    semanticCorrectness: string;
    dangerousUnaccountedV2: boolean;
    explicitlySurfacedAsUnsafe: boolean;
    matchedCandidateIds: string[];
    reason: string;
  } | null;

  verdict: FalseCreditVerdict;
  falseCreditCaught: boolean;
  verdictRationale: string;
}

export interface ReconciliationInput {
  groundTruth: readonly GroundTruthSemanticUnit[];
  candidates: readonly CandidateSemanticRepresentation[];
  bridgeCases: readonly BridgeCase[];
  /** The corrected scorer's own recorded rows, which carry `matchedUnitIds`. */
  correctedScorerRows: readonly HistoricalScorerRow[];
  /** V2 unit results, if a full run has already been performed. */
  v2Units?: readonly UnitEvaluationResult[];
  /** Maps a historical coverage-auditor semanticUnitId to this evaluator's candidate id. */
  candidateIdForAuditUnit?: (auditUnitId: string) => string;
}

const DEFAULT_CANDIDATE_ID = (auditUnitId: string): string => `coverage-unit:${auditUnitId}`;

export function reconcileKnownFalseCredits(input: ReconciliationInput): FalseCreditReconciliationCase[] {
  const gtById = new Map(input.groundTruth.map((g) => [g.gtUnitId, g]));
  const candidateById = new Map(input.candidates.map((c) => [c.candidateId, c]));
  const rowById = new Map(input.correctedScorerRows.map((r) => [r.gtUnitId, r]));
  const v2ById = new Map((input.v2Units ?? []).map((u) => [u.gtUnitId, u]));
  const toCandidateId = input.candidateIdForAuditUnit ?? DEFAULT_CANDIDATE_ID;

  const out: FalseCreditReconciliationCase[] = [];

  for (const bridge of input.bridgeCases) {
    const gt = gtById.get(bridge.gtUnitId);
    const row = rowById.get(bridge.gtUnitId);
    if (!gt) continue;
    const gtSignals = signalsForGroundTruth(gt);

    const unionIds = row?.matchedUnitIds ?? [];
    // The candidates that actually carried the old credit: the union members
    // the coverage auditor had flagged as dangerous-unaccounted. Under the old
    // algorithm, ONE such member anywhere in the union was enough to mark the
    // whole ground-truth unit "safely flagged".
    const creditBearing: CandidateSemanticRepresentation[] = [];
    const otherUnionMembers: CandidateSemanticRepresentation[] = [];
    for (const auditUnitId of unionIds) {
      const candidate = candidateById.get(toCandidateId(auditUnitId));
      if (!candidate) continue;
      if (candidate.selfReportedState.flaggedDangerousUnaccounted) creditBearing.push(candidate);
      else otherUnionMembers.push(candidate);
    }

    // Judge every credit-bearing candidate, plus a bounded sample of the rest
    // of the union, by FORCED PAIRING — candidate generation is bypassed so no
    // per-unit cap can excuse a candidate from scrutiny.
    const toJudge = [...dedupe(creditBearing), ...dedupe(otherUnionMembers).slice(0, 8)];
    const judgments: CandidateJudgment[] = toJudge.map((candidate) => {
      const assessment = evaluatePair(
        { gt, candidate, generationReasons: ["EXPLICIT_TEST_PAIRING"], gtSignals, candidateSignals: signalsForCandidate(candidate) },
        { deterministicOnly: true },
        null,
      );
      return {
        candidateId: candidate.candidateId,
        candidateSectionRef: candidate.sectionRef,
        candidateExcerpt: (candidate.excerpts[0] ?? "").slice(0, 600),
        candidateNormalizedSemantics: candidate.normalizedSemantics.slice(0, 400),
        carriedTheOldCredit: candidate.selfReportedState.flaggedDangerousUnaccounted,
        correspondence: assessment.correspondence,
        correspondenceStrength: assessment.correspondenceStrength,
        materialConflictCodes: [...new Set(assessment.conflicts.filter((c) => c.severity === "MATERIAL_CONFLICT").map((c) => c.code))],
        reason: assessment.reason,
      };
    });

    const creditPathJudgments = judgments.filter((j) => j.carriedTheOldCredit);
    const anyFullCorrespondence = creditPathJudgments.some((j) => j.correspondence === "CORRESPONDS_FULLY");
    const anyPartialOrIndeterminate = creditPathJudgments.some((j) => j.correspondence === "CORRESPONDS_PARTIALLY" || j.correspondence === "INDETERMINATE");

    let verdict: FalseCreditVerdict;
    let rationale: string;
    if (creditPathJudgments.length === 0) {
      verdict = "FALSE_CREDIT_CONFIRMED_AND_REJECTED";
      rationale =
        `The corrected scorer credited this unit because its ${unionIds.length}-member address union contained a dangerous-unaccounted entry, ` +
        "but no credit-bearing candidate could be resolved for independent re-judgment, so the credit rests on nothing V2 can verify.";
    } else if (anyFullCorrespondence) {
      verdict = "GENUINE_CREDIT_UPHELD";
      rationale = `At least one candidate that carried the old credit does substantively represent this claim (${creditPathJudgments.filter((j) => j.correspondence === "CORRESPONDS_FULLY").map((j) => j.candidateId).join(", ")}).`;
    } else if (anyPartialOrIndeterminate) {
      verdict = "AMBIGUOUS_NEEDS_REVIEW";
      rationale =
        "No candidate that carried the old credit fully represents this claim; at least one corresponds partially or could not be decided deterministically. " +
        "The credit is not upheld, and the unit is referred for second-pass adjudication rather than being silently credited or silently rejected.";
    } else {
      verdict = "FALSE_CREDIT_CONFIRMED_AND_REJECTED";
      rationale =
        `Every candidate that carried the old credit fails semantic correspondence with this claim` +
        `${creditPathJudgments[0]?.materialConflictCodes.length ? ` (material conflicts: ${[...new Set(creditPathJudgments.flatMap((j) => j.materialConflictCodes))].join(", ")})` : ""}. ` +
        "The old credit was structural proximity, not representation.";
    }

    const v2 = v2ById.get(bridge.gtUnitId);
    out.push({
      gtUnitId: bridge.gtUnitId,
      documentId: gt.documentId,
      sectionRef: gt.sectionRef,
      gtMateriality: gt.materiality,
      groundTruthExcerpt: gt.sourceExcerpt.slice(0, 900),
      groundTruthSemanticDescription: gt.semanticDescription,
      bridgeSourceFact: bridge.sourceFact,
      previouslyConfirmedFalseCreditSuspect: bridge.isFalseCreditSuspect,
      oldScorerResult: bridge.oldScorerResult,
      correctedScorerResult: bridge.correctedScorerResult,
      oldCreditReason:
        `Corrected (descendant-union) scorer: auditMatch=${row?.auditMatch ?? "?"}, coverageState=${row?.coverageState ?? "?"}, ` +
        `inDangerousUnaccounted=${String(row?.inDangerousUnaccounted ?? false)} computed over a ${unionIds.length}-member union of the ground-truth address and every lettered descendant of it.`,
      oldUnionSize: unionIds.length,
      oldCreditBearingCandidateIds: creditBearing.map((c) => c.candidateId),
      v2CandidateSetSize: v2?.pairAssessments.length ?? 0,
      v2JudgmentsOfOldCreditPath: judgments,
      v2IndependentDisposition: v2
        ? {
            matchStatus: v2.matchStatus,
            representationStatus: v2.representationStatus,
            semanticCorrectness: v2.semanticCorrectness,
            dangerousUnaccountedV2: v2.dangerousUnaccountedV2,
            explicitlySurfacedAsUnsafe: v2.explicitlySurfacedAsUnsafe,
            matchedCandidateIds: v2.matchedCandidateIds,
            reason: v2.reasonForCredit ?? v2.reasonForPartialCredit ?? v2.reasonForNoCredit ?? "",
          }
        : null,
      verdict,
      falseCreditCaught: verdict !== "GENUINE_CREDIT_UPHELD",
      verdictRationale: rationale,
    });
  }

  return out.sort((a, b) => a.gtUnitId.localeCompare(b.gtUnitId));
}

function dedupe(candidates: readonly CandidateSemanticRepresentation[]): CandidateSemanticRepresentation[] {
  const seen = new Set<string>();
  const out: CandidateSemanticRepresentation[] = [];
  for (const c of candidates) {
    if (seen.has(c.candidateId)) continue;
    seen.add(c.candidateId);
    out.push(c);
  }
  return out;
}

/**
 * The Phase 3F.1.5 gate: every previously-confirmed false credit must be
 * REJECTED or referred for review. None may be silently upheld.
 */
export interface FalseCreditGateResult {
  confirmedSuspectCount: number;
  rejectedOrFlagged: string[];
  silentlyUpheld: string[];
  passed: boolean;
}

export function evaluateFalseCreditGate(cases: readonly FalseCreditReconciliationCase[]): FalseCreditGateResult {
  const suspects = cases.filter((c) => c.previouslyConfirmedFalseCreditSuspect);
  const silentlyUpheld = suspects.filter((c) => c.verdict === "GENUINE_CREDIT_UPHELD").map((c) => c.gtUnitId);
  return {
    confirmedSuspectCount: suspects.length,
    rejectedOrFlagged: suspects.filter((c) => c.verdict !== "GENUINE_CREDIT_UPHELD").map((c) => c.gtUnitId),
    silentlyUpheld,
    passed: silentlyUpheld.length === 0,
  };
}
