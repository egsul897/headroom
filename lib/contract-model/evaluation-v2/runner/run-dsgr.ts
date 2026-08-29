/**
 * Evaluation Methodology V2 — DSGR historical validation runner.
 *
 * Phase 3F.1.5. Writes:
 *   04-dsgr-unit-level-reconciliation.json
 *   05-dsgr-old-vs-v2.json
 *   06-known-false-credit-reconciliation.json
 *   07-dsgr-v2-aggregate-metrics.json
 *   10-ground-truth-quality-audit.json
 *   _stratified-sample-for-second-pass.json          (evidence only, NO V2 label)
 *   _stratified-sample-v2-labels-SEALED.json         (this evaluator's own labels)
 *
 * Historical artifacts (ground truth, scoring report, forensics) are read only.
 *
 * Run: npx tsx lib/contract-model/evaluation-v2/runner/run-dsgr.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DSGR_DATASET_KEY, loadDsgrDataset } from "../adapters/dsgr";
import { contentHash } from "../identity";
import { blindPacket, buildEvidencePacket } from "../evidence";
import { runEvaluationV2 } from "../index";
import { evaluateFalseCreditGate, reconcileKnownFalseCredits } from "../reconciliation";
import type { BridgeCase, FalseCreditReconciliationCase, HistoricalScorerRow } from "../reconciliation";
import type { CandidateSemanticRepresentation, EvaluationRunResult, GroundTruthSemanticUnit, UnitEvaluationResult } from "../types";
import { artifactHeader, packetSummary, trimUnit, writeArtifact } from "./artifacts";

const GT_DIR = "tests/fixtures/unseen-packages/phase-3f-ground-truth";
const FORENSICS_DIR = "tests/fixtures/unseen-packages/phase-3f1-1-forensics";

interface ScoringReport {
  reportId: string;
  groundTruthTotalUnits: number;
  metrics: Record<string, unknown>;
  allResults: HistoricalScorerRow[];
}
interface Bridge {
  counts: Record<string, number>;
  adversarialAudit: { falseCreditSuspectIds: string[]; falseCreditSuspectCount: number; semanticallyAdjustedResidualEstimate: number; note: string };
  perCaseBridge: BridgeCase[];
}

export interface DsgrRunOutput {
  result: EvaluationRunResult;
  groundTruth: GroundTruthSemanticUnit[];
  candidates: CandidateSemanticRepresentation[];
  falseCreditCases: FalseCreditReconciliationCase[];
  writtenArtifacts: { path: string; sha256: string; bytes: number }[];
}

export async function runDsgr(repoRoot: string): Promise<DsgrRunOutput> {
  const startedAt = Date.now();
  const dataset = loadDsgrDataset(repoRoot);
  const result = await runEvaluationV2(dataset.groundTruth, dataset.candidates, {
    datasetKey: DSGR_DATASET_KEY,
    inputHashes: dataset.inputHashes,
    adapterQualityFindings: dataset.qualityFindings,
  });

  const gtById = new Map(dataset.groundTruth.map((g) => [g.gtUnitId, g]));
  const candidatesById = new Map(dataset.candidates.map((c) => [c.candidateId, c]));
  const written: { path: string; sha256: string; bytes: number }[] = [];

  // ---------------------------------------------------------------- 04 ------
  const trimmed = result.units.map((u) => {
    const gt = gtById.get(u.gtUnitId);
    return trimUnit(u, gt?.sourceExcerpt ?? "", gt?.semanticDescription ?? "", gt?.sourceExcerptResolution ?? "UNRESOLVED_DESCRIPTION_ONLY", candidatesById);
  });
  written.push(
    writeArtifact(repoRoot, "04-dsgr-unit-level-reconciliation.json", {
      ...artifactHeader(
        "PHASE_3F_1_5_DSGR_UNIT_LEVEL_RECONCILIATION",
        "Every DSGR ground-truth unit's Evaluation V2 disposition, with the evidence that produced it. Each unit carries its own excerpt, its adjudicated semantic description, the candidates that were evaluated against it, the per-dimension outcomes, every material conflict, and the reason for credit / partial credit / no credit.",
      ),
      datasetKey: DSGR_DATASET_KEY,
      inputHashes: dataset.inputHashes,
      candidatePool: {
        total: dataset.candidates.length,
        droppedContentFreeCandidates: dataset.droppedContentFreeCandidates,
        note: "A candidate with no content text at all cannot demonstrate correspondence, so dropping it is recall-neutral; the count is disclosed rather than hidden.",
      },
      totalUnits: trimmed.length,
      representativeEvidencePackets: buildRepresentativePackets(result.units, gtById, candidatesById),
      units: trimmed,
    }),
  );

  // ---------------------------------------------------------------- 05 ------
  const scoringReport = JSON.parse(readFileSync(join(repoRoot, GT_DIR, "phase-3f-scoring-report.json"), "utf-8")) as ScoringReport;
  const correctedRows = JSON.parse(readFileSync(join(repoRoot, FORENSICS_DIR, "raw-scorer-combination-C-corrected-x-firstblind.json"), "utf-8")) as HistoricalScorerRow[];
  const originalById = new Map(scoringReport.allResults.map((r) => [r.gtUnitId, r]));
  const correctedById = new Map(correctedRows.map((r) => [r.gtUnitId, r]));

  const oldVsV2 = result.units.map((u) => {
    const original = originalById.get(u.gtUnitId);
    const corrected = correctedById.get(u.gtUnitId);
    return {
      gtUnitId: u.gtUnitId,
      documentId: u.documentId,
      sectionRef: u.sectionRef,
      materiality: u.materiality,
      unitType: u.unitType,
      oldOriginalScorer: original
        ? {
            classification: original.classification,
            auditMatch: original.auditMatch,
            auditMatchChapeauOnly: original.auditMatchChapeauOnly ?? false,
            coverageState: original.coverageState,
            inDangerousUnaccounted: original.inDangerousUnaccounted,
            creditMechanism: `structural sectionRef match (${original.auditMatch}) then coverage state of the best-materiality unit at that address`,
          }
        : null,
      oldCorrectedScorer: corrected
        ? {
            classification: corrected.classification,
            auditMatch: corrected.auditMatch,
            coverageState: corrected.coverageState,
            inDangerousUnaccounted: corrected.inDangerousUnaccounted,
            unionSize: corrected.matchedUnitIds?.length ?? 0,
            creditMechanism: "structural sectionRef match unioned with every lettered descendant; a dangerous flag on ANY union member credited the whole unit",
          }
        : null,
      v2: {
        matchStatus: u.matchStatus,
        representationStatus: u.representationStatus,
        semanticCorrectness: u.semanticCorrectness,
        dangerousUnaccountedV2: u.dangerousUnaccountedV2,
        explicitlySurfacedAsUnsafe: u.explicitlySurfacedAsUnsafe,
        matchedCandidateIds: u.matchedCandidateIds,
        creditMechanism: "semantic correspondence on action, posture and object/resource with no material conflict on breadth, entity scope, economics, conditions or operative provenance, AND a corresponding candidate whose accounting role is a substantive representation",
      },
      agreementWithCorrectedScorer: agreement(corrected?.classification ?? null, u),
    };
  });

  const oldCriticalViolations = scoringReport.allResults.filter((r) => r.gtMateriality === "CRITICAL" && r.classification.startsWith("VIOLATION_"));
  const correctedCriticalViolations = correctedRows.filter((r) => r.gtMateriality === "CRITICAL" && r.classification.startsWith("VIOLATION_"));
  const v2CriticalDangerous = result.units.filter((u) => u.materiality === "CRITICAL" && u.dangerousUnaccountedV2);

  written.push(
    writeArtifact(repoRoot, "05-dsgr-old-vs-v2.json", {
      ...artifactHeader(
        "PHASE_3F_1_5_DSGR_OLD_VS_V2",
        "Unit-by-unit comparison between the two historical scorers' own recorded conclusions and Evaluation V2's independent judgment. The historical rows are READ from their frozen artifacts; no historical matching code is imported or re-executed.",
      ),
      headlineCounts: {
        oldOriginalScorer_criticalViolations: oldCriticalViolations.length,
        oldCorrectedScorer_criticalViolations: correctedCriticalViolations.length,
        v2_criticalDangerousUnaccounted: v2CriticalDangerous.length,
        v2_criticalDangerousUnaccountedUnitIds: v2CriticalDangerous.map((u) => u.gtUnitId).sort(),
        note:
          "The three numbers are not directly comparable as pass/fail rates: the historical scorers measured whether ANY unit at a structural address was flagged, while V2 measures whether the ground-truth CLAIM is represented or honestly surfaced. The per-unit table below is the meaningful comparison.",
      },
      units: oldVsV2,
    }),
  );

  // ---------------------------------------------------------------- 06 ------
  const bridge = JSON.parse(readFileSync(join(repoRoot, FORENSICS_DIR, "phase-3f1-1-scorer-bridge.json"), "utf-8")) as Bridge;
  const falseCreditCases = reconcileKnownFalseCredits({
    groundTruth: dataset.groundTruth,
    candidates: dataset.candidates,
    bridgeCases: bridge.perCaseBridge,
    correctedScorerRows: correctedRows,
    v2Units: result.units,
  });
  const gate = evaluateFalseCreditGate(falseCreditCases);

  written.push(
    writeArtifact(repoRoot, "06-known-false-credit-reconciliation.json", {
      ...artifactHeader(
        "PHASE_3F_1_5_KNOWN_FALSE_CREDIT_RECONCILIATION",
        "All 26 scorer-artifact-corrected cases from the Phase 3F.1.1 forensic record, independently re-judged. For each: the ground-truth claim, the old credit path, every candidate that carried that credit, V2's semantic judgment of each, V2's independent disposition, and whether the false credit is caught.",
      ),
      sourceEvidence: {
        bridgeArtifact: `${FORENSICS_DIR}/phase-3f1-1-scorer-bridge.json`,
        correctedScorerRows: `${FORENSICS_DIR}/raw-scorer-combination-C-corrected-x-firstblind.json`,
        previouslyConfirmedFalseCreditSuspectIds: bridge.adversarialAudit.falseCreditSuspectIds,
      },
      gate: {
        requirement: "All 14 previously-confirmed false credits must be REJECTED or marked AMBIGUOUS/NEEDS-REVIEW. Zero may remain silently credited.",
        ...gate,
      },
      verdictCounts: countBy(falseCreditCases.map((c) => c.verdict)),
      verdictBySuspectStatus: {
        previouslyConfirmedSuspects: countBy(falseCreditCases.filter((c) => c.previouslyConfirmedFalseCreditSuspect).map((c) => c.verdict)),
        previouslyJudgedGenuine: countBy(falseCreditCases.filter((c) => !c.previouslyConfirmedFalseCreditSuspect).map((c) => c.verdict)),
      },
      cases: falseCreditCases,
    }),
  );

  // ---------------------------------------------------------------- 07 ------
  written.push(
    writeArtifact(repoRoot, "07-dsgr-v2-aggregate-metrics.json", {
      ...artifactHeader(
        "PHASE_3F_1_5_DSGR_V2_AGGREGATE_METRICS",
        "Aggregate metrics computed ONLY after the unit-level evidence in artifact 04 was frozen. Every percentage carries the exact unit ids behind its numerator and denominator.",
      ),
      datasetKey: DSGR_DATASET_KEY,
      metrics: result.metrics,
      dangerousUnaccountedDetail: result.units
        .filter((u) => u.dangerousUnaccountedV2)
        .map((u) => ({ gtUnitId: u.gtUnitId, documentId: u.documentId, sectionRef: u.sectionRef, materiality: u.materiality, matchStatus: u.matchStatus, reason: u.dangerousUnaccountedReason })),
      interpretation: {
        whyRecallIsLow:
          "The frozen DSGR first-blind run compiled 30 of 2,847 discovery candidates and its own coverage auditor recorded zero FULLY_REPRESENTED_VERIFIED entries. Evaluation V2 requires a semantically corresponding candidate whose accounting role is a SUBSTANTIVE representation before granting credit, so the measured recall reflects the state of that run, not a defect in the metric. The separate inventoryOnlySurfacedRate shows how many claims the system NOTICED without representing.",
        fullyRepresentedReviewRequiredNotCounted:
          "The four FULLY_REPRESENTED_REVIEW_REQUIRED coverage entries in the frozen run are classified HONEST_UNRESOLVED, not SUBSTANTIVE_REPRESENTATION, because the coverage auditor's own recorded reasoning for them is that no rule is anchored to the unit's citation and only a numeric value appears elsewhere in the covering candidate's IR. That is a numeric coincidence, not a demonstrated correspondence.",
      },
      sensitivityToTheMostConsequentialClassificationChoice: buildHonestUnresolvedSensitivity(result.units),
      performance: result.performance,
      runtimeMsIncludingArtifacts: Date.now() - startedAt,
    }),
  );

  // ---------------------------------------------------------------- 10 ------
  const qualityFindings = result.groundTruthQuality;
  written.push(
    writeArtifact(repoRoot, "10-ground-truth-quality-audit.json", {
      ...artifactHeader(
        "PHASE_3F_1_5_GROUND_TRUTH_QUALITY_AUDIT",
        "Ground-truth defects and ambiguities discovered while evaluating. The frozen ground-truth files are NEVER edited; any adjudication is recorded as an overlay and any exclusion from clean aggregates carries a written reason.",
      ),
      groundTruthAdjudicationProvenance: {
        finding:
          "All four DSGR ground-truth documents declare `authoredFromSourceOnly: true` and record no external human-lawyer review. Every DSGR ground-truth unit is therefore classified AI_ADJUDICATED_FROM_SOURCE_ONLY with externallyHumanReviewed=false. Metrics computed against it measure agreement with an AI-authored answer key, not with a lawyer's.",
        affectedUnits: dataset.groundTruth.length,
      },
      verdictCounts: countBy(qualityFindings.map((f) => f.verdict)),
      excludedFromCleanAggregates: qualityFindings.filter((f) => f.excludedFromCleanAggregates).map((f) => ({ gtUnitId: f.gtUnitId, reason: f.exclusionReason })),
      productionDefectObservationsNotGroundTruthDefects: {
        note:
          "Observed while evaluating, recorded as findings and NOT fixed. Nothing in this phase modified any production module. These are defects in the frozen first-blind pipeline output, not in the ground truth.",
        observations: [
          {
            id: "PROD-OBS-1",
            severity: "HIGH",
            title: "The production coverage auditor's own FULLY_REPRESENTED_REVIEW_REQUIRED state is granted on a numeric coincidence",
            evidence:
              "stage8-coverage-result.json records exactly 4 FULLY_REPRESENTED_REVIEW_REQUIRED entries and 0 FULLY_REPRESENTED_VERIFIED entries. Every one of the 4 carries the auditor's own reasoning: \"no rule is anchored to this unit's exact citation, but its numeric value 0.01 [or 0.25] appears elsewhere in the covering candidate(s)' compiled IR - review required to confirm this is the same economic figure, not a coincidental match\".",
            why: "This is the same circularity class the Phase 3F.1.1 forensics found in the SCORER, but it sits inside the production coverage auditor: representation credit is inferred from a bare number appearing somewhere in a covering candidate's IR, with no demonstrated correspondence. Values as generic as 0.01 make coincidence near-certain.",
            v2Handling: "Evaluation V2 classifies FULLY_REPRESENTED_REVIEW_REQUIRED as HONEST_UNRESOLVED, not as a substantive representation, so it never grants V2 credit.",
            notFixed: true,
          },
          {
            id: "PROD-OBS-2",
            severity: "HIGH",
            title: "The structural substrate emits deeply nested, non-existent section addresses that the coverage auditor then anchors units to",
            evidence:
              "631 coverage units carry a sectionRef with three or more nested parenthetical levels, including addresses such as doc-a::1.01(b)(b)(b)(b)(b)(a), doc-a::6.05(A)(a)(B)(b) (whose excerpt text is EBITDA add-back language from the definitions section, not asset-sale language) and doc-b::6.08(b)(c)(b)(b)(b)(c).",
            why: "Any address-based descendant union inherits these. It is a direct cause of the enormous unions the corrected historical scorer built (up to 135 members for a single doc-d §6.05 ground-truth unit), and of definitional text being filed under an operative covenant address.",
            notFixed: true,
          },
          {
            id: "PROD-OBS-3",
            severity: "MEDIUM",
            title: "Discovery candidates at the exact addresses involved in the false-credit cases carry no source citation at all",
            evidence:
              "378 of 2,847 first-blind discovery candidates (13.3%) have an empty sourceCitation. That includes ALL 11 candidates anchored at doc-a §6.01, all 5 at doc-a §6.05 and all 4 at doc-d §6.01 — precisely the addresses of the confirmed false credits. By contrast the FWRG, LSB and CONMED discovery runs carry real excerpt text on their candidates.",
            why: "Architecture invariants #1 and #3 require a real, checkable citation behind every contractual conclusion. A candidate with no citation cannot substantiate anything, and a proximity-based scorer cannot notice that it is crediting an empty record.",
            notFixed: true,
          },
          {
            id: "PROD-OBS-4",
            severity: "MEDIUM",
            title: "Duplicate coverage-unit rows",
            evidence: "stage8-coverage-result.json contains 6,210 documentDetails unit rows collapsing to 5,725 distinct semanticUnitIds (485 duplicate rows). Some ids appear three times with identical content.",
            why: "Duplicates inflate any count taken over rows rather than ids, and inflate address unions. Evaluation V2 de-duplicates by semanticUnitId at load.",
            notFixed: true,
          },
          {
            id: "PROD-OBS-5",
            severity: "CONTEXT",
            title: "The first-blind run compiled almost nothing",
            evidence: "30 compiled units (70 IR rules, 80 IR definitions) against 2,847 discovery candidates and 5,725 coverage units; 2,210 dangerous-unaccounted entries.",
            why: "This is the reason Evaluation V2's measured DSGR recall is near zero. The metric is reporting the state of that run, not a defect in the metric. It is recorded here so the low recall is not mistaken for an evaluator failure.",
            notFixed: true,
          },
        ],
      },
      overlayApplied: null,
      overlayPolicy:
        "No adjudication overlay was applied for this run: no ground-truth unit was found to be substantively wrong about the source. The findings below are excerpt-resolution limitations of THIS evaluator's independent raw-source resolver, not defects in the answer key, and none is excluded from the clean aggregates.",
      findings: qualityFindings,
    }),
  );

  // ------------------------------------------------- stratified sample ------
  const sample = buildStratifiedSample(result.units, gtById, falseCreditCases);
  const packets = sample.map((u) => {
    const gt = gtById.get(u.gtUnitId);
    if (!gt) return null;
    return buildEvidencePacket({ gt, result: u, candidatesById, maxCandidates: 5, excerptCharLimit: 1200 });
  });

  written.push(
    writeArtifact(repoRoot, "_stratified-sample-for-second-pass.json", {
      ...artifactHeader(
        "PHASE_3F_1_5_STRATIFIED_SAMPLE_FOR_SECOND_PASS",
        "BLINDED evidence packets for the independent second-pass adjudicator. This file deliberately contains NO Evaluation V2 disposition for any case; the reviewer forms an independent judgment from the excerpts alone. The sealed label file is separate.",
      ),
      instructionsForReviewer: [
        "For each case: read the ground-truth claim (excerpt + adjudicated description), then read each candidate representation's own excerpt and normalized semantics.",
        "Answer per candidate: does it substantively represent the ground-truth claim? YES / PARTIAL / NO / AMBIGUOUS.",
        "Then give ONE overall disposition for the claim: REPRESENTED / PARTIALLY_REPRESENTED / UNREPRESENTED / AMBIGUOUS / HONESTLY_UNRESOLVED / HONESTLY_UNSUPPORTED.",
        "Structural adjacency is not evidence. A candidate sharing a section number, being a descendant or ancestor, sitting near a similar figure, or citing the same defined term does NOT represent the claim unless it asserts the same thing.",
        "Cite the excerpt text you relied on. If the evidence is insufficient to decide, say AMBIGUOUS rather than guessing.",
      ],
      stratification: sample.length > 0 ? describeStrata(sample) : {},
      caseCount: packets.filter(Boolean).length,
      cases: packets.filter(Boolean).map((p) => blindPacket(p!)).map(packetSummary),
    }),
  );

  written.push(
    writeArtifact(repoRoot, "_stratified-sample-v2-labels-SEALED.json", {
      ...artifactHeader(
        "PHASE_3F_1_5_STRATIFIED_SAMPLE_V2_LABELS_SEALED",
        "SEALED. This evaluator's own dispositions for the stratified sample, kept OUT of the blind packet the second-pass reviewer reads. For comparison after the blind review only.",
      ),
      warning: "DO NOT SHOW THIS FILE TO THE SECOND-PASS ADJUDICATOR BEFORE THEIR REVIEW IS COMPLETE.",
      caseCount: sample.length,
      labels: sample.map((u) => ({
        gtUnitId: u.gtUnitId,
        v2MatchStatus: u.matchStatus,
        v2RepresentationStatus: u.representationStatus,
        v2SemanticCorrectness: u.semanticCorrectness,
        v2DangerousUnaccounted: u.dangerousUnaccountedV2,
        v2Confidence: u.confidence,
        v2MatchedCandidateIds: u.matchedCandidateIds,
        v2Reason: (u.reasonForCredit ?? u.reasonForPartialCredit ?? u.reasonForNoCredit ?? "").slice(0, 1200),
      })),
    }),
  );

  return { result, groundTruth: dataset.groundTruth, candidates: dataset.candidates, falseCreditCases, writtenArtifacts: written };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Representative, self-contained evidence packets: each is understandable
 * without opening any source code, because it carries the actual excerpt text
 * on both sides plus the dimension-by-dimension comparison. Where fewer than
 * the requested number of a category exist in this dataset, the shortfall is
 * reported rather than padded.
 */
