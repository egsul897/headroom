/**
 * Bounded, restartable ingest plan from committed EHB handoff summary.
 * Does NOT fetch SEC bytes and does NOT write Neon unless separately authorized
 * via consume-ehb-queue.ts --mode=NEON.
 *
 *   npx tsx scripts/knowledge-factory/prepare-ehb-ingest-batch.ts --limit=25
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";

interface HandoffDoc {
  sourceId?: string;
  documentClass?: string;
  ehbQueueId?: string;
  filing?: {
    accessionNumber?: string;
    formType?: string;
    filingDate?: string;
    issuer?: { cik?: string; ticker?: string };
  };
  exhibit?: {
    filename?: string;
    description?: string;
    sourceUrl?: string;
  };
  ehbDedupeIdentity?: string;
}

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 25;
  const handoffPath = path.resolve("docs/edgar-historical-backfill/ckf-handoff-summary.json");
  if (!existsSync(handoffPath)) {
    console.error("missing handoff summary");
    process.exit(1);
  }
  const handoff = JSON.parse(readFileSync(handoffPath, "utf8")) as {
    documents?: HandoffDoc[];
    fetchableCount?: number;
  };
  const docs = (handoff.documents ?? []).slice(0, Math.max(1, limit));

  const existing = await prisma.knowledgeSource.findMany({
    where: {
      OR: [
        { sourceId: { in: docs.map((d) => d.sourceId!).filter(Boolean) } },
        {
          accessionNumber: {
            in: docs.map((d) => d.filing?.accessionNumber!).filter(Boolean),
          },
        },
      ],
    },
    select: { sourceId: true, accessionNumber: true, exhibitFilename: true, originalBytesHash: true },
  });
  const existingIds = new Set(existing.map((e) => e.sourceId));
  const existingAccEx = new Set(existing.map((e) => `${e.accessionNumber}|${e.exhibitFilename}`));

  const plan = [];
  for (const d of docs) {
    const sourceId = d.sourceId ?? (d.ehbQueueId ? `ehb:${d.ehbQueueId}` : undefined);
    const acc = d.filing?.accessionNumber ?? "";
    const file = d.exhibit?.filename ?? "";
    const already =
      (sourceId && existingIds.has(sourceId)) ||
      (acc && file && existingAccEx.has(`${acc}|${file}`));
    plan.push({
      sourceId,
      ticker: d.filing?.issuer?.ticker,
      cik: d.filing?.issuer?.cik,
      accessionNumber: acc,
      exhibitFilename: file,
      documentClass: d.documentClass,
      sourceUrl: d.exhibit?.sourceUrl,
      filingDate: d.filing?.filingDate,
      status: already ? "ALREADY_IN_NEON" : "PENDING_AUTHORIZED_FETCH",
      dedupeIdentity: d.ehbDedupeIdentity,
    });
  }

  const outDir = path.resolve("docs/intelligence-factory/cycle-3");
  mkdirSync(outDir, { recursive: true });
  const report = {
    schemaVersion: "intelligence-factory.ehb-ingest-batch.v1",
    generatedAt: new Date().toISOString(),
    handoffPath: "docs/edgar-historical-backfill/ckf-handoff-summary.json",
    limit,
    planned: plan.length,
    alreadyInNeon: plan.filter((p) => p.status === "ALREADY_IN_NEON").length,
    pendingAuthorizedFetch: plan.filter((p) => p.status === "PENDING_AUTHORIZED_FETCH").length,
    neonMutations: 0,
    paidInferenceCostUsd: 0,
    secFetchAuthorized: false,
    note: "No SEC fetch and no Neon write performed. Resume with: HEADROOM_SEC_FETCH_OWNER=WS-CKF KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE npx tsx scripts/knowledge-factory/consume-ehb-queue.ts --mode=NEON --queue=<exported-queue>",
    plan,
  };
  writeFileSync(path.join(outDir, "ehb-ingest-batch.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        planned: report.planned,
        alreadyInNeon: report.alreadyInNeon,
        pendingAuthorizedFetch: report.pendingAuthorizedFetch,
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
