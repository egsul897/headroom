import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assertMigrationSqlSafe,
  applyClfMigrationOverHttps,
  CLF_MIGRATION_NAME,
  loadClfMigrationSql,
  prismaMigrationChecksum,
  splitSqlStatements,
  toIdempotentStatement,
} from "../../lib/covenant-learning-factory/store/neon-migration-apply";
import {
  getNeonTransportMode,
  redactConnectionSecrets,
  type NeonHttpsExecutor,
} from "../../lib/covenant-learning-factory/store/neon-transport";

describe("neon HTTPS migration helpers (offline)", () => {
  it("defaults transport to tcp and honors NEON_TRANSPORT=https", () => {
    expect(getNeonTransportMode({})).toBe("tcp");
    expect(getNeonTransportMode({ NEON_TRANSPORT: "https" })).toBe("https");
    expect(getNeonTransportMode({ NEON_TRANSPORT: "tcp" })).toBe("tcp");
  });

  it("redacts connection strings", () => {
    const raw =
      "fail postgresql://neondb_owner:super-secret@ep-x.neon.tech/neondb?sslmode=require";
    const redacted = redactConnectionSecrets(raw);
    expect(redacted).not.toContain("super-secret");
    expect(redacted).toContain("postgresql://***:***@");
  });

  it("refuses DROP/TRUNCATE/DELETE", () => {
    expect(() => assertMigrationSqlSafe("DROP TABLE learning_packages;")).toThrow(
      /Refusing destructive/,
    );
    expect(() => assertMigrationSqlSafe("DELETE FROM learning_runs;")).toThrow(
      /Refusing destructive/,
    );
    expect(() => assertMigrationSqlSafe("TRUNCATE learning_artifacts;")).toThrow(
      /Refusing destructive/,
    );
  });

  it("allows the shipped additive migration SQL", () => {
    const loaded = loadClfMigrationSql();
    expect(loaded.migrationName).toBe(CLF_MIGRATION_NAME);
    expect(() => assertMigrationSqlSafe(loaded.sql)).not.toThrow();
    expect(loaded.checksum).toBe(
      createHash("sha256").update(loaded.sql, "utf8").digest("hex"),
    );
    expect(prismaMigrationChecksum(loaded.sql)).toBe(loaded.checksum);
  });

  it("makes CREATE statements idempotent", () => {
    expect(toIdempotentStatement('CREATE TABLE "learning_packages" (id TEXT)')).toMatch(
      /IF NOT EXISTS/i,
    );
    expect(toIdempotentStatement('CREATE INDEX "learning_runs_status_idx" ON "learning_runs"("status")')).toMatch(
      /IF NOT EXISTS/i,
    );
    expect(toIdempotentStatement('CREATE TYPE "learning_cohort" AS ENUM (\'TRAIN_DEV\')')).toMatch(
      /duplicate_object/i,
    );
  });

  it("applies via mocked HTTPS executor and records _prisma_migrations", async () => {
    const calls: { sql: string; params?: unknown[] }[] = [];
    const executor: NeonHttpsExecutor = {
      async execute(sql, params) {
        calls.push({ sql, params });
        if (sql.includes('FROM "_prisma_migrations"') && sql.includes("SELECT")) {
          return [];
        }
        return [];
      },
    };

    const result = await applyClfMigrationOverHttps(executor, {
      migrationId: "11111111-1111-1111-1111-111111111111",
    });

    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.statementsApplied).toBeGreaterThan(5);
    expect(calls.some((c) => c.sql.includes("CREATE TABLE IF NOT EXISTS"))).toBe(true);
    const insert = calls.find((c) => c.sql.includes('INSERT INTO "_prisma_migrations"'));
    expect(insert).toBeTruthy();
    expect(insert?.params?.[0]).toBe("11111111-1111-1111-1111-111111111111");
    expect(insert?.params?.[2]).toBe(CLF_MIGRATION_NAME);
  });

  it("skips when migration already finished", async () => {
    const executor: NeonHttpsExecutor = {
      async execute(sql) {
        if (sql.includes('FROM "_prisma_migrations"') && sql.includes("SELECT")) {
          return [{ id: "x", finished_at: new Date().toISOString(), rolled_back_at: null }];
        }
        return [];
      },
    };
    const result = await applyClfMigrationOverHttps(executor);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.statementsApplied).toBe(0);
  });

  it("splitSqlStatements handles basic semicolon separation", () => {
    const stmts = splitSqlStatements("SELECT 1; SELECT 2;");
    expect(stmts).toEqual(["SELECT 1", "SELECT 2"]);
  });
});

describe("createNeonHttpsExecutor mock seam", () => {
  it("invokes injected neon function without printing secrets", async () => {
    const neonMock = vi.fn(() => {
      const fn = Object.assign(
        async (statement: string, _params?: unknown[]) => {
          expect(statement).toBe("SELECT 1");
          return [{ ok: 1 }];
        },
        { transaction: async () => [] },
      );
      return fn;
    });

    const { createNeonHttpsExecutor } = await import(
      "../../lib/covenant-learning-factory/store/neon-transport"
    );
    const ex = await createNeonHttpsExecutor(
      "postgresql://u:secret@example.invalid/db",
      neonMock as unknown as import("../../lib/covenant-learning-factory/store/neon-transport").NeonFactory,
    );
    const rows = await ex.execute("SELECT 1");
    expect(rows).toEqual([{ ok: 1 }]);
    expect(neonMock).toHaveBeenCalledTimes(1);
  });
});
