/**
 * Autonomous fixed-dollar candidate discovery — package-agnostic.
 *
 * Expected dollars independently parsed from authentic source text.
 * Discovery proposes candidates; compile core still refuses unsupported forms.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  discoverFixedDollarCandidatesFromDocuments,
  discoverFixedDollarCandidatesFromText,
  runAutonomousCompilationPipeline,
  runAutonomousCompilationPipelineFromDocuments,
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
  });

  it("Matthews Indenture: discovers $1,300,000,000 not-to-exceed window from source", () => {
    const found = discoverFixedDollarCandidatesFromText({
      documentId: MATTHEWS_INDENTURE_SOURCE.documentId,
      text: MATTHEWS_INDENTURE_SOURCE.text,
    });
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some((c) => /1,?300,000,000/.test(c.thresholdRaw) || /1300000000/.test(c.thresholdRaw.replace(/,/g, "")))).toBe(
      true,
    );
    const pipeline = runAutonomousCompilationPipeline({
      companyId: "matthews",
      instrumentKey: "matthews-international-q1-fy2025",
      asOfDate: "2024-12-31",
      candidates: found,
      packageLabel: "Matthews via autonomous discovery",
    });
    const feed = pipeline.positionMetrics.filter((m) => m.amountMillions != null);
    expect(feed.length).toBeGreaterThanOrEqual(1);
    expect(feed.some((m) => m.amountMillions === 1300)).toBe(true);
    expect(pipeline.productionAvailablePublished).toBe(false);
  });

  it("MHK CA: discovers $700,000,000 receivables cap from authentic holdout text", () => {
    const text = loadMhkCreditAgreementText();
    const found = discoverFixedDollarCandidatesFromText({
      documentId: "mhk-doc-a-credit-agreement",
      text,
    });
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some((c) => /700,000,000/.test(c.thresholdRaw))).toBe(true);

    // Independent: hand extractor still sees the same dollar (cross-check, not fixture literal).
    const hand = extractMhk703fReceivablesCandidate();
    expect(hand).not.toBeNull();
    const indep = Number(
      hand!.operativeSourceText.match(/\$([0-9,]+)/)![1]!.replace(/,/g, ""),
    ) / 1_000_000;

    const pipeline = runAutonomousCompilationPipeline({
      companyId: "mhk",
      instrumentKey: "mhk-2026-credit-agreement",
      asOfDate: "2025-06-30",
      candidates: found,
    });
    const feed = pipeline.positionMetrics.filter((m) => m.amountMillions != null);
    expect(feed.some((m) => m.amountMillions === indep)).toBe(true);
    expect(pipeline.verifiedRemainingPublished).toBe(false);
  });

  it("adversarial: ratio-only text yields no fixed-dollar feed", () => {
    const found = discoverFixedDollarCandidatesFromDocuments([
      {
        documentId: "ratio-doc",
        text: "SECTION 4.09. The Company may Incur Debt if the Consolidated Fixed Charge Coverage Ratio would be at least 2.00 to 1.00.",
      },
    ]);
    const pipeline = runAutonomousCompilationPipeline({
      companyId: "adversarial",
      instrumentKey: "ratio-only",
      asOfDate: "2024-12-31",
      candidates: found,
    });
    expect(pipeline.positionMetrics.every((m) => m.amountMillions == null)).toBe(true);
    expect(pipeline.milestones.FIXED_DOLLAR_SOURCE_TO_POSITION).toBe("NOT_PROVEN");
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
