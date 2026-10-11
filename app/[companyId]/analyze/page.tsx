import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { assembleCfoWorkflow } from "@/lib/customer-workflow/assemble-cfo-workflow";

export const metadata = { title: "Headroom — Analyze" };

/**
 * Analyze — extraction / operative-authority status.
 * Never implies analysis succeeded merely because a file uploaded.
 */
export default async function AnalyzePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const wf = await assembleCfoWorkflow({ companyId });
  const { analyze, upload } = wf;

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Analyze</div>
        <WorkflowJourney companyId={companyId} current="analyze" />
        <div className="card-subtitle" style={{ marginTop: 8 }}>
          Extraction and operative-authority status for the debt-document package.{" "}
          <strong>Upload is not analysis success.</strong>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="row-label">Overall</div>
          <div className="row-value">
            <StatusChip code={analyze.overallStatus} />
          </div>
        </div>
        <div className="row">
          <div className="row-label">Analyzed / pending / failed / unsupported</div>
          <div className="row-value">
            {analyze.analyzedCount} / {analyze.pendingCount} / {analyze.failedCount} /{" "}
            {analyze.unsupportedCount}
          </div>
        </div>
        {analyze.compilationLimitation && (
          <div className="row-note" style={{ marginTop: 8 }}>
            <Chip tone="tight">COMPILATION LIMITATION</Chip> {analyze.compilationLimitation}
          </div>
        )}
        <div className="row-note" style={{ marginTop: 8 }}>
          {analyze.overallGuidance}
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/documents`}>
            Back to Upload
          </Link>
          <Link className="button button-primary" href={`/${companyId}/review`}>
            Continue to Review
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Documents — processing state</div>
        <div className="card-subtitle">
          Received={upload.processingSummary.RECEIVED_NOT_ANALYZED + upload.processingSummary.STAGED} ·
          Analyzing={upload.processingSummary.ANALYZING} · Analyzed={upload.processingSummary.ANALYZED} ·
          Errors={upload.processingSummary.FAILED + upload.processingSummary.RETRYABLE} ·
          Unsupported={upload.processingSummary.UNSUPPORTED}
        </div>
        {analyze.documents.length === 0 ? (
          <div className="row-note">
            <StatusChip code="NEEDS_INPUT" compact /> No documents received yet.
          </div>
        ) : (
          analyze.documents.map((d) => (
            <div className="row" key={d.id}>
              <div>
                <div className="row-label">{d.name}</div>
                <div className="row-note">
                  Role: {d.role} · {d.processingState}
                  {d.extractionStatus ? ` · extraction ${d.extractionStatus}` : ""}
                  {d.analysisError ? ` · ${d.analysisError}` : ""}
                </div>
              </div>
              <div className="row-value">
                <StatusChip code={d.customerStatus} compact />
                {d.analysisSucceeded ? (
                  <Chip tone="pass">ANALYZED</Chip>
                ) : (
                  <Chip tone="tight">NOT ANALYSIS SUCCESS</Chip>
                )}
              </div>
            </div>
          ))
        )}
      </Card>

      {(analyze.extractionErrors.length > 0 || analyze.operativeAuthorityUncertainty.length > 0) && (
        <Card>
          <div className="card-title">Errors & operative-authority uncertainty</div>
          {analyze.extractionErrors.map((e, i) => (
            <div key={`e-${i}`} className="row-note">
              · <StatusChip code="REVIEW_REQUIRED" compact /> {e}
            </div>
          ))}
          {analyze.operativeAuthorityUncertainty.map((u, i) => (
            <div key={`u-${i}`} className="row-note">
              · <StatusChip code="AMBIGUOUS" compact /> {u}
            </div>
          ))}
        </Card>
      )}

      {upload.missingDocuments.length > 0 && (
        <Card>
          <div className="card-title">Missing document roles</div>
          {upload.missingDocuments.map((m) => (
            <div key={m} className="row-note">
              · {m}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