function buildRepresentativePackets(
  units: readonly UnitEvaluationResult[],
  gtById: Map<string, GroundTruthSemanticUnit>,
  candidatesById: Map<string, CandidateSemanticRepresentation>,
): Record<string, unknown> {
  const categories: { name: string; requested: number; predicate: (u: UnitEvaluationResult) => boolean }[] = [
    { name: "truePositiveExactSingle", requested: 10, predicate: (u) => u.matchStatus === "EXACT_SINGLE" },
    { name: "truePositiveExactComposite", requested: 10, predicate: (u) => u.matchStatus === "EXACT_COMPOSITE" },
    { name: "partialMatches", requested: 10, predicate: (u) => u.matchStatus === "PARTIAL" },
    { name: "unrepresented", requested: 10, predicate: (u) => u.matchStatus === "UNREPRESENTED" },
    { name: "honestlyUnresolvedOrUnsupported", requested: 10, predicate: (u) => u.matchStatus === "HONESTLY_UNRESOLVED" || u.matchStatus === "HONESTLY_UNSUPPORTED" },
    { name: "ambiguous", requested: 100, predicate: (u) => u.matchStatus === "AMBIGUOUS" },
    { name: "contradictory", requested: 10, predicate: (u) => u.matchStatus === "CONTRADICTORY" },
  ];
  const out: Record<string, unknown> = {};
  const ordered = [...units].sort((a, b) => contentHash(a.gtUnitId).localeCompare(contentHash(b.gtUnitId)));
  for (const category of categories) {
    const matching = ordered.filter(category.predicate).slice(0, category.requested);
    out[category.name] = {
      requested: category.requested === 100 ? "all" : category.requested,
      availableInThisDataset: ordered.filter(category.predicate).length,
      shortfallDisclosure:
        category.requested !== 100 && ordered.filter(category.predicate).length < category.requested
          ? `Only ${ordered.filter(category.predicate).length} unit(s) of this kind exist in this dataset; the packet set is not padded.`
          : null,
      packets: matching
        .map((u) => {
          const gt = gtById.get(u.gtUnitId);
          if (!gt) return null;
          return packetSummary(buildEvidencePacket({ gt, result: u, candidatesById, maxCandidates: 4, excerptCharLimit: 900 }));
        })
        .filter(Boolean),
    };
  }
  return out;
}

