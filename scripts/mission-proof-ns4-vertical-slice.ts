/**
 * End-to-end NS-4 vertical slice proof (Matthews + Coherent).
 * SYNTHETIC approval attribution for CI/local only.
 */
import { PrismaClient } from "@prisma/client";
import {
  proposeAuthenticCertificateFixtureForCompany,
  approveFceProposedCertificate,
  loadNs4DashboardFinancialState,
} from "../lib/product/north-star-workflow";

const prisma = new PrismaClient();

async function teardown(companyId: string) {
  await prisma.contractLedgerUsageEvent.deleteMany({ where: { companyId } });
  await prisma.contractLedgerUsage.deleteMany({ where: { companyId } });
  await prisma.contractInputSnapshotEvent.deleteMany({ where: { companyId } });
  await prisma.contractInputFactLocator.deleteMany({
    where: { fact: { snapshot: { companyId } } },
  });
  await prisma.contractInputFact.deleteMany({ where: { snapshot: { companyId } } });
  await prisma.contractInputSnapshot.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
}

async function prove(args: {
  companyId: string;
  name: string;
  issuer: "matthews_q1_fy2025" | "coherent_fy2026";
  evaluationDate: string;
}) {
  await teardown(args.companyId);
  await prisma.company.create({
    data: { id: args.companyId, name: args.name, tenantKind: "EVALUATION" },
  });

  const proposed = await proposeAuthenticCertificateFixtureForCompany(args.companyId, args.issuer);
  const approved = await approveFceProposedCertificate({
    companyId: args.companyId,
    snapshotId: proposed.snapshotId!,
    reviewedBy: `proof-${args.issuer}@test.local`,
    approvalRef: `apr-proof-${args.issuer}`,
    reviewedAt: `${args.evaluationDate}T12:00:00Z`,
    deliveredAsOfDate: args.evaluationDate,
  });
  const dash = await loadNs4DashboardFinancialState({
    companyId: args.companyId,
    evaluationDate: args.evaluationDate,
  });

  console.log(
    JSON.stringify(
      {
        issuer: args.issuer,
        propose: {
          ok: proposed.ok,
          status: proposed.status,
          authoritative: proposed.authoritative,
          snapshotId: proposed.snapshotId,
          authority: proposed.fixtureAuthority?.kind,
          sourceDocuments: proposed.sourceDocuments,
          factKeys: proposed.factKeys,
        },
        approve: {
          ok: approved.ok,
          status: approved.status,
          authoritative: approved.authoritative,
        },
        dashboard: {
          status: dash.status,
          cutoff: dash.cutoff,
          approvalRef: dash.boundSnapshot?.approvalRef,
          reviewedBy: dash.boundSnapshot?.reviewedBy,
          leverageIr: {
            status: dash.leverageIr.status,
            computedRatio: dash.leverageIr.computedRatio,
            components: dash.leverageIr.components,
            reportedRatioDisplay: dash.leverageIr.reportedRatioDisplay,
            formula: dash.leverageIr.formula,
            calculationSteps: dash.leverageIr.calculationSteps,
            capacitySeparationNote: dash.leverageIr.capacitySeparationNote,
          },
        },
      },
      null,
      2,
    ),
  );

  await teardown(args.companyId);
}

async function main() {
  await prove({
    companyId: "mission-ns4-matthews",
    name: "Mission Matthews",
    issuer: "matthews_q1_fy2025",
    evaluationDate: "2025-02-01",
  });
  await prove({
    companyId: "mission-ns4-coherent",
    name: "Mission Coherent",
    issuer: "coherent_fy2026",
    evaluationDate: "2026-08-01",
  });
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
