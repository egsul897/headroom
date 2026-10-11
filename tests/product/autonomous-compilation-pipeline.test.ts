/**
 * Independent acceptance for the bounded autonomous fixed-dollar pipeline.
 *
 * Expected dollar amounts are derived from authentic source text via regex —
 * NOT copied from package-matthews threshold literals or fixture constants.
 *
 * Proves Matthews + MHK share the same compile core without companyId switches.
 * Does NOT claim full AUTONOMOUS_COVENANT_COMPILATION_PROVEN (leaf rows remain).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  runAutonomousCompilationPipeline,
  runMatthewsAutonomousPipeline,
  runMhkAutonomousPipeline,
  matthewsVerifiedExecutableCandidates,
  mhkVerifiedExecutableCandidates,
  extractMhk703fReceivablesCandidate,
} from "@/lib/product/real-dashboard-vertical-slice";
import { MATTHEWS_INDENTURE_SOURCE } from "@/lib/product/real-dashboard-vertical-slice/source-excerpts-matthews";

const PIPELINE_SRC = readFileSync(
  join(
    process.cwd(),
    "lib/product/real-dashboard-vertical-slice/autonomous-compilation-pipeline.ts",
  ),
  "utf8",
);
const CORE_SRC = readFileSync(
  join(
    process.cwd(),
    "lib/product/real-dashboard-vertical-slice/verified-executable-compile-core.ts",
  ),
  "utf8",
);

/** Independent: parse "$1,300,000,000" from Indenture excerpt — not from thresholdValue: 1300. */
function independentMatthews1aGrossMmFromSource(): number {
  const m = MATTHEWS_INDENTURE_SOURCE.text.match(
    /not to exceed \$([0-9,]+)/i,
  );
  if (!m) throw new Error("Matthews Indenture excerpt missing not-to-exceed dollar");
  return Number(m[1]!.replace(/,/g, "")) / 1_000_000;
}

/** Independent: parse $700,000,000 from authentic MHK CA holdout text. */
function independentMhk703fGrossMmFromSource(): number {
  const candidate = extractMhk703fReceivablesCandidate();
  if (!candidate) throw new Error("MHK §7.03(f) candidate missing from authentic text");
  const m = candidate.operativeSourceText.match(/not\s+exceed\s+\$([0-9,]+)/i);
  if (!m) throw new Error("MHK operative text missing not-exceed dollar");
  return Number(m[1]!.replace(/,/g, "")) / 1_000_000;
}

