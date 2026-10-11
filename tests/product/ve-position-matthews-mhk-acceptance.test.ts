/**
 * Independent acceptance: authentic operative text → shared VE compile →
 * capacity evaluation → Position for Matthews AND Mohawk (MHK).
 *
 * Expected dollars are parsed from authentic source text — not from
 * package-matthews threshold literals.
 *
 * Does NOT claim GENERALIZED_CALCULATION_PIPELINE_PROVEN (full leaf dashboard
 * still Matthews-only) or AUTONOMOUS_COVENANT_COMPILATION_PROVEN (ratio rows
 * remain hand-encoded) or PRODUCTION_AUTHORITY_PROVEN.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hasAuthenticPositionSlice,
  loadAuthenticDashboardSlice,
  loadVePositionSlice,
  VE_POSITION_PACKAGES,
  bindMatthewsProvisionsFromVerifiedExecutable,
  matthewsCovenantProvisions,
  evaluateMatthewsVerticalSlice,
  extractMhk703fReceivablesCandidate,
} from "@/lib/product/real-dashboard-vertical-slice";
import { MATTHEWS_INDENTURE_SOURCE } from "@/lib/product/real-dashboard-vertical-slice/source-excerpts-matthews";

const FEED_SRC = readFileSync(
  join(process.cwd(), "lib/product/real-dashboard-vertical-slice/ve-position-feed.ts"),
  "utf8",
);
const CORE_SRC = readFileSync(
  join(
    process.cwd(),
    "lib/product/real-dashboard-vertical-slice/verified-executable-compile-core.ts",
  ),
  "utf8",
);

function independentMatthews1aGrossMm(): number {
  const m = MATTHEWS_INDENTURE_SOURCE.text.match(/not to exceed \$([0-9,]+)/i);
  if (!m) throw new Error("Matthews Indenture missing not-to-exceed");
  return Number(m[1]!.replace(/,/g, "")) / 1_000_000;
}

function independentMhk703fGrossMm(): number {
  const c = extractMhk703fReceivablesCandidate();
  if (!c) throw new Error("MHK §7.03(f) missing");
  const m = c.operativeSourceText.match(/not\s+exceed\s+\$([0-9,]+)/i);
  if (!m) throw new Error("MHK operative text missing dollar");
  return Number(m[1]!.replace(/,/g, "")) / 1_000_000;
}

describe("independent acceptance — Matthews + MHK VE→Position", () => {
  it("VE feed + compile core have no issuer companyId switches", () => {
    expect(FEED_SRC).not.toMatch(/companyId\s*===\s*["']matthews["']/);
    expect(FEED_SRC).not.toMatch(/if\s*\(\s*companyId\s*===\s*["']mhk["']/);
    expect(CORE_SRC).not.toMatch(/companyId\s*===\s*["']/);
    expect(CORE_SRC).not.toMatch(/matthews|mhk|conmed/i);
  });

  it("registry lists both Matthews and MHK for shared VE Position", () => {
    const ids = VE_POSITION_PACKAGES.map((p) => p.companyId).sort();
    expect(ids).toEqual(["matthews", "mhk"]);
  });

  it("Matthews Position: VE gross matches independently parsed $1300M; production refused", () => {
    const expected = independentMatthews1aGrossMm();
    expect(expected).toBe(1300);
    expect(hasAuthenticPositionSlice("matthews")).toBe(true);
    const slice = loadAuthenticDashboardSlice("matthews")!;
    const ve = slice.verifiedExecutableMetrics.find((m) => m.amountMillions != null);
    expect(ve).toBeDefined();
    expect(ve!.amountMillions).toBe(expected);
    expect(ve!.valueProvenance).toBe("SOURCE_BACKED_COMPILED_GROSS");
    expect(ve!.mayPublishAvailable).toBe(false);
    expect(slice.productionRemainingPublished).toBe(false);
    expect(slice.verifiedExecutableCompile.productionCapacityPublished).toBe(false);
  });

  it("MHK Position: same loadAuthenticDashboardSlice path yields independently parsed $700M", () => {
    const expected = independentMhk703fGrossMm();
    expect(expected).toBe(700);
    expect(hasAuthenticPositionSlice("mhk")).toBe(true);
    const slice = loadAuthenticDashboardSlice("mhk")!;
    expect(slice.companyId).toBe("mhk");
    expect(slice.connectedMetrics).toHaveLength(0);
    const ve = slice.verifiedExecutableMetrics.find((m) => m.amountMillions != null);
    expect(ve).toBeDefined();
    expect(ve!.amountMillions).toBe(expected);
    expect(ve!.operativeSection).toBe("7.03(f)");
    expect(ve!.valueProvenance).toBe("SOURCE_BACKED_COMPILED_GROSS");
    expect(slice.productionRemainingPublished).toBe(false);
  });

  it("loadVePositionSlice is package-agnostic wrapper used by both issuers", () => {
    const m = loadVePositionSlice("matthews")!;
    const h = loadVePositionSlice("mhk")!;
    expect(m.verifiedExecutableUnitsFeedingPosition).toBeGreaterThanOrEqual(1);
    expect(h.verifiedExecutableUnitsFeedingPosition).toBeGreaterThanOrEqual(1);
    expect(m.verifiedExecutableMetrics[0]!.amountMillions).toBe(independentMatthews1aGrossMm());
    expect(h.verifiedExecutableMetrics[0]!.amountMillions).toBe(independentMhk703fGrossMm());
  });

  it("Matthews 1a leaf threshold binds from VE compile (not orphaned hand literal alone)", () => {
    const bound = bindMatthewsProvisionsFromVerifiedExecutable(matthewsCovenantProvisions());
    const oneA = bound.find((p) => p.code === "ind_permitted_debt_1a_flat")!;
    expect(oneA.thresholdValue).toBe(independentMatthews1aGrossMm());
    const fccr = bound.find((p) => p.code === "ind_ratio_debt_fccr")!;
    expect(fccr.thresholdValue).toBe(2.0);
    const notes = bound.find((p) => p.code === "ind_permitted_debt_2_notes")!;
    expect(notes.thresholdValue).toBe(300);

    const evalSlice = evaluateMatthewsVerticalSlice();
    const leaf1a = evalSlice.covenants.find((c) => c.code === "ind_permitted_debt_1a_flat")!;
    expect(leaf1a.modeledCapacityMm).not.toBeNull();
    expect(leaf1a.modeledCapacityMm).toBeLessThan(1300);
  });

  it("adversarial: unknown companyId refuses Position slice", () => {
    expect(hasAuthenticPositionSlice("autonation")).toBe(false);
    expect(loadAuthenticDashboardSlice("autonation")).toBeNull();
    expect(loadVePositionSlice("autonation")).toBeNull();
  });
});
