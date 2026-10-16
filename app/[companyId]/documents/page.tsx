import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { getDocumentDetails } from "@/lib/dashboard-service";
import { fmtDate } from "@/lib/format";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import { listConmedPackageFacts } from "@/lib/product/conmed-demo/covenant-catalog";
import {
  getLatestAmendmentPackage,
  listCustomerDocumentIntelligence,
} from "@/lib/product/customer-intelligence/load";
import { retryCustomerAnalysisAction } from "@/app/[companyId]/onboarding/documents/actions";
import { mapEngineLabelToCustomerStatus } from "@/lib/customer-workflow/status-contract";
import { assertCfoPageAccessOrNotFound } from "@/lib/customer-workflow/assert-page-access";

export const metadata = { title: "Headroom — Documents" };

/**
 * Documents workspace — upload, status, covenant intelligence, amendment package.
 * Access-gated before document / intelligence loaders.
 */
export default async function DocumentsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  await assertCfoPageAccessOrNotFound({ companyId });
  const documents = await getDocumentDetails(companyId);
  const intelligence = await listCustomerDocumentIntelligence(companyId);
  const intelByDoc = new Map(intelligence.map((i) => [i.documentId, i]));
  const amendment = await getLatestAmendmentPackage(companyId);
  const isConmed = companyId === CONMED_DEMO_COMPANY_ID;
  const facts = isConmed ? listConmedPackageFacts() : [];

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Upload — financing documents</div>
        <WorkflowJourney companyId={companyId} current="upload" />
        <div className="card-subtitle" style={{ marginTop: 8 }}>
          Create or extend the debt-document package. Receipt of a file is not analysis success —
          processing state, missing roles, unsupported files, and extraction errors are shown
          separately on Analyze. Public precedents never govern this package.
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button button-primary" href={`/${companyId}/onboarding/documents`}>
            Upload document
          </Link>
          <Link className="button" href={`/${companyId}/analyze`}>
            Open Analyze
          </Link>
          <Link className="button" href={`/${companyId}/ask`}>
            Ask Headroom
          </Link>
        </div>
      </Card>

      {amendment && (
        <Card>
          <div className="card-title">Amendment package</div>
          <div className="card-subtitle">{amendment.note}</div>
          <div className="row">
            <div className="row-label">Operative resolution</div>
            <div className="row-value">
              <StatusChip code={mapEngineLabelToCustomerStatus(amendment.operativeResolution)} />{" "}
              <Chip
                tone={
                  amendment.operativeResolution === "UNRESOLVED_PRECEDENCE"
                    ? "tight"
                    : amendment.operativeResolution === "RESOLVED"
                      ? "pass"
                      : "idle"
                }
              >
                {amendment.operativeResolution}
              </Chip>
            </div>
          </div>
          {amendment.unresolvedReasons.length > 0 && (
            <div className="row-note" style={{ marginTop: 8 }}>
              {amendment.unresolvedReasons.join(" · ")}
            </div>
          )}
          {amendment.provisionChangeSignals.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {amendment.provisionChangeSignals.length > 6 && (
                <div className="row-note">
                  (+{amendment.provisionChangeSignals.length - 6} more change signals)
                </div>
              )}
              {amendment.provisionChangeSignals.slice(0, 6).map((s, i) => (
                <div key={i} className="row-note">
                  <Chip tone="navy">{s.kind}</Chip> {s.evidence}
                </div>
              ))}
            </div>
          )}
          <div className="row-note" style={{ marginTop: 8 }}>
            {amendment.askGuidance}
          </div>
        </Card>
      )}

      {documents.length === 0 && (
        <Card>
          <div className="card-subtitle">No governing documents on record for this company.</div>
          <div className="button-row" style={{ marginTop: 12 }}>
            <Link className="button button-primary" href={`/${companyId}/onboarding/documents`}>
              Create / upload in workspace
            </Link>
          </div>
          {isConmed && (
            <div className="row-note" style={{ marginTop: 8 }}>
              Run <code>npm run product:setup-conmed-demo</code> (dry-run) then authorize live setup to persist the authentic CONMED package.
            </div>
          )}
        </Card>
      )}

      {documents.map((d) => {
        const intel = intelByDoc.get(d.id);
        return (
          <Card key={d.id}>
            <div className="card-title">{d.name}</div>
            <div className="card-subtitle">
              {d.type}
              {d.governs ? ` — ${d.governs}` : ""}
            </div>
            <div className="row">
              <div className="row-label">Effective from</div>
              <div className="row-value">{d.effectiveFrom ? fmtDate(d.effectiveFrom) : "Since inception"}</div>
            </div>
            <div className="row">
              <div className="row-label">Effective to</div>
              <div className="row-value">{d.effectiveTo ? fmtDate(d.effectiveTo) : "Current"}</div>
            </div>
            <div className="row">
              <div className="row-label">Modeled provisions</div>
              <div className="row-value">{d.provisionCount}</div>
            </div>
            <div className="row">
              <div className="row-label">Document intelligence</div>
              <div className="row-value">
                {intel ? (
                  <>
                    <Chip
                      tone={
                        intel.analysisOk
                          ? "pass"
                          : intel.processingStatus === "STAGED_PENDING_ANALYSIS" ||
                              intel.processingStatus === "ANALYZING"
                            ? "navy"
                            : "trip"
                      }
                    >
                      {intel.analysisOk
                        ? "ANALYZED"
                        : intel.processingStatus === "STAGED_PENDING_ANALYSIS"
                          ? "STAGED"
                          : intel.processingStatus === "ANALYZING"
                            ? "ANALYZING"
                            : intel.processingStatus === "FAILED_RETRYABLE"
                              ? "RETRYABLE"
                              : "FAILED"}
                    </Chip>{" "}
                    {intel.covenantItemCount} covenant summaries · {intel.extractionStatus}
                    {intel.processingStatus ? ` · ${intel.processingStatus}` : ""}
                    {/* Rule 88: staleness must surface on the list, not
                        only on the document page — a stale summary
                        otherwise reads as fresh ANALYZED. */}
                    {intel.analysisStale && (
                      <>
                        {" "}
                        <Chip tone="trip">STALE — re-analyze</Chip>
                      </>
                    )}
                    {/* Rule 119: rule 118's type mismatch must surface
                        on the list too — triage happens here, and a
                        mismatch hidden behind each detail page is easy
                        to miss. */}
                    {intel.declaredType && intel.documentClass && intel.documentClass !== intel.declaredType && (
                      <>
                        {" "}
                        <Chip tone="trip">TYPE MISMATCH — declared {intel.declaredType}, analyzed as {intel.documentClass}</Chip>
                      </>
                    )}
                  </>
                ) : (
                  <Chip tone="idle">Not yet analyzed</Chip>
                )}
              </div>
            </div>
            {intel && !intel.analysisOk && (
              <div className="row-note" style={{ color: "var(--color-danger, #b91c1c)" }}>
                {intel.processingStatus === "STAGED_PENDING_ANALYSIS" || intel.processingStatus === "ANALYZING"
                  ? "Durable bytes are saved; analysis is in progress or queued. Refresh shortly."
                  : `Analysis did not succeed${intel.analysisError ? `: ${intel.analysisError}` : "."} Original bytes are preserved — retry without re-upload.`}
              </div>
            )}
            <div className="button-row" style={{ marginTop: 12 }}>
              <Link className="button button-primary" href={`/${companyId}/documents/${d.id}`}>
                Open document
              </Link>
              <Link className="button" href={`/${companyId}/ask`}>
                Ask about package
              </Link>
              <Link className="button" href={`/${companyId}/covenants`}>
                View covenants
              </Link>
              {intel && (!intel.analysisOk || intel.analysisStale) && intel.storageRef && (
                <form action={retryCustomerAnalysisAction.bind(null, companyId, d.id)}>
                  <button className="button" type="submit">
                    {intel.analysisStale && intel.analysisOk ? "Re-analyze (stale)" : "Retry analysis"}
                  </button>
                </form>
              )}
            </div>
          </Card>
        );
      })}

      {facts.length > 0 && (
        <Card>
          <div className="card-title">Package relationships</div>
          <div className="card-subtitle">Source-backed package facts — not capacity determinations.</div>
          {facts.map((f) => (
            <div className="row" key={f.id}>
              <div>
                <div className="row-label">{f.id}</div>
                <div className="row-note">{f.fact}</div>
                <div className="row-note">
                  Citation: {f.evidenceCitation}{" "}
                  <Chip tone="navy">{f.clarity}</Chip>
                </div>
              </div>
              <Link className="button" href={`/${companyId}/documents/${f.demoDocumentId}`}>
                Source
              </Link>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
