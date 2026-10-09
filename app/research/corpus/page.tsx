import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { listCorpusBrowseRows, loadCorpusBrowseSummary } from "@/lib/product/knowledge-corpus";

export const metadata = { title: "Headroom — Research corpus" };

/**
 * Issuer-disjoint precedent browse over persisted KnowledgeSource rows.
 * Never treats similarity as operative authority for a customer workspace.
 */
export default async function ResearchCorpusPage() {
  const summary = await loadCorpusBrowseSummary();
  const rows = await listCorpusBrowseRows(100);

  return (
    <div className="stack" style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 48px" }}>
      <Card>
        <div className="card-title">Research corpus</div>
        <div className="card-subtitle">
          Persisted debt-financing precedents from Neon KnowledgeSource. Precedents inform research —
          they do not override a company&apos;s governing documents.
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href="/">
            Home
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Coverage (source inventory, not legal truth)</div>
        <div className="row">
          <div className="row-label">KnowledgeSource rows</div>
          <div className="row-value">{summary.totalSources}</div>
        </div>
        <div className="row">
          <div className="row-label">With durable storageRef</div>
          <div className="row-value">{summary.withStorageRef}</div>
        </div>
        <div className="row">
          <div className="row-label">Distinct issuers (CIK)</div>
          <div className="row-value">{summary.distinctIssuers}</div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {summary.note}
        </div>
        {summary.totalSources === 0 && (
          <div className="row-note" style={{ marginTop: 8 }}>
            No durable KnowledgeSource rows yet. Run{" "}
            <code>npm run kf:mass-precedent-dry-run</code>, then obtain owner approval for migrate +
            bulk import.
          </div>
        )}
      </Card>

      {rows.map((r) => (
        <Card key={r.sourceId}>
          <div className="card-title">{r.documentTitle}</div>
          <div className="card-subtitle">
            {r.issuerName ?? r.issuerTicker ?? r.issuerCik} — {r.documentClass} / {r.formType}
          </div>
          <div className="row">
            <div className="row-label">sourceId</div>
            <div className="row-value" style={{ fontSize: 12, wordBreak: "break-all" }}>
              {r.sourceId}
            </div>
          </div>
          <div className="row">
            <div className="row-label">Filing</div>
            <div className="row-value">{r.filingDate}</div>
          </div>
          <div className="row">
            <div className="row-label">Evidence</div>
            <div className="row-value">
              {r.hasDurableBytes ? (
                <Chip tone="navy">BYTES_BOUND</Chip>
              ) : (
                <Chip tone="idle">METADATA_ONLY</Chip>
              )}{" "}
              <Chip tone="idle">{r.representationLevel}</Chip>{" "}
              <Chip tone="idle">{r.extractionStatus}</Chip>
            </div>
          </div>
          <div className="row">
            <div className="row-label">SHA-256</div>
            <div className="row-value" style={{ fontSize: 11, wordBreak: "break-all" }}>
              {r.originalBytesHash}
            </div>
          </div>
          {r.byteSize != null && (
            <div className="row">
              <div className="row-label">Bytes</div>
              <div className="row-value">{r.byteSize.toLocaleString()}</div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
