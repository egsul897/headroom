/**
 * APPROVED + reviewedAt + no deliveredAt → NEEDS_INPUT at both authoritative entrypoints.
 * Provider-free via mocked Prisma / store loaders.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeDeliveredAtInApprovalRef } from "@/lib/contract-model/runtime/input/delivery-evidence";
import type { FinancialSnapshot } from "@/lib/contract-model/north-star-bridge";

const mocks = vi.hoisted(() => ({
  loadApprovedSnapshotsFromPrisma: vi.fn(),
  loadCutoffEligibleSnapshotsFromPrisma: vi.fn(),
  loadLedgerUsagesFromPrisma: vi.fn(),
  loadCapacityReadiness: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

vi.mock("@/lib/contract-model/north-star-bridge", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contract-model/north-star-bridge")>(
    "@/lib/contract-model/north-star-bridge",
  );
  return {
    ...actual,
    loadApprovedSnapshotsFromPrisma: mocks.loadApprovedSnapshotsFromPrisma,
    loadCutoffEligibleSnapshotsFromPrisma: mocks.loadCutoffEligibleSnapshotsFromPrisma,
    loadLedgerUsagesFromPrisma: mocks.loadLedgerUsagesFromPrisma,
  };
});

vi.mock("@/lib/product/customer-intelligence/capacity-readiness", () => ({
  loadCapacityReadiness: mocks.loadCapacityReadiness,
}));

vi.mock("@/lib/financial-certificate-engine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/financial-certificate-engine")>(
    "@/lib/financial-certificate-engine",
  );
  return {
    ...actual,
    loadVerifiedFinancialCapacityInput: vi.fn(async () => ({
      status: "NO_APPROVED_SNAPSHOT" as const,
      missingInputs: ["APPROVED_NorthStar_snapshot"],
    })),
  };
});

import { loadTransactionWorkflowReadiness } from "@/lib/product/north-star-workflow/transaction-readiness";
import { attemptCertifiedTransaction } from "@/lib/product/north-star-workflow/certified-transaction";
import {
  loadApprovedFinancialInputBundle,
  NS4_PRODUCT_CUTOFF_SELECTOR,
} from "@/lib/product/north-star-workflow/approved-financial-inputs";
import { loadNs4DashboardFinancialState } from "@/lib/dashboard/ns4-financial-panel";

const CO = "delivery-entry-co";

function approvedNoDelivery(): FinancialSnapshot {
  return {
    snapshotId: "snap-approved-no-delivery",
    version: "v1",
    companyId: CO,
    asOf: "2026-06-30",
    reportingPeriod: "FY2026-Q2",
    status: "APPROVED",
    supersedesSnapshotId: null,
    inputs: [],
    provenance: { source: "doc-1", sourceVersion: "sha256:v1" },
    review: {
      reviewedBy: "counsel",
      reviewedAt: "2026-07-20T18:00:00Z",
      approvalRef: "apr-no-delivery",
    },
  };
}

function approvedWithDelivery(): FinancialSnapshot {
  return {
    ...approvedNoDelivery(),
    snapshotId: "snap-approved-with-delivery",
    provenance: {
      source: "doc-1",
      sourceVersion: "sha256:v1",
      deliveredAtIsoDate: "2026-07-10",
    },
    review: {
      reviewedBy: "counsel",
      reviewedAt: "2026-07-20T18:00:00Z",
      approvalRef: encodeDeliveredAtInApprovalRef("apr-with-delivery", "2026-07-10"),
    },
  };
}

describe("authoritative entrypoints — delivery authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadLedgerUsagesFromPrisma.mockResolvedValue([]);
    mocks.loadCapacityReadiness.mockResolvedValue({
      canEvaluateExecutableCapacity: false,
      headline: "fixture",
      guidance: "LEGACY_ENGINE ≠ certified",
      blockers: [],
      analyzedDocumentCount: 1,
      permissionCount: 1,
    });
  });

  it("transaction-readiness: APPROVED + reviewedAt + no deliveredAt → NEEDS_INPUT", async () => {
    const snap = approvedNoDelivery();
    mocks.loadApprovedSnapshotsFromPrisma.mockResolvedValue([snap]);
    mocks.loadCutoffEligibleSnapshotsFromPrisma.mockResolvedValue([snap]);
    const readiness = await loadTransactionWorkflowReadiness(CO, {
      evaluationDate: "2026-08-01",
    });
    expect(readiness.cutoff?.state).toBe("NEEDS_INPUT");
    expect(readiness.cutoff?.snapshotId ?? null).toBeNull();
    expect(readiness.canRunTransactionWorkflow).toBe(false);
    expect(readiness.blockers.some((b) => /cutoff|NEEDS_INPUT|delivery|missing evidence/i.test(b))).toBe(
      true,
    );
  });

  it("certified-transaction: APPROVED + reviewedAt + no deliveredAt → CUTOFF_UNRESOLVED", async () => {
    const snap = approvedNoDelivery();
    mocks.loadApprovedSnapshotsFromPrisma.mockResolvedValue([snap]);
    mocks.loadCutoffEligibleSnapshotsFromPrisma.mockResolvedValue([snap]);
    const attempt = await attemptCertifiedTransaction({
      companyId: CO,
      evaluationDate: "2026-08-01",
      verifiedPackage: null,
    });
    expect(attempt.cutoffState).toBe("NEEDS_INPUT");
    expect(attempt.approvedSnapshotId).toBeNull();
    expect(attempt.blockers).toContain("CUTOFF_UNRESOLVED");
    expect(attempt.capacity).toBeNull();
  });

  it("both entrypoints may resolve when persisted delivery is present", async () => {
    const snap = approvedWithDelivery();
    mocks.loadApprovedSnapshotsFromPrisma.mockResolvedValue([snap]);
    mocks.loadCutoffEligibleSnapshotsFromPrisma.mockResolvedValue([snap]);

    const readiness = await loadTransactionWorkflowReadiness(CO, {
      evaluationDate: "2026-08-01",
      selector: NS4_PRODUCT_CUTOFF_SELECTOR,
    });
    expect(readiness.cutoff?.state).toBe("RESOLVED");
    expect(readiness.cutoff?.snapshotId).toBe("snap-approved-with-delivery");

    const attempt = await attemptCertifiedTransaction({
      companyId: CO,
      evaluationDate: "2026-08-01",
      verifiedPackage: null,
    });
    expect(attempt.cutoffState).toBe("RESOLVED");
    expect(attempt.approvedSnapshotId).toBe("snap-approved-with-delivery");
    // Still blocked for missing VEP — but cutoff itself resolved.
    expect(attempt.blockers).toContain("NO_VERIFIED_EXECUTION_PACKAGE");
    expect(attempt.blockers).not.toContain("CUTOFF_UNRESOLVED");
  });

  it("Dashboard / Position / Simulate binder: APPROVED + reviewedAt + no deliveredAt → no cutoff", async () => {
    const snap = approvedNoDelivery();
    mocks.loadApprovedSnapshotsFromPrisma.mockResolvedValue([snap]);
    mocks.loadCutoffEligibleSnapshotsFromPrisma.mockResolvedValue([snap]);

    const evalDate = "2026-08-01";
    const [binder, dash, readiness, certified] = await Promise.all([
      loadApprovedFinancialInputBundle({ companyId: CO, evaluationDate: evalDate }),
      loadNs4DashboardFinancialState({ companyId: CO, evaluationDate: evalDate }),
      loadTransactionWorkflowReadiness(CO, {
        evaluationDate: evalDate,
        selector: NS4_PRODUCT_CUTOFF_SELECTOR,
      }),
      attemptCertifiedTransaction({
        companyId: CO,
        evaluationDate: evalDate,
        verifiedPackage: null,
      }),
    ]);

    // Shared binder drives Position / Simulate; Dashboard uses the same readiness cutoff.
    // Approval + reviewedAt without persisted delivery never invents a bound identity.
    expect(binder.selector).toBe(NS4_PRODUCT_CUTOFF_SELECTOR);
    expect(binder.cutoff.state).toBe("NEEDS_INPUT");
    expect(binder.boundSnapshotId).toBeNull();
    expect(binder.status).toBe("APPROVED_INVENTORY");
    expect(binder.missingInputs).toContain("contractual_cutoff");

    expect(dash.cutoff.state).toBe("NEEDS_INPUT");
    expect(dash.boundSnapshot).toBeNull();
    expect(dash.status).not.toBe("APPROVED_BOUND");

    expect(readiness.cutoff?.state).toBe("NEEDS_INPUT");
    expect(readiness.cutoff?.snapshotId ?? null).toBeNull();

    expect(certified.cutoffState).toBe("NEEDS_INPUT");
    expect(certified.approvedSnapshotId).toBeNull();
    expect(certified.blockers).toContain("CUTOFF_UNRESOLVED");

    // Same unresolved identity across surfaces.
    expect(binder.cutoff.approvedSnapshotId).toBeNull();
    expect(dash.cutoff.approvedSnapshotId).toBeNull();
    expect(certified.approvedSnapshotId).toBe(readiness.cutoff?.snapshotId ?? null);
  });

  it("Dashboard / Position / Simulate share one eligible identity when delivery is persisted", async () => {
    const snap = approvedWithDelivery();
    mocks.loadApprovedSnapshotsFromPrisma.mockResolvedValue([snap]);
    mocks.loadCutoffEligibleSnapshotsFromPrisma.mockResolvedValue([snap]);

    const evalDate = "2026-08-01";
    const [binder, dash, readiness, certified] = await Promise.all([
      loadApprovedFinancialInputBundle({ companyId: CO, evaluationDate: evalDate }),
      loadNs4DashboardFinancialState({ companyId: CO, evaluationDate: evalDate }),
      loadTransactionWorkflowReadiness(CO, {
        evaluationDate: evalDate,
        selector: NS4_PRODUCT_CUTOFF_SELECTOR,
      }),
      attemptCertifiedTransaction({
        companyId: CO,
        evaluationDate: evalDate,
        verifiedPackage: null,
      }),
    ]);

    expect(binder.status).toBe("APPROVED_BOUND");
    expect(binder.boundSnapshotId).toBe("snap-approved-with-delivery");
    expect(dash.status).toBe("APPROVED_BOUND");
    expect(dash.boundSnapshot?.snapshotId).toBe("snap-approved-with-delivery");
    expect(readiness.cutoff?.snapshotId).toBe("snap-approved-with-delivery");
    expect(certified.approvedSnapshotId).toBe("snap-approved-with-delivery");
    expect(binder.boundSnapshotId).toBe(dash.boundSnapshot?.snapshotId);
    expect(binder.boundSnapshotId).toBe(readiness.cutoff?.snapshotId);
    expect(binder.boundSnapshotId).toBe(certified.approvedSnapshotId);
  });
});
