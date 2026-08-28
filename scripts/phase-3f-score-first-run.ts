/**
 * Phase 3F §171 - score the frozen, sealed first-blind run output against
 * the independently authored ground truth (task #170). Read-only: loads
 * the sealed artifacts (verified against the integrity manifest's hashes)
 * and the 4 ground truth files, cross-references every ground truth unit
 * against (a) Phase 2B discovery candidates and (b) Phase 3E's own
 * semantic-coverage audit inventory/coverage-state/dangerous-unaccounted
 * list, and computes every metric the frozen scoring/gate definitions
 * (phase-3f-freeze-manifest.json) require - most importantly the
 * controlling safety gate, DANGEROUS_UNFLAGGED_OMISSION.
 *
 * Matching is by structural sectionRef: exact match preferred, falling
 * back to the nearest enclosing section (e.g. ground truth "6.01(a)"
 * falls back to an audit/discovery unit anchored at "6.01" if no exact
 * "6.01(a)" unit exists) since the audit's Layer A/B granularity does not
 * always exactly mirror ground truth's lettered-basket granularity.
 *
 * Run via: npx tsx scripts/phase-3f-score-first-run.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RUN_DIR = "tests/fixtures/unseen-packages/phase-3f-first-blind-run";
const GT_DIR = "tests/fixtures/unseen-packages/phase-3f-ground-truth";
const OUT_PATH = join(GT_DIR, "phase-3f-scoring-report.json");

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
  amendmentEffectivenessConditions?: unknown[];
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// --- Step 0: verify sealed run artifacts against the integrity manifest ---
function verifySeal() {
  const manifest = loadJson<{ files: { path: string; sha256: string }[] }>(
    join(RUN_DIR, "phase-3f-first-run-integrity-manifest.json"),
  );
  const mismatches: string[] = [];
  for (const f of manifest.files) {
    const actual = sha256(f.path);
    if (actual !== f.sha256) mismatches.push(f.path);
  }
  if (mismatches.length > 0) {
    throw new Error(`SEAL VIOLATION - these files no longer match the integrity manifest: ${mismatches.join(", ")}`);
  }
  console.log(`Seal verified: all ${manifest.files.length} first-run artifacts match their recorded hashes.`);
}

// --- Base section number for fallback matching, e.g. "6.01(a)(ii)" -> "6.01" ---
function baseSection(ref: string): string {
  const m = ref.match(/^[A-Za-z0-9]+(\.[0-9]+)?/);
  return m ? m[0] : ref;
}

interface AuditUnit {
  semanticUnitId: string;
  anchors: { documentId: string; sectionRef: string | null }[];
  family: string;
  materiality: Materiality;
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

  discoveryMatch: "EXACT" | "PARENT" | "NONE";
  discoveryReviewFlagged: boolean;

  auditMatch: "EXACT" | "PARENT" | "NONE";
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

  /**
   * Broad-reading override (task §controllingSafetyGate's own "neither primary
   * uncertainty/sufficiency logic NOR Phase 2E/3E auditor surfaces the
   * problem" wording): true when this classification is a VIOLATION_* under
   * the strict (Phase 3E-auditor-only) reading, but a discovered candidate
   * at the same address was flagged NEEDS_REVIEW - i.e. discovery's own
   * uncertainty logic DID surface something worth reviewing here, even
   * though Phase 3E's separate coverage audit never independently
   * hypothesized this unit. Reported as a second, more permissive count
   * alongside the strict one - not used to silently downgrade the strict
   * finding, since Phase 3E's audit is meant to be a comprehensive,
   * independent safety net regardless of what discovery already found.
   */
  wouldBeSafeUnderBroadReading: boolean;
}

