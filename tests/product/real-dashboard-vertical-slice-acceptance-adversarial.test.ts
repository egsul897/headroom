/**
 * PR #304 independent acceptance — adversarial locks.
 *
 * These tests document what the Matthews vertical slice actually is:
 * fixture-modeled dashboard rendering + a bounded fixed-dollar VE compile
 * bridge for supporting clauses — NOT full autonomous compilation of all
 * permissions, NOT a generalized multi-package pipeline, NOT production authority.
 *
 * Do not weaken these assertions to restore REAL_DASHBOARD_VERTICAL_SLICE_PROVEN
 * or flip AUTONOMOUS_COVENANT_COMPILATION_PROVEN without replacing leaf capacity.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateMatthewsVerticalSlice,
  hasAuthenticPositionSlice,
  independentExpectedRemaining,
  loadAuthenticDashboardSlice,
  matthewsCovenantProvisions,
  connectSliceToPosition,
  runRealDashboardVerticalSlice,
} from "@/lib/product/real-dashboard-vertical-slice";
import { computeLeverageMetrics } from "@/lib/covenant-engine";
import { matthewsFinancialSnapshot } from "@/lib/product/real-dashboard-vertical-slice/package-matthews";

const EVAL_SRC = readFileSync(
  join(process.cwd(), "lib/product/real-dashboard-vertical-slice/evaluate-covenants.ts"),
  "utf8",
);
const PKG_SRC = readFileSync(
  join(process.cwd(), "lib/product/real-dashboard-vertical-slice/package-matthews.ts"),
  "utf8",
);
const BRIDGE_SRC = readFileSync(
  join(process.cwd(), "lib/product/real-dashboard-vertical-slice/position-bridge.ts"),
  "utf8",
);
const INDEX_SRC = readFileSync(
  join(process.cwd(), "lib/product/real-dashboard-vertical-slice/index.ts"),
  "utf8",
);
const VE_SRC = readFileSync(
  join(
    process.cwd(),
    "lib/product/real-dashboard-vertical-slice/verified-executable-compile-bridge.ts",
  ),
  "utf8",
);
const VE_CORE_SRC = readFileSync(
  join(
    process.cwd(),
    "lib/product/real-dashboard-vertical-slice/verified-executable-compile-core.ts",
  ),
  "utf8",
);

describe("PR #304 acceptance — provision origin (Check 1)", () => {
  it("all five CovenantProvisionInput objects are manually encoded literals", () => {
    const provisions = matthewsCovenantProvisions();
    expect(provisions).toHaveLength(5);
    // Thresholds are package literals, not compiler outputs.
    expect(provisions.map((p) => p.thresholdValue)).toEqual([1300, 2.0, 3.5, 300, 0]);
    expect(PKG_SRC).toMatch(/thresholdValue: 1300/);
    expect(PKG_SRC).toMatch(/Codes\/thresholds\/sectionRefs match populate-matthews/);
  });

  it("leaf capacity path modules do not import compileFrozenDebtPackage / UTE", () => {
    // evaluate-covenants + package-matthews remain leaf-only; VE compile lives in its own bridge.
    const leafCorpus = EVAL_SRC + PKG_SRC;
    expect(leafCorpus).not.toMatch(/compileFrozenDebtPackage/);
    expect(leafCorpus).not.toMatch(/compileFixedDollarBasket/);
    expect(leafCorpus).not.toMatch(/compileGreaterOfAssetsBasket/);
    expect(leafCorpus).not.toMatch(/evaluateVerifiedCapacity/);
    expect(leafCorpus).not.toMatch(/executeUnifiedVerifiedTransaction/);
  });

  it("verified-executable bridge uses fixed-dollar compile and refuses production", () => {
    // Compile/evaluate live in the package-agnostic core; Matthews bridge supplies candidates.
    expect(VE_CORE_SRC).toMatch(/compileFixedDollarBasket/);
    expect(VE_CORE_SRC).toMatch(/evaluateFixedDollarCapacity/);
    expect(VE_CORE_SRC).toMatch(/SOURCE_BACKED_COMPILED_GROSS/);
    expect(VE_CORE_SRC).toMatch(/PRODUCTION_CAPACITY_REFUSED/);
    expect(VE_SRC).toMatch(/compileVerifiedFixedDollarBridge/);
    expect(VE_SRC).toMatch(/matthewsVerifiedExecutableCandidates/);
    expect(BRIDGE_SRC).toMatch(/compileMatthewsVerifiedExecutableBridge/);
    expect(INDEX_SRC).toMatch(/verified-executable-compile-bridge/);
  });
});

describe("PR #304 acceptance — independentExpectedRemaining circularity (Check 5)", () => {
  it("mirrors the same hardcoded thresholds as matthewsCovenantProvisions", () => {
    expect(EVAL_SRC).toMatch(/Math\.max\(0, 1300 - fin\.securedDebt\)/);
    expect(EVAL_SRC).toMatch(/fin\.ebitda \/ 2\.0/);
    expect(EVAL_SRC).toMatch(/3\.5 \* fin\.ebitda/);

    const fin = matthewsFinancialSnapshot();
    const metrics = computeLeverageMetrics(fin);
    const provisions = matthewsCovenantProvisions();
    // Same thr → same expected: not an independent legal re-derivation.
    expect(independentExpectedRemaining("ind_permitted_debt_1a_flat", fin, metrics)).toBeCloseTo(
      Math.max(0, provisions[0]!.thresholdValue - fin.securedDebt),
      6,
    );
    expect(independentExpectedRemaining("ind_permitted_debt_1b_ratio_secured", fin, metrics)).toBeCloseTo(
      Math.max(0, provisions[2]!.thresholdValue * fin.ebitda - metrics.netSecured),
      6,
    );
  });
});

describe("Priority A — semantic boundaries", () => {
  it("A1: never coalesces null remainingCapacityMm into modeled remaining", () => {
    expect(BRIDGE_SRC).not.toMatch(/remainingCapacityMm\s*\?\?\s*c\.modeledCapacityMm/);
    const pos = connectSliceToPosition(evaluateMatthewsVerticalSlice());
    for (const m of pos.connectedMetrics) {
      expect(m.remainingCapacityMm).toBeNull();
      expect(m.remainingClaim.amountMillions).toBeNull();
      expect(m.quarantinedFromProductionCalculation).toBe(true);
    }
  });

  it("A5: hypothetical secured composition unpublished as remaining", () => {
    const slice = evaluateMatthewsVerticalSlice();
    expect(slice.securedCompositionAuthority).toBe("HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION");
    const pos = connectSliceToPosition(slice);
    const secured = pos.positionView.sides.find((s) => s.side === "secured")!;
    expect(secured.remaining.amountMillions).toBeNull();
  });

  it("UNSUPPORTED refusals carry missingLegalStructure provenance", () => {
    const pos = connectSliceToPosition(evaluateMatthewsVerticalSlice());
    const refused = pos.verifiedExecutableCompile.verifiedExecutableUnits.filter(
      (u) => !u.feedsPosition,
    );
    expect(refused.length).toBeGreaterThanOrEqual(1);
    for (const u of refused) {
      expect(u.missingLegalStructure).toBeTruthy();
      expect(u.sourceBackedGrossCapacityMm).toBeNull();
    }
  });
});

describe("PR #304 acceptance — Position publication honesty (Check 3)", () => {
  it("never labels AVAILABLE / production-authoritative remaining", () => {
    const slice = evaluateMatthewsVerticalSlice();
    const pos = connectSliceToPosition(slice);
    expect(pos.productionRemainingPublished).toBe(false);
    expect(pos.positionView.remainingAuthoritative).toBe(false);
    expect(pos.verifiedExecutableCompile.productionCapacityPublished).toBe(false);
    for (const m of [...pos.connectedMetrics, ...pos.verifiedExecutableMetrics]) {
      expect(m.claim.status).not.toBe("VERIFIED_EXECUTABLE");
      expect(m.claim.claimLabel).not.toMatch(/AVAILABLE(?!\s*\()/i);
      expect(m.claim.claimLabel.toLowerCase()).not.toContain("available (verified)");
      // MODELED remaining, GROSS contractual, or unavailable — never production AVAILABLE.
      expect(
        /MODELED|NOT VERIFIED|NOT_PRODUCTION|UNKNOWN|NEEDS_INPUT|GROSS/i.test(m.claim.claimLabel),
      ).toBe(true);
      // D3b: no claimKind REMAINING for leaf modeled rows (modeled≠remaining).
      expect(m.claim.claimKind).not.toBe("REMAINING");
    }
  });

  it("1a flat refuses remainingCapacityMm when completeness incomplete", () => {
    const flat = evaluateMatthewsVerticalSlice().covenants.find((c) => c.code === "ind_permitted_debt_1a_flat")!;
    expect(flat.modeledCapacityMm).toBeCloseTo(521.118, 3);
    expect(flat.remainingCapacityMm).toBeNull();
    expect(flat.authorityStatus).toBe("GROSS_ONLY_UTILIZATION_INCOMPLETE");
  });

  it("D3b: ratio modeled rooms keep remainingCapacityMm null (no modeled→remaining fallback)", () => {
    const slice = evaluateMatthewsVerticalSlice();
    const fccr = slice.covenants.find((c) => c.code === "ind_ratio_debt_fccr")!;
    const ratio1b = slice.covenants.find((c) => c.code === "ind_permitted_debt_1b_ratio_secured")!;
    expect(fccr.modeledCapacityMm).not.toBeNull();
    expect(ratio1b.modeledCapacityMm).not.toBeNull();
    expect(fccr.remainingCapacityMm).toBeNull();
    expect(ratio1b.remainingCapacityMm).toBeNull();
    const pos = connectSliceToPosition(slice);
    for (const code of ["ind_ratio_debt_fccr", "ind_permitted_debt_1b_ratio_secured"]) {
      const m = pos.connectedMetrics.find((x) => x.code === code)!;
      expect(m.claim.claimKind).toBe("GROSS_CONTRACTUAL");
      expect(m.claim.claimKind).not.toBe("REMAINING");
    }
  });

  it("D3c: rulebook stage is INTERPRETED — not fabricated REVIEWED", () => {
    const pos = connectSliceToPosition(evaluateMatthewsVerticalSlice());
    expect(BRIDGE_SRC).toMatch(/stage:\s*"INTERPRETED"/);
    expect(BRIDGE_SRC).not.toMatch(/stage:\s*"REVIEWED"/);
    expect(pos.positionView.permissions.executableReported).toBe(0);
    expect(pos.positionView.permissions.verified).toBe(0);
    expect(pos.positionView.reviewBlockers.some((b) => /INTERPRETED/i.test(b))).toBe(true);
  });

  it("separates SOURCE_BACKED_COMPILED_GROSS ($1300) from MODELED_LEAF room ($521.118)", () => {
    const pos = connectSliceToPosition(evaluateMatthewsVerticalSlice());
    const ve = pos.verifiedExecutableMetrics.find((m) => m.code.includes("1a"))!;
    const leaf = pos.connectedMetrics.find((m) => m.code === "ind_permitted_debt_1a_flat")!;
    expect(ve.amountMillions).toBeCloseTo(1300, 6);
    expect(leaf.amountMillions).toBeCloseTo(521.118, 3);
    expect(ve.valueProvenance).toBe("SOURCE_BACKED_COMPILED_GROSS");
    expect(leaf.valueProvenance).toBe("MODELED_LEAF");
  });
});

describe("PR #304 acceptance — secured composition (Check 4)", () => {
  it("labels $631.45 composition as hypothetical/unverified for secured capacity", () => {
    const slice = evaluateMatthewsVerticalSlice();
    expect(slice.indentureSecuredCompositionMm).toBeCloseTo(631.45, 1);
    // Composition must carry an explicit non-verified secured label after acceptance remediation.
    expect(slice.securedCompositionAuthority).toBe("HYPOTHETICAL_UNVERIFIED_SECURED_COMPOSITION");
  });
});

describe("PR #304 acceptance — second package / generalization (Check 6)", () => {
  it("full leaf dashboard pathway returns null for non-Matthews / non-VE packages", () => {
    for (const id of ["coherent", "conmed", "autonation", "wor", "mtn", "acme"]) {
      expect(hasAuthenticPositionSlice(id)).toBe(false);
      expect(loadAuthenticDashboardSlice(id)).toBeNull();
    }
  });

  it("MHK registers for shared VE→Position feed (not full leaf dashboard)", () => {
    expect(hasAuthenticPositionSlice("mhk")).toBe(true);
    const mhk = loadAuthenticDashboardSlice("mhk");
    expect(mhk).not.toBeNull();
    expect(mhk!.connectedMetrics).toHaveLength(0); // no evaluateProvision leaf path
    expect(mhk!.verifiedExecutableUnitsFeedingPosition).toBeGreaterThanOrEqual(1);
    expect(mhk!.productionRemainingPublished).toBe(false);
  });

  it("leaf evaluator remains company-named (full GENERALIZED pipeline still NOT_PROVEN)", () => {
    expect(EVAL_SRC).toMatch(/export function evaluateMatthewsVerticalSlice/);
    expect((EVAL_SRC.match(/p\.code === "/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});

describe("PR #304 acceptance — milestone verdicts (final)", () => {
  it("withdraws REAL_DASHBOARD_VERTICAL_SLICE_PROVEN as product acceptance", () => {
    const result = runRealDashboardVerticalSlice();
    expect(result.verdict).not.toBe("REAL_DASHBOARD_VERTICAL_SLICE_PROVEN");
    expect(result.milestones).toEqual({
      FIXTURE_MODELED_DASHBOARD_PROVEN: "PROVEN_WITH_DEFECTS",
      GENERALIZED_CALCULATION_PIPELINE_PROVEN: "NOT_PROVEN",
      AUTONOMOUS_COVENANT_COMPILATION_PROVEN: "NOT_PROVEN",
      PRODUCTION_AUTHORITY_PROVEN: "NOT_PROVEN",
    });
  });
});
