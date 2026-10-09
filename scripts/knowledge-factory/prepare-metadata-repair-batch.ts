/**
 * Reviewable, idempotent metadata repair batch (NO Neon writes by default).
 *
 * Produces:
 * - instrumentIdentity backfill proposals for PUBLIC_SEC_EDGAR rows missing identity
 * - UNKNOWN reclassify proposals from title/filename alone (byte review flagged separately)
 *
 * Preserves original documentClass + audit trail in the batch file.
 *
 *   npx tsx scripts/knowledge-factory/prepare-metadata-repair-batch.ts
 * Apply (owner-gated):
 *   KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE \
 *     npx tsx scripts/knowledge-factory/prepare-metadata-repair-batch.ts --apply
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { classifyDebtDocument } from "../../lib/knowledge-factory/classify/debt-document";
import { computeInstrumentIdentity } from "../../lib/knowledge-factory/pipeline/instrument-identity";
import type { DebtDocumentClass } from "../../lib/knowledge-factory/types";

const LIVE_ENV = "KF_MASS_PRECEDENT_LIVE_WRITE";
const LIVE_TOKEN = "I_AUTHORIZE_NEON_BULK_WRITE";

async function main() {
  const apply = process.argv.includes("--apply");
  if (apply && process.env[LIVE_ENV] !== LIVE_TOKEN) {
    console.error(`Refusing --apply without ${LIVE_ENV}=${LIVE_TOKEN}`);
    process.exit(2);
  }

  const outDir = path.resolve("docs/intelligence-factory/cycle-3");
  mkdirSync(outDir, { recursive: true });

  const rows = await prisma.knowledgeSource.findMany({
    where: { usageRightsReviewStatus: "PUBLIC_SEC_EDGAR" as never },
    select: {
      sourceId: true,
      issuerCik: true,
      documentClass: true,
      documentTitle: true,
      exhibitFilename: true,
      formType: true,
      instrumentIdentity: true,
      filingDate: true,
      metadata: true,
    },
  });

  const identityOps = [];
  const reclassOps = [];

  for (const r of rows) {
    if (!r.instrumentIdentity) {
      const next = computeInstrumentIdentity({
        issuerCik: r.issuerCik,
        documentClass: r.documentClass as DebtDocumentClass,
        documentTitle: r.documentTitle,
        filingDate: r.filingDate?.toISOString?.(),
      });
      identityOps.push({
        sourceId: r.sourceId,
        op: "SET_INSTRUMENT_IDENTITY",
        before: null,
        after: next,
        basis: "deterministic computeInstrumentIdentity(title,class,cik)",
      });
    }

    if (r.documentClass === "UNKNOWN") {
      const result = classifyDebtDocument({
        title: r.documentTitle ?? "",
        description: r.documentTitle ?? "",
        filename: r.exhibitFilename ?? "",
        exhibitType: r.formType ?? "",
      });
      if (result.documentClass !== "UNKNOWN") {
        reclassOps.push({
          sourceId: r.sourceId,
          op: "RECLASSIFY_DOCUMENT_CLASS",
          before: "UNKNOWN",
          after: result.documentClass,
          signals: result.signals,
          basis: "metadata_only_title_filename",
          requiresByteReview: false,
          preservedOriginalClass: "UNKNOWN",
        });
      } else {
        reclassOps.push({
          sourceId: r.sourceId,
          op: "HOLD_FOR_BYTE_REVIEW",
          before: "UNKNOWN",
          after: "UNKNOWN",
          signals: result.signals,
          basis: "metadata_insufficient",
          requiresByteReview: true,
          preservedOriginalClass: "UNKNOWN",
        });
      }
    }
  }

  const batch = {
    schemaVersion: "intelligence-factory.metadata-repair-batch.v1",
    generatedAt: new Date().toISOString(),
    authorizationRequired: `${LIVE_ENV}=${LIVE_TOKEN}`,
    applied: false,
    neonMutations: 0,
    identityBackfill: {
      proposed: identityOps.length,
      operations: identityOps,
    },
    unknownReclassify: {
      proposedSafeFromMetadata: reclassOps.filter((o) => o.op === "RECLASSIFY_DOCUMENT_CLASS").length,
      holdForByteReview: reclassOps.filter((o) => o.op === "HOLD_FOR_BYTE_REVIEW").length,
      operations: reclassOps,
    },
    auditTrail: {
      preserveOriginalClass: true,
      note: "Original documentClass UNKNOWN retained in before/preservedOriginalClass fields. Apply is idempotent on sourceId.",
    },
  };

  const batchPath = path.join(outDir, "metadata-repair-batch.json");
  writeFileSync(batchPath, JSON.stringify(batch, null, 2));

  let appliedIdentity = 0;
  let appliedReclass = 0;
  if (apply) {
    for (const op of identityOps) {
      const row = await prisma.knowledgeSource.findUnique({
        where: { sourceId: op.sourceId },
        select: { metadata: true },
      });
      const prev =
        row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const repairAudit = Array.isArray(prev.repairAudit) ? [...(prev.repairAudit as unknown[])] : [];
      repairAudit.push({
        at: new Date().toISOString(),
        op: op.op,
        before: op.before,
        after: op.after,
      });
      await prisma.knowledgeSource.update({
        where: { sourceId: op.sourceId },
        data: {
          instrumentIdentity: op.after,
          metadata: { ...prev, repairAudit } as never,
        },
      });
      appliedIdentity += 1;
    }
    for (const op of reclassOps.filter((o) => o.op === "RECLASSIFY_DOCUMENT_CLASS")) {
      const row = await prisma.knowledgeSource.findUnique({
        where: { sourceId: op.sourceId },
        select: { metadata: true },
      });
      const prev =
        row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      const repairAudit = Array.isArray(prev.repairAudit) ? [...prev.repairAudit] : [];
      repairAudit.push({
        at: new Date().toISOString(),
        op: op.op,
        before: op.before,
        after: op.after,
        signals: op.signals,
      });
      await prisma.knowledgeSource.update({
        where: { sourceId: op.sourceId },
        data: {
          documentClass: op.after as never,
          metadata: { ...prev, repairAudit, originalDocumentClass: op.preservedOriginalClass } as never,
        },
      });
      appliedReclass += 1;
    }
    batch.applied = true;
    batch.neonMutations = appliedIdentity + appliedReclass;
    writeFileSync(batchPath, JSON.stringify(batch, null, 2));
  }

  console.log(
    JSON.stringify(
      {
        batchPath,
        apply,
        proposedIdentity: identityOps.length,
        proposedReclassSafe: batch.unknownReclassify.proposedSafeFromMetadata,
        holdForByteReview: batch.unknownReclassify.holdForByteReview,
        appliedIdentity,
        appliedReclass,
        neonMutations: batch.neonMutations,
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
