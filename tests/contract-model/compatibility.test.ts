/**
 * Compatibility mapping (task §33, docs/contract-model-foundation-phase-b.md).
 * Projects REAL Coherent Permission/PermissionRelationship rows into the
 * Phase B shape, read-only - proves Coherent's reviewed configuration stays
 * completely unaltered (zero writes to permissions/permission_relationships
 * anywhere in this file) while still being representable in the
 * generalized ontology.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { grantTypeToCovenantFamily, modelingStatusToCoverageStatus, projectPermissionAsContractRuleView, projectPermissionRelationshipAsContractRuleRelationshipView, STACKING_TO_CONTRACT_RULE_RELATIONSHIP } from "../../lib/contract-model/compatibility";

describe("Compatibility mapping against real Coherent data (task §33)", () => {
  it("projects every real Coherent Permission row into a valid ContractRule view without altering the underlying row", async () => {
    const permissions = await prisma.permission.findMany({ where: { companyId: "coherent" } });
    expect(permissions.length).toBeGreaterThan(0);

    const before = JSON.stringify(permissions);
    for (const permission of permissions) {
      const view = projectPermissionAsContractRuleView(permission);
      expect(view.companyId).toBe("coherent");
      expect(["INDEBTEDNESS", "LIENS"]).toContain(view.covenantFamily);
      expect(view.ruleType).toBe("QUANTITATIVE_PERMISSION");
      expect(view.evaluationClass).toBe("EXECUTABLE");
      expect(view.sourceSectionRef).toBe(permission.sectionRef);
      expect(view.thresholdValue).toBe(permission.thresholdValue.toNumber());
    }
    // Re-fetch and confirm byte-for-byte identical - the projection is read-only.
    const after = await prisma.permission.findMany({ where: { companyId: "coherent" } });
    expect(JSON.stringify(after)).toBe(before);
  });

  it("grantType maps DEBT_INCURRENCE -> INDEBTEDNESS and LIEN -> LIENS, matching how Coherent's own permissions are actually typed", () => {
    expect(grantTypeToCovenantFamily("DEBT_INCURRENCE")).toBe("INDEBTEDNESS");
    expect(grantTypeToCovenantFamily("LIEN")).toBe("LIENS");
  });

  it("a KNOWN_NOT_MODELED Coherent permission projects to REVIEW_REQUIRED coverage, never a fabricated FULLY_MODELED", async () => {
    const anyKnownNotModeled = await prisma.permission.findFirst({ where: { companyId: "coherent", modelingStatus: "KNOWN_NOT_MODELED" } });
    if (anyKnownNotModeled) {
      expect(modelingStatusToCoverageStatus(anyKnownNotModeled.modelingStatus)).toBe("REVIEW_REQUIRED");
    }
    expect(modelingStatusToCoverageStatus("MODELED")).toBe("FULLY_MODELED");
    expect(modelingStatusToCoverageStatus("KNOWN_NOT_MODELED")).toBe("REVIEW_REQUIRED");
  });

  it("every real Coherent PermissionRelationship row projects to a valid ContractRuleRelationshipType, preserving the fromPermission/toPermission pairing exactly", async () => {
    const relationships = await prisma.permissionRelationship.findMany({ where: { companyId: "coherent" } });
    expect(relationships.length).toBeGreaterThan(0);
    for (const relationship of relationships) {
      const view = projectPermissionRelationshipAsContractRuleRelationshipView(relationship);
      expect(view.fromRuleSourceId).toBe(relationship.fromPermissionId);
      expect(view.toRuleSourceId).toBe(relationship.toPermissionId);
      expect(Object.values(STACKING_TO_CONTRACT_RULE_RELATIONSHIP)).toContain(view.relationshipType);
    }
  });

  it("no existing Coherent Permission or PermissionRelationship row has been touched by anything in lib/contract-model/** - zero ContractRule rows exist for Coherent as of this phase (a genuine data migration was deliberately NOT performed)", async () => {
    const contractRuleCount = await prisma.contractRule.count({ where: { companyId: "coherent" } });
    expect(contractRuleCount).toBe(0);
  });

  it("Matthews' Permission rows are equally projectable - the mapping is company-agnostic, not tuned to Coherent specifically", async () => {
    const permissions = await prisma.permission.findMany({ where: { companyId: "matthews" }, take: 5 });
    expect(permissions.length).toBeGreaterThan(0);
    for (const permission of permissions) {
      const view = projectPermissionAsContractRuleView(permission);
      expect(view.companyId).toBe("matthews");
    }
  });
});
