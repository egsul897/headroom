import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { listCorpusBrowseRows, loadCorpusBrowseSummary } from "@/lib/product/knowledge-corpus";
import { getPrecedentIndexSummary, searchPrecedents } from "@/lib/product/precedent-search";

export const metadata = { title: "Headroom — Research corpus" };

/**
 * Issuer-disjoint precedent browse + search over retrieval index / Neon KnowledgeSource.
 * Never treats similarity as operative authority for a customer workspace.
 */
export default async function ResearchCorpusPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; family?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const family = sp.family?.trim() ?? "";

  const summary = await loadCorpusBrowseSummary();
  const rows = await listCorpusBrowseRows(50);
  const indexSummary = getPrecedentIndexSummary();
  const hits = searchPrecedents({ q: q || undefined, family: family || undefined, limit: 40 });

  return (
    <div className="stack" style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 48px" }}>
      <Card>
        <div className="card-title">Research corpus</div>
        <div className="card-subtitle">
          Persisted Neon KnowledgeSource rows and the local precedent retrieval index. Precedents
          inform research — they do not override a company&apos;s governing documents.
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href="/">
            Home
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Search precedents</div>
        <form method="get" action="/research/corpus" className="stack" style={{ gap: 8 }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="Defined term, family, issuer, title…"
            style={{ padding: "10px 12px", border: "1px solid var(--border, #ccc)", width: "100%" }}
          />
          <input
            name="family"
            defaultValue={family}
            placeholder="Covenant family filter (optional)"
            style={{ padding: "10px 12px", border: "1px solid var(--border, #ccc)", width: "100%" }}
          />
          <button className="button button-primary" type="submit">
            Search index
          </button>
        </form>
        {indexSummary.available ? (
          <div className="row-note" style={{ marginTop: 8 }}>
            Index: {indexSummary.totals!.sources} sources · {indexSummary.totals!.definitions}{" "}
            definitions · {indexSummary.totals!.covenantCandidates} covenant candidates ·{" "}
            {indexSummary.totals!.distinctIssuers} issuers
          </div>
        ) : (
          <div className="row-note" style={{ marginTop: 8 }}>
            {indexSummary.note}
          </div>
        )}
      </Card>

      {hits.length > 0 && (
        <Card>
          <div className="card-title">Index hits ({hits.length})</div>
          {hits.map((h) => (
            <div className="row" key={h.sourceId}>
              <div>
                <div className="row-label">{h.title}</div>
                <div className="row-note">
                  {h.issuer} — {h.documentClass} — {h.filingDate}
                </div>
                <div className="row-note" style={{ wordBreak: "break-all" }}>
                  {h.sourceId}
                </div>
                {h.families.length > 0 && (
                  <div className="row-note">Families: {h.families.slice(0, 6).join(", ")}</div>
                )}
                {h.definitionHits.length > 0 && (
                  <div className="row-note">Terms: {h.definitionHits.join(", ")}</div>
                )}
              </div>
              <div>
                <Chip tone="idle">score {h.score}</Chip>{" "}
                <Chip tone="idle">{h.representationLevel}</Chip>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div className="card-title">Neon KnowledgeSource (durable)</div>
        <div className="row">
          <div className="row-label">Rows</div>
          <div className="row-value">{summary.totalSources}</div>
        </div>
        <div className="row">
          <div className="row-label">With storageRef</div>
          <div className="row-value">{summary.withStorageRef}</div>
        </div>
        <div className="row">
          <div className="row-label">Distinct issuers</div>
          <div className="row-value">{summary.distinctIssuers}</div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {summary.note}
        </div>
        {summary.totalSources === 0 && (
          <div className="row-note" style={{ marginTop: 8 }}>
            Neon durable persist blocked pending owner migrate + LIVE WRITE approval. Local index
            still searchable above.
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
            <div className="row-label">Evidence</div>
            <div className="row-value">
              {r.hasDurableBytes ? (
                <Chip tone="navy">BYTES_BOUND</Chip>
              ) : (
                <Chip tone="idle">METADATA_ONLY</Chip>
              )}{" "}
              <Chip tone="idle">{r.representationLevel}</Chip>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
