/**
 * Reclassify Neon PUBLIC_SEC_EDGAR sources currently UNKNOWN using title/filename
 * and optional BYTEA text samples (no SEC network). Requires live-write gate.
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
  const withBytes = process.argv.includes("--with-bytes");
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
      originalBytesHash: true,
    },
  });

  const hashSet = withBytes
    ? [...new Set(rows.map((r) => r.originalBytesHash).filter(Boolean))]
    : [];
  const byteByHash = new Map<string, Buffer>();
  if (hashSet.length) {
    const blobs = await prisma.documentByteObject.findMany({
      where: { contentHash: { in: hashSet } },
      select: { contentHash: true, bytes: true },
    });
    for (const b of blobs) byteByHash.set(b.contentHash, Buffer.from(b.bytes));
  }

  const stats = {
    scanned: rows.length,
    changed: 0,
    unchanged: 0,
    withTextSample: 0,
    byTarget: {} as Record<string, number>,
  };

  for (const row of rows) {
    let textSample = "";
    if (withBytes && row.originalBytesHash) {
      const buf = byteByHash.get(row.originalBytesHash);
      if (buf) {
        textSample = buf.toString("utf8").slice(0, 12_000);
        stats.withTextSample += 1;
      }
    }
    const result = classifyDebtDocument({
      title: row.documentTitle ?? "",
      description: row.documentTitle ?? "",
      filename: row.exhibitFilename ?? "",
      exhibitType: row.formType ?? "",
      textSample,
    });
    if (result.documentClass === "UNKNOWN") {
      stats.unchanged += 1;
      continue;
    }
    stats.changed += 1;
    stats.byTarget[result.documentClass] = (stats.byTarget[result.documentClass] ?? 0) + 1;
    console.log(
      `${dry ? "DRY" : "UPD"} ${row.sourceId} -> ${result.documentClass} (${result.signals.join(",")})`,
    );
    if (!dry) {
      await prisma.knowledgeSource.update({
        where: { sourceId: row.sourceId },
        data: { documentClass: result.documentClass as never },
      });
    }
  }
  console.log(JSON.stringify({ dry, withBytes, stats }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
