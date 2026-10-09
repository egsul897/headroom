/**
 * Report Neon KnowledgeSource corpus stats (public vs total).
 * Does not print secrets.
 */
import { prisma } from "../../lib/prisma";

async function main() {
  const total = await prisma.knowledgeSource.count();
  const publicCount = await prisma.knowledgeSource.count({
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
  });
  const withHash = await prisma.knowledgeSource.count({
    where: {
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never,
      NOT: { originalBytesHash: "" },
    },
  });
  const byteObjects = await prisma.documentByteObject.count();
  const classes = await prisma.knowledgeSource.groupBy({
    by: ["documentClass"],
    _count: true,
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
  });
  const issuers = await prisma.knowledgeSource.findMany({
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
    select: { issuerCik: true },
    distinct: ["issuerCik"],
  });
  const rows = await prisma.knowledgeSource.findMany({
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
    select: { metadata: true },
  });
  let withV2 = 0;
  let withCandidates = 0;
  let itemCount = 0;
  for (const r of rows) {
    const m =
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : {};
    const summary = m.covenantSummary as { items?: unknown[] } | undefined;
    const items = summary?.items;
    if (Array.isArray(items) && items.length) {
      withV2 += 1;
      itemCount += items.length;
    }
    const analysis = m.analysis as { covenantCandidates?: number } | undefined;
    if (typeof analysis?.covenantCandidates === "number" && analysis.covenantCandidates > 0) {
      withCandidates += 1;
    }
  }
  console.log(
    JSON.stringify(
      {
        totalKnowledgeSources: total,
        publicSecEdgar: publicCount,
        withOriginalBytesHash: withHash,
        documentByteObjects: byteObjects,
        distinctIssuers: issuers.length,
        withV2Summaries: withV2,
        withCovenantCandidates: withCandidates,
        covenantSummaryItems: itemCount,
        byClass: Object.fromEntries(classes.map((c) => [c.documentClass, c._count])),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
