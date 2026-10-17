/**
 * Rule 12 — greater-of basket extraction must accept (i)/(ii) and
 * (1)/(2) limb markers, not only (x)/(y).
 *
 * The greater-of regex hard-coded `(?:x\)\s*)?` / `(?:y\)\s*)?` for
 * the two limbs. Real indentures write the same construct as
 * "greater of (i) $150.0 million and (ii) 10.0% of Consolidated
 * EBITDA" or with (1)/(2) markers — all of which the regex silently
 * failed to match, dropping the basket entirely.
 */
import { describe, expect, it } from "vitest";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import type { CovenantCandidateRecord } from "../../lib/knowledge-factory/types";

function analyze(excerpt: string) {
  const candidate: CovenantCandidateRecord = {
    candidateId: "c1",
    sourceId: "src",
    nodeId: undefined,
    families: ["INDEBTEDNESS"],
    signals: [],
    excerpt,
    representationLevel: "DISCOVERED_CANDIDATE",
    discoveryScore: 5,
  };
  return analyzeProvision({
    sourceId: "src",
    documentTitle: "Indenture",
    candidate,
    definitions: [],
    structuralNodes: [],
  });
}

describe("greater-of basket limb markers", () => {
  it("extracts greater-of with (i)/(ii) markers", () => {
    const a = analyze(
      "Section 6.01 Limitation on Indebtedness. The Company shall not create Indebtedness " +
        "except Indebtedness in an aggregate principal amount not to exceed the greater of " +
        "(i) $150.0 million and (ii) 10.0% of Consolidated EBITDA at any time outstanding.",
    );
    expect(a.basketsAndThresholds.join(" ")).toContain(
      "Greater-of basket: $150.0 million and 10.0% of Consolidated EBITDA",
    );
  });

  it("extracts greater-of with (1)/(2) markers", () => {
    const a = analyze(
      "Section 6.01 Limitation on Indebtedness. The Company shall not create Indebtedness " +
        "except Indebtedness in an aggregate principal amount not to exceed the greater of " +
        "(1) $75.0 million and (2) 7.5% of Consolidated EBITDA at any time outstanding.",
    );
    expect(a.basketsAndThresholds.join(" ")).toContain(
      "Greater-of basket: $75.0 million and 7.5% of Consolidated EBITDA",
    );
  });

  it("still extracts greater-of with (x)/(y) markers", () => {
    const a = analyze(
      "Section 6.01 Limitation on Indebtedness. The Company shall not create Indebtedness " +
        "except Indebtedness in an aggregate principal amount not to exceed the greater of " +
        "(x) $150.0 million and (y) 10.0% of Consolidated EBITDA at any time outstanding.",
    );
    expect(a.basketsAndThresholds.join(" ")).toContain(
      "Greater-of basket: $150.0 million and 10.0% of Consolidated EBITDA",
    );
  });
});
