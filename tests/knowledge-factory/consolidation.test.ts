import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  scanOriginalByteCandidates,
  verifyGibraltarFixture,
  buildAssetInventory,
  LIVE_WRITE_ENV,
  LIVE_WRITE_TOKEN,
  importOriginalByteCandidates,
} from "../../lib/knowledge-factory/consolidation";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  store: vi.fn(),
  retrieve: vi.fn(),
  del: vi.fn(),
  queryRaw: vi.fn(),
  companyCount: vi.fn(),
  financialSnapshotCount: vi.fn(),
  documentCount: vi.fn(),
  knowledgeSourceCount: vi.fn(),
  knowledgeRelationshipEdgeCount: vi.fn(),
  knowledgeCostLedgerEntryCount: vi.fn(),
  goldenTestCount: vi.fn(),
  definedTermCount: vi.fn(),
  sourceArtifactCount: vi.fn(),
}));

// The live-write approval contract (token + committed, owner-attributable record) is tested in
// live-write-approval.test.ts; this file tests the durable-store path, so the record is stubbed.
vi.mock("../../lib/knowledge-factory/live-write-approval", () => ({
  assertLiveWriteApproval: () => ({ ref: "docs/knowledge-factory/approvals/stub.md", approvedBy: "test", approvedAt: "2026-10-09T00:00:00Z", environment: "test", scope: "test", operations: ["consolidation-import"] }),
}));
vi.mock("../../lib/prisma", () => ({
  prisma: {
    $queryRawUnsafe: mocks.queryRaw,
    company: { count: mocks.companyCount },
    financialSnapshot: { count: mocks.financialSnapshotCount },
    document: { count: mocks.documentCount },
    knowledgeSource: {
      findUnique: mocks.findUnique,
      findFirst: mocks.findFirst,
      create: mocks.create,
      update: mocks.update,
      count: mocks.knowledgeSourceCount,
    },
    knowledgeRelationshipEdge: { count: mocks.knowledgeRelationshipEdgeCount },
    knowledgeCostLedgerEntry: { count: mocks.knowledgeCostLedgerEntryCount },
    goldenTest: { count: mocks.goldenTestCount },
    definedTerm: { count: mocks.definedTermCount },
    sourceArtifact: { count: mocks.sourceArtifactCount },
  },
}));

vi.mock("../../lib/document-storage/postgres-bytea-provider", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../lib/document-storage/postgres-bytea-provider")
  >();
  return {
    ...actual,
    PostgresDocumentStorageProvider: class {
      store = mocks.store;
      retrieve = mocks.retrieve;
      delete = mocks.del;
    },
  };
});

describe("consolidation inventory + Gibraltar fixture", () => {
  it("verifies Gibraltar expected bytes and SHA-256", () => {
    const g = verifyGibraltarFixture();
    expect(g.ok).toBe(true);
    expect(g.byteSize).toBe(2_266_666);
    expect(g.sha256).toBe(
      "6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a",
    );
  });

  it("scans committed original-byte candidates without inventing paths", () => {
    const candidates = scanOriginalByteCandidates();
    expect(candidates.length).toBeGreaterThanOrEqual(15);
    const gib = candidates.find((c) =>
      c.sourceId.includes("0001140361-26-003087"),
    );
    expect(gib?.byteSize).toBe(2_266_666);
    expect(gib?.label).toBe("FIXTURE_AUTHENTIC_SEC");
    const chewy = candidates.find((c) => c.sourceId.includes("0001193125-26-281042"));
    expect(chewy).toBeTruthy();
    expect(chewy?.issuerTicker).toBe("CHWY");
    expect(chewy?.exhibitFilename).toBe("doc-a-2026-06-23-credit-agreement.htm");
    expect(chewy?.originalBytesHash).toBe(
      "5fbd8c90046305871d3f93e78bf5726ae77a0004eef93183d43a887befa9c4af",
    );
  });

  it("builds asset inventory for local corpus (gitignored; may be populated by mass-precedent runs)", () => {
    const inv = buildAssetInventory();
    expect(inv.schemaVersion).toBe("knowledge-factory.asset-inventory.v1");
    expect(inv.originalByteSummary.gibraltarOk).toBe(true);
    const local = inv.families.find((f) => f.family.includes("Local KF corpus"));
    expect(local).toBeDefined();
    expect(["UNAVAILABLE", "READY"]).toContain(local!.availability);
    if (local!.availability === "READY") {
      expect(local!.originalBytesPresent).toBe(true);
    }
  });
});

