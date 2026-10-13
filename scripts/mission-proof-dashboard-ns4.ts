/**
 * One-shot numerical proof for Dashboard NS-4 Neon read path.
 * SYNTHETIC only. Not a production entrypoint.
 */
import { PrismaClient } from "@prisma/client";
import {
  proposeSyntheticCertificateForCompany,
  approveWorkspaceCertificate,
  loadNs4DashboardFinancialState,
} from "../lib/product/north-star-workflow";

const CO = "mission-proof-dash-ns4";
const prisma = new PrismaClient();

async function teardown() {
  await prisma.contractLedgerUsageEvent.deleteMany({ where: { companyId: CO } });
  await prisma.contractLedgerUsage.deleteMany({ where: { companyId: CO } });
  await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId: CO } });
  await prisma.contractInputFactLocator.deleteMany({
    where: { fact: { snapshot: { companyId: CO } } },
  });
  await prisma.contractInputFact.deleteMany({ where: { snapshot: { companyId: CO } } });
  await prisma.contractInputSnapshot.deleteMany({ where: { companyId: CO } });
  await prisma.company.deleteMany({ where: { id: CO } });
}

async function main() {
  await teardown();
  await prisma.company.create({
    data: { id: CO, name: "Mission Proof Co", tenantKind: "EVALUATION" },
  });

  const empty = await loadNs4DashboardFinancialState({ companyId: CO });
  console.log(
    "EMPTY",
    JSON.stringify(
      { status: empty.status, authority: empty.authority, missing: empty.missingInputs },
      null,
      2,
    ),
  );

  const proposed = await proposeSyntheticCertificateForCompany(CO, {
    snapshotId: "snap-mission-q2",
    reportingPeriod: "FY2026-Q2",
    asOf: "2026-06-30",
  });
  await approveWorkspaceCertificate({
    companyId: CO,
    snapshotId: proposed.snapshotId,
    reviewedBy: "mission",
    approvalRef: "apr-mission",
    reviewedAt: "2026-07-20T18:00:00Z",
  });

  const bound = await loadNs4DashboardFinancialState({
    companyId: CO,
    evaluationDate: "2026-08-01",
  });
  console.log(
    "BOUND",
    JSON.stringify(
      {
        status: bound.status,
        authority: bound.authority,
        cutoff: bound.cutoff,
        snapshotId: bound.boundSnapshot?.snapshotId,
        period: bound.boundSnapshot?.reportingPeriod,
        asOf: bound.boundSnapshot?.asOf,
        facts: bound.boundSnapshot?.facts.map((f) => ({
          key: f.key,
          value: f.displayValue,
          currency: f.currency,
          type: f.valueType,
        })),
      },
      null,
      2,
    ),
  );

  await teardown();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