function main() {
  verifySeal();

  const docIds = ["doc-a", "doc-b", "doc-c", "doc-d"];
  const gtDocs = docIds.map((d) => loadJson<GtDoc>(join(GT_DIR, `ground-truth-${d}.json`)));

  const discoveryAll = loadJson<DiscoveryCandidate[]>(join(RUN_DIR, "stage2-all-discovery-candidates.json"));
  const coverageResult = loadJson<{
    packageCoverage: { status: string; documents: DocCoverage[] };
    documentDetails: DocDetail[];
  }>(join(RUN_DIR, "stage8-coverage-result.json"));

  // Index discovery candidates by documentId -> sectionRef -> candidates
  const discByDoc = new Map<string, Map<string, DiscoveryCandidate[]>>();
  for (const c of discoveryAll) {
    if (!discByDoc.has(c.documentId)) discByDoc.set(c.documentId, new Map());
    const m = discByDoc.get(c.documentId)!;
    if (!m.has(c.normalizedSourceRef)) m.set(c.normalizedSourceRef, []);
    m.get(c.normalizedSourceRef)!.push(c);
  }

  // Index audit units by documentId -> sectionRef -> units, plus lookup maps
  const auditByDoc = new Map<string, Map<string, AuditUnit[]>>();
  const auditUnitById = new Map<string, AuditUnit>();
  for (const dd of coverageResult.documentDetails) {
    const m = new Map<string, AuditUnit[]>();
    for (const u of dd.units) {
      auditUnitById.set(u.semanticUnitId, u);
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
    const discIndex: Map<string, DiscoveryCandidate[]> = discByDoc.get(gtDoc.documentId) ?? new Map();
    const auditIndex: Map<string, AuditUnit[]> = auditByDoc.get(gtDoc.documentId) ?? new Map();
    const coverageIndex: Map<string, CoverageEntry> = coverageByDoc.get(gtDoc.documentId) ?? new Map();
    const dangerousSet: Set<string> = dangerousByDoc.get(gtDoc.documentId) ?? new Set();

    for (const article of gtDoc.articles) {
      for (const unit of article.units) {
        const base = baseSection(unit.sectionRef ?? "");

        // Discovery match
        let discoveryMatch: MatchResult["discoveryMatch"] = "NONE";
        let discoveryReviewFlagged = false;
        let discCandidates = discIndex.get(unit.sectionRef) ?? [];
        if (discCandidates.length > 0) discoveryMatch = "EXACT";
        else {
          discCandidates = discIndex.get(base) ?? [];
          if (discCandidates.length > 0) discoveryMatch = "PARENT";
        }
        discoveryReviewFlagged = discCandidates.some((c) => c.reviewStatus === "NEEDS_REVIEW");

        // Audit match
        let auditMatch: MatchResult["auditMatch"] = "NONE";
        let auditUnits = auditIndex.get(unit.sectionRef) ?? [];
        if (auditUnits.length > 0) auditMatch = "EXACT";
        else {
          auditUnits = auditIndex.get(base) ?? [];
          if (auditUnits.length > 0) auditMatch = "PARENT";
        }

        let auditMaterialityAssigned: Materiality | null = null;
        let coverageState: string | null = null;
        let inDangerousUnaccounted = false;

        if (auditUnits.length > 0) {
          // Prefer the highest-materiality audit unit at this address (most conservative read).
          const order: Materiality[] = ["CRITICAL", "MATERIAL", "REVIEW_UNCERTAIN", "INFORMATIONAL"];
          auditUnits.sort((a, b) => order.indexOf(a.materiality) - order.indexOf(b.materiality));
          const best = auditUnits[0]!;
          auditMaterialityAssigned = best.materiality;
          const cov = coverageIndex.get(best.semanticUnitId);
          coverageState = cov?.coverageState ?? null;
          inDangerousUnaccounted = auditUnits.some((u) => dangerousSet.has(u.semanticUnitId));
        }

        const gtIsHighMateriality = unit.materiality === "CRITICAL" || unit.materiality === "MATERIAL";
        const auditMaterialityMismatch =
          auditMaterialityAssigned !== null &&
          gtIsHighMateriality &&
          (auditMaterialityAssigned === "INFORMATIONAL" || auditMaterialityAssigned === "REVIEW_UNCERTAIN");

        const isFullyRepresented = coverageState === "FULLY_REPRESENTED_VERIFIED" || coverageState === "FULLY_REPRESENTED_REVIEW_REQUIRED";
        const isUnrepresented = coverageState === "UNREPRESENTED" || coverageState === "PARTIALLY_REPRESENTED" || coverageState === null;

        let classification: MatchResult["classification"];
        if (!gtIsHighMateriality) {
          classification = "SAFE_LOW_MATERIALITY_UNREPRESENTED";
        } else if (auditMatch === "NONE") {
          classification = "VIOLATION_NO_AUDIT_MATCH";
        } else if (isFullyRepresented) {
          classification = "SAFE_FULLY_REPRESENTED";
        } else if (auditMaterialityMismatch && !inDangerousUnaccounted) {
          classification = "VIOLATION_MATERIALITY_MISCLASSIFIED_UNFLAGGED";
        } else if (isUnrepresented && inDangerousUnaccounted) {
          classification = "SAFE_FLAGGED_DANGEROUS";
        } else if (isUnrepresented && !inDangerousUnaccounted) {
          classification = "VIOLATION_UNREPRESENTED_NOT_FLAGGED";
        } else {
          classification = "SAFE_FLAGGED_DANGEROUS";
        }

        const wouldBeSafeUnderBroadReading = classification.startsWith("VIOLATION_") && discoveryMatch !== "NONE" && discoveryReviewFlagged;

        results.push({
          gtUnitId: unit.unitId,
          documentId: gtDoc.documentId,
          sectionRef: unit.sectionRef,
          gtMateriality: unit.materiality,
          unitType: unit.unitType,
          discoveryMatch,
          discoveryReviewFlagged,
          auditMatch,
          auditMaterialityAssigned,
          auditMaterialityMismatch,
          coverageState,
          inDangerousUnaccounted,
          classification,
          wouldBeSafeUnderBroadReading,
        });
      }
    }
  }

  // --- Aggregate metrics ---
  const total = results.length;
  const byClassification: Record<string, number> = {};
  for (const r of results) byClassification[r.classification] = (byClassification[r.classification] ?? 0) + 1;

  const violations = results.filter((r) => r.classification.startsWith("VIOLATION_"));
  const criticalViolations = violations.filter((r) => r.gtMateriality === "CRITICAL");
  const criticalViolationsStrict = criticalViolations; // Phase 3E-auditor-only reading (primary/controlling)
  const criticalViolationsBroad = criticalViolations.filter((r) => !r.wouldBeSafeUnderBroadReading); // credits discovery-layer NEEDS_REVIEW flags too

  const highMatUnits = results.filter((r) => r.gtMateriality === "CRITICAL" || r.gtMateriality === "MATERIAL");
  const discoveryRecallNumerator = highMatUnits.filter((r) => r.discoveryMatch !== "NONE").length;
  const discoveryRecall = highMatUnits.length > 0 ? discoveryRecallNumerator / highMatUnits.length : 1;

  const basketUnits = results.filter((r) => r.unitType === "BASKET" || r.unitType === "EXCEPTION");
  const basketDiscoveryRecall =
    basketUnits.length > 0 ? basketUnits.filter((r) => r.discoveryMatch !== "NONE").length / basketUnits.length : 1;

  // Covenant-bearing SECTION recall (task's own named gate, >=98%): distinct
  // (documentId, base-section) addresses inside Articles V/VI/VII that are
  // CRITICAL/MATERIAL - does discovery have ANY candidate anchored there,
  // at the section level (not sub-clause), regardless of unitType.
  const covenantArticleRefs = new Set(["V", "VI", "VII"]);
  const covenantSectionAddresses = new Map<string, boolean>(); // "docId::baseSection" -> found-by-discovery
  for (const gtDoc of gtDocs) {
    for (const article of gtDoc.articles) {
      if (!covenantArticleRefs.has(article.articleRef)) continue;
      const discIndex: Map<string, DiscoveryCandidate[]> = discByDoc.get(gtDoc.documentId) ?? new Map();
      for (const unit of article.units) {
        if (unit.materiality !== "CRITICAL" && unit.materiality !== "MATERIAL") continue;
        const base = baseSection(unit.sectionRef ?? "");
        const key = `${gtDoc.documentId}::${base}`;
        if (covenantSectionAddresses.has(key)) continue;
        const found = (discIndex.get(base)?.length ?? 0) > 0;
        covenantSectionAddresses.set(key, found);
      }
    }
  }
  const covenantSectionRecall =
    covenantSectionAddresses.size > 0
      ? [...covenantSectionAddresses.values()].filter(Boolean).length / covenantSectionAddresses.size
      : 1;

  // Operative-rule recall (task's own named gate, >=95%): scoped to unitTypes
  // that represent an actual operative rule (not definitions/cross-refs/
  // boilerplate-summaries), regardless of which Article they're in.
  const operativeUnitTypes = new Set(["COVENANT", "BASKET", "EXCEPTION", "CONDITION", "EVENT_OF_DEFAULT", "FINANCIAL_TEST"]);
  const operativeUnits = highMatUnits.filter((r) => operativeUnitTypes.has(r.unitType));
  const operativeRuleRecall =
    operativeUnits.length > 0 ? operativeUnits.filter((r) => r.discoveryMatch !== "NONE").length / operativeUnits.length : 1;

  const auditRecallNumerator = highMatUnits.filter((r) => r.auditMatch !== "NONE").length;
  const auditRecall = highMatUnits.length > 0 ? auditRecallNumerator / highMatUnits.length : 1;

  const perDocument: Record<string, unknown> = {};
  for (const docId of docIds) {
    const docResults = results.filter((r) => r.documentId === docId);
    const docHighMat = docResults.filter((r) => r.gtMateriality === "CRITICAL" || r.gtMateriality === "MATERIAL");
    perDocument[docId] = {
      totalGtUnits: docResults.length,
      byClassification: docResults.reduce<Record<string, number>>((acc, r) => {
        acc[r.classification] = (acc[r.classification] ?? 0) + 1;
        return acc;
      }, {}),
      discoveryRecallHighMateriality: docHighMat.length > 0 ? docHighMat.filter((r) => r.discoveryMatch !== "NONE").length / docHighMat.length : 1,
      violationCount: docResults.filter((r) => r.classification.startsWith("VIOLATION_")).length,
      criticalViolationCount: docResults.filter((r) => r.classification.startsWith("VIOLATION_") && r.gtMateriality === "CRITICAL").length,
    };
  }

  const report = {
    reportId: "PHASE_3F_SCORING_REPORT",
    scoredAt: new Date().toISOString(),
    groundTruthTotalUnits: total,
    groundTruthHighMaterialityUnits: highMatUnits.length,
    metrics: {
      dangerousUnflaggedOmissionCount_strictPhase3EAuditorOnly: criticalViolationsStrict.length,
      dangerousUnflaggedOmissionCount_broadCreditingDiscoveryUncertainty: criticalViolationsBroad.length,
      totalViolationCount: violations.length,
      violationCountByMateriality: {
        CRITICAL: violations.filter((r) => r.gtMateriality === "CRITICAL").length,
        MATERIAL: violations.filter((r) => r.gtMateriality === "MATERIAL").length,
      },
      discoveryLayerRecallHighMateriality: discoveryRecall,
      discoveryLayerRecallBasketException_gateThreshold0_95: basketDiscoveryRecall,
      covenantBearingSectionRecall_gateThreshold0_98: covenantSectionRecall,
      operativeRuleRecall_gateThreshold0_95: operativeRuleRecall,
      auditInventoryRecallHighMateriality: auditRecall,
    },
    byClassification,
    perDocument,
    violationDetail: violations.map((r) => ({
      gtUnitId: r.gtUnitId,
      documentId: r.documentId,
      sectionRef: r.sectionRef,
      gtMateriality: r.gtMateriality,
      classification: r.classification,
      auditMatch: r.auditMatch,
      auditMaterialityAssigned: r.auditMaterialityAssigned,
      coverageState: r.coverageState,
      inDangerousUnaccounted: r.inDangerousUnaccounted,
    })),
    allResults: results,
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nScoring complete. ${total} ground truth units scored (${highMatUnits.length} CRITICAL/MATERIAL).`);
  console.log(`DANGEROUS_UNFLAGGED_OMISSION count (CRITICAL, strict Phase-3E-auditor-only reading): ${criticalViolationsStrict.length}`);
  console.log(`DANGEROUS_UNFLAGGED_OMISSION count (CRITICAL, broad reading crediting discovery NEEDS_REVIEW): ${criticalViolationsBroad.length}`);
  console.log(`Total violations (CRITICAL+MATERIAL): ${violations.length}`);
  console.log(`Discovery-layer recall (CRITICAL/MATERIAL, all unit types): ${(discoveryRecall * 100).toFixed(2)}%`);
  console.log(`Gate: basket/exception recall >= 95%: ${(basketDiscoveryRecall * 100).toFixed(2)}% (${basketDiscoveryRecall >= 0.95 ? "PASS" : "FAIL"})`);
  console.log(`Gate: covenant-bearing section recall >= 98%: ${(covenantSectionRecall * 100).toFixed(2)}% (${covenantSectionRecall >= 0.98 ? "PASS" : "FAIL"})`);
  console.log(`Gate: operative-rule recall >= 95%: ${(operativeRuleRecall * 100).toFixed(2)}% (${operativeRuleRecall >= 0.95 ? "PASS" : "FAIL"})`);
  console.log(`Audit-inventory recall (CRITICAL/MATERIAL): ${(auditRecall * 100).toFixed(2)}%`);
  console.log(`By classification:`, JSON.stringify(byClassification, null, 2));
  console.log(`\nReport written to ${OUT_PATH}`);
}

main();
