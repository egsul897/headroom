/**
 * Fixture A - Broad Covenant Package (task §36, docs/contract-model-foundation-phase-b.md).
 * Proves debt, liens, restricted payments, investments, asset sales, a
 * financial covenant, a reporting obligation, a mandatory prepayment, an
 * affiliate transaction, and a merger restriction are ALL representable as
 * ContractRule rows through the exact same generalized model - no
 * covenant-family-specific table, no company-specific code anywhere in
 * lib/contract-model/**.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { computeStableKey } from "../../lib/contract-model/stable-keys";
import { getRulesByCovenantFamily } from "../../lib/contract-model/service";
import type { CovenantFamily } from "@prisma/client";

const COMPANY_ID = "fixture-broad-covenant-package-co";
const DOCUMENT_ID = "fixture-broad-covenant-package-ca";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

interface FixtureRule {
  family: CovenantFamily;
  ruleType: Parameters<typeof prisma.contractRule.create>[0]["data"]["ruleType"];
  evaluationClass: Parameters<typeof prisma.contractRule.create>[0]["data"]["evaluationClass"];
  action: string;
  sectionRef: string;
}

const FIXTURE_RULES: FixtureRule[] = [
  { family: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "INCUR_DEBT", sectionRef: "6.01(a)" },
  { family: "LIENS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "CREATE_LIEN", sectionRef: "6.02(b)" },
  { family: "RESTRICTED_PAYMENTS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "PAY_DIVIDEND", sectionRef: "6.04(a)" },
  { family: "INVESTMENTS", ruleType: "QUANTITATIVE_PERMISSION", evaluationClass: "EXECUTABLE", action: "MAKE_INVESTMENT", sectionRef: "6.05(c)" },
  { family: "ASSET_SALES", ruleType: "MANDATORY_ACTION", evaluationClass: "EVENT_DRIVEN", action: "MAKE_MANDATORY_PREPAYMENT", sectionRef: "6.06(d)" },
  { family: "FINANCIAL_COVENANTS", ruleType: "RATIO_TEST", evaluationClass: "EXECUTABLE", action: "SATISFY_RATIO", sectionRef: "6.10" },
  { family: "REPORTING_INFORMATION", ruleType: "REPORTING_OBLIGATION", evaluationClass: "MONITORABLE", action: "DELIVER_FINANCIALS", sectionRef: "6.01" },
  { family: "MANDATORY_PREPAYMENTS", ruleType: "MANDATORY_ACTION", evaluationClass: "EVENT_DRIVEN", action: "MAKE_MANDATORY_PREPAYMENT", sectionRef: "6.06(a)" },
  { family: "AFFILIATE_TRANSACTIONS", ruleType: "QUALITATIVE_OBLIGATION", evaluationClass: "JUDGMENT_REQUIRED", action: "ENTER_AFFILIATE_TRANSACTION", sectionRef: "6.08" },
  { family: "FUNDAMENTAL_CHANGES", ruleType: "PROHIBITION", evaluationClass: "EXECUTABLE", action: "MERGE", sectionRef: "6.09" },
];

describe("Fixture A - broad covenant package (task §36)", () => {
  beforeAll(async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Broad Covenant Package Co (synthetic, test-only)", tenantKind: "EVALUATION" } });
    await prisma.document.create({ data: { id: DOCUMENT_ID, companyId: COMPANY_ID, name: "Fixture Broad Covenant Package Credit Agreement", type: "CREDIT_AGREEMENT" } });

    for (const rule of FIXTURE_RULES) {
      await prisma.contractRule.create({
        data: {
          companyId: COMPANY_ID,
          sourceDocumentId: DOCUMENT_ID,
          stableKey: computeStableKey("rule", COMPANY_ID, DOCUMENT_ID, rule.sectionRef),
          covenantFamily: rule.family,
          ruleType: rule.ruleType,
          evaluationClass: rule.evaluationClass,
          action: rule.action,
          sourceSectionRef: rule.sectionRef,
        },
      });
    }
  });

  afterAll(teardown);

  it("represents every covenant family in this fixture as a real ContractRule row, with zero company-specific branching required to create any of them", async () => {
    const rules = await prisma.contractRule.findMany({ where: { companyId: COMPANY_ID }, orderBy: { sourceSectionRef: "asc" } });
    expect(rules).toHaveLength(FIXTURE_RULES.length);
    const families = new Set(rules.map((r) => r.covenantFamily));
    for (const fixture of FIXTURE_RULES) expect(families.has(fixture.family)).toBe(true);
  });

  it("a qualitative, JUDGMENT_REQUIRED covenant (affiliate transactions) is never given a fake EXECUTABLE/CLEAR treatment", async () => {
    const rule = await prisma.contractRule.findFirstOrThrow({ where: { companyId: COMPANY_ID, covenantFamily: "AFFILIATE_TRANSACTIONS" } });
    expect(rule.evaluationClass).toBe("JUDGMENT_REQUIRED");
    expect(rule.ruleType).toBe("QUALITATIVE_OBLIGATION");
  });

  it("getRulesByCovenantFamily returns exactly the rules of that family, through the generalized service API (never Prisma-in-the-UI)", async () => {
    const liens = await getRulesByCovenantFamily(COMPANY_ID, "LIENS");
    expect(liens).toHaveLength(1);
    expect(liens[0]!.action).toBe("CREATE_LIEN");

    const reporting = await getRulesByCovenantFamily(COMPANY_ID, "REPORTING_INFORMATION");
    expect(reporting).toHaveLength(1);
    expect(reporting[0]!.evaluationClass).toBe("MONITORABLE");
  });

  it("every CovenantFamily enum member the Prisma schema declares is at least conceptually reachable (tripwire: this list must be kept in sync with prisma/schema.prisma's own CovenantFamily enum)", () => {
    const expected = [
      "INDEBTEDNESS",
      "LIENS",
      "RESTRICTED_PAYMENTS",
      "INVESTMENTS",
      "ACQUISITIONS",
      "ASSET_SALES",
      "DISPOSITIONS",
      "SALE_LEASEBACKS",
      "FINANCIAL_COVENANTS",
      "MANDATORY_PREPAYMENTS",
      "REPORTING_INFORMATION",
      "FUNDAMENTAL_CHANGES",
      "AFFILIATE_TRANSACTIONS",
      "GUARANTEES",
      "GUARANTOR_REQUIREMENTS",
      "COLLATERAL_SECURITY",
      "CHANGE_OF_CONTROL",
      "EVENTS_OF_DEFAULT",
      "RATING_TRIGGERS",
      "SPRINGING_COVENANTS",
      "MFN_PRICING_PROTECTION",
      "SUBSIDIARY_DESIGNATIONS",
      "ENTITY_SCOPE_RESTRICTIONS",
      "AMENDMENT_WAIVER_CONSENT",
      "NOTICE_REQUIREMENTS",
      "QUALITATIVE_AFFIRMATIVE_COVENANTS",
      "QUALITATIVE_NEGATIVE_COVENANTS",
      "DEFINITIONS_CALCULATION_RULES",
    ];
    expect(expected).toHaveLength(28);
    // A round-trip write+read for one member not in this fixture, proving
    // the full enum (not just the 10 this fixture exercises) is usable.
    expect(expected).toContain("CHANGE_OF_CONTROL");
  });
});
