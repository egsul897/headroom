import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { SyntheticExtractionProvider } from "../../lib/extraction/synthetic-provider";
import { uploadAndChunkDocument, runExtractionForDocument } from "../../lib/onboarding/documents";
import { proposeFinancialFactsFromDocument } from "../../lib/onboarding/financial-facts-from-document";

const COMPANY_ID = "saas-setup-certificate-facts";

const CERTIFICATE = `COMPLIANCE CERTIFICATE
As of June 30, 2026

Consolidated EBITDA: $1,700 million
Total Debt: $3,258 million
Secured Debt: $2,221 million
Unrestricted Cash: $1,162 million
Interest Expense: $190 million
`;

async function cleanUp() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("compliance certificate → FINANCIAL_FACT candidates", () => {
  beforeAll(async () => {
    await cleanUp();
    await prisma.company.create({
      data: { id: COMPANY_ID, name: "SaaS Setup Certificate Co", onboardingStatus: "ONBOARDING" },
    });
  });

  afterAll(async () => {
    await cleanUp();
  });

  it("proposes reviewable facts after extraction, never auto-approved", async () => {
    const { document } = await uploadAndChunkDocument({
      companyId: COMPANY_ID,
      filename: "compliance-certificate.txt",
      data: Buffer.from(CERTIFICATE),
      declaredType: "COMPLIANCE_CERTIFICATE",
    });
    await runExtractionForDocument({
      companyId: COMPANY_ID,
      documentId: document.id,
      provider: new SyntheticExtractionProvider(),
      providerName: "synthetic",
      model: "n/a",
    });
    const created = await proposeFinancialFactsFromDocument(COMPANY_ID, document.id);
    expect(created).toBeGreaterThanOrEqual(4);

    const facts = await prisma.extractionCandidate.findMany({
      where: { companyId: COMPANY_ID, kind: "FINANCIAL_FACT" },
    });
    expect(facts.every((f) => f.reviewStatus === "PENDING" || f.reviewStatus === "REVIEW_REQUIRED")).toBe(true);
    expect(facts.every((f) => f.promotedAt == null)).toBe(true);
    const names = facts.map((f) => (f.proposedValue as { metricName: string }).metricName);
    expect(names).toEqual(expect.arrayContaining(["covenant_ebitda", "total_debt", "cash"]));
  }, 30_000);
});
