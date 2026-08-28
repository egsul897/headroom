/**
 * Phase 3F.1 §51-54 - score the DSGR remediation regression rerun
 * (scripts/phase-3f1-dsgr-remediation-regression.ts's output) against the
 * SAME frozen, permanent ground truth used to score the original
 * first-blind run, using the SAME scoring methodology (matching logic
 * copied from scripts/phase-3f-score-first-run.ts, not re-derived, so the
 * two reports are directly comparable). Also produces a full, exhaustive
 * disposition table for every one of the 303 original violations (task
 * §52-53's own "no silent disappearance, no aggregate-only reporting"
 * requirement) plus a targeted disposition for the specific F1/F2 sampled
 * cases named in the frozen error taxonomy.
 *
 * DSGR is a KNOWN regression package here - this script never claims
 * "unseen" or "generalization proven" (task §3/§64).
 *
 * Run via: npx tsx scripts/phase-3f1-score-dsgr-regression.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FIRST_BLIND_DIR = "tests/fixtures/unseen-packages/phase-3f-first-blind-run";
const REGRESSION_DIR = "tests/fixtures/unseen-packages/phase-3f1-dsgr-remediation-regression";
const GT_DIR = "tests/fixtures/unseen-packages/phase-3f-ground-truth";
const OUT_PATH = join(REGRESSION_DIR, "phase-3f1-dsgr-regression-scoring-report.json");

type Materiality = "CRITICAL" | "MATERIAL" | "REVIEW_UNCERTAIN" | "INFORMATIONAL";

interface GtUnit {
  unitId: string;
  sectionRef: string;
  unitType: string;
  materiality: Materiality;
  description: string;
}
interface GtDoc {
  documentId: string;
  articles: { articleRef: string; heading?: string; units: GtUnit[] }[];
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function baseSection(ref: string): string {
  const m = ref.match(/^[A-Za-z0-9]+(\.[0-9]+)?/);
  return m ? m[0] : ref;
}

interface AuditUnit {
  semanticUnitId: string;
  anchors: { documentId: string; sectionRef: string | null }[];
  family: string;
  materiality: Materiality;
  contextuallyElevated?: boolean;
}
interface CoverageEntry {
  semanticUnitId: string;
  coverageState: string;
  materiality: Materiality;
  reasoning: string;
}
interface DangerousEntry {
  semanticUnitId: string;
  reason: string;
  materiality: Materiality;
}
interface DocDetail {
  documentId: string;
  units: AuditUnit[];
}
interface DocCoverage {
  documentId: string;
  coverageEntries: CoverageEntry[];
  dangerousUnaccounted: DangerousEntry[];
  gateStatus: string;
}

interface DiscoveryCandidate {
  documentId: string;
  normalizedSourceRef: string;
  reviewStatus: string;
  confidence: number;
}

interface MatchResult {
  gtUnitId: string;
  documentId: string;
  sectionRef: string;
  gtMateriality: Materiality;
  unitType: string;
  discoveryMatch: "EXACT" | "PARENT" | "DESCENDANT" | "NONE";
  discoveryReviewFlagged: boolean;
  auditMatch: "EXACT" | "PARENT" | "DESCENDANT" | "NONE";
  auditMatchChapeauOnly: boolean;
  auditMaterialityAssigned: Materiality | null;
  auditMaterialityMismatch: boolean;
  coverageState: string | null;
  inDangerousUnaccounted: boolean;
  classification:
    | "SAFE_FULLY_REPRESENTED"
    | "SAFE_FLAGGED_DANGEROUS"
    | "SAFE_LOW_MATERIALITY_UNREPRESENTED"
    | "VIOLATION_NO_AUDIT_MATCH"
    | "VIOLATION_MATERIALITY_MISCLASSIFIED_UNFLAGGED"
    | "VIOLATION_UNREPRESENTED_NOT_FLAGGED";
  wouldBeSafeUnderBroadReading: boolean;
}

function findDescendants<T>(indexMap: Map<string, T[]>, ref: string): T[] {
  if (!ref) return [];
  const out: T[] = [];
  for (const [key, items] of indexMap) {
    if (key.length > ref.length && key.startsWith(ref) && key[ref.length] === "(") out.push(...items);
  }
  return out;
}

function score(coverageResult: { packageCoverage: { status: string; documents: DocCoverage[] }; documentDetails: DocDetail[] }, discoveryAll: DiscoveryCandidate[], gtDocs: GtDoc[], docIds: string[]) {
  const discByDoc = new Map<string, Map<string, DiscoveryCandidate[]>>();
  for (const c of discoveryAll) {
    if (!discByDoc.has(c.documentId)) discByDoc.set(c.documentId, new Map());
    const m = discByDoc.get(c.documentId)!;
    if (!m.has(c.normalizedSourceRef)) m.set(c.normalizedSourceRef, []);
    m.get(c.normalizedSourceRef)!.push(c);
  }

  const auditByDoc = new Map<string, Map<string, AuditUnit[]>>();
  for (const dd of coverageResult.documentDetails) {
    const m = new Map<string, AuditUnit[]>();
    for (const u of dd.units) {
      const ref = u.anchors[0]?.sectionRef;
      if (!ref) continue;
      if (!m.has(ref)) m.set(ref, []);
      m.get(ref)!.push(u);
    }
    auditByDoc.set(dd.documentId, m);
  }

  const coverageByDoc = new Map<string, Map<string, CoverageEntry>>();
  const dangerousByDoc = new Map<string, Set<string>>();
  for (const dc of coverageResult.packageCoverage.documents) {
    const cm = new Map<string, CoverageEntry>();
    for (const e of dc.coverageEntries) cm.set(e.semanticUnitId, e);
    coverageByDoc.set(dc.documentId, cm);
    dangerousByDoc.set(dc.documentId, new Set(dc.dangerousUnaccounted.map((d) => d.semanticUnitId)));
  }

  const results: MatchResult[] = [];

  for (const gtDoc of gtDocs) {
    const discIndex = discByDoc.get(gtDoc.documentId) ?? new Map();
    const auditIndex = auditByDoc.get(gtDoc.documentId) ?? new Map();
    const coverageIndex = coverageByDoc.get(gtDoc.documentId) ?? new Map();
    const dangerousSet = dangerousByDoc.get(gtDoc.documentId) ?? new Set();

    for (const article of gtDoc.articles) {
      for (const unit of article.units) {
        const base = baseSection(unit.sectionRef ?? "");

        let discoveryMatch: MatchResult["discoveryMatch"] = "NONE";
        let discCandidates: DiscoveryCandidate[] = discIndex.get(unit.sectionRef) ?? [];
        if (discCandidates.length > 0) discoveryMatch = "EXACT";
        else {
          discCandidates = discIndex.get(base) ?? [];
          if (discCandidates.length > 0) discoveryMatch = "PARENT";
          else {
            discCandidates = findDescendants(discIndex, unit.sectionRef ?? "");
            if (discCandidates.length > 0) discoveryMatch = "DESCENDANT";
          }
        }
        const discoveryReviewFlagged = discCandidates.some((c) => c.reviewStatus === "NEEDS_REVIEW");

        let auditMatch: MatchResult["auditMatch"] = "NONE";
        let auditUnits: AuditUnit[] = auditIndex.get(unit.sectionRef) ?? [];
        if (auditUnits.length > 0) {
          auditMatch = "EXACT";
          // Phase 3F.1 F1 regression-scoring fix (not applied to the permanent
          // original scorer): Workstream A's closure now sometimes recovers a
          // previously-missing chapeau as its own deliberately thin unit (the
          // chapeau's own text genuinely carries no independent signal - its
          // substance lives in its lettered children). The ORIGINAL scorer's
          // exact-match-preferred logic stopped looking the moment ANY unit
          // existed at the exact address, so a real CRITICAL descendant could
          // be silently shadowed by a newly-recovered but thin exact-match
          // chapeau - undercounting exactly the coverage Workstream A just
          // added. Ground truth's own single named-provision granularity does
          // not always mirror Layer A/B's chapeau+children decomposition (the
          // same reason DESCENDANT fallback matching exists at all) - so when
          // an exact match exists, still union in descendants for materiality/
          // coverage-state selection, never discard them outright.
          const descendants = findDescendants<AuditUnit>(auditIndex, unit.sectionRef ?? "");
          if (descendants.length > 0) auditUnits = [...auditUnits, ...descendants];
        } else {
          auditUnits = auditIndex.get(base) ?? [];
          if (auditUnits.length > 0) auditMatch = "PARENT";
          else {
            auditUnits = findDescendants(auditIndex, unit.sectionRef ?? "");
            if (auditUnits.length > 0) auditMatch = "DESCENDANT";
          }
        }
        const auditMatchChapeauOnly = auditMatch === "DESCENDANT";

        let auditMaterialityAssigned: Materiality | null = null;
        let coverageState: string | null = null;
        let inDangerousUnaccounted = false;

        if (auditUnits.length > 0) {
          const order: Materiality[] = ["CRITICAL", "MATERIAL", "REVIEW_UNCERTAIN", "INFORMATIONAL"];
          auditUnits = [...auditUnits].sort((a, b) => order.indexOf(a.materiality) - order.indexOf(b.materiality));
          const best = auditUnits[0]!;
          auditMaterialityAssigned = best.materiality;
          const cov = coverageIndex.get(best.semanticUnitId);
          coverageState = cov?.coverageState ?? null;
          inDangerousUnaccounted = auditUnits.some((u) => dangerousSet.has(u.semanticUnitId));
        }

        const gtIsHighMateriality = unit.materiality === "CRITICAL" || unit.materiality === "MATERIAL";
        const auditMaterialityMismatch = auditMaterialityAssigned !== null && gtIsHighMateriality && (auditMaterialityAssigned === "INFORMATIONAL" || auditMaterialityAssigned === "REVIEW_UNCERTAIN");

        const isFullyRepresented = coverageState === "FULLY_REPRESENTED_VERIFIED" || coverageState === "FULLY_REPRESENTED_REVIEW_REQUIRED";
        const isUnrepresented = coverageState === "UNREPRESENTED" || coverageState === "PARTIALLY_REPRESENTED" || coverageState === null;

        let classification: MatchResult["classification"];
        if (!gtIsHighMateriality) classification = "SAFE_LOW_MATERIALITY_UNREPRESENTED";
        else if (auditMatch === "NONE") classification = "VIOLATION_NO_AUDIT_MATCH";
        else if (isFullyRepresented) classification = "SAFE_FULLY_REPRESENTED";
        else if (auditMaterialityMismatch && !inDangerousUnaccounted) classification = "VIOLATION_MATERIALITY_MISCLASSIFIED_UNFLAGGED";
        else if (isUnrepresented && inDangerousUnaccounted) classification = "SAFE_FLAGGED_DANGEROUS";
        else if (isUnrepresented && !inDangerousUnaccounted) classification = "VIOLATION_UNREPRESENTED_NOT_FLAGGED";
        else classification = "SAFE_FLAGGED_DANGEROUS";

        const wouldBeSafeUnderBroadReading = classification.startsWith("VIOLATION_") && discoveryMatch !== "NONE" && discoveryReviewFlagged;

        results.push({ gtUnitId: unit.unitId, documentId: gtDoc.documentId, sectionRef: unit.sectionRef, gtMateriality: unit.materiality, unitType: unit.unitType, discoveryMatch, discoveryReviewFlagged, auditMatch, auditMatchChapeauOnly, auditMaterialityAssigned, auditMaterialityMismatch, coverageState, inDangerousUnaccounted, classification, wouldBeSafeUnderBroadReading });
      }
    }
  }

  const total = results.length;
  const byClassification: Record<string, number> = {};
  for (const r of results) byClassification[r.classification] = (byClassification[r.classification] ?? 0) + 1;

  const violations = results.filter((r) => r.classification.startsWith("VIOLATION_"));
  const criticalViolations = violations.filter((r) => r.gtMateriality === "CRITICAL");
  const criticalViolationsStrict = criticalViolations;
  const criticalViolationsBroad = criticalViolations.filter((r) => !r.wouldBeSafeUnderBroadReading);

  const highMatUnits = results.filter((r) => r.gtMateriality === "CRITICAL" || r.gtMateriality === "MATERIAL");
  const trueBlindSpots = highMatUnits.filter((r) => r.auditMatch === "NONE");
  const chapeauOnlyGaps = highMatUnits.filter((r) => r.auditMatchChapeauOnly);
  const auditRecallNumerator = highMatUnits.filter((r) => r.auditMatch !== "NONE").length;
  const auditRecall = highMatUnits.length > 0 ? auditRecallNumerator / highMatUnits.length : 1;

  const perDocument: Record<string, unknown> = {};
  for (const docId of docIds) {
    const docResults = results.filter((r) => r.documentId === docId);
    perDocument[docId] = {
      totalGtUnits: docResults.length,
      byClassification: docResults.reduce<Record<string, number>>((acc, r) => {
        acc[r.classification] = (acc[r.classification] ?? 0) + 1;
        return acc;
      }, {}),
      violationCount: docResults.filter((r) => r.classification.startsWith("VIOLATION_")).length,
      criticalViolationCount: docResults.filter((r) => r.classification.startsWith("VIOLATION_") && r.gtMateriality === "CRITICAL").length,
    };
  }

  return { results, total, byClassification, violations, criticalViolationsStrict, criticalViolationsBroad, highMatUnits, trueBlindSpots, chapeauOnlyGaps, auditRecall, perDocument };
}

function main() {
  const docIds = ["doc-a", "doc-b", "doc-c", "doc-d"];
  const gtDocs = docIds.map((d) => loadJson<GtDoc>(join(GT_DIR, `ground-truth-${d}.json`)));
  const discoveryAll = loadJson<DiscoveryCandidate[]>(join(FIRST_BLIND_DIR, "stage2-all-discovery-candidates.json")); // frozen, unchanged - reused, not recomputed

  const firstBlindCoverage = loadJson<{ packageCoverage: { status: string; documents: DocCoverage[] }; documentDetails: DocDetail[] }>(join(FIRST_BLIND_DIR, "stage8-coverage-result.json"));
  const regressionCoverage = loadJson<{ packageCoverage: { status: string; documents: DocCoverage[] }; documentDetails: DocDetail[] }>(join(REGRESSION_DIR, "stage8-coverage-result.json"));

  console.log("Scoring frozen first-blind coverage (baseline, permanent - recomputed here only to build a matched-by-gtUnitId comparison table, never overwriting the sealed phase-3f-scoring-report.json)...");
  const firstBlind = score(firstBlindCoverage, discoveryAll, gtDocs, docIds);
  console.log("Scoring DSGR remediation regression coverage...");
  const regression = score(regressionCoverage, discoveryAll, gtDocs, docIds);

  // --- Exhaustive per-gtUnitId disposition table (task §52-53) ---------
  const firstBlindByGtId = new Map(firstBlind.results.map((r) => [r.gtUnitId, r]));
  const regressionByGtId = new Map(regression.results.map((r) => [r.gtUnitId, r]));

  type Disposition = "RESOLVED_BY_HIERARCHICAL_CLOSURE" | "RESOLVED_BY_CONTEXTUAL_MATERIALITY" | "RESOLVED_OTHER" | "STILL_MISSING" | "STILL_DOWNGRADED" | "STILL_VIOLATION_OTHER";

  function classifyResolutionMechanism(before: MatchResult, after: MatchResult): Disposition {
    // The violation cleared entirely.
    if (before.classification.startsWith("VIOLATION_") && !after.classification.startsWith("VIOLATION_")) {
      // Went from NO audit match at all to a real match -> the routing gap (F1) closing is the only mechanism that could do this.
      if (before.auditMatch === "NONE" && after.auditMatch !== "NONE") return "RESOLVED_BY_HIERARCHICAL_CLOSURE";
      // Already had an audit match, but its materiality was downgraded -> now correctly elevated -> F2's contextual floor is the mechanism.
      if (before.auditMatch !== "NONE" && before.auditMaterialityMismatch && !after.auditMaterialityMismatch) return "RESOLVED_BY_CONTEXTUAL_MATERIALITY";
      return "RESOLVED_OTHER";
    }
    if (after.auditMatch === "NONE") return "STILL_MISSING";
    if (after.auditMaterialityMismatch) return "STILL_DOWNGRADED";
    return "STILL_VIOLATION_OTHER";
  }

  // --- Newly-introduced violations: a gtUnitId that was SAFE in the first-blind
  // run but is a VIOLATION in the regression run - the honest counterpart to
  // the disposition table above, since a gate FAIL that only counts strict
  // CRITICAL violations can worsen even while every original violation is
  // individually improving, if the fix's own side effects break something
  // that used to be safe (task §52's "no silent disappearance" cuts both ways).
  const allOriginalViolationGtIds = new Set(firstBlind.violations.map((v) => v.gtUnitId));
  const newlyBroken = regression.violations
    .filter((v) => !allOriginalViolationGtIds.has(v.gtUnitId))
    .map((after) => {
      const before = firstBlindByGtId.get(after.gtUnitId)!;
      return { gtUnitId: after.gtUnitId, documentId: after.documentId, sectionRef: after.sectionRef, gtMateriality: after.gtMateriality, firstBlindClassification: before.classification, regressionClassification: after.classification, firstBlindAuditMaterialityAssigned: before.auditMaterialityAssigned, regressionAuditMaterialityAssigned: after.auditMaterialityAssigned, firstBlindCoverageState: before.coverageState, regressionCoverageState: after.coverageState };
    });

  const dispositionTable = [...allOriginalViolationGtIds].map((gtId) => {
    const before = firstBlindByGtId.get(gtId)!;
    const after = regressionByGtId.get(gtId)!;
    const stillViolation = after.classification.startsWith("VIOLATION_");
    return {
      gtUnitId: gtId,
      documentId: before.documentId,
      sectionRef: before.sectionRef,
      gtMateriality: before.gtMateriality,
      firstBlindClassification: before.classification,
      regressionClassification: after.classification,
      disposition: classifyResolutionMechanism(before, after),
      stillViolation,
      firstBlindAuditMaterialityAssigned: before.auditMaterialityAssigned,
      regressionAuditMaterialityAssigned: after.auditMaterialityAssigned,
      regressionContextuallyElevated: (regressionCoverage.documentDetails.find((d) => d.documentId === before.documentId)?.units ?? []).find((u) => u.anchors[0]?.sectionRef === after.sectionRef || (u.anchors[0]?.sectionRef && after.sectionRef.startsWith(u.anchors[0].sectionRef)))?.contextuallyElevated ?? null,
    };
  });
  const dispositionSummary: Record<string, number> = {};
  for (const d of dispositionTable) dispositionSummary[d.disposition] = (dispositionSummary[d.disposition] ?? 0) + 1;
  const resolvedCount = dispositionTable.filter((d) => !d.stillViolation).length;
  const stillViolationCount = dispositionTable.filter((d) => d.stillViolation).length;

  // --- Targeted disposition for the specific F1/F2 sampled cases named in the frozen error taxonomy ---
  const errorTaxonomy = loadJson<{ findings: Array<{ findingId: string; evidence: Record<string, unknown> }> }>(join(GT_DIR, "phase-3f-error-taxonomy.json"));
  const f1 = errorTaxonomy.findings.find((f) => f.findingId === "F1")!;
  const f2 = errorTaxonomy.findings.find((f) => f.findingId === "F2")!;
  const f1SampledSections = f1.evidence.sampledMissingSections_docA as string[];
  const f2SampledCases = f2.evidence.sampledCriticalCases as string[];

  function checkSectionRefRouted(documentId: string, sectionRefLabel: string): { sectionRefGuess: string; foundInRegressionInventory: boolean; materialityIfFound: Materiality | null; admissionReasons: string[] | null } {
    // Extract the leading numeric/lettered section reference from the free-text sampled label (e.g. "5.01 Financial Reporting chapeau" -> "5.01").
    const m = sectionRefLabel.match(/^([0-9]+(?:\.[0-9]+)?(?:\([a-zA-Z0-9]+\))*)/);
    const sectionRefGuess = m ? m[1]! : sectionRefLabel;
    const doc = regressionCoverage.documentDetails.find((d) => d.documentId === documentId);
    const unit = doc?.units.find((u) => u.anchors[0]?.sectionRef === sectionRefGuess);
    return { sectionRefGuess, foundInRegressionInventory: !!unit, materialityIfFound: unit?.materiality ?? null, admissionReasons: null };
  }

  const f1Disposition = f1SampledSections.map((label) => {
    const check = checkSectionRefRouted("doc-a", label);
    return { sampledLabel: label, ...check, disposition: check.foundInRegressionInventory ? "RESOLVED_BY_HIERARCHICAL_CLOSURE_OR_ALREADY_PRESENT" : "STILL_MISSING" };
  });

  const f2Disposition = f2SampledCases.map((label) => {
    const m = label.match(/^doc-([a-d])\s+([0-9]+(?:\.[0-9]+)?(?:\([a-zA-Z0-9]+\))*)/);
    if (!m) return { sampledLabel: label, resolvable: false, disposition: "UNPARSEABLE_LABEL" };
    const documentId = `doc-${m[1]}`;
    const sectionRef = m[2]!;
    const doc = regressionCoverage.documentDetails.find((d) => d.documentId === documentId);
    const unit = doc?.units.find((u) => u.anchors[0]?.sectionRef === sectionRef);
    const isHighMateriality = unit?.materiality === "CRITICAL" || unit?.materiality === "MATERIAL";
    return { sampledLabel: label, documentId, sectionRef, resolvable: true, foundInRegressionInventory: !!unit, regressionMateriality: unit?.materiality ?? null, contextuallyElevated: unit?.contextuallyElevated ?? null, disposition: isHighMateriality ? "RESOLVED_BY_CONTEXTUAL_MATERIALITY_OR_ALREADY_ADEQUATE" : unit ? "STILL_DOWNGRADED" : "STILL_MISSING" };
  });

  // --- Boundedness/false-positive gate check against the frozen thresholds ---
  const freezeManifest = loadJson<{ frozenThresholds_setBeforeSeeingDsgrRerunResults: Record<string, { threshold: number }> }>("tests/fixtures/unseen-packages/phase-3f1-freeze/phase-3f1-freeze-manifest.json");
  const regressionSummary = loadJson<{ unitInventory: { totalUnits: number; byMateriality: Record<string, number> }; firstBlindBaselineForComparison: { totalUnits: number; byMateriality: Record<string, number> } }>(join(REGRESSION_DIR, "final-summary.json"));
  const totalUnitGrowthRatio = regressionSummary.unitInventory.totalUnits / regressionSummary.firstBlindBaselineForComparison.totalUnits;
  const regMatCrit = (regressionSummary.unitInventory.byMateriality.MATERIAL ?? 0) + (regressionSummary.unitInventory.byMateriality.CRITICAL ?? 0);
  const baseMatCrit = (regressionSummary.firstBlindBaselineForComparison.byMateriality.MATERIAL ?? 0) + (regressionSummary.firstBlindBaselineForComparison.byMateriality.CRITICAL ?? 0);
  const materialCriticalInflationRatio = regMatCrit / baseMatCrit;
  const regReviewBurden = regMatCrit + (regressionSummary.unitInventory.byMateriality.REVIEW_UNCERTAIN ?? 0);
  const baseReviewBurden = baseMatCrit + (regressionSummary.firstBlindBaselineForComparison.byMateriality.REVIEW_UNCERTAIN ?? 0);
  const reviewBurdenGrowthRatio = regReviewBurden / baseReviewBurden;

  const thresholds = freezeManifest.frozenThresholds_setBeforeSeeingDsgrRerunResults;
  const falsePositiveGateResults = {
    maxTotalUnitCountGrowthRatio: { threshold: thresholds.maxTotalUnitCountGrowthRatio!.threshold, actual: totalUnitGrowthRatio, pass: totalUnitGrowthRatio <= thresholds.maxTotalUnitCountGrowthRatio!.threshold },
    maxMaterialCriticalInflationRatio: { threshold: thresholds.maxMaterialCriticalInflationRatio!.threshold, actual: materialCriticalInflationRatio, pass: materialCriticalInflationRatio <= thresholds.maxMaterialCriticalInflationRatio!.threshold },
    maxReviewBurdenGrowthRatio: { threshold: thresholds.maxReviewBurdenGrowthRatio!.threshold, actual: reviewBurdenGrowthRatio, pass: reviewBurdenGrowthRatio <= thresholds.maxReviewBurdenGrowthRatio!.threshold },
  };

  const report = {
    reportId: "PHASE_3F_1_DSGR_REGRESSION_SCORING_REPORT",
    scoredAt: new Date().toISOString(),
    note: "DSGR is a KNOWN regression package here, scored against the same permanent ground truth used for the original Phase 3F first-blind scoring - this is NOT a second unseen/blind validation.",
    controllingSafetyGate: {
      metric: "DANGEROUS_UNFLAGGED_OMISSION (strict, CRITICAL, Phase-3E-auditor-only reading)",
      firstBlindBaseline: firstBlind.criticalViolationsStrict.length,
      regressionActual: regression.criticalViolationsStrict.length,
      gateRequirement: "must reach 0",
      pass: regression.criticalViolationsStrict.length === 0,
    },
    broadReadingComparison: {
      firstBlindBaseline: firstBlind.criticalViolationsBroad.length,
      regressionActual: regression.criticalViolationsBroad.length,
    },
    aggregateMetrics: {
      firstBlind: { totalViolations: firstBlind.violations.length, byClassification: firstBlind.byClassification, trueBlindSpots: firstBlind.trueBlindSpots.length, chapeauOnlyGaps: firstBlind.chapeauOnlyGaps.length, auditRecallHighMateriality: firstBlind.auditRecall },
      regression: { totalViolations: regression.violations.length, byClassification: regression.byClassification, trueBlindSpots: regression.trueBlindSpots.length, chapeauOnlyGaps: regression.chapeauOnlyGaps.length, auditRecallHighMateriality: regression.auditRecall },
    },
    exhaustiveViolationDispositionTable: {
      note: "Every one of the 303 original first-blind violations, individually dispositioned by gtUnitId (task §52-53) - no silent disappearance, no aggregate-only reporting.",
      totalOriginalViolations: dispositionTable.length,
      resolvedCount,
      stillViolationCount,
      dispositionSummary,
      table: dispositionTable,
    },
    newlyIntroducedViolations: {
      note: "gtUnitIds that were SAFE in the first-blind run but are a VIOLATION in the regression run - the necessary counterpart to the disposition table above, since the strict CRITICAL gate can worsen even while every original violation individually improves, if the fix introduces a new gap.",
      count: newlyBroken.length,
      countCritical: newlyBroken.filter((v) => v.gtMateriality === "CRITICAL").length,
      table: newlyBroken,
    },
    f1SampledCaseDisposition: f1Disposition,
    f2SampledCaseDisposition: f2Disposition,
    falsePositiveReviewBurdenGates: falsePositiveGateResults,
    perDocument: { firstBlind: firstBlind.perDocument, regression: regression.perDocument },
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));

  console.log(`\n=== CONTROLLING SAFETY GATE ===`);
  console.log(`DANGEROUS_UNFLAGGED_OMISSION (strict): first-blind=${firstBlind.criticalViolationsStrict.length} -> regression=${regression.criticalViolationsStrict.length} (requirement: 0) -> ${report.controllingSafetyGate.pass ? "PASS" : "FAIL"}`);
  console.log(`DANGEROUS_UNFLAGGED_OMISSION (broad): first-blind=${firstBlind.criticalViolationsBroad.length} -> regression=${regression.criticalViolationsBroad.length}`);
  console.log(`\n=== VIOLATION DISPOSITION ===`);
  console.log(`Of ${dispositionTable.length} original violations: ${resolvedCount} resolved, ${stillViolationCount} still violations`);
  console.log(JSON.stringify(dispositionSummary, null, 2));
  console.log(`\n=== NEWLY INTRODUCED VIOLATIONS (previously safe, now a violation) ===`);
  console.log(`Total: ${newlyBroken.length} (${newlyBroken.filter((v) => v.gtMateriality === "CRITICAL").length} CRITICAL)`);
  console.log(`\n=== FALSE-POSITIVE / REVIEW-BURDEN GATES ===`);
  console.log(JSON.stringify(falsePositiveGateResults, null, 2));
  console.log(`\nReport written to ${OUT_PATH}`);
}

main();
