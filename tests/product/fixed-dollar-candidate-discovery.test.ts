/**
 * Autonomous fixed-dollar candidate discovery — package-agnostic.
 *
 * Discovery proposes candidates only. Compile/fidelity establish capacity.
 * Expected dollars independently parsed from authentic source text.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverFixedDollarCandidatesFromDocuments,
  discoverFixedDollarCandidatesFromText,
  selectSoleCapDiscoveryCandidates,
  runAutonomousCompilationPipeline,
  runAutonomousCompilationPipelineFromDocuments,
  loadVePositionSlice,
  extractMhk703fReceivablesCandidate,
  MATTHEWS_INDENTURE_SOURCE,
} from "@/lib/product/real-dashboard-vertical-slice";
import { loadMhkCreditAgreementText } from "@/lib/product/real-dashboard-vertical-slice/package-mhk-ve-candidates";

const DISCOVERY_SRC = readFileSync(
  join(
    process.cwd(),
    "lib/product/real-dashboard-vertical-slice/fixed-dollar-candidate-discovery.ts",
  ),
  "utf8",
);

describe("fixed-dollar candidate discovery (autonomous)", () => {
  it("discovery module has no issuer companyId switches", () => {
    expect(DISCOVERY_SRC).not.toMatch(/companyId\s*===\s*["']/);
    expect(DISCOVERY_SRC).not.toMatch(/matthews|mhk|conmed/i);
    expect(DISCOVERY_SRC).toMatch(/extractDeterministicCovenantFacts/);
    expect(DISCOVERY_SRC).toMatch(/capRoleSignal/);
  });

  it("Matthews Indenture: source-span identity + sole-cap $1300M → Position via discovery", () => {
    const found = discoverFixedDollarCandidatesFromText({
      documentId: MATTHEWS_INDENTURE_SOURCE.documentId,
      text: MATTHEWS_INDENTURE_SOURCE.text,
    });
    const sole = found.filter((c) => c.capRoleSignal === "NOT_TO_EXCEED_CAP");
    expect(sole.length).toBeGreaterThanOrEqual(1);
    for (const c of sole) {
      expect(c.startOffset).toBeGreaterThanOrEqual(0);
      expect(c.endOffset).toBeGreaterThan(c.startOffset);
      expect(MATTHEWS_INDENTURE_SOURCE.text.slice(c.startOffset, c.endOffset)).toContain(
        c.thresholdRaw.replace(/\s+/g, " ").slice(0, 8).trim() || "$",
      );
    }

    const pipeline = runAutonomousCompilationPipeline({
      companyId: "matthews",
      instrumentKey: "matthews-international-q1-fy2025",
      asOfDate: "2024-12-31",
      candidates: selectSoleCapDiscoveryCandidates(found),
      packageLabel: "Matthews via autonomous discovery",
    });
    const feed = pipeline.positionMetrics.filter((m) => m.amountMillions != null);
    expect(feed.some((m) => m.amountMillions === 1300)).toBe(true);
    expect(pipeline.productionAvailablePublished).toBe(false);

    // Generic Position path uses discovery (not hand VE candidate list).
    const slice = loadVePositionSlice("matthews");
    expect(slice).not.toBeNull();
    expect(
      slice!.verifiedExecutableMetrics.some((m) => m.amountMillions === 1300),
    ).toBe(true);
    expect(slice!.productionRemainingPublished).toBe(false);
  });

  it("MHK CA: discovers $700M sole-cap; grandfather/false-positive dollars do not feed", () => {
    const text = loadMhkCreditAgreementText();
    const found = discoverFixedDollarCandidatesFromText({
      documentId: "mhk-doc-a-credit-agreement",
      text,
    });
    expect(found.some((c) => /700,000,000/.test(c.thresholdRaw))).toBe(true);

    const hand = extractMhk703fReceivablesCandidate();
    expect(hand).not.toBeNull();
    const indep =
      Number(hand!.operativeSourceText.match(/\$([0-9,]+)/)![1]!.replace(/,/g, "")) / 1_000_000;

    const sole = selectSoleCapDiscoveryCandidates(found);
    const pipeline = runAutonomousCompilationPipeline({
      companyId: "mhk",
      instrumentKey: "mhk-2026-credit-agreement",
      asOfDate: "2025-06-30",
      candidates: sole,
    });
    const feed = pipeline.positionMetrics.filter((m) => m.amountMillions != null);
    expect(feed.some((m) => m.amountMillions === indep)).toBe(true);
    expect(pipeline.verifiedRemainingPublished).toBe(false);

    const slice = loadVePositionSlice("mhk");
    expect(slice).not.toBeNull();
    expect(slice!.verifiedExecutableMetrics.some((m) => m.amountMillions === 700)).toBe(true);
  });

  it("adversarial: ratio-only text yields no fixed-dollar feed", () => {
    const found = discoverFixedDollarCandidatesFromDocuments([
      {
        documentId: "ratio-doc",
        text: "SECTION 4.09. The Company may Incur Debt if the Consolidated Fixed Charge Coverage Ratio would be at least 2.00 to 1.00.",
      },
    ]);
    expect(selectSoleCapDiscoveryCandidates(found)).toHaveLength(0);
    const pipeline = runAutonomousCompilationPipeline({
      companyId: "adversarial",
      instrumentKey: "ratio-only",
      asOfDate: "2024-12-31",
      candidates: found,
    });
    expect(pipeline.positionMetrics.every((m) => m.amountMillions == null)).toBe(true);
  });

  it("adversarial: multi-amount and aggregate-amount-of windows are not sole-cap feeds", () => {
    const text = `
SECTION 4.09. Permitted Debt means (1)(a) Debt not to exceed $1,300,000,000 plus (b) additional Debt of $50,000,000;
(2) Debt represented by the Notes in an aggregate principal amount of $300,000,000;
`;
    const found = discoverFixedDollarCandidatesFromText({
      documentId: "multi-amt",
      text,
    });
    // Notes grandfather (amount of) may appear as AGGREGATE_AMOUNT_OF — excluded from sole-cap.
    const sole = selectSoleCapDiscoveryCandidates(found);
    expect(sole.every((c) => !/300,000,000/.test(c.operativeSourceText) || /not to exceed/i.test(c.operativeSourceText))).toBe(
      true,
    );
    // Multi-amount not-to-exceed window must not be selected as sole-cap.
    expect(sole.every((c) => !(c as { multiAmountWindow?: boolean }).multiAmountWindow)).toBe(true);
    const multi = found.filter((c) => c.multiAmountWindow);
    for (const m of multi) {
      expect(selectSoleCapDiscoveryCandidates([m])).toHaveLength(0);
    }
  });

  it("discovery does not claim verified capacity without compile (honesty)", () => {
    const found = discoverFixedDollarCandidatesFromText({
      documentId: MATTHEWS_INDENTURE_SOURCE.documentId,
      text: MATTHEWS_INDENTURE_SOURCE.text,
    });
    expect(found.every((c) => c.discoveryMethod === "DETERMINISTIC_THRESHOLD_WINDOW")).toBe(true);
    // No amount field on discovery candidates — capacity only after compile.
    expect(found.every((c) => !("sourceBackedGrossCapacityMm" in c))).toBe(true);
  });

  it("FromDocuments entry: discovery→compile is one pipeline (Matthews $1300 GROSS)", () => {
    const pipeline = runAutonomousCompilationPipelineFromDocuments({
      companyId: "matthews",
      instrumentKey: "matthews-international-q1-fy2025",
      asOfDate: "2024-12-31",
      documents: [
        {
          documentId: MATTHEWS_INDENTURE_SOURCE.documentId,
          text: MATTHEWS_INDENTURE_SOURCE.text,
        },
      ],
      packageLabel: "Matthews via FromDocuments discovery",
    });
    expect(pipeline.path.some((s) => s.stage === "operative-clause-candidates")).toBe(true);
    expect(pipeline.positionMetrics.some((m) => m.amountMillions === 1300)).toBe(true);
    expect(pipeline.positionMetrics.every((m) => !m.mayPublishAvailable)).toBe(true);
    expect(pipeline.productionAvailablePublished).toBe(false);
    expect(pipeline.milestones.FIXED_DOLLAR_SOURCE_TO_POSITION).toBe("PROVEN");
  });
});
