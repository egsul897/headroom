import Link from "next/link";
import { Card, Chip, type ChipTone } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { listCompanySourceConnections } from "@/lib/connectors/registry";
import { prisma } from "@/lib/prisma";
import { connectEdgarAction, connectAndSyncCsvAction, syncConnectionAction } from "./actions";

export const metadata = { title: "Headroom — Connect sources" };
export const dynamic = "force-dynamic";

/**
 * Bare-minimum "Connect Source" UI (docs/autonomous-retrieval-phase-a-foundation.md).
 * Deliberately not polished - a functional exercise surface for the
 * connector/registry/ingestion foundation this phase builds, not the
 * review-queue/reconciliation UI Phase B owns.
 */
const STATUS_TONE: Record<string, ChipTone> = { CONNECTED: "pass", ERROR: "trip", DISCONNECTED: "idle" };
const STAGE_TONE: Record<string, ChipTone> = { COMPLETE: "pass", FAILED: "trip", IN_PROGRESS: "tight", PENDING: "idle" };

export default async function OnboardingSourcesPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const connections = await listCompanySourceConnections(companyId);
  const recentJobs = await prisma.ingestionJob.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { stages: { orderBy: { id: "asc" } }, sourceConnection: { select: { provider: true, connectorType: true } } },
  });

  const connectEdgar = connectEdgarAction.bind(null, companyId);
  const connectAndSyncCsv = connectAndSyncCsvAction.bind(null, companyId);

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Connected sources</div>
        <div className="card-subtitle">A company&rsquo;s document upload is already a first-class source connection here, alongside EDGAR/CSV - not a special case.</div>
        {connections.length === 0 ? (
          <div className="row-note">No source connections yet - connect EDGAR or upload a CSV below. A DOCUMENT_UPLOAD connection is created automatically the first time a document is uploaded.</div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {connections.map((c) => (
              <div key={c.id} className="onboarding-stage" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {c.provider} <Chip tone={STATUS_TONE[c.status] ?? "idle"}>{c.status}</Chip>
                  </div>
                  <div className="row-note">
                    {c.connectorType} · capabilities: {c.capabilities.join(", ") || "none"} · {c.lastSuccessfulSyncAt ? `last synced ${fmtDate(c.lastSuccessfulSyncAt)}` : "never synced"}
                    {c.errorState ? ` · error: ${c.errorState}` : ""}
                  </div>
                </div>
                {c.connectorType === "EDGAR" && (
                  <form action={syncConnectionAction.bind(null, companyId, c.id)}>
                    <button type="submit" className="button">
                      {c.lastSuccessfulSyncAt ? "Sync now" : "Initialize"}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="card-title">Connect SEC EDGAR</div>
        <div className="card-subtitle">Public filings only, no credential required. Discovers 8-K/10-K/10-Q exhibits matching Credit Agreement/Indenture/Amendment/Intercreditor.</div>
        <form action={connectEdgar} className="stack" style={{ gap: 10 }}>
          <div className="field">
            <div className="field-label">Ticker</div>
            <div className="field-control">
              <input type="text" name="ticker" placeholder="e.g. AAL" required />
            </div>
          </div>
          <button type="submit" className="button-primary" style={{ width: "fit-content" }}>
            Connect
          </button>
        </form>
      </Card>

      <Card>
        <div className="card-title">Connect financial figures (CSV)</div>
        <div className="card-subtitle">Header row: metricName,value,asOfDate,unit,notes. Uploading runs the full ingestion job immediately - each valid row becomes a reviewable FINANCIAL_FACT candidate.</div>
        <form action={connectAndSyncCsv} className="stack" style={{ gap: 10 }}>
          <div className="field">
            <div className="field-label">File</div>
            <div className="field-control">
              <input type="file" name="file" accept=".csv" required />
            </div>
          </div>
          <button type="submit" className="button-primary" style={{ width: "fit-content" }}>
            Upload &amp; ingest
          </button>
        </form>
      </Card>

      {recentJobs.length > 0 && (
        <Card>
          <div className="card-title">Recent ingestion jobs</div>
          <div className="stack" style={{ gap: 8 }}>
            {recentJobs.map((job) => (
              <div key={job.id} className="onboarding-stage" style={{ display: "block" }}>
                <div style={{ fontWeight: 600 }}>
                  {job.sourceConnection?.provider ?? "unknown source"} — {job.kind}
                </div>
                <div className="row-note" style={{ marginBottom: 6 }}>{fmtDate(job.createdAt)}</div>
                <div className="button-row">
                  {job.stages.map((s) => (
                    <Chip key={s.id} tone={STAGE_TONE[s.status] ?? "idle"}>
                      {s.stage}: {s.status} ({s.recordsChanged}/{s.recordsDiscovered})
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="button-row">
          <Link href={`/${companyId}/onboarding/review`} className="button button-primary" style={{ textDecoration: "none" }}>
            Continue to Review
          </Link>
          <Link href={`/${companyId}/onboarding`} className="button" style={{ textDecoration: "none" }}>
            Back to onboarding wizard
          </Link>
        </div>
      </Card>
    </div>
  );
}
