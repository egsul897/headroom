/**
 * Apply all prisma/migrations over Neon HTTPS, idempotently.
 */

import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { NeonHttpsExecutor } from "../covenant-learning-factory/store/neon-transport";
import {
  assertMigrationSqlSafeForHttpsMigrate,
  ENSURE_PRISMA_MIGRATIONS_SQL,
  prismaMigrationChecksum,
  splitSqlStatements,
  toIdempotentMigrationStatement,
} from "./sql";

export interface MigrationFolder {
  name: string;
  sqlPath: string;
  sql: string;
  checksum: string;
}

export function listPrismaMigrations(repoRoot: string = process.cwd()): MigrationFolder[] {
  const root = path.join(repoRoot, "prisma/migrations");
  const names = readdirSync(root)
    .filter((n) => existsSync(path.join(root, n, "migration.sql")))
    .sort();
  return names.map((name) => {
    const sqlPath = path.join(root, name, "migration.sql");
    const sql = readFileSync(sqlPath, "utf8");
    assertMigrationSqlSafeForHttpsMigrate(sql);
    return { name, sqlPath, sql, checksum: prismaMigrationChecksum(sql) };
  });
}

export type MigrationApplyItem = {
  migrationName: string;
  checksum: string;
  status: "applied" | "skipped" | "failed";
  statementsApplied: number;
  detail: string;
};

export type MigrateAllResult = {
  ok: boolean;
  transport: "https";
  migrations: MigrationApplyItem[];
  applied: number;
  skipped: number;
  failed: number;
};

export async function applyAllPrismaMigrationsOverHttps(
  executor: NeonHttpsExecutor,
  opts?: { repoRoot?: string },
): Promise<MigrateAllResult> {
  const migrations = listPrismaMigrations(opts?.repoRoot);
  await executor.execute(ENSURE_PRISMA_MIGRATIONS_SQL);

  const items: MigrationApplyItem[] = [];
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const m of migrations) {
    try {
      const existing = await executor.execute(
        `SELECT id, finished_at, rolled_back_at, checksum FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1`,
        [m.name],
      );
      const row = existing[0];
      if (row?.finished_at && !row.rolled_back_at) {
        items.push({
          migrationName: m.name,
          checksum: m.checksum,
          status: "skipped",
          statementsApplied: 0,
          detail: "already recorded in _prisma_migrations",
        });
        skipped += 1;
        continue;
      }

      const statements = splitSqlStatements(m.sql).map(toIdempotentMigrationStatement);
      for (const stmt of statements) {
        await executor.execute(stmt);
      }

      const migrationId = randomUUID();
      if (!row) {
        await executor.execute(
          `INSERT INTO "_prisma_migrations"
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
           VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), $4)`,
          [migrationId, m.checksum, m.name, statements.length],
        );
      } else {
        await executor.execute(
          `UPDATE "_prisma_migrations"
           SET checksum = $1, finished_at = NOW(), rolled_back_at = NULL, applied_steps_count = $2
           WHERE migration_name = $3`,
          [m.checksum, statements.length, m.name],
        );
      }

      items.push({
        migrationName: m.name,
        checksum: m.checksum,
        status: "applied",
        statementsApplied: statements.length,
        detail: "applied idempotently over HTTPS",
      });
      applied += 1;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      items.push({
        migrationName: m.name,
        checksum: m.checksum,
        status: "failed",
        statementsApplied: 0,
        detail: detail.slice(0, 400),
      });
      failed += 1;
      break; // stop in order — later migrations may depend on earlier ones
    }
  }

  return {
    ok: failed === 0,
    transport: "https",
    migrations: items,
    applied,
    skipped,
    failed,
  };
}
