import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import {
  COVENANT_CATEGORY_LABELS,
  type CovenantCategoryKey,
  summarizeFromStoredMetadata,
} from "@/lib/product/covenant-intelligence/summarize";

export const metadata = { title: "Headroom — Precedent comparison" };

/**
 * Cross-document category comparison across durable corpus summaries.
 * Similarity is not operative authority.
 */
export default async function ComparePrecedentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const sp = await searchParams;
  const category = (sp.category?.trim().toUpperCase() || "RESTRICTED_PAYMENTS_INVESTMENTS") as CovenantCategoryKey;
  const rows = await prisma.knowledgeSource.findMany({
    where: { storageRef: { not: null } },
    take: 80,
    orderBy: { filingDate: "desc" },
  });

  const hits: Array<{
    sourceId: string;
    title: string;
    issuer: string;
    sectionRef: string;
    excerpt: string;
  }> = [];

  for (const row of rows) {
    const summary = summarizeFromStoredMetadata(row.metadata);
    if (!summary) continue;
    for (const item of summary.items.filter((i) => i.category === category).slice(0, 2)) {
      hits.push({
        sourceId: summary.sourceId,
        title: summary.governingAgreement,
        issuer: summary.issuerName ?? summary.issuerCik,
        sectionRef: item.sectionRef,
        excerpt: item.operativeLanguageExcerpt.slice(0, 280),
      });
    }
  }

  const cats = Object.keys(COVENANT_CATEGORY_LABELS) as CovenantCategoryKey[];

  return (
    <div className="stack" style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 48px" }}>
      <Card>
        <div className="card-title">Cross-document precedent comparison</div>
        <div className="card-subtitle">
          Discovered provisions by category across the durable corpus. Similarity is not operative
          authority for any customer.
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href="/research/corpus">
            Corpus
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Category</div>
        <div className="button-row">
          {cats.slice(0, 8).map((c) => (
            <Link
              key={c}
              className="button"
              href={`/research/compare?category=${encodeURIComponent(c)}`}
            >
              {COVENANT_CATEGORY_LABELS[c]}
            </Link>
          ))}
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          Showing: {COVENANT_CATEGORY_LABELS[category] ?? category} · {hits.length} excerpts
        </div>
      </Card>

      {hits.map((h, idx) => (
        <Card key={`${h.sourceId}-${idx}`}>
          <div className="card-title">{h.title}</div>
          <div className="card-subtitle">
            {h.issuer} · {h.sectionRef}
          </div>
          <div className="row-note">“{h.excerpt}…”</div>
          <div className="button-row" style={{ marginTop: 8 }}>
            <Chip tone="idle">DISCOVERED_CANDIDATE</Chip>
            <Link className="button" href={`/research/corpus/${encodeURIComponent(h.sourceId)}`}>
              Open agreement
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}
