/**
 * Product surfaces read Phase 3 VERIFIED SemanticTruthRecord rows via the
 * existing trust gate — never invent CERTIFIED / Phase 4E capacity.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { loadPhase3TrustedRulebookStatus } from "../../lib/product/customer-intelligence/phase3-trusted-rulebook";
import { loadCapacityReadiness } from "../../lib/product/customer-intelligence/capacity-readiness";

const COMPANY_ID = "fixture-phase3-trusted-rulebook-setup";

async function teardown() {
  await prisma.semanticTruthRecord.deleteMany({ where: { companyId: COMPANY_ID } });
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("phase3 trusted rulebook product reader", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({
      data: { id: COMPANY_ID, name: "Phase 3 trusted rulebook fixture", onboardingStatus: "ONBOARDING" },
    });
  });

  afterAll(async () => {
    await teardown();
  });

  it("returns empty when no VERIFIED units exist (fail closed)", async () => {
    const status = await loadPhase3TrustedRulebookStatus(COMPANY_ID);
    expect(status.hasTrustedSemanticUnits).toBe(false);
    expect(status.trustedUnitCount).toBe(0);
    expect(status.units).toEqual([]);
  });

  it("surfaces VERIFIED units when present without claiming capacity certification", async () => {
    await prisma.semanticTruthRecord.create({
      data: {
        companyId: COMPANY_ID,
        instrumentKey: "fixture-instrument-a",
        kind: "RULE",
        semanticObjectId: "rule-fixture-7.01",
        sourceDocumentId: "doc-fixture-a",
        sourceSectionRef: "7.01",
        sourceCitation: "§7.01",
        irSchemaVersion: "test",
        compilerAlgorithmVersion: "test",
        compilerPromptVersion: "test",
        toolPolicyVersion: "test",
        sufficiency: "COMPLETE",
        sufficiencyReasons: [],
        trustStatus: "VERIFIED",
        payloadSchemaVersion: "test",
        payload: { kind: "RULE", fixture: true },
        contentHash: "hash-rule-fixture-7.01",
        version: 1,
      },
    });
    await prisma.semanticTruthRecord.create({
      data: {
        companyId: COMPANY_ID,
        instrumentKey: "fixture-instrument-a",
        kind: "DEFINITION",
        semanticObjectId: "def-fixture-ebitda",
        sourceDocumentId: "doc-fixture-a",
        sourceSectionRef: "1.01",
        sourceCitation: "§1.01 Consolidated EBITDA",
        irSchemaVersion: "test",
        compilerAlgorithmVersion: "test",
        compilerPromptVersion: "test",
        toolPolicyVersion: "test",
        sufficiency: "COMPLETE",
        sufficiencyReasons: [],
        trustStatus: "COMPILED",
        payloadSchemaVersion: "test",
        payload: { kind: "DEFINITION", fixture: true },
        contentHash: "hash-def-fixture-ebitda",
        version: 1,
      },
    });

    const status = await loadPhase3TrustedRulebookStatus(COMPANY_ID);
    expect(status.hasTrustedSemanticUnits).toBe(true);
    expect(status.trustedUnitCount).toBe(1);
    expect(status.trustedRuleCount).toBe(1);
    expect(status.trustedDefinitionCount).toBe(0);
    expect(status.nonTrustedByStatus.COMPILED).toBe(1);
    expect(status.units[0]?.sourceSectionRef).toBe("7.01");

    const readiness = await loadCapacityReadiness(COMPANY_ID);
    expect(readiness.phase3TrustedUnitCount).toBe(1);
    expect(readiness.phase3TrustedRuleCount).toBe(1);
    expect(readiness.capacityAuthority).not.toBe("LEGACY_ENGINE"); // no financials/permissions yet
    expect(readiness.headline).toMatch(/Phase 3 trusted semantic units on file \(1 VERIFIED\)/);
    expect(readiness.headline).toMatch(/not package CERTIFIED/);
    expect(readiness.guidance).toMatch(/do not alone certify package-level or Phase 4E/);
  }, 30_000);
});
