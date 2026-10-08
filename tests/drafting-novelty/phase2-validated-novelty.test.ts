import { describe, expect, it } from "vitest";
import { mulberry32, runBalancedNoveltyEvaluation, shuffleInPlace } from "../../lib/drafting-novelty/balanced";
import { recoverControllingContext } from "../../lib/drafting-novelty/context";
import { independentlyReviewQueue, stratifyQueueSample } from "../../lib/drafting-novelty/review";
import { buildKnowledgeFactoryImport } from "../../lib/drafting-novelty/kf-export";
import { extractUnitsFromDocument, scoreNovelty, buildReviewerQueue } from "../../lib/drafting-novelty";
import type { DocumentSource, NoveltyFinding } from "../../lib/drafting-novelty";

const RECLASS = `
SECTION 1.08(f) Fixed Amounts and Incurrence-Based Amounts.
The Borrower shall not permit any Fixed Amounts utilization without testing.
In connection with any action, amounts incurred in reliance on Fixed Amounts shall be automatically and immediately reclassified at any time,
unless the Initial Borrower otherwise elects from time to time, as incurred under the applicable Incurrence-Based Amounts; provided that the ratio test is met.
"Fixed Amounts" means the amounts described in this Section 1.08(f).
"Incurrence-Based Amounts" has the meaning assigned to such term in this Section 1.08(f).
`;

const SHARED = `
SECTION 6.01 Limitation on Indebtedness.
The Borrower shall not, and shall not permit any Restricted Subsidiary to, create or incur any Indebtedness, except:
(a) Indebtedness under the Loan Documents;
(q) Indebtedness of Non-Loan Parties in an aggregate principal amount, together with Section 6.01(r), not to exceed the greater of $50,000,000 and 25% of Consolidated EBITDA;
provided that no Loan Party shall guarantee such Indebtedness.
`;

describe("phase2 balanced sampling", () => {
  it("mulberry32 is deterministic", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("equal-sized splits are reproducible and do not treat imbalance as rarity", () => {
    const corpusDoc: DocumentSource = {
      documentId: "c1",
      packageId: "conmed-2025-credit-facility",
      role: "CORPUS",
      path: "virtual/c.txt",
      label: "c",
      publicSourceNote: "t",
    };
    const probeDoc: DocumentSource = {
      documentId: "p1",
      packageId: "chwy-2026-credit-agreement",
      role: "PROBE",
      path: "virtual/p.txt",
      label: "p",
      publicSourceNote: "t",
    };
    const units = [
      ...extractUnitsFromDocument(corpusDoc, RECLASS + SHARED),
      ...extractUnitsFromDocument(probeDoc, RECLASS + SHARED + SHARED),
    ];
    // Inflate probe artificially
    const inflated = [
      ...units.filter((u) => u.role === "CORPUS"),
      ...units.filter((u) => u.role === "PROBE"),
      ...units.filter((u) => u.role === "PROBE").map((u, i) => ({ ...u, unitId: `${u.unitId}:dup${i}` })),
    ];
    const report = runBalancedNoveltyEvaluation(inflated, { seeds: [1, 2, 3], sampleSizes: [20] });
    expect(report.disclaimer).toMatch(/not evidence of market rarity/i);
    expect(report.equalSizedSplits.length).toBe(3);
    for (const s of report.equalSizedSplits) {
      expect(s.corpusUnits).toBe(s.probeUnits);
    }
    expect(report.leaveOneIssuerOut.length).toBeGreaterThan(0);
  });

  it("shuffleInPlace respects RNG", () => {
    const arr = [1, 2, 3, 4, 5];
    const r1 = mulberry32(7);
    shuffleInPlace(arr, r1);
    const arr2 = [1, 2, 3, 4, 5];
    const r2 = mulberry32(7);
    shuffleInPlace(arr2, r2);
    expect(arr).toEqual(arr2);
  });
});

describe("phase2 controlling context", () => {
  it("marks missing file as CONTEXT_INCOMPLETE", () => {
    const finding = {
      findingId: "novelty:test",
      unitId: "u",
      category: "RECLASSIFICATION" as const,
      noveltyScore: 0.9,
      rarityRank: 1,
      corpusSupport: 0,
      probeSupport: 1,
      clusterSize: 1,
      signatureKey: "RECLASSIFICATION|RECLASSIFY_AUTOMATIC",
      signatureTokens: ["RECLASSIFY_AUTOMATIC" as const],
      suspectedFailureMode: "CAPACITY_OVERSTATEMENT" as const,
      failureRationale: "x",
      span: {
        documentId: "missing",
        path: "does/not/exist.txt",
        charStart: 0,
        charEnd: 10,
        excerpt: "automatically and immediately reclassified",
      },
      comparisonExamples: [],
      nearestCorpusSignatureDistance: 1,
      notes: [],
    };
    const ctx = recoverControllingContext(finding);
    expect(ctx.completeness).toBe("CONTEXT_INCOMPLETE");
    expect(ctx.missingPieces).toContain("source_file_missing");
  });
});

describe("phase2 independent review + KF export", () => {
  it("stratifies queue and never confirms legal defects from heuristics alone", () => {
    const doc: DocumentSource = {
      documentId: "probe-sample",
      packageId: "chwy-2026-credit-agreement",
      role: "PROBE",
      path: "virtual/sample.txt",
      label: "s",
      publicSourceNote: "t",
    };
    const units = extractUnitsFromDocument(doc, RECLASS + "\n" + SHARED);
    const findings = scoreNovelty(units) as NoveltyFinding[];
    // Point spans at a real fixture file so context recovery can run for at least some.
    for (const f of findings) {
      f.span.path = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
    }
    const queue = buildReviewerQueue(findings, 40);
    const sample = stratifyQueueSample(queue, 2, 20);
    expect(sample.length).toBeGreaterThan(0);
    const review = independentlyReviewQueue(queue, findings, { sampleSize: 10 });
    expect(review.confirmedLegalDefectCount).toBe(0);
    expect(review.heuristicOnlyFailureModeCount).toBe(review.sampleSize);
    const kf = buildKnowledgeFactoryImport(findings, queue, review.items, { limit: 5 });
    expect(kf[0]?.schema).toBe("knowledge-factory.novelty-import.v1");
    expect(kf[0]?.paidCalls).toBe(0);
    expect(kf[0]?.productionLegalRulesModified).toBe(false);
    expect(["DISCOVERED_CANDIDATE", "REVIEW_REQUIRED"]).toContain(kf[0]?.representationLevel);
  });
});
