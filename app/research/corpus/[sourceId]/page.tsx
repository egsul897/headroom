import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import {
  COVENANT_CATEGORY_LABELS,
  type CovenantCategoryKey,
  summarizeFromStoredMetadata,
} from "@/lib/product/covenant-intelligence/summarize";

export const metadata = { title: "Headroom — Agreement covenants" };

export default async function CorpusDocumentPage({
  params,
}: {
  params: Promise<{ sourceId: string }>;
}) {
  const { sourceId: raw } = await params;
  const sourceId = decodeURIComponent(raw);
  const row = await prisma.knowledgeSource.findUnique({ where: { sourceId } });
  if (!row) notFound();

  const summary = summarizeFromStoredMetadata(row.metadata);
  const categories = Object.keys(COVENANT_CATEGORY_LABELS) as CovenantCategoryKey[];

  return (
    <div className="stack" style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 48px" }}>
      <Card>
        <div className="card-title">{row.documentTitle}</div>
        <div className="card-subtitle">
          {row.issuerName ?? row.issuerTicker ?? row.issuerCik} · {row.documentClass} · {row.formType}
        </div>
        <div className="row">
          <div className="row-label">sourceId</div>
          <div className="row-value" style={{ fontSize: 12, wordBreak: "break-all" }}>
            {row.sourceId}
          </div>
        </div>
        <div className="row">
          <div className="row-label">Durable bytes</div>
          <div className="row-value">
            {row.storageRef ? <Chip tone="navy">BYTES_BOUND</Chip> : <Chip tone="idle">MISSING</Chip>}{" "}
            <Chip tone="idle">{row.representationLevel}</Chip>
          </div>
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href="/research/corpus">
            Back to corpus
          </Link>
          <Link
            className="button button-primary"
            href={`/research/ask?sourceId=${encodeURIComponent(row.sourceId)}`}
          >
            Ask about this agreement
          </Link>
        </div>
      </Card>

      {!summary && (
        <Card>
          <div className="card-subtitle">
            Covenant summary not yet backfilled for this source. Run{" "}
            <code>npm run kf:backfill-covenant-summaries</code>.
          </div>
        </Card>
      )}

      {summary && (
        <>
          <Card>
            <div className="card-title">Covenant intelligence</div>
            <div className="card-subtitle">{summary.note}</div>
            <div className="row">
              <div className="row-label">Discovered items</div>
              <div className="row-value">{summary.items.length}</div>
            </div>
            <div className="row">
              <div className="row-label">Defined terms sampled</div>
              <div className="row-value">{summary.definedTermsSample.length}</div>
            </div>
          </Card>

          {categories.map((cat) => {
            const items = summary.items.filter((i) => i.category === cat);
            if (items.length === 0) return null;
            return (
              <Card key={cat}>
                <div className="card-title">{COVENANT_CATEGORY_LABELS[cat]}</div>
                <div className="card-subtitle">
                  {items.length} discovered provision{items.length === 1 ? "" : "s"} — not verified legal
                  conclusions
                </div>
                {items.slice(0, 12).map((item) => (
                  <div className="row" key={`${item.sectionRef}-${item.heading}`}>
                    <div>
                      <div className="row-label">
                        {item.sectionRef} — {item.heading}
                      </div>
                      <div className="row-note">{item.plainEnglish}</div>
                      <div className="row-note" style={{ marginTop: 4 }}>
                        Operative language: “{item.operativeLanguageExcerpt.slice(0, 320)}
                        {item.operativeLanguageExcerpt.length > 320 ? "…" : ""}”
                      </div>
                      <div className="row-note">Citation: {item.sourceCitation}</div>
                      {item.relatedDefinedTerms.length > 0 && (
                        <div className="row-note">
                          Defined terms: {item.relatedDefinedTerms.join(", ")}
                        </div>
                      )}
                      <div className="row-note">
                        Unresolved: {item.unresolvedQuestions[0]}
                      </div>
                    </div>
                    <Chip tone="idle">{item.epistemicStatus}</Chip>
                  </div>
                ))}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
