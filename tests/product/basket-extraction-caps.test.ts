/**
 * Rule 15 — basket extraction must not silently drop baskets past
 * an arbitrary cap. extractBaskets capped amounts at 10 and the
 * final list at 10, so a §6.01 with 12+ enumerated baskets lost
 * the tail with no disclosure. Real sections can carry 20+
 * baskets. Caps are raised well above any real section's count
 * (40 amounts / 40 total); dropping baskets silently is worse
 * than a long list.
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

describe("basket extraction caps", () => {
  it("extracts all 12 amount baskets in a long enumerated section", () => {
    const amounts = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]
      .map((n, i) => `(${String.fromCharCode(97 + i)}) Indebtedness not to exceed $${n}.0 million`)
      .join("; ");
    const a = analyze(
      "Section 6.01 Limitation on Indebtedness. The Company shall not create Indebtedness except: " +
        amounts +
        ".",
    );
    const joined = a.basketsAndThresholds.join(" ");
    for (const n of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]) {
      expect(joined).toContain(`$${n}.0 million`);
    }
  });
});
