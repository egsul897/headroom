/**
 * lib/extraction/schemas.ts - a well-formed synthetic stage result validates
 * cleanly; a malformed one is rejected loudly, never silently coerced.
 */
import { describe, expect, it } from "vitest";
import {
  CoverageStageResultSchema,
  DefinitionsStageResultSchema,
  FinancialInputsStageResultSchema,
  PermissionsStageResultSchema,
  RelationshipsStageResultSchema,
  StructureStageResultSchema,
} from "../../lib/extraction/schemas";

describe("StructureStageResultSchema", () => {
  it("accepts a well-formed DOCUMENT_RELATIONSHIP proposal", () => {
    const result = StructureStageResultSchema.safeParse({
      candidates: [
        {
          kind: "DOCUMENT_RELATIONSHIP",
          sourceChunkIds: ["chunk-1"],
          confidence: 0.9,
          rationale: "Title page reads Credit Agreement.",
          proposedValue: { documentType: "CREDIT_AGREEMENT", articleOutline: [{ articleRef: "Article I", heading: "DEFINITIONS" }] },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown documentType instead of silently coercing it", () => {
    const result = StructureStageResultSchema.safeParse({
      candidates: [{ kind: "DOCUMENT_RELATIONSHIP", sourceChunkIds: ["c1"], proposedValue: { documentType: "NOT_A_REAL_TYPE", articleOutline: [] } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a proposal with zero sourceChunkIds (no evidence)", () => {
    const result = StructureStageResultSchema.safeParse({
      candidates: [{ kind: "DOCUMENT_RELATIONSHIP", sourceChunkIds: [], proposedValue: { documentType: "OTHER", articleOutline: [] } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a confidence value outside [0, 1]", () => {
    const result = StructureStageResultSchema.safeParse({
      candidates: [{ kind: "DOCUMENT_RELATIONSHIP", sourceChunkIds: ["c1"], confidence: 1.5, proposedValue: { documentType: "OTHER", articleOutline: [] } }],
    });
    expect(result.success).toBe(false);
  });
});

describe("DefinitionsStageResultSchema", () => {
  it("accepts a well-formed DEFINED_TERM proposal", () => {
    const result = DefinitionsStageResultSchema.safeParse({
      candidates: [{ kind: "DEFINED_TERM", sourceChunkIds: ["c1"], proposedValue: { termName: "Consolidated EBITDA", sectionRef: "1.01", fullText: '"Consolidated EBITDA" means...' } }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a DEFINED_TERM candidate wrongly tagged with a different kind literal", () => {
    const result = DefinitionsStageResultSchema.safeParse({
      candidates: [{ kind: "PERMISSION", sourceChunkIds: ["c1"], proposedValue: { termName: "X", sectionRef: "1.01", fullText: "means..." } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing required field (fullText)", () => {
    const result = DefinitionsStageResultSchema.safeParse({
      candidates: [{ kind: "DEFINED_TERM", sourceChunkIds: ["c1"], proposedValue: { termName: "X", sectionRef: "1.01" } }],
    });
    expect(result.success).toBe(false);
  });
});

describe("PermissionsStageResultSchema", () => {
  const validPermission = {
    kind: "PERMISSION",
    sourceChunkIds: ["c1"],
    sourceSectionRef: "6.01",
    confidence: 0.8,
    proposedValue: {
      permissionRef: "6.01",
      action: "incur Indebtedness",
      grantType: "DEBT_INCURRENCE",
      amountKind: "FIXED",
      entityScope: [],
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 50,
      measurementBasis: "CUMULATIVE_INCURRED",
      sectionRef: "6.01",
      definedTermRefs: [],
      modelingStatus: "MODELED",
    },
  };

  it("accepts a well-formed PERMISSION proposal", () => {
    expect(PermissionsStageResultSchema.safeParse({ candidates: [validPermission] }).success).toBe(true);
  });

  it("accepts a well-formed COLLATERAL_SCOPE proposal alongside a PERMISSION one (the union)", () => {
    const collateralScope = {
      kind: "COLLATERAL_SCOPE",
      sourceChunkIds: ["c1"],
      proposedValue: { permissionRef: "6.01", collateralPoolName: "Pool A", priorityTier: "FIRST", sourceSectionRef: "6.01" },
    };
    expect(PermissionsStageResultSchema.safeParse({ candidates: [validPermission, collateralScope] }).success).toBe(true);
  });

  it("rejects an invalid grantType enum value", () => {
    const bad = { ...validPermission, proposedValue: { ...validPermission.proposedValue, grantType: "EQUITY_ISSUANCE" } };
    expect(PermissionsStageResultSchema.safeParse({ candidates: [bad] }).success).toBe(false);
  });

  it("rejects a non-numeric thresholdValue instead of coercing a numeric string", () => {
    const bad = { ...validPermission, proposedValue: { ...validPermission.proposedValue, thresholdValue: "50" } };
    expect(PermissionsStageResultSchema.safeParse({ candidates: [bad] }).success).toBe(false);
  });
});

describe("RelationshipsStageResultSchema", () => {
  it("accepts RELATIONSHIP, SHARED_CONSTRAINT, and ACTIVATION_CONDITION candidates in one result (the 3-way union)", () => {
    const result = RelationshipsStageResultSchema.safeParse({
      candidates: [
        { kind: "RELATIONSHIP", sourceChunkIds: ["c1"], proposedValue: { relationshipType: "ALTERNATIVE", fromPermissionRef: "a", toPermissionRef: "b", sourceSectionRef: "6.01" } },
        { kind: "SHARED_CONSTRAINT", sourceChunkIds: ["c1"], proposedValue: { name: "Shared Basket", aggregationRule: "NAMED_MEMBER_CLAUSES", measurementBasis: "CUMULATIVE_INCURRED", sourceSectionRef: "6.01" } },
        { kind: "ACTIVATION_CONDITION", sourceChunkIds: ["c1"], proposedValue: { predicateKind: "USAGE_LIMITED", predicateConfig: { maxUses: 2 }, effect: "APPLICABILITY", sourceSectionRef: "6.01" } },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid relationshipType", () => {
    const result = RelationshipsStageResultSchema.safeParse({
      candidates: [{ kind: "RELATIONSHIP", sourceChunkIds: ["c1"], proposedValue: { relationshipType: "SOMETHING_ELSE", fromPermissionRef: "a", toPermissionRef: "b", sourceSectionRef: "6.01" } }],
    });
    expect(result.success).toBe(false);
  });
});

describe("CoverageStageResultSchema", () => {
  it("accepts a KNOWN_NOT_MODELED gap placeholder", () => {
    const result = CoverageStageResultSchema.safeParse({
      candidates: [
        {
          kind: "PERMISSION",
          sourceChunkIds: ["c1"],
          rationale: "Section references Indebtedness but no candidate covers it.",
          proposedValue: {
            permissionRef: "6.03-gap",
            action: "unmodeled provision",
            grantType: "DEBT_INCURRENCE",
            amountKind: "FIXED",
            entityScope: [],
            formulaType: "FLAT_AMOUNT",
            thresholdValue: 0,
            measurementBasis: "CUMULATIVE_INCURRED",
            sectionRef: "6.03",
            definedTermRefs: [],
            modelingStatus: "KNOWN_NOT_MODELED",
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("FinancialInputsStageResultSchema", () => {
  it("accepts a well-formed EXTERNAL_INPUT_REQUIREMENT proposal", () => {
    const result = FinancialInputsStageResultSchema.safeParse({
      candidates: [{ kind: "EXTERNAL_INPUT_REQUIREMENT", sourceChunkIds: ["c1"], proposedValue: { kind: "CERTIFIED_EXTERNAL_INPUT", name: "Consolidated EBITDA", description: "Required for basket formulas." } }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid external-input kind", () => {
    const result = FinancialInputsStageResultSchema.safeParse({
      candidates: [{ kind: "EXTERNAL_INPUT_REQUIREMENT", sourceChunkIds: ["c1"], proposedValue: { kind: "MADE_UP_KIND", name: "X", description: "Y" } }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects extra unexpected top-level shape (an array instead of the {candidates} envelope)", () => {
    const result = FinancialInputsStageResultSchema.safeParse([{ kind: "EXTERNAL_INPUT_REQUIREMENT" }]);
    expect(result.success).toBe(false);
  });
});
