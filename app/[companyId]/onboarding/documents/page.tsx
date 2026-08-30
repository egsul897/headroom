import Link from "next/link";
import { Card, Chip, type ChipTone } from "@/components/ui";
import { getDocumentsWithExtractionStatus } from "@/lib/onboarding/documents";
import { getLatestAnalysisRunForCompany, getAnalysisRunIssues, getAnalysisFailureLogsForCompany } from "@/lib/contract-model/analysis";
import type { AnalysisRunStatus } from "@prisma/client";
import { fmtDate } from "@/lib/format";
import { uploadDocumentAction, runExtractionAction } from "./actions";

export const metadata = { title: "Headroom — Onboarding documents" };
export const dynamic = "force-dynamic";

const DOCUMENT_TYPES: { value: string; label: string }[] = [
  { value: "CREDIT_AGREEMENT", label: "Credit Agreement" },
  { value: "INDENTURE", label: "Indenture" },
  { value: "AMENDMENT", label: "Amendment" },
  { value: "INTERCREDITOR_AGREEMENT", label: "Intercreditor Agreement" },
  { value: "COMPLIANCE_CERTIFICATE", label: "Compliance Certificate" },
  { value: "OTHER", label: "Other" },
];

// Phase 3F.1.6.RX Workstream H (AUDIT-F6 - live product-flow inevitability).
// A prior audit found this page gave the user ZERO visibility into whether
// contract-model analysis (lib/contract-model/analysis's runContractAnalysis
// - the pipeline that actually produces trusted semantic truth and
// safe-failure ClaimReviewItem rows) had ever run, was still running, or had
// failed - only the SEPARATE, older ExtractionRun/ExtractionStage chips
// above were shown, and "Continue to Review" was reachable without ever
// clicking "Run extraction" at all. This deliberately keeps the existing
// two-step upload -> run-extraction flow (a legitimate design per this
// workstream's own charter - "AS LONG AS the product's own status model
// makes the uploaded-vs-analyzed distinction real and visible, not silently
// ambiguous") and makes that distinction real: a company with documents but
// no AnalysisRun row is now visibly "not yet analyzed," not silently
// indistinguishable from "analyzed and clean."
const ANALYSIS_STATUS_TONE: Record<AnalysisRunStatus, ChipTone> = {
  PENDING: "idle",
  RUNNING: "idle",
  COMPLETED: "pass",
  COMPLETED_WITH_REVIEW: "tight",
  PARTIAL: "trip",
  FAILED: "trip",
};

