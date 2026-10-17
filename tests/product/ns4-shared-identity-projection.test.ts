/**
 * Rule 79 — the shared NS-4 identity must not invent a bound
 * snapshot from a different context.
 *
 * sharedIdentityFromApprovedBundle built boundSnapshotId as
 * `bundle.boundSnapshotId ?? authoritative.cutoff.approvedSnapshotId`.
 * When the bundle did not bind, the fallback pulled the
 * authoritative capacity's snapshot — which may have been computed
 * with a different evaluation date / selector — and labeled it the
 * bundle's bound snapshot. The consistency check then compared
 * authoritative to itself (circular) and reported "consistent"
 * when the bundle contributed nothing. boundSnapshotId is now
 * exactly the bundle's own binding.
 */
import { describe, expect, it } from "vitest";
import { sharedIdentityFromApprovedBundle } from "../../lib/product/ns4-shared-identity-projection";
import type { ApprovedFinancialInputBundle } from "../../lib/product/north-star-workflow/approved-financial-inputs";
import type { AuthoritativeCapacityResult } from "../../lib/product/north-star-workflow/authoritative-capacity";

function bundle(overrides: Partial<ApprovedFinancialInputBundle> = {}): ApprovedFinancialInputBundle {
  return {
    companyId: "co-1",
    status: "APPROVED_INVENTORY",
    evaluationDate: "2026-06-30",
    selector: "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE",
    cutoff: {
      state: "NEEDS_INPUT",
      reportingPeriodKey: null,
      asOf: null,
      approvedSnapshotId: null,
      cutoffSnapshotId: null,
      cutoffSnapshotStatus: null,
    },
    boundSnapshotId: null,
    boundSnapshot: null,
    financialInputFingerprint: null,
    authority: { kind: "NONE", disclosure: "none" } as unknown as ApprovedFinancialInputBundle["authority"],
    factKeys: [],
    leverageIr: {
      status: "NEEDS_INPUT",
      computedRatio: null,
      totalNetLeverage: null,
      missingInputs: [],
      evidence: [],
    } as unknown as ApprovedFinancialInputBundle["leverageIr"],
    verifiedCapacity: null,
    missingInputs: [],
    evidence: [],
    reusableFor: [
      "dashboard_leverage",
      "debt_capacity",
      "liens_capacity",
      "investments_capacity",
      "restricted_payments_capacity",
      "transaction_simulation",
    ] as const,
    ...overrides,
  };
}

function authoritative(approvedSnapshotId: string | null): AuthoritativeCapacityResult {
  return {
    companyId: "co-1",
    evaluationDate: "2026-06-30",
    status: "NEEDS_INPUT",
    authority: "NOT_CERTIFIED_4E",
    cutoff: {
      state: "RESOLVED",
      reportingPeriodKey: "2026Q2",
      asOf: "2026-06-30",
      approvedSnapshotId,
      cutoffSnapshotId: approvedSnapshotId,
      cutoffSnapshotStatus: approvedSnapshotId ? "APPROVED" : null,
    },
    approvedSnapshotCount: approvedSnapshotId ? 1 : 0,
    activeLedgerUsageCount: 0,
    ledgerUsages: [],
    snapshotFactKeys: [],
    certified: {
      packagePresent: false,
      capacityOutcome: null,
      blockers: [],
      authorityNote: "",
    },
    legacy: {
      capacityAuthority: "NONE",
      canEvaluateExecutableCapacity: false,
      note: "",
    },
    missingInputs: [],
    evidence: [],
  };
}

describe("sharedIdentityFromApprovedBundle", () => {
  it("does NOT fall back to authoritative's snapshot when the bundle did not bind", () => {
    const identity = sharedIdentityFromApprovedBundle(
      bundle({ status: "APPROVED_INVENTORY", boundSnapshotId: null }),
      authoritative("snap-auth"),
    );
    expect(identity.boundSnapshotId).toBeNull();
    // The bundle did not bind but authoritative did — they disagree.
    expect(identity.identityConsistentWithAuthoritative).toBe(false);
  });

  it("reports the bundle's own binding when it bound", () => {
    const identity = sharedIdentityFromApprovedBundle(
      bundle({ status: "APPROVED_BOUND", boundSnapshotId: "snap-bundle" }),
      authoritative("snap-bundle"),
    );
    expect(identity.boundSnapshotId).toBe("snap-bundle");
    expect(identity.identityConsistentWithAuthoritative).toBe(true);
  });

  it("reports inconsistency when bundle and authoritative bind different snapshots", () => {
    const identity = sharedIdentityFromApprovedBundle(
      bundle({ status: "APPROVED_BOUND", boundSnapshotId: "snap-bundle" }),
      authoritative("snap-auth"),
    );
    expect(identity.boundSnapshotId).toBe("snap-bundle");
    expect(identity.identityConsistentWithAuthoritative).toBe(false);
  });
});
