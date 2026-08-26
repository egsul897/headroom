/**
 * Stable-key and replay-safety proof (task §48/§49, docs/contract-model-foundation-phase-b.md).
 * "Fresh database -> different generated row IDs -> same stable contractual
 * keys." Simulates a fresh-environment replay by deleting and recreating
 * the same fixture (new cuids every time, since Prisma generates a fresh
 * one on every create()) and proving the stableKey stays identical, while
 * confirming a mutable field (reviewStatus/confidence) never changes
 * identity and a real content change DOES.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";

const COMPANY_ID = "fixture-stable-keys-replay-co";
const DOCUMENT_ID = "fixture-stable-keys-replay-ca";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

async function seedOnce() {
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Stable Keys Replay Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
  await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Stable Keys Replay Credit Agreement", type: "CREDIT_AGREEMENT" } });
  return prisma.contractRule.create({
    data: {
      companyId: COMPANY_ID,
      sourceDocumentId: DOCUMENT_ID,
      stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "6.01(a)"),
      covenantFamily: "INDEBTEDNESS",
      ruleType: "QUANTITATIVE_PERMISSION",
      evaluationClass: "EXECUTABLE",
      action: "INCUR_DEBT",
      sourceSectionRef: "6.01(a)",
      reviewStatus: "PENDING",
    },
  });
}

describe("Stable keys / replay safety (task §48/§49)", () => {
  beforeEach(teardown);
  afterEach(teardown);

  it("computeStableKey is a pure function of its inputs - identical inputs always produce the identical key across independent calls", () => {
    const a = computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "6.01(a)");
    const b = computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "6.01(a)");
    expect(a).toBe(b);
  });

  it("a fresh-database replay produces a DIFFERENT generated row id but the IDENTICAL stableKey", async () => {
    const firstRun = await seedOnce();
    const firstId = firstRun.id;
    const firstStableKey = firstRun.stableKey;

    await teardown(); // simulates dropping/recreating the database
    const secondRun = await seedOnce();

    expect(secondRun.id).not.toBe(firstId); // cuid() is random every time - this is the replay problem stable keys exist to solve
    expect(secondRun.stableKey).toBe(firstStableKey);
  });

  it("changing reviewStatus/confidence does NOT change the stableKey - identity is independent of review state", async () => {
    const rule = await seedOnce();
    const originalStableKey = rule.stableKey;
    const updated = await prisma.contractRule.update({ where: { id: rule.id }, data: { reviewStatus: "APPROVED", coverageStatus: "FULLY_MODELED" } });
    expect(updated.stableKey).toBe(originalStableKey);
    expect(updated.id).toBe(rule.id);
  });

  it("changing the canonical source identity (a different section reference) DOES produce a different stableKey - it is a genuinely different provision", () => {
    const original = computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "6.01(a)");
    const differentSection = computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "6.01(b)");
    expect(original).not.toBe(differentSection);
  });

  it("stableKey uniqueness is enforced by the database itself, per company (task §@@unique constraint) - a duplicate insert is rejected, not silently overwritten", async () => {
    await seedOnce();
    await expect(
      prisma.contractRule.create({
        data: {
          companyId: COMPANY_ID,
          sourceDocumentId: DOCUMENT_ID,
          stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, "6.01(a)"), // deliberately identical to seedOnce()'s own key
          covenantFamily: "LIENS",
          ruleType: "QUANTITATIVE_PERMISSION",
          evaluationClass: "EXECUTABLE",
          action: "CREATE_LIEN",
          sourceSectionRef: "6.02",
        },
      })
    ).rejects.toThrow();
  });

  it("the same stableKey scheme, applied to two DIFFERENT companies, never collides - keys are scoped by companyId as an input, not just a uniqueness constraint", () => {
    const forCompanyA = computeStableKey("rule", "company-a", DOCUMENT_ID, "6.01(a)");
    const forCompanyB = computeStableKey("rule", "company-b", DOCUMENT_ID, "6.01(a)");
    expect(forCompanyA).not.toBe(forCompanyB);
  });
});
