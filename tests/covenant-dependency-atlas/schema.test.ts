import { describe, expect, it } from "vitest";
import {
  AtlasEdgeSchema,
  DEPENDENCY_EDGE_KINDS,
  EVIDENCE_CLASSES,
  edgeIdOf,
  nodeIdForTerm,
} from "../../scripts/covenant-dependency-atlas/schema";

describe("Covenant Dependency Atlas schema", () => {
  it("enumerates all mission edge kinds", () => {
    expect(DEPENDENCY_EDGE_KINDS).toEqual([
      "COVENANT_TO_DEFINITION",
      "DEFINITION_TO_DEFINITION",
      "COVENANT_TO_CONDITION",
      "COVENANT_TO_EXCEPTION",
      "COVENANT_TO_AMENDMENT",
      "COVENANT_TO_SHARED_BASKET",
      "COVENANT_TO_CROSS_DOCUMENT",
      "ENTITY_SCOPE",
      "RATIO_CALCULATION",
      "FINANCIAL_INPUT",
      "RECLASSIFICATION",
    ]);
  });

  it("rejects similarity-only evidence classes", () => {
    expect(EVIDENCE_CLASSES).not.toContain("STRING_SIMILARITY");
    expect(EVIDENCE_CLASSES).not.toContain("TERM_CO_OCCURRENCE");
  });

  it("builds stable edge and term node ids", () => {
    expect(nodeIdForTerm("doc-a", "Available Amount")).toBe("node:doc-a:term:available_amount");
    expect(edgeIdOf("COVENANT_TO_DEFINITION", "a", "b")).toBe("COVENANT_TO_DEFINITION::a::b");
  });

  it("requires rationale and at least one source span on every edge", () => {
    const bad = {
      edgeId: "x",
      kind: "COVENANT_TO_DEFINITION",
      fromNodeId: "a",
      toNodeId: "b",
      resolution: "RESOLVED",
      confidence: "HIGH",
      evidenceClass: "GROUND_TRUTH_INVENTORY_DECLARATION",
      rationale: "",
      sourceSpans: [],
      unresolvedReason: null,
      sharedBasketKey: null,
      financialInputKey: null,
      rootCause: null,
      controllingRestrictionRisk: false,
    };
    expect(() => AtlasEdgeSchema.parse(bad)).toThrow();
  });
});