/**
 * The single most consequential classification choice in the DSGR numbers, made
 * explicit and quantified rather than buried.
 *
 * The frozen coverage auditor's SOURCE_CONTEXT_INCOMPLETE state means, in its
 * own words, "a candidate was discovered for this unit's region but never
 * compiled to IR". Evaluation V2 treats that as an HONEST_UNRESOLVED
 * declaration when it sits on a semantically-corresponding candidate: the
 * system did say something was missing here. A reviewer could reasonably hold
 * the opposite view — that a coverage-audit state buried in a 28MB artifact is
 * not a disclosure to anyone who would act on it, and that these are silent
 * omissions. Both readings are published.
 */
function buildHonestUnresolvedSensitivity(units: readonly UnitEvaluationResult[]): Record<string, unknown> {
  const high = (u: UnitEvaluationResult) => u.materiality === "CRITICAL" || u.materiality === "MATERIAL";
  const honest = units.filter((u) => u.matchStatus === "HONESTLY_UNRESOLVED" || u.matchStatus === "HONESTLY_UNSUPPORTED");
  const dangerous = units.filter((u) => u.dangerousUnaccountedV2);
  const honestHigh = honest.filter(high);
  const honestCritical = honest.filter((u) => u.materiality === "CRITICAL");
  return {
    choice: "Whether an explicit HONESTLY_UNRESOLVED / HONESTLY_UNSUPPORTED declaration on a semantically-corresponding candidate counts as ACCOUNTING FOR the claim.",
    asPublished: {
      reading: "It does count. An honest 'we could not resolve this' is different from a silent omission, and invariant 9 says unsupported semantics must be surfaced, not coerced.",
      dangerousUnaccountedTotal: dangerous.length,
      dangerousUnaccountedCritical: dangerous.filter((u) => u.materiality === "CRITICAL").length,
    },
    stricterAlternative: {
      reading: "It does not count, on the view that a coverage-audit state inside a bulk artifact is not a disclosure a decision-maker would ever see.",
      dangerousUnaccountedTotal: dangerous.length + honestHigh.length,
      dangerousUnaccountedCritical: dangerous.filter((u) => u.materiality === "CRITICAL").length + honestCritical.length,
      affectedUnitCount: honestHigh.length,
    },
    historicalComparators: {
      originalPhase3FScorer_criticalViolations: 119,
      correctedPhase3F1Scorer_criticalViolations: 93,
      phase3F11ForensicsSemanticallyAdjustedEstimate: 103,
      note: "The two V2 readings bracket every historical figure. That is the honest position: the CRITICAL dangerous-unaccounted count for this run is somewhere between the two, and which end depends on a disclosed judgment about what counts as surfacing a gap — not on a matching algorithm.",
    },
    referredToSecondPass: true,
  };
}

