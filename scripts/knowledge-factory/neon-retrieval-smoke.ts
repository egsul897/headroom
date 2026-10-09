/**
 * Smoke retrieval/quality check over Neon KnowledgeSource covenant summaries.
 * Read-only. Does not claim legal certification accuracy.
 */
import { prisma } from "../../lib/prisma";

const QUERIES = [
  { name: "restricted_payments", re: /\brestricted\s+payment/i },
  { name: "available_amount", re: /\bavailable\s+amount\b|\bbuilder\s+basket\b/i },
  { name: "indebtedness", re: /\bindebtedness\b|\bincurrence\b/i },
  { name: "liens", re: /\bliens?\b|\bsecurity\s+interest\b/i },
  { name: "incremental", re: /\bincremental\b/i },
  { name: "intercreditor", re: /\bintercreditor\b/i },
  { name: "asset_sale", re: /\basset\s+sale\b|\bmandatory\s+prepayment\b/i },
];

async function main() {
  const rows = await prisma.knowledgeSource.findMany({
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" },
    select: {
      sourceId: true,
      issuerTicker: true,
      documentClass: true,
      documentTitle: true,
      representationLevel: true,
      metadata: true,
      provenance: true,
    },
  });

  const hits: Record<string, Array<{ sourceId: string; ticker: string | null; title: string; class: string }>> = {};
  for (const q of QUERIES) hits[q.name] = [];

  let withCitation = 0;
  let itemTotal = 0;
  let continuousExpand = 0;

  for (const r of rows) {
    if (r.provenance === "sec-edgar-continuous-expand") continuousExpand += 1;
    const m =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {};
    const summary = m.covenantSummary as { items?: Array<Record<string, unknown>> } | undefined;
    const items = Array.isArray(summary?.items) ? summary!.items! : [];
    itemTotal += items.length;
    for (const item of items) {
      const families = Array.isArray(item.families) ? item.families.join(" ") : "";
      const text = [
        item.sectionRef,
        item.category,
        item.categoryLabel,
        item.heading,
        item.plainEnglish,
        item.restriction,
        item.operativeLanguageExcerpt,
        item.sourceCitation,
        families,
        Array.isArray(item.permissions) ? item.permissions.join(" ") : "",
        Array.isArray(item.materialBasketsThresholds)
          ? item.materialBasketsThresholds.join(" ")
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      if (item.sectionRef || item.sourceCitation) withCitation += 1;
      for (const q of QUERIES) {
        if (q.re.test(text) && (hits[q.name]?.length ?? 0) < 5) {
          hits[q.name]!.push({
            sourceId: r.sourceId,
            ticker: r.issuerTicker,
            title: r.documentTitle.slice(0, 80),
            class: r.documentClass,
          });
        }
      }
    }
  }

  const report = {
    schema: "neon-retrieval-smoke.v1",
    publicSources: rows.length,
    continuousExpandSources: continuousExpand,
    covenantSummaryItems: itemTotal,
    itemsWithCitationSignal: withCitation,
    citationRate: itemTotal ? withCitation / itemTotal : 0,
    queryHits: Object.fromEntries(
      Object.entries(hits).map(([k, v]) => [k, { countSampled: v.length, sample: v }]),
    ),
    note: "Retrieval samples DISCOVERED covenant summaries — not certified operative authority",
  };
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
