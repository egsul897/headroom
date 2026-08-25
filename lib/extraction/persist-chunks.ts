/**
 * Persists lib/extraction/chunk.ts's pure ChunkResult[] output as
 * DocumentChunk rows (docs/document-onboarding-pipeline-foundation.md).
 * Idempotent per document - re-chunking (e.g. after a parser fix) replaces
 * a document's existing chunks rather than accumulating duplicates.
 */

import { prisma } from "../prisma";
import type { ChunkResult } from "./chunk";

export async function persistDocumentChunks(documentId: string, chunks: ChunkResult[]): Promise<{ id: string; chunkIndex: number }[]> {
  return prisma.$transaction(async (tx) => {
    await tx.documentChunk.deleteMany({ where: { documentId } });
    const created: { id: string; chunkIndex: number }[] = [];
    for (const c of chunks) {
      const row = await tx.documentChunk.create({
        data: {
          documentId,
          chunkIndex: c.chunkIndex,
          page: c.page,
          articleRef: c.articleRef,
          sectionRef: c.sectionRef,
          heading: c.heading,
          text: c.text,
          charStart: c.charStart,
          charEnd: c.charEnd,
        },
        select: { id: true, chunkIndex: true },
      });
      created.push(row);
    }
    return created;
  });
}
