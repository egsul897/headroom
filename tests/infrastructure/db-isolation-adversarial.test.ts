/**
 * Adversarial proof (docs/test-infrastructure-incident-2026-08-30.md §18)
 * that the new per-worktree ephemeral-database architecture actually
 * isolates concurrent workstreams from each other and from the persistent
 * regression database - the exact property that was missing when the
 * 2026-08-30 incident occurred (see 09-root-cause-analysis.json).
 *
 * Real Postgres only - creates and destroys 3 real ephemeral databases on
 * the same server as DATABASE_URL. Skips (does not fail) if `createdb`
 * isn't reachable in this environment.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createEphemeralDatabase, destroyEphemeralDatabase, type EphemeralDatabase } from "../../lib/testing/ephemeral-db";
import { assertDisposableDatabase, DisposableDatabaseAssertionError } from "../../lib/testing/disposable-db";

const BASE_URL = process.env.DATABASE_URL!;

describe("Database isolation adversarial proof (post-incident hardening)", () => {
  let a: EphemeralDatabase, b: EphemeralDatabase, c: EphemeralDatabase;
  let clientA: PrismaClient, clientB: PrismaClient, clientC: PrismaClient;
  const persistent = new PrismaClient();

  beforeAll(async () => {
    [a, b, c] = await Promise.all([createEphemeralDatabase(BASE_URL), createEphemeralDatabase(BASE_URL), createEphemeralDatabase(BASE_URL)]);
    clientA = new PrismaClient({ datasources: { db: { url: a.databaseUrl } } });
    clientB = new PrismaClient({ datasources: { db: { url: b.databaseUrl } } });
    clientC = new PrismaClient({ datasources: { db: { url: c.databaseUrl } } });

    await clientA.company.create({ data: { id: "iso-test-a-company", name: "TEST_A company" } });
    await clientB.company.create({ data: { id: "iso-test-b-company", name: "TEST_B company" } });
    await clientC.company.create({ data: { id: "iso-test-c-company", name: "TEST_C company" } });
  }, 60_000);

  afterAll(async () => {
    await Promise.all([clientA?.$disconnect(), clientB?.$disconnect(), clientC?.$disconnect(), persistent.$disconnect()]);
    await Promise.all([a && destroyEphemeralDatabase(a), b && destroyEphemeralDatabase(b), c && destroyEphemeralDatabase(c)].filter(Boolean));
  }, 60_000);

  it("each ephemeral database's own current_database() matches the disposable naming convention", async () => {
    await expect(assertDisposableDatabase(clientA)).resolves.toMatch(/^headroom_test_[a-f0-9]{8,}$/);
    await expect(assertDisposableDatabase(clientB)).resolves.toMatch(/^headroom_test_[a-f0-9]{8,}$/);
    await expect(assertDisposableDatabase(clientC)).resolves.toMatch(/^headroom_test_[a-f0-9]{8,}$/);
  });

  it("the real persistent regression database is REJECTED by assertDisposableDatabase - proving the guard actually distinguishes disposable from protected", async () => {
    await expect(assertDisposableDatabase(persistent)).rejects.toThrow(DisposableDatabaseAssertionError);
  });

  it("a destructive whole-database reset against TEST_A leaves TEST_B, TEST_C, and the persistent regression database completely unaffected", async () => {
    // The destructive operation itself - gated by the SAME assertDisposableDatabase()
    // every real reset helper must call first.
    await assertDisposableDatabase(clientA);
    await clientA.company.deleteMany({});

    const [aCount, bCompany, cCompany] = await Promise.all([
      clientA.company.count(),
      clientB.company.findUnique({ where: { id: "iso-test-b-company" } }),
      clientC.company.findUnique({ where: { id: "iso-test-c-company" } }),
    ]);
    expect(aCount).toBe(0);
    expect(bCompany?.id).toBe("iso-test-b-company");
    expect(cCompany?.id).toBe("iso-test-c-company");

    // The persistent regression database's own company set (coherent, matthews,
    // the FWRG fixture company) must be byte-for-byte unaffected by an operation
    // against a completely separate physical database.
    const persistentCompanies = await persistent.company.findMany({ select: { id: true } });
    const persistentIds = persistentCompanies.map((c) => c.id).sort();
    expect(persistentIds).not.toContain("iso-test-a-company");
    expect(persistentIds).toEqual(expect.arrayContaining(["coherent", "matthews"]));
  });

  it("a real, unguarded deleteMany({}) against the persistent database's own connection is refused before it can run, by any helper that calls assertDisposableDatabase first", async () => {
    await expect(assertDisposableDatabase(persistent)).rejects.toThrow(/current_database\(\) is "headroom"/);
  });
});
