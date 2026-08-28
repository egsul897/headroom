/**
 * Phase 3F.1.1 — Residual Safety Failure Forensic Adjudication.
 *
 * READ-ONLY forensic tool. Never modifies production code, historical
 * Phase 3F artifacts, Phase 3F.1 artifacts, or ground truth. Everything
 * this script writes goes under tests/fixtures/unseen-packages/
 * phase-3f1-1-forensics/ (new directory) and docs/phase-3f1-1-*.
 *
 * DSGR remains a KNOWN regression package - nothing here treats it as
 * unseen, and no new package is inspected, downloaded, or fingerprinted.
 *
 * This script re-invokes the CURRENT (frozen, unmodified-by-this-phase)
 * router.ts/unit-hypothesis.ts read-only against the frozen Phase 2A
 * structural output, purely to recover routing-region membership and
 * closure-reason detail that stage8-coverage-result.json's own persisted
 * shape does not retain (it stores only the final hypothesized units, not
 * the intermediate RoutedRegion list). This is not new production
 * behavior - it is a deterministic replay of what the already-committed
 * Phase 3F.1 DSGR regression rerun already computed internally, exposed
 * here for forensic inspection only.
 *
 * Run via: npx tsx scripts/phase-3f1-1-forensics.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIRST_BLIND_DIR = "tests/fixtures/unseen-packages/phase-3f-first-blind-run";
const GT_DIR = "tests/fixtures/unseen-packages/phase-3f-ground-truth";
const REGRESSION_DIR = "tests/fixtures/unseen-packages/phase-3f1-dsgr-remediation-regression";
const SRC_DIR = "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text";
const OUT_DIR = "tests/fixtures/unseen-packages/phase-3f1-1-forensics";

const DOCS = [
  { documentId: "doc-a", file: "doc-a-2022-amended-restated-credit-agreement.txt" },
  { documentId: "doc-b", file: "doc-b-2024-third-amendment.txt" },
  { documentId: "doc-c", file: "doc-c-2025-fourth-amendment.txt" },
  { documentId: "doc-d", file: "doc-d-2025-second-amended-restated-credit-agreement.txt" },
];

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}
function preserve(name: string, data: unknown) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`  [preserved] ${OUT_DIR}/${name}.json`);
}

type Materiality = "CRITICAL" | "MATERIAL" | "REVIEW_UNCERTAIN" | "INFORMATIONAL";

interface GtUnit {
  unitId: string;
  sectionRef: string;
  unitType: string;
  materiality: Materiality;
  description: string;
  keyDefinedTerms?: string[];
  notes?: string;
}
interface GtDoc {
  documentId: string;
  articles: { articleRef: string; heading?: string; units: GtUnit[] }[];
}
interface AuditUnit {
  semanticUnitId: string;
  anchors: { documentId: string; sectionRef: string | null; structuralNodeKey?: string | null; sourceCitation?: string }[];
  family: string;
  materiality: Materiality;
  materialityReasoning?: string;
  contextuallyElevated?: boolean;
  detectedSignals?: string[];
  postureSignal?: string;
  excerptText?: string;
  detectionMethod?: string;
  fromRawSourceFallback?: boolean;
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
interface CoverageResult {
  packageCoverage: { status: string; documents: DocCoverage[] };
  documentDetails: DocDetail[];
}
interface DiscoveryCandidate {
  documentId: string;
  discoveryId: string;
  normalizedSourceRef: string;
  reviewStatus: string;
  confidence: number;
}

function baseSection(ref: string): string {
  const m = ref.match(/^[A-Za-z0-9]+(\.[0-9]+)?/);
  return m ? m[0] : ref;
}
function findDescendants<T>(indexMap: Map<string, T[]>, ref: string): T[] {
  if (!ref) return [];
  const out: T[] = [];
  for (const [key, items] of indexMap) {
    if (key.length > ref.length && key.startsWith(ref) && key[ref.length] === "(") out.push(...items);
  }
  return out;
}

interface ScorerResult {
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
  classification: "SAFE_FULLY_REPRESENTED" | "SAFE_FLAGGED_DANGEROUS" | "SAFE_LOW_MATERIALITY_UNREPRESENTED" | "VIOLATION_NO_AUDIT_MATCH" | "VIOLATION_MATERIALITY_MISCLASSIFIED_UNFLAGGED" | "VIOLATION_UNREPRESENTED_NOT_FLAGGED";
  wouldBeSafeUnderBroadReading: boolean;
  matchedUnitIds: string[];
}

/**
 * The scorer algorithm, parameterized by `unionDescendantsOnExactMatch`:
 * - false = "algorithm A/B" - the ORIGINAL Phase 3F scorer's exact-match-
 *   preferred semantics (scripts/phase-3f-score-first-run.ts, permanent,
 *   never modified). Section 6 of the task calls this both "original
 *   Phase 3F scoring semantics" (applied to first-blind coverage) and
 *   "pre-correction Phase 3F.1 scoring semantics" (applied to regression
 *   coverage) - it is the SAME algorithm in both cases, only the input
 *   coverage differs.
 * - true = "algorithm C" - the corrected Phase 3F.1 regression scorer
 *   (scripts/phase-3f1-score-dsgr-regression.ts), which unions descendant
 *   units into an exact match rather than stopping at a thin parent.
 */
