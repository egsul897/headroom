/**
 * Real-Postgres check of the atomic cap (pg_advisory_xact_lock + count + insert in one transaction).
 * Runs only when SCENARIOS_TEST_DATABASE_URL points at a scratch database with the
 * 20261017180000_saved_scenarios migration applied. Never point it at a shared/production DB.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { createPrismaScenarioStore, createScenarioWithinCap } from "@/lib/scenarios/store";

const url = process.env.SCENARIOS_TEST_DATABASE_URL;

describe.skipIf(!url)("saved-scenario cap on real Postgres", () => {
  const db = new PrismaClient({ datasources: { db: { url: url! } } });
  afterAll(async () => {
    await db.savedScenario.deleteMany({ where: { companyId: { startsWith: "pgtest-" } } });
    await db.$disconnect();
  });
  it("20 concurrent saves at 97 leave exactly 100 rows", async () => {
    const companyId = `pgtest-${Date.now()}`;
    await db.savedScenario.createMany({ data: Array.from({ length: 97 }, (_, i) => ({ companyId, createdBy: "u", name: `n${i}`, lines: [] })) });
    const store = createPrismaScenarioStore(db as never);
    const basis = { asOfDate: null, financialStateId: null, financialStateUpdatedAt: null, engineVersion: null };
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => createScenarioWithinCap(store, { companyId, createdBy: "u", name: `c${i}`, lines: [{ label: "a", value: "b" }], basis })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(await db.savedScenario.count({ where: { companyId } })).toBe(100);
  });
});
