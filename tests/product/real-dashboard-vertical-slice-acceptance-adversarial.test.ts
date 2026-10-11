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
    expect(VE_SRC).toMatch(/compileFixedDollarBasket/);
    expect(VE_SRC).toMatch(/evaluateFixedDollarCapacity/);
    expect(VE_SRC).toMatch(/SOURCE_BACKED_COMPILED_GROSS/);
    expect(VE_SRC).toMatch(/PRODUCTION_CAPACITY_REFUSED/);
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
    }
  });

  it("1a flat refuses remainingCapacityMm when completeness incomplete", () => {
    const flat = evaluateMatthewsVerticalSlice().covenants.find((c) => c.code === "ind_permitted_debt_1a_flat")!;
    expect(flat.modeledCapacityMm).toBeCloseTo(521.118, 3);
    expect(flat.remainingCapacityMm).toBeNull();
    expect(flat.authorityStatus).toBe("GROSS_ONLY_UTILIZATION_INCOMPLETE");
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
  it("same pathway returns null for every non-Matthews companyId", () => {
    for (const id of ["coherent", "conmed", "autonation", "wor", "mhk", "mtn", "acme"]) {
      expect(hasAuthenticPositionSlice(id)).toBe(false);
      expect(loadAuthenticDashboardSlice(id)).toBeNull();
    }
  });

  it("evaluator is company-named and code-switched (not generalized)", () => {
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