function score(coverageResult: CoverageResult, discoveryAll: DiscoveryCandidate[], gtDocs: GtDoc[], docIds: string[], unionDescendantsOnExactMatch: boolean): ScorerResult[] {
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

  const results: ScorerResult[] = [];
  for (const gtDoc of gtDocs) {
    if (!docIds.includes(gtDoc.documentId)) continue;
    const discIndex = discByDoc.get(gtDoc.documentId) ?? new Map<string, DiscoveryCandidate[]>();
    const auditIndex = auditByDoc.get(gtDoc.documentId) ?? new Map<string, AuditUnit[]>();
    const coverageIndex = coverageByDoc.get(gtDoc.documentId) ?? new Map<string, CoverageEntry>();
    const dangerousSet = dangerousByDoc.get(gtDoc.documentId) ?? new Set<string>();

    for (const article of gtDoc.articles) {
      for (const unit of article.units) {
        const base = baseSection(unit.sectionRef ?? "");

        let discoveryMatch: ScorerResult["discoveryMatch"] = "NONE";
        let discCandidates: DiscoveryCandidate[] = discIndex.get(unit.sectionRef) ?? [];
        if (discCandidates.length > 0) discoveryMatch = "EXACT";
        else {
          discCandidates = discIndex.get(base) ?? [];
          if (discCandidates.length > 0) discoveryMatch = "PARENT";
          else {
            discCandidates = findDescendants<DiscoveryCandidate>(discIndex, unit.sectionRef ?? "");
            if (discCandidates.length > 0) discoveryMatch = "DESCENDANT";
          }
        }
        const discoveryReviewFlagged = discCandidates.some((c) => c.reviewStatus === "NEEDS_REVIEW");

        let auditMatch: ScorerResult["auditMatch"] = "NONE";
        let auditUnits: AuditUnit[] = auditIndex.get(unit.sectionRef) ?? [];
        if (auditUnits.length > 0) {
          auditMatch = "EXACT";
          if (unionDescendantsOnExactMatch) {
            const descendants = findDescendants<AuditUnit>(auditIndex, unit.sectionRef ?? "");
            if (descendants.length > 0) auditUnits = [...auditUnits, ...descendants];
          }
        } else {
          auditUnits = auditIndex.get(base) ?? [];
          if (auditUnits.length > 0) auditMatch = "PARENT";
          else {
            auditUnits = findDescendants<AuditUnit>(auditIndex, unit.sectionRef ?? "");
            if (auditUnits.length > 0) auditMatch = "DESCENDANT";
          }
        }
        const auditMatchChapeauOnly = auditMatch === "DESCENDANT";

        let auditMaterialityAssigned: Materiality | null = null;
        let coverageState: string | null = null;
        let inDangerousUnaccounted = false;
        let matchedUnitIds: string[] = [];

        if (auditUnits.length > 0) {
          const order: Materiality[] = ["CRITICAL", "MATERIAL", "REVIEW_UNCERTAIN", "INFORMATIONAL"];
          const sorted = [...auditUnits].sort((a, b) => order.indexOf(a.materiality) - order.indexOf(b.materiality));
          const best = sorted[0]!;
          auditMaterialityAssigned = best.materiality;
          const cov = coverageIndex.get(best.semanticUnitId);
          coverageState = cov?.coverageState ?? null;
          inDangerousUnaccounted = auditUnits.some((u) => dangerousSet.has(u.semanticUnitId));
          matchedUnitIds = auditUnits.map((u) => u.semanticUnitId);
        }

        const gtIsHighMateriality = unit.materiality === "CRITICAL" || unit.materiality === "MATERIAL";
        const auditMaterialityMismatch = auditMaterialityAssigned !== null && gtIsHighMateriality && (auditMaterialityAssigned === "INFORMATIONAL" || auditMaterialityAssigned === "REVIEW_UNCERTAIN");
        const isFullyRepresented = coverageState === "FULLY_REPRESENTED_VERIFIED" || coverageState === "FULLY_REPRESENTED_REVIEW_REQUIRED";
        const isUnrepresented = coverageState === "UNREPRESENTED" || coverageState === "PARTIALLY_REPRESENTED" || coverageState === null;

        let classification: ScorerResult["classification"];
        if (!gtIsHighMateriality) classification = "SAFE_LOW_MATERIALITY_UNREPRESENTED";
        else if (auditMatch === "NONE") classification = "VIOLATION_NO_AUDIT_MATCH";
        else if (isFullyRepresented) classification = "SAFE_FULLY_REPRESENTED";
        else if (auditMaterialityMismatch && !inDangerousUnaccounted) classification = "VIOLATION_MATERIALITY_MISCLASSIFIED_UNFLAGGED";
        else if (isUnrepresented && inDangerousUnaccounted) classification = "SAFE_FLAGGED_DANGEROUS";
        else if (isUnrepresented && !inDangerousUnaccounted) classification = "VIOLATION_UNREPRESENTED_NOT_FLAGGED";
        else classification = "SAFE_FLAGGED_DANGEROUS";

        const wouldBeSafeUnderBroadReading = classification.startsWith("VIOLATION_") && discoveryMatch !== "NONE" && discoveryReviewFlagged;

        results.push({ gtUnitId: unit.unitId, documentId: gtDoc.documentId, sectionRef: unit.sectionRef, gtMateriality: unit.materiality, unitType: unit.unitType, discoveryMatch, discoveryReviewFlagged, auditMatch, auditMatchChapeauOnly, auditMaterialityAssigned, auditMaterialityMismatch, coverageState, inDangerousUnaccounted, classification, wouldBeSafeUnderBroadReading, matchedUnitIds });
      }
    }
  }
  return results;
}

