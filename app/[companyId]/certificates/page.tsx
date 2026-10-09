import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { loadApprovedSnapshotsFromPrisma } from "@/lib/contract-model/runtime/input/store";
import { loadLedgerUsagesFromPrisma } from "@/lib/contract-model/runtime/capacity/store";
import { loadTransactionWorkflowReadiness } from "@/lib/product/north-star-workflow";
import { CertificatesClient } from "./CertificatesClient";

export const metadata = { title: "Headroom — Certificates & reporting" };

/**
 * Customer Sources / Reporting / Certificates surface (North Star).
 * Approves periodic financial snapshots — not continuous monitoring.
 */
export default async function CertificatesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [allRows, approved, ledger, workflow] = await Promise.all([
    prisma.contractInputSnapshot.findMany({
      where: { companyId },
      include: { _count: { select: { facts: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    loadApprovedSnapshotsFromPrisma(prisma, companyId),
    loadLedgerUsagesFromPrisma(prisma, companyId),
    loadTransactionWorkflowReadiness(companyId),
  ]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card>
        <div className="card-title">Certificates & reporting cutoffs</div>
        <div className="card-subtitle">
          Approve dated compliance-certificate facts into the North-Star financial store. Headroom does not sync ERP or
          invent the latest quarter.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Workflow</div>
          <div className="row-value">
            <Chip tone={workflow.canRunTransactionWorkflow ? "pass" : "tight"}>
              {workflow.canRunTransactionWorkflow ? "TRANSACTION_READY" : "NEEDS_INPUT"}
            </Chip>
          </div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          APPROVED snapshots: {approved.length} · Contract ledger (active):{" "}
          {ledger.filter((u) => u.status !== "SUPERSEDED").length} · Cutoff: {workflow.cutoff?.state ?? "n/a"}
          {workflow.cutoff?.reportingPeriodKey ? ` (${workflow.cutoff.reportingPeriodKey})` : ""}
        </div>
        <div className="row-note">{workflow.authorityNote}</div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/ask`}>
            Ask Headroom
          </Link>
          <Link className="button" href={`/${companyId}/capacity`}>
            Capacity
          </Link>
          <Link className="button" href={`/${companyId}/intelligence`}>
            Intelligence
          </Link>
          <Link className="button" href={`/${companyId}/feeds`}>
            Legacy Feeds
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Certificate proposals</div>
        <CertificatesClient
          companyId={companyId}
          snapshots={allRows.map((r) => ({
            snapshotId: r.snapshotId,
            status: r.status,
            reportingPeriod: r.reportingPeriod,
            asOf: r.asOf,
            approvalRef: r.approvalRef,
            factCount: r._count.facts,
          }))}
        />
      </Card>
    </div>
  );
}
