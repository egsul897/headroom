/**
 * Reclassify Neon PUBLIC_SEC_EDGAR sources currently UNKNOWN using title/filename
 * metadata only (no SEC network). Requires KF_MASS_PRECEDENT_LIVE_WRITE gate.
 */
import { classifyDebtDocument } from "../../lib/knowledge-factory/classify/debt-document";
import { prisma } from "../../lib/prisma";

const LIVE_ENV = "KF_MASS_PRECEDENT_LIVE_WRITE";
const LIVE_TOKEN = "I_AUTHORIZE_NEON_BULK_WRITE";

async function main() {
  if (process.env[LIVE_ENV] !== LIVE_TOKEN) {
    console.error(`Refusing without ${LIVE_ENV}=${LIVE_TOKEN}`);
    process.exit(2);
  }
  const dry = process.argv.includes("--dry-run");
  const rows = await prisma.knowledgeSource.findMany({
    where: {
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never,
      documentClass: "UNKNOWN" as never,
    },
    select: {
      sourceId: true,
      documentTitle: true,
      exhibitFilename: true,
      formType: true,
      metadata: true,
    },
  });
  const stats: Record<string, number> = { scanned: rows.length, changed: 0, unchanged: 0 };
  for (const row of rows) {
    const result = classifyDebtDocument({
      title: row.documentTitle ?? "",
      description: row.documentTitle ?? "",
      filename: row.exhibitFilename ?? "",
      exhibitType: row.formType ?? "",
    });
    if (result.documentClass === "UNKNOWN") {
      stats.unchanged += 1;
      continue;
    }
    stats.changed += 1;
    stats[`to_${result.documentClass}`] = (stats[`to_${result.documentClass}`] ?? 0) + 1;
    console.log(`${dry ? "DRY" : "UPD"} ${row.sourceId} -> ${result.documentClass} (${result.signals.join(",")})`);
    if (!dry) {
      await prisma.knowledgeSource.update({
        where: { sourceId: row.sourceId },
        data: { documentClass: result.documentClass as never },
      });
    }
  }
  console.log(JSON.stringify({ dry, stats }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
