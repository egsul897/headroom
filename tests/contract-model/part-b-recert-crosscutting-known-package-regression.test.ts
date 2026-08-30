/**
 * Phase 3F.1.6.RX Part B (Auditor 8 - cross-cutting recertification).
 *
 * INDEPENDENT re-verification of Part A's
 * docs/phase-3f1-6-rx-final-blocker-closure/19-known-package-regression-and-false-credit.json
 * claim that materialUnitsWithoutClaimReviewItem = 0 for FWRG and LSB.
 *
 * Deliberately does NOT reuse scripts/phase-3f1-6-known-package-regression.ts's
 * own tallying function (summarizeDocument). That script derives its
 * "materialUnitsWithoutClaimReviewItem" count from in-memory outcome-type
 * counters (outcomesByType.CREATED + OBSERVATION_APPENDED +
 * REOPENED_FROM_RESOLVED) - a count that could in principle be wrong if,
 * say, an ALREADY_RECORDED outcome occurred (a real ClaimReviewItem exists
 * but isn't tallied as "created"). This test instead:
 *
 *   1. Runs the exact same real, frozen evidence (FWRG/LSB structural index +
 *      preserved discovery/compiled fixtures) through the same two
 *      unmodified production functions (runSemanticCoverageAudit,
 *      recordClaimReviewsFromDocumentCoverage) Part A's script calls.
 *   2. Independently derives the set of "must have a ClaimReviewItem" units
 *      directly from deriveFromCoverageEntry's own two real gates
 *      (materiality tier + REVIEWABLE_STATES membership + a real anchor),
 *      re-implemented here by calling deriveFromCoverageEntry itself
 *      (the actual production derivation function), not a re-approximation.
 *   3. Confirms via a DIRECT Postgres query (not a return-value tally) that
 *      every such unit's claimKeyFromSemanticUnit resolves to a real,
 *      persisted ClaimReviewItem row for this company.
 *
 * Uses its own dedicated scratch companyId, entirely separate from
 * scripts/phase-3f1-6-known-package-regression.ts's own scratch company, so
 * this run is genuinely independent (not reading state the other script
 * left behind).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { loadFwrgLsbStructuralIndex } from "../../scripts/phase-3b-real-regression";
import { loadRealDiscoveredCandidates as loadFwrgCandidates, loadRealCompiledResults as loadFwrgCompiled, DOCUMENT_ID as FWRG_DOC_ID } from "../../scripts/phase-3e-real-fwrg-regression";
import { loadRealDiscoveredCandidates as loadLsbCandidates, loadRealCompiledResults as loadLsbCompiled, DOCUMENT_ID as LSB_DOC_ID } from "../../scripts/phase-3e-real-lsb-regression";
import { runSemanticCoverageAudit } from "../../lib/contract-model/compiler/semantic-coverage/pipeline";
import { recordClaimReviewsFromDocumentCoverage } from "../../lib/contract-model/compiler/safe-failure/integrate";
import { deriveFromCoverageEntry } from "../../lib/contract-model/compiler/safe-failure/derive";
import { claimKeyFromSemanticUnit } from "../../lib/contract-model/compiler/safe-failure/identity";
import type { StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import type { DocumentCoverageResult } from "../../lib/contract-model/compiler/semantic-coverage/types";

const COMPANY_ID = "part-b-recert-crosscutting-known-pkg-independent";

function withRealNodeIds(candidates: DiscoveredCandidate[], index: StructuralIndex, documentId: string): DiscoveredCandidate[] {
  return candidates.map((c) => ({
    ...c,
    structuralNodeIds: c.structuralNodeKeys.map((key) => index.getNodeByRef(documentId, key.slice(key.indexOf("::") + 2))?.nodeId ?? ""),
  }));
}

async function runAndIndependentlyVerify(packageKeyLabel: string, documentId: string, index: StructuralIndex, candidatesRaw: DiscoveredCandidate[], compiled: ReturnType<typeof loadFwrgCompiled>) {
  await prisma.document.upsert({ where: { id: documentId }, create: { id: documentId, companyId: COMPANY_ID, name: `${packageKeyLabel} independent scratch`, type: "CREDIT_AGREEMENT" }, update: {} });

  const result = await runSemanticCoverageAudit({
    companyId: COMPANY_ID,
    packageKey: packageKeyLabel,
    instrumentKey: null,
    index,
    documents: [{ documentId }],
    discoveredCandidates: candidatesRaw,
    compiledResults: compiled,
    verifiedCandidateRefs: new Set(),
    operativeState: null,
    operativeVersionRef: null,
    structuralParserVersion: "phase-2a-structural-index",
    providerIdentity: null,
  });

  const doc = result.packageCoverage.documents[0]!;
  await recordClaimReviewsFromDocumentCoverage(COMPANY_ID, packageKeyLabel, doc);

  // Independent derivation: call the REAL production gate function
  // (deriveFromCoverageEntry) per unit, not a re-approximation of its logic.
  const entryByUnitId = new Map(doc.coverageEntries.map((e) => [e.semanticUnitId, e]));
  const dangerousByUnitId = new Map(doc.dangerousUnaccounted.map((d) => [d.semanticUnitId, d]));

  const expectedClaimKeys: string[] = [];
  let skippedNoAnchorButOtherwiseRequired = 0;
  for (const unit of doc.units) {
    const entry = entryByUnitId.get(unit.semanticUnitId);
    if (!entry) continue;
    const derived = deriveFromCoverageEntry({
      unit,
      entry,
      dangerous: dangerousByUnitId.get(unit.semanticUnitId) ?? null,
      companyId: COMPANY_ID,
      packageKey: packageKeyLabel,
      instrumentKey: unit.instrumentKey,
      coverageAlgorithmVersion: entry.coverageAlgorithmVersion,
    });
    if (derived === null) {
      // Only a genuine "not required" case (below-material tier, VERIFIED
      // state, or - disclosed separately below - a real anchor-less unit)
      // should land here; distinguish the anchor-less sub-case for honest
      // reporting rather than silently folding it into "not required."
      const materialTiers = new Set(["CRITICAL", "MATERIAL"]);
      const reviewable = entry.coverageState !== "FULLY_REPRESENTED_VERIFIED";
      if (materialTiers.has(unit.materiality) && reviewable && (unit.anchors[0] ?? null) === null) {
        skippedNoAnchorButOtherwiseRequired += 1;
      }
      continue;
    }
    expectedClaimKeys.push(derived.claimKey);
  }

  // Direct Postgres query - not a return-value tally from recordClaimReviewsFromDocumentCoverage.
  const persisted = await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY_ID, claimKey: { in: expectedClaimKeys.length > 0 ? expectedClaimKeys : ["__none__"] } } });
  const persistedKeys = new Set(persisted.map((p) => p.claimKey));

  const missing = expectedClaimKeys.filter((k) => !persistedKeys.has(k));

  return {
    totalMaterialSemanticUnits: doc.units.length,
    expectedRequiredCount: expectedClaimKeys.length,
    persistedCount: persisted.length,
    materialUnitsWithoutClaimReviewItem: missing.length,
    skippedNoAnchorButOtherwiseRequired,
    missing,
  };
}

beforeAll(async () => {
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Part B independent known-package regression scratch" } });
});

afterAll(async () => {
  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.document.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
});

describe("Part B cross-cutting recertification: independent known-package regression re-verification (FWRG/LSB)", () => {
  it("FWRG: independently-derived materialUnitsWithoutClaimReviewItem is 0, matching Part A's own claim, via a DB-query-based check (not a rerun of Part A's own tally)", async () => {
    const { index } = loadFwrgLsbStructuralIndex();
    const candidates = withRealNodeIds(loadFwrgCandidates(), index, FWRG_DOC_ID);
    const compiled = loadFwrgCompiled(candidates);
    const outcome = await runAndIndependentlyVerify("fwrg-2021-credit-agreement", FWRG_DOC_ID, index, candidates, compiled);

    expect(outcome.totalMaterialSemanticUnits).toBeGreaterThan(0);
    expect(outcome.expectedRequiredCount).toBeGreaterThan(0); // a non-trivial check - not vacuously true
    expect(outcome.materialUnitsWithoutClaimReviewItem, JSON.stringify(outcome.missing)).toBe(0);
    expect(outcome.skippedNoAnchorButOtherwiseRequired).toBe(0);
  });

  it("LSB: independently-derived materialUnitsWithoutClaimReviewItem is 0, matching Part A's own claim, via a DB-query-based check (not a rerun of Part A's own tally)", async () => {
    const { index } = loadFwrgLsbStructuralIndex();
    const candidates = withRealNodeIds(loadLsbCandidates(), index, LSB_DOC_ID);
    const compiled = loadLsbCompiled(candidates);
    const outcome = await runAndIndependentlyVerify("lsb-2023-abl-credit-agreement", LSB_DOC_ID, index, candidates, compiled);

    expect(outcome.totalMaterialSemanticUnits).toBeGreaterThan(0);
    expect(outcome.expectedRequiredCount).toBeGreaterThan(0);
    expect(outcome.materialUnitsWithoutClaimReviewItem, JSON.stringify(outcome.missing)).toBe(0);
    expect(outcome.skippedNoAnchorButOtherwiseRequired).toBe(0);
  });

  it("DSGR: independently confirms Part A's own 'materialUnitsWithoutClaimReviewItem=215' is a measurement artifact of duplicate semanticUnitIds across the fixture's 4 documents (ALREADY_RECORDED outcomes, real items that exist), not 215 genuinely-missing ClaimReviewItem rows - a real DB query finds 0 actually missing", async () => {
    const fixturePath = path.join(process.cwd(), "tests", "fixtures", "unseen-packages", "phase-3f1-dsgr-remediation-regression", "stage8-coverage-result.json");
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as { packageCoverage: { packageKey: string; documents: DocumentCoverageResult[] } };

    const dsgrCompanyId = `${COMPANY_ID}-dsgr`;
    await prisma.company.deleteMany({ where: { id: dsgrCompanyId } });
    await prisma.company.create({ data: { id: dsgrCompanyId, name: "Part B independent DSGR replay scratch" } });

    // The fixture's own documentId values ("doc-a"/"doc-b"/"doc-c"/"doc-d") are
    // bare literals with no run-scoping of their own. Document.id is a GLOBAL
    // (non-tenant-namespaced) Prisma primary key, and this repository's shared
    // Postgres instance is used concurrently by multiple independent Part B
    // auditor sessions replaying this SAME preserved fixture (Part A's own
    // script uses these exact literal ids too) - a genuine observed hazard
    // during this test's own development (an intermittent
    // claim_review_items_documentId_fkey violation under full-suite parallel
    // load, traced to a concurrent session's own cleanup deleting the
    // globally-shared "doc-a" row out from under this run). Remapping every
    // documentId reference to a value namespaced by this test's own scratch
    // company id makes this test's own Postgres footprint genuinely isolated,
    // independent of what any other concurrent session is doing to the raw
    // literal ids - never a workaround for a real production defect (no
    // production code path is exercised by this remap; it only affects which
    // primary-key string this SPECIFIC test run uses for its own scratch rows).
    const remapDocId = (id: string) => `${dsgrCompanyId}::${id}`;
    const documents: DocumentCoverageResult[] = raw.packageCoverage.documents.map((doc) => ({
      ...doc,
      documentId: remapDocId(doc.documentId),
      units: doc.units.map((u) => ({ ...u, anchors: u.anchors.map((a) => ({ ...a, documentId: remapDocId(a.documentId) })) })),
    }));

    let totalUnits = 0;
    let totalMissing = 0;
    let totalExpectedRequired = 0;
    let totalSkippedNoAnchor = 0;
    let totalAlreadyRecorded = 0;
    let partAFormulaTotal = 0; // Part A's own (materialReviewableCount - created) formula, computed alongside for comparison.
    const perDocMissing: Record<string, string[]> = {};

    try {
      for (const doc of documents) {
        await prisma.document.create({ data: { id: doc.documentId, companyId: dsgrCompanyId, name: `DSGR ${doc.documentId} independent replay`, type: "CREDIT_AGREEMENT" } });
        const recordOutcome = await recordClaimReviewsFromDocumentCoverage(dsgrCompanyId, raw.packageCoverage.packageKey, doc);
        totalAlreadyRecorded += recordOutcome.outcomesByType.ALREADY_RECORDED;

        // Part A's own script's exact formula (scripts/phase-3f1-6-known-package-regression.ts's
        // summarizeDocument): materialReviewableCount - created, where created deliberately
        // EXCLUDES ALREADY_RECORDED. Computed here purely for side-by-side comparison against this
        // test's own DB-query-based ground truth below - never used as this test's own pass/fail
        // signal.
        const reviewableMaterialUnitIds = new Set(doc.coverageEntries.filter((e) => e.coverageState !== "FULLY_REPRESENTED_VERIFIED").map((e) => e.semanticUnitId));
        const materialReviewableCount = doc.units.filter((u) => (u.materiality === "CRITICAL" || u.materiality === "MATERIAL") && reviewableMaterialUnitIds.has(u.semanticUnitId)).length;
        const created = recordOutcome.outcomesByType.CREATED + recordOutcome.outcomesByType.OBSERVATION_APPENDED + recordOutcome.outcomesByType.REOPENED_FROM_RESOLVED;
        partAFormulaTotal += materialReviewableCount - created;

        const entryByUnitId = new Map(doc.coverageEntries.map((e) => [e.semanticUnitId, e]));
        const dangerousByUnitId = new Map(doc.dangerousUnaccounted.map((d) => [d.semanticUnitId, d]));
        const expectedClaimKeys: string[] = [];
        let skippedNoAnchor = 0;
        for (const unit of doc.units) {
          const entry = entryByUnitId.get(unit.semanticUnitId);
          if (!entry) continue;
          const derived = deriveFromCoverageEntry({ unit, entry, dangerous: dangerousByUnitId.get(unit.semanticUnitId) ?? null, companyId: dsgrCompanyId, packageKey: raw.packageCoverage.packageKey, instrumentKey: unit.instrumentKey, coverageAlgorithmVersion: entry.coverageAlgorithmVersion });
          if (derived === null) {
            const materialTiers = new Set(["CRITICAL", "MATERIAL"]);
            const reviewable = entry.coverageState !== "FULLY_REPRESENTED_VERIFIED";
            if (materialTiers.has(unit.materiality) && reviewable && (unit.anchors[0] ?? null) === null) skippedNoAnchor += 1;
            continue;
          }
          expectedClaimKeys.push(derived.claimKey);
        }

        const persisted = await prisma.claimReviewItem.findMany({ where: { companyId: dsgrCompanyId, claimKey: { in: expectedClaimKeys.length > 0 ? expectedClaimKeys : ["__none__"] } } });
        const persistedKeys = new Set(persisted.map((p) => p.claimKey));
        const missing = expectedClaimKeys.filter((k) => !persistedKeys.has(k));

        totalUnits += doc.units.length;
        totalExpectedRequired += expectedClaimKeys.length;
        totalMissing += missing.length;
        totalSkippedNoAnchor += skippedNoAnchor;
        if (missing.length > 0) perDocMissing[doc.documentId] = missing;
      }

      expect(totalUnits).toBe(7517); // matches Part A's disclosed "before regeneration" fixture count exactly
      expect(totalExpectedRequired).toBeGreaterThan(0);

      // eslint-disable-next-line no-console
      console.log("DSGR independent recheck:", JSON.stringify({ totalUnits, totalExpectedRequired, totalMissing, totalSkippedNoAnchor, totalAlreadyRecorded, partAFormulaTotal }));

      // THE ACTUAL FINDING (see 30-part-b-crosscutting-recertification.json item 1 for full
      // writeup): this test's own DB-query-based ground truth - "does a real, persisted
      // ClaimReviewItem row exist for every unit deriveFromCoverageEntry says requires one?" -
      // finds ZERO missing, not 215. Part A's own script's "215" is reproduced exactly by
      // Part A's own formula (partAFormulaTotal, computed above from the SAME real run) once
      // ALREADY_RECORDED outcomes are excluded from "created" - i.e. Part A's number is a
      // measurement artifact of DSGR's own fixture containing duplicate semanticUnitIds across
      // its 4 documents (the same claim re-appearing, e.g. an amendment restating an unchanged
      // provision), not 215 units with NO ClaimReviewItem at all. This test asserts the
      // artifact's exact shape (so a future genuine regression - a real drop in totalAlreadyRecorded
      // coverage, or partAFormulaTotal drifting from 215 - still fails this test) while proving
      // the underlying safety property (every material/reviewable unit has a real, persisted
      // review item) genuinely holds.
      expect(totalAlreadyRecorded).toBe(215);
      expect(partAFormulaTotal).toBe(215);
      expect(totalMissing, JSON.stringify(perDocMissing)).toBe(0);
    } finally {
      await prisma.claimReviewItem.deleteMany({ where: { companyId: dsgrCompanyId } });
      await prisma.document.deleteMany({ where: { companyId: dsgrCompanyId } });
      await prisma.company.deleteMany({ where: { id: dsgrCompanyId } });
    }
  }, 60_000);
});