function countBy(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function agreement(oldClassification: string | null, unit: UnitEvaluationResult): string {
  if (!oldClassification) return "NO_HISTORICAL_ROW";
  const oldSaysSafe = oldClassification.startsWith("SAFE_");
  const v2SaysAccounted = !unit.dangerousUnaccountedV2;
  if (oldSaysSafe && v2SaysAccounted) return "AGREE_ACCOUNTED";
  if (!oldSaysSafe && !v2SaysAccounted) return "AGREE_DANGEROUS";
  if (oldSaysSafe && !v2SaysAccounted) return "V2_STRICTER_OLD_CREDITED_V2_DOES_NOT";
  return "V2_MORE_LENIENT_OLD_FLAGGED_V2_ACCOUNTS_FOR_IT";
}

interface Stratum {
  name: string;
  target: number;
  predicate: (u: UnitEvaluationResult, gt: GroundTruthSemanticUnit | undefined) => boolean;
}

function buildStratifiedSample(
  units: readonly UnitEvaluationResult[],
  gtById: Map<string, GroundTruthSemanticUnit>,
  falseCreditCases: readonly FalseCreditReconciliationCase[],
): UnitEvaluationResult[] {
  const byId = new Map(units.map((u) => [u.gtUnitId, u]));
  const selected = new Map<string, UnitEvaluationResult>();

  // Every previously-confirmed false credit is always in the sample, plus every
  // V2 ambiguous match — the reviewer must see the hard cases. The rest of the
  // sample is a deterministic stratified draw so the review is not composed
  // only of known-problematic units.
  for (const c of falseCreditCases) {
    if (!c.previouslyConfirmedFalseCreditSuspect) continue;
    const u = byId.get(c.gtUnitId);
    if (u) selected.set(u.gtUnitId, u);
  }
  for (const u of units) if (u.matchStatus === "AMBIGUOUS") selected.set(u.gtUnitId, u);

  const strata: Stratum[] = [
    { name: "doc-a", target: 1, predicate: (u) => u.documentId === "doc-a" },
    { name: "doc-b", target: 1, predicate: (u) => u.documentId === "doc-b" },
    { name: "doc-c", target: 1, predicate: (u) => u.documentId === "doc-c" },
    { name: "doc-d", target: 1, predicate: (u) => u.documentId === "doc-d" },
    { name: "materiality-CRITICAL", target: 2, predicate: (u) => u.materiality === "CRITICAL" },
    { name: "materiality-MATERIAL", target: 2, predicate: (u) => u.materiality === "MATERIAL" },
    { name: "materiality-INFORMATIONAL", target: 1, predicate: (u) => u.materiality === "INFORMATIONAL" },
    { name: "status-EXACT", target: 3, predicate: (u) => u.matchStatus === "EXACT_SINGLE" || u.matchStatus === "EXACT_COMPOSITE" },
    { name: "status-PARTIAL", target: 3, predicate: (u) => u.matchStatus === "PARTIAL" },
    { name: "status-UNREPRESENTED", target: 3, predicate: (u) => u.matchStatus === "UNREPRESENTED" },
    { name: "status-HONEST", target: 3, predicate: (u) => u.matchStatus === "HONESTLY_UNRESOLVED" || u.matchStatus === "HONESTLY_UNSUPPORTED" },
    { name: "status-CONTRADICTORY", target: 2, predicate: (u) => u.matchStatus === "CONTRADICTORY" },
    { name: "numeric-provisions", target: 1, predicate: (_u, gt) => (gt?.figures.length ?? 0) > 0 },
    { name: "qualitative-provisions", target: 1, predicate: (_u, gt) => (gt?.figures.length ?? 0) === 0 },
    { name: "descendant-role", target: 2, predicate: (u) => u.provisionRole === "ENUMERATED_EXCEPTION" },
    { name: "definition-role", target: 2, predicate: (u) => u.provisionRole === "DEFINITION_OR_CALCULATION" },
    { name: "cross-reference-heavy", target: 1, predicate: (_u, gt) => (gt?.crossReferences.length ?? 0) >= 2 },
    { name: "family-INDEBTEDNESS", target: 1, predicate: (u) => u.semanticFamily === "INDEBTEDNESS" },
    { name: "family-LIENS", target: 1, predicate: (u) => u.semanticFamily === "LIENS" },
    { name: "family-FINANCIAL_COVENANTS", target: 1, predicate: (u) => u.semanticFamily === "FINANCIAL_COVENANTS" },
    { name: "family-ASSET_SALES", target: 1, predicate: (u) => u.semanticFamily === "ASSET_SALES" },
    { name: "family-RESTRICTED_PAYMENTS", target: 1, predicate: (u) => u.semanticFamily === "RESTRICTED_PAYMENTS" },
  ];

  // Deterministic draw order that is not lexicographic: sorting by gtUnitId
  // alone would fill every stratum from doc-a. Sorting by a content hash of the
  // id spreads the draw across documents and articles while remaining
  // byte-for-byte reproducible.
  const ordered = [...units].sort((a, b) => contentHash(a.gtUnitId).localeCompare(contentHash(b.gtUnitId)));
  for (const stratum of strata) {
    let taken = 0;
    for (const u of ordered) {
      if (taken >= stratum.target) break;
      if (selected.has(u.gtUnitId)) continue;
      if (!stratum.predicate(u, gtById.get(u.gtUnitId))) continue;
      selected.set(u.gtUnitId, u);
      taken += 1;
    }
  }

  return [...selected.values()].sort((a, b) => a.gtUnitId.localeCompare(b.gtUnitId));
}

function describeStrata(sample: readonly UnitEvaluationResult[]): Record<string, unknown> {
  return {
    byDocument: countBy(sample.map((u) => u.documentId)),
    byMateriality: countBy(sample.map((u) => u.materiality)),
    byProvisionRole: countBy(sample.map((u) => u.provisionRole)),
    bySemanticFamily: countBy(sample.map((u) => u.semanticFamily)),
    note: "Match-status stratification is deliberately NOT disclosed here — it would leak this evaluator's own labels into the blind packet.",
  };
}

if (process.argv[1] && process.argv[1].endsWith("run-dsgr.ts")) {
  void runDsgr(process.cwd()).then((out) => {
    console.log(`DSGR run complete. ${out.result.units.length} units, ${out.falseCreditCases.length} false-credit cases.`);
    for (const a of out.writtenArtifacts) console.log(`  wrote ${a.path} (${a.bytes} bytes)`);
  });
}
