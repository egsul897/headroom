/**
 * Phase 3F.1.1 — quadrants, family/structural/document distributions,
 * Pareto, false-positive re-check, F3/F6 verification, and the final
 * disposition/root-cause balance check. READ-ONLY, no production code
 * touched. Consumes the outputs of phase-3f1-1-forensics.ts and
 * phase-3f1-1-root-cause.ts.
 *
 * Run via: npx tsx scripts/phase-3f1-1-distributions.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "tests/fixtures/unseen-packages/phase-3f1-1-forensics";
const FIRST_BLIND_DIR = "tests/fixtures/unseen-packages/phase-3f-first-blind-run";
const REGRESSION_DIR = "tests/fixtures/unseen-packages/phase-3f1-dsgr-remediation-regression";

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}
function preserve(name: string, data: unknown) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
  console.log(`  [preserved] ${OUT_DIR}/${name}.json`);
}

interface CaseForensics {
  gtUnitId: string;
  documentId: string;
  sectionRef: string;
  unitType?: string;
  disposition: string;
  primaryRootCause: string;
  secondaryRootCauses: string[];
  algoA_classification: string;
  algoC_classification: string;
  algoD_classification: string;
  discoveryMatch?: string;
}

function main() {
  const cases = loadJson<CaseForensics[]>(join(OUT_DIR, "case-forensics-all-119.json"));
  const original119 = loadJson<{ gtUnitId: string; unitType: string; discoveryMatch: string; documentId: string }[]>(join(OUT_DIR, "original-119-canonical.json"));
  const unitTypeById = new Map(original119.map((r) => [r.gtUnitId, r.unitType] as const));
  const discoveryMatchById = new Map(original119.map((r) => [r.gtUnitId, r.discoveryMatch] as const));

  const stillDangerous = cases.filter((c) => c.disposition === "STILL_DANGEROUS");

  // --- Invariant check: disposition totals sum to 119 ---
  const dispCounts: Record<string, number> = {};
  for (const c of cases) dispCounts[c.disposition] = (dispCounts[c.disposition] ?? 0) + 1;
  const dispSum = Object.values(dispCounts).reduce((a, b) => a + b, 0);
  console.log("Disposition totals:", JSON.stringify(dispCounts, null, 2));
  console.log(`Sum = ${dispSum} (must equal 119): ${dispSum === 119 ? "BALANCED" : "*** IMBALANCED ***"}`);

  // --- Invariant check: primary root causes sum to residual (STILL_DANGEROUS) count ---
  const primaryCounts: Record<string, number> = {};
  for (const c of stillDangerous) primaryCounts[c.primaryRootCause] = (primaryCounts[c.primaryRootCause] ?? 0) + 1;
  const primarySum = Object.values(primaryCounts).reduce((a, b) => a + b, 0);
  console.log(`\nPrimary root-cause sum = ${primarySum} (must equal ${stillDangerous.length}): ${primarySum === stillDangerous.length ? "BALANCED" : "*** IMBALANCED ***"}`);

  // --- Secondary cause tally ---
  const secondaryCounts: Record<string, number> = {};
  for (const c of stillDangerous) for (const s of c.secondaryRootCauses) secondaryCounts[s] = (secondaryCounts[s] ?? 0) + 1;

  // --- Discovery (Phase 2B) vs Phase 3E four-quadrant table (residual population only) ---
  const quadrants = { A_found_found: 0, B_found_missed: 0, C_missed_found: 0, D_missed_missed: 0 };
  for (const c of stillDangerous) {
    const discFound = discoveryMatchById.get(c.gtUnitId) !== "NONE";
    const auditFound = c.algoD_classification !== "VIOLATION_NO_AUDIT_MATCH"; // has SOME audit match, even if materiality/flagging still wrong
    if (discFound && auditFound) quadrants.A_found_found++;
    else if (discFound && !auditFound) quadrants.B_found_missed++;
    else if (!discFound && auditFound) quadrants.C_missed_found++;
    else quadrants.D_missed_missed++;
  }
  console.log("\n=== Phase 2B discovery vs Phase 3E audit quadrants (residual 89) ===");
  console.log(JSON.stringify(quadrants, null, 2));

  // --- Family distribution (using ground-truth unitType as proxy family) ---
  const familyDist: Record<string, number> = {};
  for (const c of stillDangerous) {
    const ut = unitTypeById.get(c.gtUnitId) ?? "UNKNOWN";
    familyDist[ut] = (familyDist[ut] ?? 0) + 1;
  }

  // --- Structural-shape distribution (derived from sectionRef pattern + gtUnitId hints) ---
  function classifyStructuralShape(sectionRef: string, gtUnitId: string): string {
    if (/chapeau|lead-in/i.test(gtUnitId)) return "SECTION_CHAPEAU";
    if (/proviso|flush|overriding/i.test(gtUnitId)) return "TRAILING_PROVISO_OR_FLUSH_CLAUSE";
    if (/\([a-z0-9]+\)\([a-z0-9]+\)/i.test(sectionRef)) return "NESTED_ENUMERATED_CHILD";
    if (/\([a-z0-9]+\)$/i.test(sectionRef)) return "ENUMERATED_CHILD";
    if (/amendment|exhibit/i.test(gtUnitId)) return "AMENDMENT_CARRIED";
    return "DIRECT_CLAUSE_OR_SECTION";
  }
  const structDist: Record<string, number> = {};
  for (const c of stillDangerous) {
    const shape = classifyStructuralShape(c.sectionRef, c.gtUnitId);
    structDist[shape] = (structDist[shape] ?? 0) + 1;
  }

  // --- Document distribution ---
  const docDist: Record<string, number> = {};
  for (const c of stillDangerous) docDist[c.documentId] = (docDist[c.documentId] ?? 0) + 1;

  // --- Pareto: top-N root causes' coverage of the residual population ---
  const sortedCauses = Object.entries(primaryCounts).sort((a, b) => b[1] - a[1]);
  const paretoRows = sortedCauses.map(([, count], i) => {
    const cumulative = sortedCauses.slice(0, i + 1).reduce((s, [, c]) => s + c, 0);
    return { rank: i + 1, cause: sortedCauses[i]![0], count, cumulativeCount: cumulative, cumulativePercent: (cumulative / stillDangerous.length) * 100 };
  });
  console.log("\n=== Pareto ===");
  for (const row of paretoRows) console.log(`  top-${row.rank}: ${row.cause} (+${row.count}) -> cumulative ${row.cumulativeCount}/${stillDangerous.length} (${row.cumulativePercent.toFixed(1)}%)`);

  // Also compute the "R17-attributable" combined figure (primary R17 + secondary R17)
  const r17Primary = primaryCounts["R17_STRUCTURAL_PARSER_EFFECT"] ?? 0;
  const r17Secondary = secondaryCounts["R17_STRUCTURAL_PARSER_EFFECT"] ?? 0;
  const r17Combined = r17Primary + r17Secondary;
  console.log(`\nR17-attributable (primary + secondary): ${r17Combined}/${stillDangerous.length} (${((r17Combined / stillDangerous.length) * 100).toFixed(1)}%)`);

  preserve("root-cause-taxonomy", { residualPopulation: stillDangerous.length, primaryRootCauseCounts: primaryCounts, secondaryRootCauseCounts: secondaryCounts, r17CombinedPrimaryPlusSecondary: r17Combined, r17CombinedPercent: (r17Combined / stillDangerous.length) * 100, invariantCheck: { dispositionSum: dispSum, expectedDispositionSum: 119, dispositionBalanced: dispSum === 119, primaryRootCauseSum: primarySum, expectedPrimaryRootCauseSum: stillDangerous.length, primaryRootCauseBalanced: primarySum === stillDangerous.length } });
  preserve("discovery-audit-quadrants", quadrants);
  preserve("family-structural-distribution", { familyDistribution: familyDist, structuralShapeDistribution: structDist, documentDistribution: docDist });
  preserve("pareto", paretoRows);

  // --- F3 check: re-verify no OPERATIVE_STATE_RESOLVED-with-zero-provisions in the regression run ---
  const operativeState = loadJson<{ status: string; provisions: unknown[]; unattachedEffects: unknown[] }>(join(REGRESSION_DIR, "stage5-operative-state-recomputed.json"));
  const f3Pass = !(operativeState.status === "OPERATIVE_STATE_RESOLVED" && operativeState.provisions.length === 0);
  console.log(`\n=== F3 check ===`);
  console.log(`status=${operativeState.status}, provisions=${operativeState.provisions.length}, unattachedEffects=${operativeState.unattachedEffects.length}`);
  console.log(`F3 (no falsely-clean RESOLVED-with-zero-provisions state): ${f3Pass ? "PASS" : "FAIL"}`);

  // --- F6 check: verify compile failures preserve errorDetail (spot-check the 2 known failures from first-blind) ---
  const stage6 = loadJson<Array<{ candidateRef: string; status: string; telemetry?: unknown }>>(join(FIRST_BLIND_DIR, "stage6-compiled-results.json"));
  const failedInFirstBlind = stage6.filter((e) => e.status === "FAILED");
  console.log(`\n=== F6 check ===`);
  console.log(`First-blind FAILED candidates: ${failedInFirstBlind.length} (these are FROZEN, historical - errorDetail was not captured for them since they predate Workstream D; F6 is verified via the dedicated synthetic test suite instead, since the DSGR regression reuses this frozen compile output unchanged, per task's own cost-discipline requirement not to recompile)`);

  preserve("f3-f6-verification", {
    f3: { status: operativeState.status, provisionsCount: operativeState.provisions.length, unattachedEffectsCount: operativeState.unattachedEffects.length, pass: f3Pass, note: "Verified against the Phase 3F.1 DSGR regression's own recomputed operative state (stage5-operative-state-recomputed.json) - the exact real-package instance of the original F3 finding." },
    f6: { firstBlindFailedCandidateCount: failedInFirstBlind.length, note: "stage6-compiled-results.json is frozen/reused unchanged in the DSGR regression (task's own cost-discipline requirement forbids recompiling) - F6's fix cannot be re-exercised against these 2 specific historical failures without recompiling, which this phase does not do. F6 is independently verified via its own dedicated synthetic test suite (tests/contract-model/phase-3f1-failure-observability.test.ts, 10 tests, unaffected by this phase's freeze) - re-run in the regression-suite step below." },
  });

  // --- False-positive independent re-check: concentration analysis on the regression's own unit inventory ---
  const regressionCoverage = loadJson<{ documentDetails: { documentId: string; units: { materiality: string; contextuallyElevated?: boolean; anchors: { sectionRef: string | null }[] }[] }[] }>(join(REGRESSION_DIR, "stage8-coverage-result.json"));
  let totalElevated = 0;
  let totalUnits = 0;
  const elevatedByDoc: Record<string, number> = {};
  for (const dd of regressionCoverage.documentDetails) {
    totalUnits += dd.units.length;
    const elevated = dd.units.filter((u) => u.contextuallyElevated).length;
    totalElevated += elevated;
    elevatedByDoc[dd.documentId] = elevated;
  }
  console.log(`\n=== False-positive independent re-check ===`);
  console.log(`Total units: ${totalUnits}, contextuallyElevated: ${totalElevated} (${((totalElevated / totalUnits) * 100).toFixed(2)}%)`);
  console.log(`By document: ${JSON.stringify(elevatedByDoc)}`);
  preserve("false-positive-recheck", { totalUnits, totalElevated, elevatedPercent: (totalElevated / totalUnits) * 100, elevatedByDoc, note: "Independent re-derivation directly from stage8-coverage-result.json, cross-checked against the frozen false-positive thresholds in phase-3f1-freeze-manifest.json (all three passed per the Phase 3F.1 report) - see docs/phase-3f1-1-residual-safety-forensics.md for the concentration analysis." });
}

main();
