/**
 * Durably record an import stall on the KnowledgeSource row itself.
 *
 * General rule: a SOURCE_ONLY row must never sit at extractionStatus
 * ACQUIRED with no reason. The batch's in-memory error list and the
 * local checkpoint JSON are not durable (ephemeral disk, another
 * machine), so a stall that only lives there looks like a healthy
 * "not yet processed" row forever — and no later pass can tell which
 * rows need retry. This helper preserves existing metadata, sets
 * extractionStatus FAILED, and stamps stallReason/stallAt/stallStage.
 *
 * Returns true when the row was updated, false when the row does not
 * exist (nothing was persisted yet) or the write itself failed.
 * Never throws: callers are already in error handling.
 *
 * Kept dependency-free (no prisma import) so it is unit-testable
 * without a generated Prisma client.
 */
export interface StallRecorderClient {
  knowledgeSource: {
    findUnique(args: { where: { sourceId: string } }): Promise<{ metadata?: unknown } | null>;
    update(args: {
      where: { sourceId: string };
      data: { extractionStatus: unknown; metadata: unknown };
    }): Promise<unknown>;
  };
}

export async function recordImportStall(
  client: StallRecorderClient,
  sourceId: string,
  stage: string,
  error: unknown,
): Promise<boolean> {
  try {
    const row = await client.knowledgeSource.findUnique({ where: { sourceId } });
    if (!row) return false;
    const prev =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const message = error instanceof Error ? error.message : String(error);
    await client.knowledgeSource.update({
      where: { sourceId },
      data: {
        extractionStatus: "FAILED" as never,
        metadata: JSON.parse(
          JSON.stringify({
            ...prev,
            stallReason: message.slice(0, 500),
            stallAt: new Date().toISOString(),
            stallStage: stage,
          }),
        ),
      },
    });
    return true;
  } catch {
    return false;
  }
}
