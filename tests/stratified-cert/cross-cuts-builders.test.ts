/**
 * P3-WB1 emitter honesty: sealed role BUILDER → WITH_BUILDERS.
 * Text heuristic stays supplemental only when role is not BUILDER.
 * A sealed BUILDER role is never overridden to WITHOUT_BUILDERS.
 */
import { describe, expect, it } from "vitest";
import { crossCutClaims, deriveCrossCuts } from "../../scripts/stratified-cert/lib/cross-cuts";

function claimOf(
  claims: Record<string, { claimed: boolean; basis: string }>,
  id: string,
): { claimed: boolean; basis: string } {
  const row = claims[id];
  if (!row) throw new Error(`missing cross-cut claim ${id}`);
  return row;
}

const DISCOVERY_ID = "discovery-candidate:f62db8ebcda9d35c4fc03b2a";
const NO_BUILDER_TEXT = "The Borrower may incur Indebtedness in an aggregate principal amount not to exceed $10,000,000.";
const BUILDER_TEXT = "plus the builder amount equal to the accumulated restricted payments capacity.";

describe("deriveCrossCuts BUILDER role honesty", () => {
  it("sealed role BUILDER yields WITH_BUILDERS without a builder/grower text match", () => {
    const cuts = deriveCrossCuts({ role: "BUILDER", operativeText: NO_BUILDER_TEXT });
    expect(cuts).toContain("WITH_BUILDERS");
    expect(cuts).not.toContain("WITHOUT_BUILDERS");
  });

  it("sealed role BUILDER stays WITH_BUILDERS even when the text also matches the heuristic", () => {
    const cuts = deriveCrossCuts({ role: "BUILDER", operativeText: BUILDER_TEXT });
    expect(cuts.filter((c) => c === "WITH_BUILDERS")).toEqual(["WITH_BUILDERS"]);
    expect(cuts).not.toContain("WITHOUT_BUILDERS");
  });

  it("does not override a sealed BUILDER role when SHARED_CAP is absent", () => {
    const cuts = deriveCrossCuts({ role: "BUILDER", operativeText: NO_BUILDER_TEXT });
    expect(cuts).toContain("WITHOUT_SHARED_CAPS");
    expect(cuts).toContain("WITH_BUILDERS");
    expect(cuts).toContain("WITHOUT_RECLASSIFICATION");
  });

  it("keeps the text heuristic supplemental only when role is not BUILDER", () => {
    const withText = deriveCrossCuts({ role: "BASKET", operativeText: BUILDER_TEXT });
    expect(withText).toContain("WITH_BUILDERS");
    expect(withText).not.toContain("WITHOUT_BUILDERS");

    const withoutText = deriveCrossCuts({ role: "BASKET", operativeText: NO_BUILDER_TEXT });
    expect(withoutText).toContain("WITHOUT_BUILDERS");
    expect(withoutText).not.toContain("WITH_BUILDERS");

    const shared = deriveCrossCuts({ role: "SHARED_CAP", operativeText: NO_BUILDER_TEXT });
    expect(shared).toContain("WITH_SHARED_CAPS");
    expect(shared).toContain("WITHOUT_BUILDERS");
  });

  it("still honors explicit overrides ahead of role and text", () => {
    const cuts = deriveCrossCuts({
      role: "BUILDER",
      operativeText: BUILDER_TEXT,
      overrides: ["WITHOUT_BUILDERS"],
    });
    expect(cuts).toEqual(["WITHOUT_BUILDERS"]);
  });
});

describe("crossCutClaims BUILDER basis (SHARED_CAP style)", () => {
  it("role BUILDER basis is role-only, parallel to SHARED_CAP", () => {
    const claims = crossCutClaims({
      crossCuts: ["WITH_BUILDERS"],
      role: "BUILDER",
      discoveryId: DISCOVERY_ID,
      operativeText: NO_BUILDER_TEXT,
    });
    const claim = claimOf(claims, "WITH_BUILDERS");
    expect(claim.claimed).toBe(true);
    expect(claim.basis).toBe(
      `Sealed discovery role BUILDER === BUILDER on ${DISCOVERY_ID}; WITH_BUILDERS derived from role only (not operative-text heuristics).`,
    );
  });

  it("SHARED_CAP basis stays role-only", () => {
    const claims = crossCutClaims({
      crossCuts: ["WITH_SHARED_CAPS"],
      role: "SHARED_CAP",
      discoveryId: "discovery-candidate:cf3d8d9492aeca04392b5172",
      operativeText: NO_BUILDER_TEXT,
    });
    expect(claimOf(claims, "WITH_SHARED_CAPS").basis).toBe(
      "Sealed discovery role SHARED_CAP === SHARED_CAP on discovery-candidate:cf3d8d9492aeca04392b5172; WITH_SHARED_CAPS derived from role only (not operative-text heuristics).",
    );
  });

  it("non-BUILDER WITH_BUILDERS basis names the supplemental text heuristic", () => {
    const claims = crossCutClaims({
      crossCuts: ["WITH_BUILDERS"],
      role: "BASKET",
      discoveryId: DISCOVERY_ID,
      operativeText: BUILDER_TEXT,
    });
    const claim = claimOf(claims, "WITH_BUILDERS");
    expect(claim.claimed).toBe(true);
    expect(claim.basis).toMatch(/is not BUILDER/);
    expect(claim.basis).toMatch(/builder\/grower heuristic/);
    expect(claim.basis).not.toMatch(/derived from role only/);
  });

  it("WITHOUT_BUILDERS basis records that the sealed role is not BUILDER", () => {
    const claims = crossCutClaims({
      crossCuts: ["WITHOUT_BUILDERS"],
      role: "CONDITION",
      discoveryId: DISCOVERY_ID,
      operativeText: NO_BUILDER_TEXT,
    });
    const claim = claimOf(claims, "WITHOUT_BUILDERS");
    expect(claim.claimed).toBe(true);
    expect(claim.basis).toBe(
      "Sealed discovery role CONDITION is not BUILDER; no builder/grower formula detected in this operative window.",
    );
  });
});