async function main() {
  console.log("================ PHASE_3F_1_1_FORENSIC_SCORING ================");
  const docIds = ["doc-a", "doc-b", "doc-c", "doc-d"];
  const gtDocs = docIds.map((d) => loadJson<GtDoc>(join(GT_DIR, `ground-truth-${d}.json`)));
  const discoveryAll = loadJson<DiscoveryCandidate[]>(join(FIRST_BLIND_DIR, "stage2-all-discovery-candidates.json"));
  const firstBlindCoverage = loadJson<CoverageResult>(join(FIRST_BLIND_DIR, "stage8-coverage-result.json"));
  const regressionCoverage = loadJson<CoverageResult>(join(REGRESSION_DIR, "stage8-coverage-result.json"));
  const originalScoringReport = loadJson<{ allResults: ScorerResult[] }>(join(GT_DIR, "phase-3f-scoring-report.json"));

  // The permanent, sealed original 119: gtMateriality CRITICAL + VIOLATION_* classification, from the ORIGINAL algorithm as sealed in phase-3f-scoring-report.json (never recomputed - read directly).
  const original119 = originalScoringReport.allResults.filter((r) => r.gtMateriality === "CRITICAL" && r.classification.startsWith("VIOLATION_"));
  console.log(`Original permanent sealed strict CRITICAL violations: ${original119.length}`);
  if (original119.length !== 119) console.log(`  *** WARNING: expected 119, found ${original119.length} - reporting the true count, not forcing it ***`);

  // Three scorer/coverage combinations, run fresh from frozen artifacts.
  console.log("\n=== Scorer combination A: original algorithm (exact-only) x first-blind coverage ===");
  const algoA_firstBlind = score(firstBlindCoverage, discoveryAll, gtDocs, docIds, false);
  console.log("=== Scorer combination B: original algorithm (exact-only) x regression coverage ===");
  const algoB_regression = score(regressionCoverage, discoveryAll, gtDocs, docIds, false);
  console.log("=== Scorer combination C: corrected algorithm (union descendants) x first-blind coverage ===");
  const algoC_firstBlind = score(firstBlindCoverage, discoveryAll, gtDocs, docIds, true);
  console.log("=== Scorer combination D: corrected algorithm (union descendants) x regression coverage ===");
  const algoD_regression = score(regressionCoverage, discoveryAll, gtDocs, docIds, true);

  const countCriticalViolations = (rs: ScorerResult[]) => rs.filter((r) => r.gtMateriality === "CRITICAL" && r.classification.startsWith("VIOLATION_")).length;
  console.log(`\nA (original alg x first-blind, = the permanent sealed 119): ${countCriticalViolations(algoA_firstBlind)}`);
  console.log(`B (original alg x regression, pre-correction Phase 3F.1 semantics): ${countCriticalViolations(algoB_regression)}`);
  console.log(`C (corrected alg x first-blind, the "93" baseline used in the Phase 3F.1 report): ${countCriticalViolations(algoC_firstBlind)}`);
  console.log(`D (corrected alg x regression, the "89" final reported in the Phase 3F.1 report): ${countCriticalViolations(algoD_regression)}`);

  preserve("raw-scorer-combination-A-original-x-firstblind", algoA_firstBlind);
  preserve("raw-scorer-combination-B-original-x-regression", algoB_regression);
  preserve("raw-scorer-combination-C-corrected-x-firstblind", algoC_firstBlind);
  preserve("raw-scorer-combination-D-corrected-x-regression", algoD_regression);
  preserve("original-119-canonical", original119);

  console.log("\nDone. Run scripts/phase-3f1-1-build-lineage.ts next to build the full lineage/bridge/residual artifacts.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