describe("consolidation import gates", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.findFirst.mockReset();
    mocks.create.mockReset();
    mocks.store.mockReset();
    delete process.env[LIVE_WRITE_ENV];
  });

  it("dry-run import does not touch prisma store", async () => {
    const r = await importOriginalByteCandidates({
      live: false,
      onlySourceIds: ["edgar:0001140361-26-003087:ef20064499_ex10-1.htm"],
    });
    expect(r.mode).toBe("dry-run");
    expect(r.inserted).toBe(1);
    expect(mocks.store).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses live import without authorization token", async () => {
    await expect(
      importOriginalByteCandidates({
        live: true,
        onlySourceIds: ["edgar:0001140361-26-003087:ef20064499_ex10-1.htm"],
      }),
    ).rejects.toThrow(/Live consolidation write refused/);
  });

  it("live import with token persists via durable-store (idempotent path)", async () => {
    process.env[LIVE_WRITE_ENV] = LIVE_WRITE_TOKEN;
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://example.invalid/headroom";
    const bytes = readFileSync(
      path.join(
        process.cwd(),
        "tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm",
      ),
    );
    const hash = createHash("sha256").update(bytes).digest("hex");
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(null);
    mocks.store.mockResolvedValue({
      storageRef: `pgbytea:v1:${hash}`,
      provider: "postgres-bytea",
    });
    mocks.create.mockResolvedValue({
      id: "row1",
      sourceId: "edgar:0001140361-26-003087:ef20064499_ex10-1.htm",
      originalBytesHash: hash,
      byteSize: bytes.length,
      storageRef: `pgbytea:v1:${hash}`,
      representationLevel: "SOURCE_ONLY",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      metadata: { storageProvider: "postgres-bytea" },
    });

    const r = await importOriginalByteCandidates({
      live: true,
      onlySourceIds: ["edgar:0001140361-26-003087:ef20064499_ex10-1.htm"],
    });
    expect(r.mode).toBe("live");
    expect(r.inserted).toBe(1);
    expect(mocks.store).toHaveBeenCalledOnce();
    expect(r.results[0]?.storageRef?.startsWith("pgbytea:v1:")).toBe(true);
  });
});

describe("dry-run plan against mocked neon", () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset();
    mocks.companyCount.mockResolvedValue(5);
    mocks.financialSnapshotCount.mockResolvedValue(3);
    mocks.documentCount.mockResolvedValue(7);
    mocks.knowledgeSourceCount.mockResolvedValue(0);
    mocks.knowledgeRelationshipEdgeCount.mockResolvedValue(0);
    mocks.knowledgeCostLedgerEntryCount.mockResolvedValue(0);
    mocks.goldenTestCount.mockResolvedValue(48);
    mocks.definedTermCount.mockResolvedValue(15);
    mocks.sourceArtifactCount.mockResolvedValue(8);
    mocks.findUnique.mockResolvedValue(null);
    mocks.findFirst.mockResolvedValue(null);
  });

  it("reports migration blocker when document_byte_objects missing", async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([{ c: 33 }]) // migration count
      .mockResolvedValueOnce([{ t: null }]); // table missing
    const { buildDryRunPlan } = await import(
      "../../lib/knowledge-factory/consolidation/dry-run-plan"
    );
    const plan = await buildDryRunPlan();
    expect(plan.liveWriteAuthorized).toBe(false);
    expect(plan.neon.existingCounts.companies).toBe(5);
    expect(plan.neon.existingCounts.financialSnapshots).toBe(3);
    expect(plan.proposed.skipMissingBytes).toBeGreaterThan(0);
    expect(plan.blockers.some((b) => b.includes("document_byte_objects"))).toBe(true);
    expect(plan.approvalCheckpoint).toMatch(/OWNER_APPROVAL_REQUIRED/);
  });
});
