/**
 * NS-4 propose path from the financial-certificate engine.
 * Extraction → DRAFT/REVIEW_REQUIRED only; never auto-APPROVED.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  runFinancialCertificateEngine,
  buildCertificateProposalFromEngine,
  proposeNs4SnapshotFromEngine,
} from "@/lib/financial-certificate-engine";
import { COHERENT_COMPLIANCE_CERTIFICATE_FY2026, COHERENT_FINANCIAL_STATEMENT_FY2026 } from "@/lib/financial-certificate-engine/fixtures";

const COMPANY_ID = "fce-ns4-propose-co";

async function cleanUp() {
  await prisma.contractInputSnapshot.deleteMany({ where: { companyId: COMPANY_ID } }).catch(() => undefined);
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("financial-certificate-engine → NS-4 propose (no auto-approve)", () => {
  beforeAll(async () => {
    await cleanUp();
    await prisma.company.create({
      data: { id: COMPANY_ID, name: "FCE NS4 Propose Co", onboardingStatus: "ONBOARDING" },
    });
  });

  afterAll(async () => {
    await cleanUp();
  });

  it("builds REVIEW_REQUIRED/DRAFT proposal and persists without APPROVED status", async () => {
    const run = runFinancialCertificateEngine({
      companyId: COMPANY_ID,
      statement: {
        documentId: "fce-stmt",
        text: COHERENT_FINANCIAL_STATEMENT_FY2026,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "fce-cert",
        text: COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-08-20T00:00:00Z"),
    });

    const cert = buildCertificateProposalFromEngine({ companyId: COMPANY_ID, run });
    expect(cert).not.toBeNull();
    expect(cert!.proposalStatus).not.toBe("APPROVED");
    expect(["DRAFT", "REVIEW_REQUIRED"]).toContain(cert!.proposalStatus);
    expect(cert!.facts.some((f) => f.key === "Consolidated EBITDA")).toBe(true);

    const proposed = await proposeNs4SnapshotFromEngine({ companyId: COMPANY_ID, run });
    expect(proposed.ok).toBe(true);
    expect(proposed.snapshotId).toBeTruthy();

    const row = await prisma.contractInputSnapshot.findFirst({
      where: { companyId: COMPANY_ID, snapshotId: proposed.snapshotId },
    });
    expect(row).not.toBeNull();
    expect(row!.status).not.toBe("APPROVED");
    expect(["DRAFT", "REVIEW_REQUIRED"]).toContain(row!.status);
  }, 60_000);
});
