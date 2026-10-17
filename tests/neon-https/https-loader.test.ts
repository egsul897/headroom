import { describe, expect, it } from "vitest";
import {
  applyAllPrismaMigrationsOverHttps,
  listPrismaMigrations,
} from "../../lib/neon-https/migrate-all";
import {
  AUTHORITY_STATUS,
  importPrecedentsOverHttps,
  isLiveAuthorized,
  sanitizeRepresentationLevel,
} from "../../lib/neon-https/precedent-import";
import { verifyNeonHttps } from "../../lib/neon-https/verify";
import {
  assertMigrationSqlSafeForHttpsMigrate,
  toIdempotentMigrationStatement,
} from "../../lib/neon-https/sql";
import type { NeonHttpsExecutor } from "../../lib/covenant-learning-factory/store/neon-transport";

function fakeExecutor() {
  const statements: { sql: string; params?: unknown[] }[] = [];
  const applied = new Set<string>();
  const tables = new Map<string, number>();
  const executor: NeonHttpsExecutor = {
    async execute(sql, params) {
      statements.push({ sql, params });
      const u = sql.toUpperCase();
      if (u.includes('FROM "_PRISMA_MIGRATIONS"') && u.includes("SELECT")) {
        const name = String(params?.[0] ?? "");
        if (applied.has(name)) {
          return [{ id: "x", finished_at: new Date().toISOString(), rolled_back_at: null }];
        }
        return [];
      }
      if (u.includes('INSERT INTO "_PRISMA_MIGRATIONS"')) {
        applied.add(String(params?.[2] ?? ""));
        return [];
      }
      if (u.startsWith("SELECT COUNT(*)")) {
        const m = sql.match(/FROM\s+"([^"]+)"/i);
        const table = m?.[1] ?? "";
        return [{ count: tables.get(table) ?? 0 }];
      }
      if (u.includes("INSERT INTO KF_PRECEDENT") || u.includes("INSERT INTO kf_precedent")) {
        const m = sql.match(/INSERT INTO\s+"?([a-z_]+)"?/i);
        if (m) tables.set(m[1]!, (tables.get(m[1]!) ?? 0) + 1);
      }
      if (u.includes("INSERT INTO KNOWLEDGE_SOURCES") || u.includes("INSERT INTO knowledge_sources")) {
        tables.set("knowledge_sources", (tables.get("knowledge_sources") ?? 0) + 1);
      }
      if (u.includes("INSERT INTO DOCUMENT_BYTE_OBJECTS") || u.includes("INSERT INTO document_byte_objects")) {
        tables.set("document_byte_objects", (tables.get("document_byte_objects") ?? 0) + 1);
      }
      if (u.includes("FROM knowledge_sources") && u.includes("SELECT")) return [];
      if (u.includes("FROM document_byte_objects") && u.includes("SELECT")) return [];
      return [];
    },
  };
  return { executor, statements, applied, tables };
}

describe("neon HTTPS loader (fake client)", () => {
  it("lists prisma migrations in order and refuses DELETE/TRUNCATE", () => {
    const migrations = listPrismaMigrations();
    expect(migrations.length).toBeGreaterThanOrEqual(43);
    expect(migrations[0]?.name).toBe("20260824024618_init");
    expect(migrations.some((m) => m.name.includes("covenant_learning_factory"))).toBe(true);
    expect(migrations.some((m) => m.name.includes("kf_precedent_export_tables"))).toBe(true);
    expect(() => assertMigrationSqlSafeForHttpsMigrate("DELETE FROM knowledge_sources;")).toThrow(
      /data-destructive/,
    );
    expect(toIdempotentMigrationStatement('DROP INDEX "x"')).toMatch(/IF EXISTS/i);
  });

  it("applies migrations idempotently and skips already-recorded ones", async () => {
    const { executor, applied } = fakeExecutor();
    // Pretend CLF migration already applied
    applied.add("20261013180000_covenant_learning_factory");

    const first = await applyAllPrismaMigrationsOverHttps(executor);
    expect(first.ok).toBe(true);
    expect(first.skipped).toBeGreaterThanOrEqual(1);
    expect(
      first.migrations.find((m) => m.migrationName === "20261013180000_covenant_learning_factory")
        ?.status,
    ).toBe("skipped");

    const second = await applyAllPrismaMigrationsOverHttps(executor);
    expect(second.ok).toBe(true);
    expect(second.applied).toBe(0);
    expect(second.skipped).toBe(second.migrations.length);
  });

  it("dry-run precedent import never writes; live path upserts with COMPUTED_NOT_CERTIFIED", async () => {
    expect(sanitizeRepresentationLevel("CERTIFIED")).toBe("DISCOVERED_CANDIDATE");
    expect(AUTHORITY_STATUS).toBe("COMPUTED_NOT_CERTIFIED");
    expect(isLiveAuthorized({ KF_MASS_PRECEDENT_LIVE_WRITE: "nope" })).toBe(false);

    const { executor, tables, statements } = fakeExecutor();
    const dry = await importPrecedentsOverHttps(executor, {
      live: false,
      skipBytes: true,
      limitExportRows: 3,
    });
    expect(dry.dryRun).toBe(true);
    expect(dry.counts.exportSourcesWouldUpsert).toBe(3);
    expect(tables.get("kf_precedent_covenant_candidates") ?? 0).toBe(0);

    const prev = process.env.KF_MASS_PRECEDENT_LIVE_WRITE;
    process.env.KF_MASS_PRECEDENT_LIVE_WRITE = "I_AUTHORIZE_NEON_BULK_WRITE";
    try {
      const live = await importPrecedentsOverHttps(executor, {
        live: true,
        skipBytes: true,
        limitExportRows: 2,
      });
      expect(live.live).toBe(true);
      expect(live.counts.exportSourcesUpserted).toBe(2);
      expect(live.counts["covenant-candidatesUpserted"]).toBe(2);
      expect(statements.some((s) => /ContractRule/i.test(s.sql))).toBe(false);
      expect(statements.some((s) => /COMPUTED_NOT_CERTIFIED/.test(JSON.stringify(s.params)))).toBe(
        true,
      );
    } finally {
      if (prev === undefined) delete process.env.KF_MASS_PRECEDENT_LIVE_WRITE;
      else process.env.KF_MASS_PRECEDENT_LIVE_WRITE = prev;
    }
  });

  it("verify returns per-table counts", async () => {
    const { executor, tables } = fakeExecutor();
    tables.set("knowledge_sources", 12);
    tables.set("learning_packages", 2);
    const v = await verifyNeonHttps(executor);
    expect(v.transport).toBe("https");
    expect(v.tables.knowledge_sources).toBe(12);
    expect(v.tables.learning_packages).toBe(2);
  });
});
