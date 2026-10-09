/**
 * Upsert a workspace-scoped metadata KnowledgeSource row (adversarial log, counsel feedback).
 * Preserves hashes/provenance stubs; never overwrites operative financing documents.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

function stubHash(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

export async function upsertWorkspaceMetaSource(params: {
  sourceId: string;
  companyId: string;
  title: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const hash = stubHash(params.sourceId);
  await prisma.knowledgeSource.upsert({
    where: { sourceId: params.sourceId },
    create: {
      sourceId: params.sourceId,
      companyId: params.companyId,
      issuerCik: "0000000000",
      accessionNumber: params.sourceId.slice(0, 80),
      exhibitFilename: `${params.sourceId}.json`,
      sourceUrl: `fixture://workspace-meta/${params.companyId}/${params.sourceId}`,
      filingDate: new Date("1970-01-01T00:00:00.000Z"),
      formType: "WORKSPACE_META",
      documentTitle: params.title,
      documentClass: "OTHER_DEBT_RELATED",
      originalBytesHash: hash,
      acquisitionTimestamp: new Date(),
      parserVersion: "workspace-meta-v1",
      extractionStatus: "PENDING",
      representationLevel: "SOURCE_ONLY",
      provenance: "workspace-meta",
      usageRightsReviewStatus: "UNREVIEWED",
      byteSize: 0,
      metadata: params.metadata,
    },
    update: {
      companyId: params.companyId,
      documentTitle: params.title,
      metadata: params.metadata,
    },
  });
}

export async function readWorkspaceMetaSource(
  sourceId: string,
): Promise<Record<string, unknown> | null> {
  const row = await prisma.knowledgeSource.findUnique({ where: { sourceId } });
  if (!row?.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) {
    return null;
  }
  return row.metadata as Record<string, unknown>;
}
