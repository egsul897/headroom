import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildMassPrecedentInventory,
  MASS_PRECEDENT_INVENTORY_SCHEMA,
  MASS_PRECEDENT_PLAN_SCHEMA,
} from "../../lib/knowledge-factory/mass-precedent";
import { buildMassPrecedentCostAssessment } from "../../lib/knowledge-factory/mass-precedent/cost-model";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  companyCount: vi.fn(),
  financialSnapshotCount: vi.fn(),
  knowledgeSourceCount: vi.fn(),
  knowledgeSourceFindMany: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: mocks.queryRaw,
    company: { count: mocks.companyCount },
    financialSnapshot: { count: mocks.financialSnapshotCount },
    knowledgeSource: {
      count: mocks.knowledgeSourceCount,
      findMany: mocks.knowledgeSourceFindMany,
    },
  },
}));

describe("mass precedent inventory", () => {
  it("inventories committed bytes without inventing URL-only evidence", () => {
    const inv = buildMassPrecedentInventory();
    expect(inv.schemaVersion).toBe(MASS_PRECEDENT_INVENTORY_SCHEMA);
    expect(inv.summary.committedBytesAvailable).toBeGreaterThanOrEqual(29);
    expect(inv.summary.financingLocators).toBeGreaterThanOrEqual(100);
    const committed = inv.items.filter((i) => i.channel === "COMMITTED_BYTES");
    expect(committed.every((i) => i.evidenceStatus === "BYTES_ON_DISK")).toBe(true);
    expect(committed.every((i) => Boolean(i.originalBytesHash && i.localPath))).toBe(true);
    const urlOnly = inv.items.filter((i) => i.channel === "MANIFEST_URL_ONLY");
    expect(urlOnly.every((i) => i.evidenceStatus === "HASH_AND_URL_ONLY")).toBe(true);
    expect(urlOnly.every((i) => !i.localPath)).toBe(true);
  });

  it("never marks FALSE_POSITIVE exhibits as high-priority financing", () => {
    const inv = buildMassPrecedentInventory();
    const fps = inv.items.filter((i) => i.corpusRole === "FALSE_POSITIVE_EXHIBIT");
    for (const fp of fps) {
      expect(fp.priorityScore).toBeLessThan(
        inv.items.find((i) => i.channel === "COMMITTED_BYTES")!.priorityScore,
      );
    }
  });
});

describe("mass precedent batch plan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockImplementation(async (sql: string) => {
      if (sql.includes("_prisma_migrations")) return [{ c: 33 }];
      if (sql.includes("document_byte_objects")) return [{ t: null }];
      return [];
    });
    mocks.companyCount.mockResolvedValue(6);
    mocks.financialSnapshotCount.mockResolvedValue(3);
    mocks.knowledgeSourceCount.mockResolvedValue(0);
    mocks.knowledgeSourceFindMany.mockResolvedValue([]);
  });

  it("builds batch-100 dry-run with liveWriteAuthorized false", async () => {
    const { buildMassPrecedentBatchPlan } = await import(
      "../../lib/knowledge-factory/mass-precedent/batch-plan"
    );
    const plan = await buildMassPrecedentBatchPlan({ batchSize: 100 });
    expect(plan.schemaVersion).toBe(MASS_PRECEDENT_PLAN_SCHEMA);
    expect(plan.liveWriteAuthorized).toBe(false);
    expect(plan.approvalCheckpoint).toContain("OWNER_APPROVAL");
    expect(plan.proposed.persistCommittedBytes).toBeGreaterThanOrEqual(29);
    expect(plan.neon.companies).toBe(6);
    expect(plan.neon.financialSnapshots).toBe(3);
    expect(plan.blockers.some((b) => b.includes("LIVE WRITE NOT AUTHORIZED"))).toBe(true);
    expect(plan.blockers.some((b) => b.includes("document_byte_objects"))).toBe(true);
  });

  it("schedules FETCH_THEN_PERSIST only when includeNetworkFetch", async () => {
    const { buildMassPrecedentBatchPlan } = await import(
      "../../lib/knowledge-factory/mass-precedent/batch-plan"
    );
    const off = await buildMassPrecedentBatchPlan({ batchSize: 100, includeNetworkFetch: false });
    expect(off.proposed.fetchThenPersist).toBe(0);
    const on = await buildMassPrecedentBatchPlan({ batchSize: 100, includeNetworkFetch: true });
    expect(on.proposed.fetchThenPersist).toBeGreaterThan(0);
    expect(on.proposed.persistCommittedBytes + on.proposed.fetchThenPersist).toBeLessThanOrEqual(100);
  });
});

describe("mass precedent cost model", () => {
  it("produces milestone footprints without claiming durability", () => {
    const cost = buildMassPrecedentCostAssessment({
      committedBytesTotal: 37_306_833,
      committedDocCount: 29,
    });
    expect(cost.milestones.length).toBeGreaterThanOrEqual(3);
    expect(cost.rateLimits.secMaxRequestsPerSecond).toBe(10);
    const first = cost.milestones[0];
    expect(first).toBeDefined();
    expect(first!.estimatedNeonFootprintGiB).toBeGreaterThan(0);
  });
});
