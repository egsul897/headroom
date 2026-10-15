/**
 * Shared SQL helpers for Neon HTTPS migrate/import (scripts/lib only).
 *
 * Statement splitter is comment / quote / dollar-quote aware so Neon HTTP
 * prepared statements never receive multi-command blobs.
 */

import { createHash } from "node:crypto";

/** Statement-leading data-destroying verbs (allows ON DELETE CASCADE). */
const DATA_DESTRUCTIVE_RE = /^\s*(TRUNCATE|DELETE)\b/i;

/**
 * Split SQL into single executable statements.
 * Handles: -- line comments, /* block comments *\/, 'strings', "identifiers", $tag$dollar$tag$.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let i = 0;
  type Mode = "normal" | "lineComment" | "blockComment" | "single" | "double" | "dollar";
  let mode: Mode = "normal";
  let dollarTag: string | null = null;

  const pushBuf = () => {
    const trimmed = buf.trim();
    if (trimmed.length > 0) statements.push(trimmed);
    buf = "";
  };

  while (i < sql.length) {
    const ch = sql[i]!;
    const next = sql[i + 1];

    if (mode === "lineComment") {
      buf += ch;
      i += 1;
      if (ch === "\n") mode = "normal";
      continue;
    }

    if (mode === "blockComment") {
      buf += ch;
      i += 1;
      if (ch === "*" && next === "/") {
        buf += "/";
        i += 1;
        mode = "normal";
      }
      continue;
    }

    if (mode === "single") {
      buf += ch;
      i += 1;
      if (ch === "'" && next === "'") {
        buf += "'";
        i += 1;
        continue;
      }
      if (ch === "'") mode = "normal";
      continue;
    }

    if (mode === "double") {
      buf += ch;
      i += 1;
      if (ch === '"' && next === '"') {
        buf += '"';
        i += 1;
        continue;
      }
      if (ch === '"') mode = "normal";
      continue;
    }

    if (mode === "dollar") {
      if (dollarTag && sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        mode = "normal";
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }

    // mode === "normal"
    if (ch === "-" && next === "-") {
      buf += "--";
      i += 2;
      mode = "lineComment";
      continue;
    }
    if (ch === "/" && next === "*") {
      buf += "/*";
      i += 2;
      mode = "blockComment";
      continue;
    }
    if (ch === "'") {
      buf += ch;
      i += 1;
      mode = "single";
      continue;
    }
    if (ch === '"') {
      buf += ch;
      i += 1;
      mode = "double";
      continue;
    }
    if (ch === "$") {
      const rest = sql.slice(i);
      const m = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        mode = "dollar";
        continue;
      }
    }
    if (ch === ";") {
      pushBuf();
      i += 1;
      continue;
    }

    buf += ch;
    i += 1;
  }

  if (mode !== "normal" && mode !== "lineComment") {
    // Unterminated quote/comment/dollar — still emit remainder so callers see it.
    pushBuf();
  } else {
    pushBuf();
  }

  return statements;
}

/**
 * True when `stmt` contains no top-level semicolon (aside from an optional trailing one).
 * Semicolons inside comments, quotes, or dollar-quotes are allowed.
 */
export function isSingleSqlStatement(stmt: string): boolean {
  const parts = splitSqlStatements(stmt);
  if (parts.length === 0) return true;
  if (parts.length > 1) return false;
  // splitSqlStatements drops the terminator; a single part means one statement.
  return true;
}

/** Count top-level (executable) statements — same as split length. */
export function countTopLevelStatements(sql: string): number {
  return splitSqlStatements(sql).length;
}

export function stripSqlLineComments(sql: string): string {
  // Legacy helper — prefer splitSqlStatements which is fully comment-aware.
  const statements = splitSqlStatements(sql);
  return statements.join(";\n");
}

/** Refuse DELETE/TRUNCATE. DROP INDEX/TYPE/TABLE allowed for Prisma migrate replay. */
export function assertMigrationSqlSafeForHttpsMigrate(sql: string): void {
  for (const stmt of splitSqlStatements(sql)) {
    // Ignore pure comment statements
    const withoutComments = stmt
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/--[^\n]*/g, "")
      .trim();
    if (!withoutComments) continue;
    if (DATA_DESTRUCTIVE_RE.test(withoutComments)) {
      throw new Error(
        "Refusing data-destructive SQL in neon:https-migrate (DELETE/TRUNCATE)",
      );
    }
  }
}

/** Make CREATE/DROP statements idempotent for empty or partially-applied DBs. */
export function toIdempotentMigrationStatement(stmt: string): string {
  const s = stmt.trim();
  // Strip leading comment-only lines for verb matching, keep full stmt for emit.
  const executable = s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--[^\n]*\n?/gm, "")
    .trim();

  if (/^CREATE\s+TYPE\b/i.test(executable)) {
    return `DO $$ BEGIN ${executable}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
  }
  if (/^CREATE\s+TABLE\b/i.test(executable) && !/^CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(executable)) {
    return executable.replace(/^CREATE\s+TABLE\b/i, "CREATE TABLE IF NOT EXISTS");
  }
  if (/^CREATE\s+UNIQUE\s+INDEX\b/i.test(executable) && !/IF\s+NOT\s+EXISTS/i.test(executable)) {
    return executable.replace(/^CREATE\s+UNIQUE\s+INDEX\b/i, "CREATE UNIQUE INDEX IF NOT EXISTS");
  }
  if (/^CREATE\s+INDEX\b/i.test(executable) && !/IF\s+NOT\s+EXISTS/i.test(executable)) {
    return executable.replace(/^CREATE\s+INDEX\b/i, "CREATE INDEX IF NOT EXISTS");
  }
  if (/^ALTER\s+TABLE\b/i.test(executable) && /\bADD\s+CONSTRAINT\b/i.test(executable)) {
    return `DO $$ BEGIN ${executable}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
  }
  if (/^ALTER\s+TABLE\b/i.test(executable) && /\bADD\s+COLUMN\b/i.test(executable)) {
    return `DO $$ BEGIN ${executable}; EXCEPTION WHEN duplicate_column THEN NULL; END $$`;
  }
  if (/^DROP\s+INDEX\b/i.test(executable) && !/IF\s+EXISTS/i.test(executable)) {
    return executable.replace(/^DROP\s+INDEX\b/i, "DROP INDEX IF EXISTS");
  }
  if (/^DROP\s+TYPE\b/i.test(executable) && !/IF\s+EXISTS/i.test(executable)) {
    return executable.replace(/^DROP\s+TYPE\b/i, "DROP TYPE IF EXISTS");
  }
  if (/^DROP\s+TABLE\b/i.test(executable) && !/IF\s+EXISTS/i.test(executable)) {
    return executable.replace(/^DROP\s+TABLE\b/i, "DROP TABLE IF EXISTS");
  }
  return executable || s;
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