async function ContractAnalysisStatusCard({ companyId }: { companyId: string }) {
  const [run, failureLogs] = await Promise.all([getLatestAnalysisRunForCompany(companyId), getAnalysisFailureLogsForCompany(companyId)]);
  const issues = run ? await getAnalysisRunIssues(run.id) : [];

  return (
    <Card>
      <div className="card-title">Contract analysis</div>
      <div className="card-subtitle">
        Runs automatically alongside extraction above (lib/contract-model/analysis) - independently discovers, compiles, and verifies covenants, and flags anything it cannot confidently represent for review. Distinct from the extraction stage
        chips above.
      </div>
      {!run ? (
        <div className="row-note">Not yet analyzed - click &ldquo;Run extraction&rdquo; on a document above to trigger it.</div>
      ) : (
        <>
          <div className="button-row" style={{ marginBottom: 8 }}>
            <Chip tone={ANALYSIS_STATUS_TONE[run.status]}>{run.status.replace(/_/g, " ")}</Chip>
            {run.reviewItemCount > 0 && <Chip tone="tight">{run.reviewItemCount} open review item(s)</Chip>}
          </div>
          <div className="row-note" style={{ marginBottom: 8 }}>
            {run.documentIds.length} document(s) · last run {run.completedAt ? fmtDate(run.completedAt) : run.startedAt ? `started ${fmtDate(run.startedAt)}` : "—"}
            {run.reviewItemCount > 0 && (
              <>
                {" · "}
                <Link href={`/${companyId}/onboarding/review`}>view findings</Link>
              </>
            )}
          </div>
          {run.status === "FAILED" && run.fatalError != null && <div className="row-note" style={{ color: "var(--color-danger, #b91c1c)" }}>Run failed: {JSON.stringify(run.fatalError)}</div>}
          {issues.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div className="row-note">{issues.length} instrument(s) failed to analyze this run (unrelated successfully-analyzed instruments are unaffected):</div>
              {issues.map((issue) => (
                <div key={issue.id} className="row-note" style={{ color: "var(--color-danger, #b91c1c)" }}>
                  {issue.instrumentKey}: {issue.errorClass} — {issue.message}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {failureLogs.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div className="row-note">{failureLogs.length} pre-analysis failure(s) (occurred before a run could be started):</div>
          {failureLogs.slice(0, 5).map((log) => (
            <div key={log.id} className="row-note" style={{ color: "var(--color-danger, #b91c1c)" }}>
              {fmtDate(log.createdAt)} · {log.errorClass} — {log.message}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default async function OnboardingDocumentsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const documents = await getDocumentsWithExtractionStatus(companyId);
  const upload = uploadDocumentAction.bind(null, companyId);

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Upload a document</div>
        <div className="card-subtitle">PDF, DOCX, or TXT. The file is stored via the configured DocumentStorageProvider, then parsed and chunked immediately.</div>
        <form action={upload} className="stack" style={{ gap: 10 }}>
          <div className="field">
            <div className="field-label">File</div>
            <div className="field-control">
              <input type="file" name="file" accept=".pdf,.docx,.txt" required />
            </div>
          </div>
          <div className="field">
            <div className="field-label">Declared type (best guess — extraction may propose a correction for review)</div>
            <div className="field-control">
              <select name="declaredType" defaultValue="CREDIT_AGREEMENT">
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <div className="field-label">Governs (optional, e.g. &ldquo;Term Loan B&rdquo;)</div>
            <div className="field-control">
              <input type="text" name="governs" />
            </div>
          </div>
          <button type="submit" className="button-primary" style={{ width: "fit-content" }}>
            Upload &amp; chunk
          </button>
        </form>
      </Card>

      {documents.map((d) => (
        <Card key={d.id}>
          <div className="card-title">{d.name}</div>
          <div className="card-subtitle">
            {d.type}
            {!d.typeConfirmedByUser && " (unconfirmed — review the DOCUMENT_RELATIONSHIP candidate to confirm)"} · {d.chunkCount} chunk(s)
            {d.uploadedAt ? ` · uploaded ${fmtDate(d.uploadedAt)}` : ""}
          </div>
          {d.latestRun ? (
            <>
              <div className="row-note" style={{ marginBottom: 4 }}>
                provider: {d.latestRun.provider} · model: {d.latestRun.model}
              </div>
              <div className="button-row" style={{ marginBottom: 8 }}>
                {d.latestRun.stages.map((s) => (
                  <Chip key={s.stage} tone={s.status === "COMPLETE" ? "pass" : s.status === "FAILED" ? "trip" : "idle"}>
                    {s.stage}: {s.status}
                  </Chip>
                ))}
              </div>
              {d.latestRun.stages
                .filter((s) => s.status === "FAILED" && s.error)
                .map((s) => (
                  <div key={s.stage} className="row-note" style={{ marginBottom: 8, color: "var(--color-danger, #b91c1c)" }}>
                    {s.stage} error: {s.error}
                  </div>
                ))}
            </>
          ) : (
            <div className="row-note" style={{ marginBottom: 8 }}>No extraction run yet.</div>
          )}
          <form action={runExtractionAction.bind(null, companyId, d.id)}>
            <button type="submit" className="button">
              {d.latestRun ? "Re-run pending/failed stages" : "Run extraction"}
            </button>
          </form>
        </Card>
      ))}

      {documents.length > 0 && <ContractAnalysisStatusCard companyId={companyId} />}

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
