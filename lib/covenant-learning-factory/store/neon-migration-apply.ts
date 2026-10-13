/**
 * Idempotent apply of the CLF additive migration over Neon HTTPS.
 * Refuses DROP / TRUNCATE / DELETE. Records _prisma_migrations like Prisma Migrate.
 */

import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NeonHttpsExecutor } from "./neon-transport";

export const CLF_MIGRATION_NAME = "20261013180000_covenant_learning_factory";

export const CLF_LEARNING_TABLES = [
  "learning_packages",
  "learning_runs",
  "learning_artifacts",
  "learning_error_ledger_entries",
  "learning_evaluation_outcomes",
  "learning_improvement_proposals",
] as const;

/** Statement-leading destructive verbs only (allows ON DELETE CASCADE). */
const DESTRUCTIVE_STATEMENT_RE =
  /^\s*(DROP|TRUNCATE|DELETE)\b/i;

/** Split SQL on semicolons outside single-quoted / dollar-quoted strings. */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const ch = sql[i];

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }

    if (inSingle) {
      buf += ch;
      if (ch === "'" && sql[i + 1] === "'") {
        buf += "'";
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      buf += ch;
      i += 1;
      continue;
    }

    if (ch === "$") {
      const rest = sql.slice(i);
      const m = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (ch === ";") {
      const trimmed = buf.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      buf = "";
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }

  const tail = buf.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

export function assertMigrationSqlSafe(sql: string): void {
  const withoutLineComments = sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
  for (const stmt of splitSqlStatements(withoutLineComments)) {
    if (DESTRUCTIVE_STATEMENT_RE.test(stmt)) {
      throw new Error(
        `Refusing destructive SQL in CLF migration apply: matched DROP/TRUNCATE/DELETE`,
      );
    }
  }
}

/** Make CREATE statements idempotent; wrap TYPE/CONSTRAINT in duplicate-safe DO blocks. */
export function toIdempotentStatement(stmt: string): string {
  const s = stmt.trim();
  const upper = s.toUpperCase();

  if (/^CREATE\s+TYPE\b/i.test(s)) {
    return `DO $$ BEGIN ${s}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
  }

  if (/^CREATE\s+TABLE\b/i.test(s) && !/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(s)) {
    return s.replace(/^CREATE\s+TABLE\b/i, "CREATE TABLE IF NOT EXISTS");
  }

  if (/^CREATE\s+UNIQUE\s+INDEX\b/i.test(s) && !/IF\s+NOT\s+EXISTS/i.test(s)) {
    return s.replace(/^CREATE\s+UNIQUE\s+INDEX\b/i, "CREATE UNIQUE INDEX IF NOT EXISTS");
  }

  if (/^CREATE\s+INDEX\b/i.test(s) && !/IF\s+NOT\s+EXISTS/i.test(s)) {
    return s.replace(/^CREATE\s+INDEX\b/i, "CREATE INDEX IF NOT EXISTS");
  }

  if (/^ALTER\s+TABLE\b/i.test(s) && /\bADD\s+CONSTRAINT\b/i.test(s)) {
    return `DO $$ BEGIN ${s}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
  }

  // Leave other non-destructive statements as-is (e.g. comments-only already stripped).
  void upper;
  return s;
}

export function prismaMigrationChecksum(migrationSql: string): string {
  return createHash("sha256").update(migrationSql, "utf8").digest("hex");
}

export function loadClfMigrationSql(repoRoot: string = process.cwd()): {
  migrationName: string;
  sql: string;
  filePath: string;
  checksum: string;
} {
  const filePath = path.join(
    repoRoot,
    "prisma/migrations",
    CLF_MIGRATION_NAME,
    "migration.sql",
  );
  const sql = readFileSync(filePath, "utf8");
  assertMigrationSqlSafe(sql);
  return {
    migrationName: CLF_MIGRATION_NAME,
    sql,
    filePath,
    checksum: prismaMigrationChecksum(sql),
  };
}

const ENSURE_PRISMA_MIGRATIONS = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)
`.trim();

export type NeonApplyResult = {
  ok: boolean;
  skipped: boolean;
  migrationName: string;
  checksum: string;
  statementsApplied: number;
  detail: string;
};

export async function applyClfMigrationOverHttps(
  executor: NeonHttpsExecutor,
  opts?: { repoRoot?: string; migrationId?: string },
): Promise<NeonApplyResult> {
  const loaded = loadClfMigrationSql(opts?.repoRoot);
  assertMigrationSqlSafe(loaded.sql);

  await executor.execute(ENSURE_PRISMA_MIGRATIONS);

  const existing = await executor.execute(
    `SELECT id, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1`,
    [loaded.migrationName],
  );

  if (existing.length > 0 && existing[0].finished_at && !existing[0].rolled_back_at) {
    return {
      ok: true,
      skipped: true,
      migrationName: loaded.migrationName,
      checksum: loaded.checksum,
      statementsApplied: 0,
      detail: "already recorded in _prisma_migrations",
    };
  }

  const statements = splitSqlStatements(loaded.sql).map(toIdempotentStatement);
  let applied = 0;
  for (const stmt of statements) {
    await executor.execute(stmt);
    applied += 1;
  }

  const migrationId = opts?.migrationId ?? randomUUID();
  if (existing.length === 0) {
    await executor.execute(
      `INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), $4)`,
      [migrationId, loaded.checksum, loaded.migrationName, applied],
    );
  } else {
    await executor.execute(
      `UPDATE "_prisma_migrations"
       SET checksum = $1, finished_at = NOW(), rolled_back_at = NULL, applied_steps_count = $2
       WHERE migration_name = $3`,
      [loaded.checksum, applied, loaded.migrationName],
    );
  }

  return {
    ok: true,
    skipped: false,
    migrationName: loaded.migrationName,
    checksum: loaded.checksum,
    statementsApplied: applied,
    detail: "applied idempotently over HTTPS",
  };
}

export async function countLearningTables(
  executor: NeonHttpsExecutor,
): Promise<Record<(typeof CLF_LEARNING_TABLES)[number], number | null>> {
  const out = {} as Record<(typeof CLF_LEARNING_TABLES)[number], number | null>;
  for (const table of CLF_LEARNING_TABLES) {
    try {
      const rows = await executor.execute(`SELECT COUNT(*)::int AS count FROM "${table}"`);
      const n = rows[0]?.count;
      out[table] = typeof n === "number" ? n : Number(n ?? 0);
    } catch {
      out[table] = null;
    }
  }
  return out;
}
