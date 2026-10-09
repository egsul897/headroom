import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { listCorpusBrowseRows, loadCorpusBrowseSummary } from "@/lib/product/knowledge-corpus";
import { getPrecedentIndexSummary, searchPrecedents } from "@/lib/product/precedent-search";
import { listSummariesInNeon } from "@/lib/product/covenant-intelligence/ask-retrieve";

export const metadata = { title: "Headroom — Research corpus" };

export default async function ResearchCorpusPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; family?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const family = sp.family?.trim() ?? "";

  const summary = await loadCorpusBrowseSummary();
  const rows = await listCorpusBrowseRows(100);
  const indexSummary = getPrecedentIndexSummary();
  const hits = searchPrecedents({ q: q || undefined, family: family || undefined, limit: 40 });
  const neonSummaries = await listSummariesInNeon(100);
  const withSummary = neonSummaries.filter((s) => s.candidateCount > 0).length;

  return (
    <div className="stack" style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 48px" }}>
      <Card>
        <div className="card-title">Research corpus</div>
        <div className="card-subtitle">
          Durable Neon KnowledgeSource rows with covenant intelligence. Precedents inform research —
          they do not override a company&apos;s governing documents.
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href="/">
            Home
          </Link>
          <Link className="button button-primary" href="/research/ask">
            Ask the corpus
          </Link>
          <Link className="button" href="/research/compare">
            Compare precedents
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Durable corpus</div>
        <div className="row">
          <div className="row-label">KnowledgeSource with storageRef</div>
          <div className="row-value">{summary.withStorageRef}</div>
        </div>
        <div className="row">
          <div className="row-label">Substantive financing precedents</div>
          <div className="row-value">{summary.substantiveFinancingSources}</div>
        </div>
        <div className="row">
          <div className="row-label">Non-financing exhibits (excluded from browse)</div>
          <div className="row-value">{summary.nonFinancingExhibits}</div>
        </div>
        <div className="row">
          <div className="row-label">With covenant summaries (substantive)</div>
          <div className="row-value">{withSummary}</div>
        </div>
        <div className="row">
          <div className="row-label">Distinct issuers (substantive)</div>
          <div className="row-value">{summary.distinctIssuers}</div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {summary.note}
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
            Local index: {indexSummary.totals!.sources} sources · {indexSummary.totals!.definitions}{" "}
            definitions · {indexSummary.totals!.covenantCandidates} candidates
          </div>
        ) : null}
      </Card>

      {hits.length > 0 && (
        <Card>
          <div className="card-title">Index hits ({hits.length})</div>
          {hits.map((h) => (
            <div className="row" key={h.sourceId}>
              <div>
                <div className="row-label">{h.title}</div>
                <div className="row-note">
                  {h.issuer} — {h.documentClass}
                </div>
              </div>
              <Link className="button" href={`/research/corpus/${encodeURIComponent(h.sourceId)}`}>
                Open
              </Link>
            </div>
          ))}
        </Card>
      )}

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
          <div className="button-row" style={{ marginTop: 8 }}>
            <Link
              className="button button-primary"
              href={`/research/corpus/${encodeURIComponent(r.sourceId)}`}
            >
              Covenant summary
            </Link>
            <Link
              className="button"
              href={`/research/ask?sourceId=${encodeURIComponent(r.sourceId)}`}
            >
              Ask
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
