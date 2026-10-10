/**
 * Authentic Neon capacity execution — independently verifies production leaf
 * evaluation against Coherent / Matthews / demo counsel provisions.
 *
 * Requires DATABASE_URL. Does not expand the synthetic 53-case matrix.
 * Does not fabricate utilization or financial inputs.
 */
import { describe, expect, it } from "vitest";
import { runAuthenticCapacityExecution } from "@/scripts/capacity/authentic-capacity-execution";

const hasDb = Boolean(process.env.DATABASE_URL?.trim());

describe.runIf(hasDb)("authentic capacity execution (Neon)", () => {
  it("independently verifies authentic gross capacity with zero incorrect evaluations", async () => {
    const { cases, summary, blockers } = await runAuthenticCapacityExecution();

    expect(summary.incorrectlyEvaluated).toBe(0);
    expect(summary.authenticProvisionsEvaluated).toBeGreaterThanOrEqual(20);
    expect(summary.independentlyCorrectExecutableResults).toBeGreaterThanOrEqual(15);
    expect(summary.mechanicsCovered).toEqual(
      expect.arrayContaining([
        "fixed_basket",
        "greater_of_grower",
        "ratio_debt",
        "incremental_facility",
        "available_amount_builder",
        "restricted_payment",
        "investment",
        "shared_capacity",
      ]),
    );

    // Correct refusals (automatic-link liens) must not be counted as executable calculations.
    expect(summary.correctlyRefused).toBeGreaterThan(0);
    for (const c of cases.filter((x) => x.outcomeClass === "CORRECT_REFUSAL")) {
      expect(c.engineResult.capacityMillions ?? 0).toBe(0);
      expect(c.verificationStatus).toBe("REFUSAL_ALIGNED");
    }

    // Every executable match still lacks attributed utilization — remaining ≠ gross claim.
    for (const c of cases.filter((x) => x.outcomeClass === "EXECUTABLE_CORRECT")) {
      expect(c.utilization.attributed).toBe(false);
      expect(c.verificationStatus).toBe("MATCH");
      if (c.independentExpected.unlimited) {
        expect(c.engineResult.unlimited).toBe(true);
      } else {
        expect(c.difference).toBe(0);
      }
    }

    // Provenance preserved
    for (const c of cases.filter((x) => x.authenticity === "VERIFIED_POPULATION")) {
      expect(c.agreement.length).toBeGreaterThan(0);
      expect(c.section.length).toBeGreaterThan(0);
      expect(c.provenance.sourceId.length).toBeGreaterThan(0);
    }

    // Integration blockers are diagnosed, not papered over
    expect(blockers.permissionsModeled).toBeGreaterThan(0);
    expect(blockers.knowledgeSourcesByRepresentation).toBeTruthy();
    expect(blockers.blockers.some((b) => b.category === "Missing utilization")).toBe(true);
    expect(blockers.blockers.some((b) => b.category === "Verification and certification blockers")).toBe(true);
  }, 60_000);
});

describe("synthetic matrix preservation", () => {
  it("keeps the Agent-3 mathematics matrix file in tree", async () => {
    const { readFileSync, existsSync } = await import("node:fs");
    const path = "tests/contract-model/runtime/capacity/capacity-mathematics-matrix.test.ts";
    expect(existsSync(path)).toBe(true);
    const text = readFileSync(path, "utf8");
    expect(text.toLowerCase()).toContain("independently validated covenant capacity mathematics matrix");
    expect(text.toLowerCase()).toContain("fixed baskets");
    expect(text).toContain("Available Amount builders");
  });
});
