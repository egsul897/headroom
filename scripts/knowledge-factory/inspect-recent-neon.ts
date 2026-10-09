import { prisma } from "../../lib/prisma";

async function main() {
  const expanded = await prisma.knowledgeSource.findMany({
    where: { provenance: { in: ["sec-edgar-continuous-expand", "ehb-handoff-consume", "cbcfl-phase2-edgar-acquisition"] } },
    select: {
      sourceId: true,
      issuerTicker: true,
      documentTitle: true,
      documentClass: true,
      provenance: true,
      createdAt: true,
      byteSize: true,
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const byProv: Record<string, number> = {};
  const byClass: Record<string, number> = {};
  for (const r of expanded) {
    byProv[r.provenance] = (byProv[r.provenance] ?? 0) + 1;
    byClass[r.documentClass] = (byClass[r.documentClass] ?? 0) + 1;
  }
  const counts = {
    knowledgeSources: await prisma.knowledgeSource.count(),
    publicSec: await prisma.knowledgeSource.count({
      where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" },
    }),
    bytes: await prisma.documentByteObject.count(),
    rels: await prisma.knowledgeRelationshipEdge.count(),
    batches: await prisma.knowledgeImportBatch.count(),
  };
  console.log(JSON.stringify({ counts, byProv, byClass, expanded }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
