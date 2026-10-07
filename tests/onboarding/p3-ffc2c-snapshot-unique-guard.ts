/**
 * Test-only guard for FinancialSnapshot @@unique([companyId, asOfDate]).
 *
 * Pre-migration duplicate Snapshot rows cannot be inserted while the unique
 * index exists. AMBIGUOUS proofs seed those rows by suspending the index
 * under a session advisory lock. The caller then removes the rows it seeded.
 * This guard does not choose a winner, a majority, or a last row.
 *
 * The migration never drops the index and never removes rows.
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED. invent-absence forever.
 */
import { PrismaClient } from "@prisma/client";

export const SNAPSHOT_UNIQUE_INDEX = "financial_snapshots_companyId_asOfDate_key";
const LOCK_KEY = 62022103;

let guardClient: PrismaClient | undefined;

function guardUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required for the Snapshot unique guard");
  const url = new URL(raw);
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}

function guard(): PrismaClient {
  if (!guardClient) {
    guardClient = new PrismaClient({ datasources: { db: { url: guardUrl() } } });
  }
  return guardClient;
}

async function duplicatePairCount(): Promise<number> {
  const rows = await guard().$queryRaw<Array<{ pairs: number }>>`
    SELECT COUNT(*)::int AS pairs
    FROM (
      SELECT 1
      FROM "financial_snapshots"
      GROUP BY "companyId", "asOfDate"
      HAVING COUNT(*) > 1
    ) AS duplicate_pair
  `;
  return rows[0]?.pairs ?? 0;
}

async function dropIndex(): Promise<void> {
  await guard().$executeRawUnsafe(`DROP INDEX IF EXISTS "${SNAPSHOT_UNIQUE_INDEX}"`);
}

async function createIndex(): Promise<void> {
  await guard().$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "${SNAPSHOT_UNIQUE_INDEX}" ON "financial_snapshots"("companyId", "asOfDate")`,
  );
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  await guard().$executeRaw`SELECT pg_advisory_lock(${LOCK_KEY})`;
  try {
    return await fn();
  } finally {
    await guard().$executeRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
  }
}

/** Hold the unique index in force. Refuses to proceed while duplicate pairs exist. */
export async function withSnapshotUniqueEnforced<T>(fn: () => Promise<T>): Promise<T> {
  return withLock(async () => {
    const pairs = await duplicatePairCount();
    if (pairs > 0) {
      throw new Error(
        `P3-FFC2c: ${pairs} duplicate FinancialSnapshot (companyId, asOfDate) pair(s) are present. Refusing to treat the unique index as enforced. No silent collapse.`,
      );
    }
    await createIndex();
    return await fn();
  });
}

/**
 * Suspend the unique index so a test can seed pre-migration duplicate
 * Snapshot rows. The caller must remove those duplicate rows before
 * returning. This function then recreates the index.
 */
export async function withPreMigrationSnapshotDuplicates<T>(fn: () => Promise<T>): Promise<T> {
  return withLock(async () => {
    await dropIndex();
    try {
      return await fn();
    } finally {
      const pairs = await duplicatePairCount();
      if (pairs > 0) {
        throw new Error(
          `P3-FFC2c test guard: ${pairs} duplicate Snapshot pair(s) remain after the pre-migration seed. Refusing to recreate ${SNAPSHOT_UNIQUE_INDEX}. No silent collapse. Remove the seeded duplicate rows before returning.`,
        );
      }
      await createIndex();
    }
  });
}
