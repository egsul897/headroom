/**
 * Defense-in-depth guard against the incident documented in
 * docs/test-infrastructure-incident-2026-08-30.md: concurrent Prisma
 * migrate-tooling invocations against one shared, unisolated Postgres
 * database wiped the Company table and everything cascading from it.
 *
 * A database is eligible for a destructive, whole-database reset only if
 * its OWN current_database() (read live from the connection, never from an
 * env var alone - an env var can be stale or simply wrong) matches the
 * disposable naming convention. NODE_ENV=test is deliberately NOT accepted
 * as a substitute signal: real fixture data (Coherent/Matthews/the FWRG/LSB
 * fixture companies) is legitimately queried under NODE_ENV=test by
 * ordinary vitest runs, so that flag says nothing about whether resetting
 * the connected database is safe.
 */
import type { PrismaClient } from "@prisma/client";

export const DISPOSABLE_DATABASE_NAME_PATTERN = /^headroom_test_[a-f0-9]{8,}$/;

export class DisposableDatabaseAssertionError extends Error {
  constructor(actualDatabaseName: string) {
    super(
      `Refusing a destructive database operation: current_database() is "${actualDatabaseName}", which does not match the disposable-database naming convention ${DISPOSABLE_DATABASE_NAME_PATTERN}. ` +
        `Only a database created by lib/testing/ephemeral-db.ts's createEphemeralDatabase() is eligible for a whole-database reset. ` +
        `If this is the real persistent regression database (e.g. "headroom"), this is working as intended - see docs/test-infrastructure-incident-2026-08-30.md.`
    );
    this.name = "DisposableDatabaseAssertionError";
  }
}

/**
 * Throws DisposableDatabaseAssertionError unless the CURRENTLY CONNECTED
 * database's own name matches the disposable naming convention. Call this
 * as the very first line of any helper that performs a whole-database
 * reset (truncate-all-tables, drop-and-recreate-schema, etc.) - never rely
 * on the caller having checked first.
 */
export async function assertDisposableDatabase(prisma: PrismaClient): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ current_database: string }[]>("SELECT current_database()");
  const actual = rows[0]?.current_database ?? "";
  if (!DISPOSABLE_DATABASE_NAME_PATTERN.test(actual)) {
    throw new DisposableDatabaseAssertionError(actual);
  }
  return actual;
}

/** Same check against a raw connection string, for callers that don't yet have a PrismaClient. */
export function assertDisposableDatabaseUrl(databaseUrl: string): string {
  const match = /\/([^/?]+)(\?|$)/.exec(databaseUrl);
  const dbName = match?.[1] ?? "";
  if (!DISPOSABLE_DATABASE_NAME_PATTERN.test(dbName)) {
    throw new DisposableDatabaseAssertionError(dbName);
  }
  return dbName;
}