describe("autonomous compilation pipeline — independence + multi-package", () => {
  it("pipeline and compile core have no issuer companyId switches", () => {
    expect(PIPELINE_SRC).not.toMatch(/companyId\s*===\s*["']/);
    expect(PIPELINE_SRC).not.toMatch(/if\s*\(\s*companyId/);
    expect(CORE_SRC).not.toMatch(/companyId\s*===\s*["']/);
    expect(CORE_SRC).not.toMatch(/matthews|mhk|conmed/i);
  });

  it("Matthews: source→IR→GROSS Position feed matches independently parsed $1300M", () => {
    const expectedMm = independentMatthews1aGrossMmFromSource();
    expect(expectedMm).toBe(1300);

    const result = runMatthewsAutonomousPipeline();
    expect(result.path.map((p) => p.stage)).toEqual([
      "authentic-documents",
      "operative-clause-candidates",
      "governing-document-resolution",
      "source-backed-verified-IR",
      "executable-capacity-rules",
      "financial-utilization-evidence",
      "shared-capacity-engine",
      "position-dashboard-feed",
    ]);
    expect(result.productionAvailablePublished).toBe(false);
    expect(result.verifiedRemainingPublished).toBe(false);
    expect(result.trustedIdentityActivation).toBe("BLOCKED");
    expect(result.milestones.FIXED_DOLLAR_SOURCE_TO_POSITION).toBe("PROVEN");
    expect(result.milestones.VERIFIED_REMAINING).toBe("BLOCKED");
    expect(result.milestones.PRODUCTION_AVAILABLE).toBe("BLOCKED");

    const feed = result.positionMetrics.filter((m) => m.amountMillions != null);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.amountMillions).toBe(expectedMm);
    expect(feed[0]!.publicationClass).toBe("GROSS_CONTRACTUAL_CAPACITY");
    expect(feed[0]!.claim.claimKind).toBe("GROSS_CONTRACTUAL");
    expect(feed[0]!.mayPublishAvailable).toBe(false);

    // Notes grandfather + CA lien refuse rather than invent.
    expect(result.unsupported.length).toBeGreaterThanOrEqual(2);
    expect(
      result.unsupported.some((u) => u.candidateId.includes("notes") || u.valueClass.includes("REFUSED")),
    ).toBe(true);
  });

  it("MHK: same pipeline yields independently parsed $700M GROSS; production refused", () => {
    const expectedMm = independentMhk703fGrossMmFromSource();
    expect(expectedMm).toBe(700);

    const result = runMhkAutonomousPipeline();
    expect(result.companyId).toBe("mhk");
    expect(result.productionAvailablePublished).toBe(false);
    expect(result.milestones.FIXED_DOLLAR_SOURCE_TO_POSITION).toBe("PROVEN");
    const feed = result.positionMetrics.filter((m) => m.amountMillions != null);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.amountMillions).toBe(expectedMm);
    expect(feed[0]!.publicationClass).toBe("GROSS_CONTRACTUAL_CAPACITY");
    expect(feed[0]!.sourceSectionRef).toBe("7.03(f)");
  });

  it("adversarial: wrong operative text refuses; no fabricated capacity", () => {
    const result = runAutonomousCompilationPipeline({
      companyId: "adversarial",
      instrumentKey: "wrong-doc",
      asOfDate: "2024-12-31",
      candidates: [
        {
          candidateId: "ratio-only",
          documentId: "doc-x",
          sourceSectionRef: "4.09(a)",
          operativeSourceText:
            "the Company may Incur Debt if the Consolidated Fixed Charge Coverage Ratio would be at least 2.00 to 1.00",
          relatedLeafCode: null,
        },
      ],
    });
    expect(result.positionMetrics.every((m) => m.amountMillions == null)).toBe(true);
    expect(result.unsupported).toHaveLength(1);
    expect(result.unsupported[0]!.valueClass).toBe("REFUSED_NOT_FIXED_DOLLAR");
    expect(result.milestones.FIXED_DOLLAR_SOURCE_TO_POSITION).toBe("NOT_PROVEN");
    expect(result.milestones.RATIO_AND_COMPLEX_STRUCTURES).toBe("UNSUPPORTED");
  });

  it("Matthews + MHK traces stay package-distinct through bare shared API", () => {
    const matthews = runAutonomousCompilationPipeline({
      companyId: "matthews",
      instrumentKey: "matthews-international-q1-fy2025",
      asOfDate: "2024-12-31",
      candidates: matthewsVerifiedExecutableCandidates(),
    });
    const mhk = runAutonomousCompilationPipeline({
      companyId: "mhk",
      instrumentKey: "mhk-2026-credit-agreement",
      asOfDate: "2025-06-30",
      candidates: mhkVerifiedExecutableCandidates(),
    });
    const mFeed = matthews.positionMetrics.filter((m) => m.amountMillions != null);
    const hFeed = mhk.positionMetrics.filter((m) => m.amountMillions != null);
    expect(mFeed[0]!.amountMillions).toBe(independentMatthews1aGrossMmFromSource());
    expect(hFeed[0]!.amountMillions).toBe(independentMhk703fGrossMmFromSource());
    expect(mFeed[0]!.documentId).not.toBe(hFeed[0]!.documentId);
    expect(mFeed[0]!.code).not.toBe(hFeed[0]!.code);
  });
});
