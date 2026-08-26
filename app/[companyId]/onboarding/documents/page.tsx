import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { getDocumentsWithExtractionStatus } from "@/lib/onboarding/documents";
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
