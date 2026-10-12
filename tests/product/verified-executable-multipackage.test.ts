/**
 * Bounded product proof: the same package-agnostic fixed-dollar VE compile core
 * feeds SOURCE_BACKED_COMPILED_GROSS for Matthews and authentic MHK — without
 * issuer `if (companyId === …)` branches in the compile path.
 *
 * Does NOT claim GENERALIZED_CALCULATION_PIPELINE_PROVEN for the full leaf
 * dashboard, nor AUTONOMOUS_COVENANT_COMPILATION_PROVEN.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  compileMatthewsVerifiedExecutableBridge,
  compileMhkVerifiedExecutableBridge,
  compileVerifiedFixedDollarBridge,
  extractMhk703fReceivablesCandidate,
  matthewsVerifiedExecutableCandidates,
  mhkVerifiedExecutableCandidates,
} from "@/lib/product/real-dashboard-vertical-slice";

const CORE_SRC = readFileSync(
  join(
    process.cwd(),
    "lib/product/real-dashboard-vertical-slice/verified-executable-compile-core.ts",
  ),
  "utf8",
);

describe("generic fixed-dollar VE compile — multi-package", () => {
  it("compile core has no issuer/company switch statements", () => {
    expect(CORE_SRC).not.toMatch(/companyId\s*===\s*["']/);
    expect(CORE_SRC).not.toMatch(/if\s*\(\s*companyId/);
    expect(CORE_SRC).not.toMatch(/matthews|mhk|conmed/i);
    expect(CORE_SRC).toMatch(/compileFixedDollarBasket/);
    expect(CORE_SRC).toMatch(/evaluateFixedDollarCapacity/);
  });

  it("Matthews (1)(a) feeds Position as SOURCE_BACKED_COMPILED_GROSS $1300M; production refused", () => {
    const result = compileMatthewsVerifiedExecutableBridge("2024-12-31");
    expect(result.companyId).toBe("matthews");
    expect(result.productionCapacityPublished).toBe(false);
    expect(result.trustedIdentityActivation).toBe("BLOCKED");
    const feed = result.verifiedExecutableUnits.filter((u) => u.feedsPosition);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.candidateId).toBe("matw-permitted-debt-1a-fixed-dollar");
    expect(feed[0]!.valueClass).toBe("SOURCE_BACKED_COMPILED_GROSS");
    expect(feed[0]!.sourceBackedGrossCapacityMm).toBe(1300);
    expect(feed[0]!.productionOutcome).toBe("PRODUCTION_CAPACITY_REFUSED");
    // Non-cap dollars refuse rather than invent capacity.
    const notes = result.verifiedExecutableUnits.find(
      (u) => u.candidateId === "matw-permitted-debt-2-notes",
    );
    expect(notes?.valueClass).toBe("REFUSED_NOT_FIXED_DOLLAR");
  });

  it("authentic MHK §7.03(f) compiles on the same core to $700M gross; production refused", () => {
    const candidate = extractMhk703fReceivablesCandidate();
    expect(candidate).not.toBeNull();
    expect(candidate!.operativeSourceText).toMatch(/not exceed \$700,000,000/i);

    const viaWrapper = compileMhkVerifiedExecutableBridge("2025-06-30");
    expect(viaWrapper.companyId).toBe("mhk");
    expect(viaWrapper.productionCapacityPublished).toBe(false);
    expect(viaWrapper.verifiedExecutableUnitsFeedingPosition).toBe(1);
    expect(viaWrapper.verifiedExecutableUnits[0]!.sourceBackedGrossCapacityMm).toBe(700);
    expect(viaWrapper.verifiedExecutableUnits[0]!.valueClass).toBe(
      "SOURCE_BACKED_COMPILED_GROSS",
    );
    expect(viaWrapper.verifiedExecutableUnits[0]!.productionOutcome).toBe(
      "PRODUCTION_CAPACITY_REFUSED",
    );

    // Same candidates through the bare core API (no MHK wrapper) — identity only.
    const viaCore = compileVerifiedFixedDollarBridge({
      companyId: "mhk",
      instrumentKey: "mhk-2026-credit-agreement",
      asOfDate: "2025-06-30",
      candidates: mhkVerifiedExecutableCandidates(),
    });
    expect(viaCore.verifiedExecutableUnits[0]!.sourceBackedGrossCapacityMm).toBe(
      viaWrapper.verifiedExecutableUnits[0]!.sourceBackedGrossCapacityMm,
    );
  });

  it("Matthews + MHK both feed VE gross via shared core without conflating packages", () => {
    const matthews = compileVerifiedFixedDollarBridge({
      companyId: "matthews",
      instrumentKey: "matthews-international-q1-fy2025",
      asOfDate: "2024-12-31",
      candidates: matthewsVerifiedExecutableCandidates(),
    });
    const mhk = compileVerifiedFixedDollarBridge({
      companyId: "mhk",
      instrumentKey: "mhk-2026-credit-agreement",
      asOfDate: "2025-06-30",
      candidates: mhkVerifiedExecutableCandidates(),
    });

    const mFeed = matthews.verifiedExecutableUnits.filter((u) => u.feedsPosition);
    const hFeed = mhk.verifiedExecutableUnits.filter((u) => u.feedsPosition);
    expect(mFeed.map((u) => u.sourceBackedGrossCapacityMm)).toEqual([1300]);
    expect(hFeed.map((u) => u.sourceBackedGrossCapacityMm)).toEqual([700]);
    expect(matthews.productionCapacityPublished).toBe(false);
    expect(mhk.productionCapacityPublished).toBe(false);
    // Distinct candidate identities — no silent cross-package substitution.
    expect(mFeed[0]!.candidateId).not.toBe(hFeed[0]!.candidateId);
    expect(mFeed[0]!.documentId).not.toBe(hFeed[0]!.documentId);
  });
});
