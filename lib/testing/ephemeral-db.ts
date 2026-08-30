/**
 * Per-worktree/per-auditor disposable Postgres database lifecycle, built in
 * response to the incident in docs/test-infrastructure-incident-2026-08-30.md:
 * concurrent `prisma migrate dev` invocations against one shared, unisolated
 * database wiped the Company table. Each ephemeral database is a REAL,
 * fully-isolated Postgres database (Postgres never permits cross-database
 * queries) created on the same server, migrated via `prisma migrate deploy`
 * (never `migrate dev`/`db push` - those are the tools that caused the
 * incident and must never run against a shared server), used, then dropped.
 *
 * Requires `createdb`/`dropdb`/`psql` on PATH and a PGPASSWORD-bearing
 * connection identical in every way to the real DATABASE_URL except the
 * database name.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { DISPOSABLE_DATABASE_NAME_PATTERN, assertDisposableDatabaseUrl } from "./disposable-db";

const execFileAsync = promisify(execFile);

export interface EphemeralDatabase {
  name: string;
  databaseUrl: string;
}

interface ParsedConnection {
  host: string;
  port: string;
  user: string;
  password: string;
}

function parseAdminConnection(baseDatabaseUrl: string): ParsedConnection {
  const url = new URL(baseDatabaseUrl);
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

function randomDisposableName(): string {
  const name = `headroom_test_${randomBytes(8).toString("hex")}`;
  if (!DISPOSABLE_DATABASE_NAME_PATTERN.test(name)) {
    throw new Error(`Generated name "${name}" does not match the disposable naming convention - this is a bug in randomDisposableName().`);
  }
  return name;
}

/**
 * Creates a brand-new, empty, isolated Postgres database on the same server
 * as `baseDatabaseUrl`, then applies every committed migration to it via
 * `prisma migrate deploy` (safe under concurrency - it only ever replays
 * already-committed migration files in order, and never creates a shadow
 * database or performs a drift-triggered reset the way `migrate dev` does).
 */
export async function createEphemeralDatabase(baseDatabaseUrl: string): Promise<EphemeralDatabase> {
  const conn = parseAdminConnection(baseDatabaseUrl);
  const name = randomDisposableName();
  const env = { ...process.env, PGPASSWORD: conn.password };

  await execFileAsync("createdb", ["-h", conn.host, "-p", conn.port, "-U", conn.user, name], { env });

  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${name}`;
  const databaseUrl = url.toString();

  await execFileAsync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...env, DATABASE_URL: databaseUrl },
    cwd: process.cwd(),
  });

  return { name, databaseUrl };
}

/** Drops an ephemeral database. Refuses (throws) unless the name matches the disposable convention - this can never be pointed at the persistent regression database. */
export async function destroyEphemeralDatabase(db: EphemeralDatabase): Promise<void> {
  assertDisposableDatabaseUrl(db.databaseUrl);
  const conn = parseAdminConnection(db.databaseUrl);
  const env = { ...process.env, PGPASSWORD: conn.password };
  await execFileAsync("dropdb", ["-h", conn.host, "-p", conn.port, "-U", conn.user, "--if-exists", "--force", db.name], { env });
}
