/**
 * Shared SQL helpers for Neon HTTPS migrate/import (scripts/lib only).
 */

import { createHash } from "node:crypto";

/** Statement-leading data-destroying verbs (allows ON DELETE CASCADE). */
const DATA_DESTRUCTIVE_RE = /^\s*(TRUNCATE|DELETE)\b/i;

/** Split SQL on semicolons outside single-quoted / dollar-quoted strings. */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const ch = sql[i]!;

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

export function stripSqlLineComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
}

/** Refuse DELETE/TRUNCATE. DROP INDEX/TYPE/TABLE allowed for Prisma migrate replay. */
export function assertMigrationSqlSafeForHttpsMigrate(sql: string): void {
  for (const stmt of splitSqlStatements(stripSqlLineComments(sql))) {
    if (DATA_DESTRUCTIVE_RE.test(stmt)) {
      throw new Error(
        "Refusing data-destructive SQL in neon:https-migrate (DELETE/TRUNCATE)",
      );
    }
  }
}

/** Make CREATE/DROP statements idempotent for empty or partially-applied DBs. */
export function toIdempotentMigrationStatement(stmt: string): string {
  const s = stmt.trim();

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
  if (/^ALTER\s+TABLE\b/i.test(s) && /\bADD\s+COLUMN\b/i.test(s)) {
    return `DO $$ BEGIN ${s}; EXCEPTION WHEN duplicate_column THEN NULL; END $$`;
  }
  if (/^DROP\s+INDEX\b/i.test(s) && !/IF\s+EXISTS/i.test(s)) {
    return s.replace(/^DROP\s+INDEX\b/i, "DROP INDEX IF EXISTS");
  }
  if (/^DROP\s+TYPE\b/i.test(s) && !/IF\s+EXISTS/i.test(s)) {
    return s.replace(/^DROP\s+TYPE\b/i, "DROP TYPE IF EXISTS");
  }
  if (/^DROP\s+TABLE\b/i.test(s) && !/IF\s+EXISTS/i.test(s)) {
    return s.replace(/^DROP\s+TABLE\b/i, "DROP TABLE IF EXISTS");
  }
  return s;
}

export function prismaMigrationChecksum(migrationSql: string): string {
  return createHash("sha256").update(migrationSql, "utf8").digest("hex");
}

export const ENSURE_PRISMA_MIGRATIONS_SQL = `
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
