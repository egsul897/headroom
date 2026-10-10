import { describe, expect, it } from "vitest";
import {
  assertHoldoutUntouched,
  CORPUS_POPULATION_REGISTRY,
  packagesForPopulation,
} from "../../lib/knowledge-factory/corpus/population-registry";

describe("corpus population registry", () => {
  it("keeps Gibraltar as untouched holdout development", () => {
    const holdout = packagesForPopulation("HOLDOUT_DEVELOPMENT");
    expect(holdout.some((p) => p.packageId === "gibraltar-2026-credit-agreement")).toBe(true);
  });

  it("keeps Superior in regression, not holdout", () => {
    const reg = packagesForPopulation("REGRESSION");
    expect(reg.some((p) => p.packageId === "final-lightweight-unseen-sup")).toBe(true);
    expect(
      CORPUS_POPULATION_REGISTRY.find((p) => p.packageId === "final-lightweight-unseen-sup")?.population,
    ).toBe("REGRESSION");
  });

  it("flags holdout packages used for development", () => {
    expect(assertHoldoutUntouched(["fwrg-2021-credit-agreement"]).ok).toBe(true);
    expect(assertHoldoutUntouched(["gibraltar-2026-credit-agreement"]).ok).toBe(false);
  });
});
