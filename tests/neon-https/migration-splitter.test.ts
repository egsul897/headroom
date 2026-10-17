import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import {
  isSingleSqlStatement,
  splitSqlStatements,
  toIdempotentMigrationStatement,
} from "../../lib/neon-https/sql";

function listMigrationSqlFiles(repoRoot = process.cwd()): string[] {
  const root = path.join(repoRoot, "prisma/migrations");
  return readdirSync(root)
    .filter((n) => existsSync(path.join(root, n, "migration.sql")))
    .sort()
    .map((n) => path.join(root, n, "migration.sql"));
}

describe("SQL statement splitter (comment/quote/dollar aware)", () => {
  it("does not treat apostrophes inside -- comments as string openers", () => {
    const sql = readFileSync(
      "prisma/migrations/20260828221531_p1_9_contract_reference_edge_stable_key/migration.sql",
      "utf8",
    );
    const stmts = splitSqlStatements(sql);
    expect(stmts.length).toBe(2);
    expect(stmts[0]).toMatch(/ALTER TABLE/i);
    expect(stmts[0]).not.toMatch(/CREATE UNIQUE INDEX/i);
    expect(stmts[1]).toMatch(/CREATE UNIQUE INDEX/i);
    const idempotent = stmts.map(toIdempotentMigrationStatement);
    for (const s of idempotent) {
      expect(splitSqlStatements(s).length).toBe(1);
      expect(isSingleSqlStatement(s)).toBe(true);
    }
  });

  it("keeps DO $$ ... $$ blocks as one statement", () => {
    const sql = `
CREATE TYPE "foo" AS ENUM ('a', 'b');
DO $$ BEGIN
  ALTER TABLE "t" ADD COLUMN "x" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
`;
    const stmts = splitSqlStatements(sql);
    expect(stmts.length).toBe(2);
    expect(stmts[1]).toMatch(/DO \$\$/);
    expect(stmts[1]).toMatch(/END \$\$/);
  });

  it("ignores semicolons inside block comments and dollar quotes", () => {
    const sql = `
/* note; with semicolon */
SELECT 1;
SELECT $tag$ a; b; c $tag$;
`;
    const stmts = splitSqlStatements(sql);
    expect(stmts.length).toBe(2);
    expect(stmts[1]).toContain("$tag$");
  });

  it("every prisma migration file splits into single statements", () => {
    const files = listMigrationSqlFiles();
    expect(files.length).toBeGreaterThanOrEqual(43);
    const failures: string[] = [];

    for (const file of files) {
      const name = path.basename(path.dirname(file));
      const sql = readFileSync(file, "utf8");
      const stmts = splitSqlStatements(sql);
      if (stmts.length === 0) {
        failures.push(`${name}: zero statements`);
        continue;
      }
      for (let i = 0; i < stmts.length; i++) {
        const stmt = stmts[i]!;
        if (!isSingleSqlStatement(stmt)) {
          failures.push(`${name}[${i}]: not single before idempotent`);
          continue;
        }
        const idem = toIdempotentMigrationStatement(stmt);
        const parts = splitSqlStatements(idem);
        if (parts.length !== 1) {
          failures.push(
            `${name}[${i}]: idempotent split into ${parts.length}: ${idem.slice(0, 100)}`,
          );
        }
        // After idempotent transform, still one prepared-statement-safe command.
        if (/;\s*\S/.test(idem.replace(/\$\$[\s\S]*?\$\$/g, "DOLLAR").replace(/'[^']*'/g, "STR"))) {
          // Allow only trailing semicolon; reject mid-statement top-level ; outside $$/'
          const stripped = idem
            .replace(/\$\$[\s\S]*?\$\$/g, "")
            .replace(/\$[A-Za-z_][A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z_][A-Za-z0-9_]*\$/g, "")
            .replace(/'([^']|'')*'/g, "")
            .replace(/"([^"]|"")*"/g, "")
            .replace(/--[^\n]*/g, "")
            .replace(/\/\*[\s\S]*?\*\//g, "");
          const semis = stripped.match(/;/g) ?? [];
          if (semis.length > 0) {
            // idempotent CREATE/ALTER wrappers use DO $$ which we stripped; plain stmts should have 0
            // (splitSqlStatements already removed terminators)
            failures.push(`${name}[${i}]: unexpected top-level semicolon residue`);
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});
