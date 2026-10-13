/**
 * Product surfaces (#334 binder) and package resolver share one NS-4 authority.
 */
import { describe, expect, it, vi } from "vitest";
import {
  mayClaimVerifiedRemaining,
  resolveCanonicalFinancialInputs,
  MATTHEWS_PKG,
} from "@/lib/product/financial-metric-resolver";
import { makeTestApprovedNs4SnapshotForPackage } from "./ns4-approved-fixture";

vi.mock("@/lib/product/north-star-workflow/approved-financial-inputs", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/product/north-star-workflow/approved-financial-inputs")
  >("@/lib/product/north-star-workflow/approved-financial-inputs");
  return {
    ...actual,
    loadApprovedFinancialInputBundle: vi.fn(),
  };
});

import { loadApprovedFinancialInputBundle } from "@/lib/product/north-star-workflow/approved-financial-inputs";
import { resolveCanonicalFinancialInputsViaProductBinder } from "@/lib/product/financial-metric-resolver/product-bridge";
import { classifyApprovedSnapshotAuthority } from "@/lib/financial-certificate-engine/authority";

describe("product binder ↔ package resolver shared authority", () => {
  it("uses the binder boundSnapshot identity for approved-value provenance", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    const authority = classifyApprovedSnapshotAuthority({
      reviewedBy: snap.review.reviewedBy,
      approvalRef: snap.review.approvalRef,
      productionContext: false,
    });

    vi.mocked(loadApprovedFinancialInputBundle).mockResolvedValue({
      companyId: MATTHEWS_PKG.companyId,
      status: "APPROVED_BOUND",
      evaluationDate: MATTHEWS_PKG.asOf,
      selector: "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE",
      cutoff: {
        state: "RESOLVED",
        reportingPeriodKey: MATTHEWS_PKG.measurementPeriod,
        asOf: MATTHEWS_PKG.asOf,
        approvedSnapshotId: snap.snapshotId,
      },
      boundSnapshotId: snap.snapshotId,
      boundSnapshot: snap,
      financialInputFingerprint: "fp-test",
      authority,
      factKeys: snap.inputs.map((i) => i.identity.key),
      leverageIr: {
        status: "NEEDS_INPUT",
        totalNetLeverage: null,
        missingInputs: [],
        evidence: [],
        inputsUsed: [],
      } as never,
      verifiedCapacity: null,
      missingInputs: [],
      evidence: ["test"],
      reusableFor: [
        "dashboard_leverage",
        "debt_capacity",
        "liens_capacity",
        "investments_capacity",
        "restricted_payments_capacity",
        "transaction_simulation",
      ],
    });

    const result = await resolveCanonicalFinancialInputsViaProductBinder({
      packageKey: MATTHEWS_PKG.packageKey,
      companyId: MATTHEWS_PKG.companyId,
      evaluationDate: MATTHEWS_PKG.asOf,
    });

    expect(result.productBinder.boundSnapshotId).toBe(snap.snapshotId);
    expect(result.sameBoundSnapshotIdentity).toBe(true);
    expect(result.packageBundle!.capacityPublication).toBe("GROSS_FROM_APPROVED_SNAPSHOT");
    expect(
      result.packageBundle!.facts.every((f) => f.approvedProvenance?.snapshotId === snap.snapshotId),
    ).toBe(true);
    // Gross ≠ verified remaining (missing utilization completeness)
    expect(mayClaimVerifiedRemaining(result.packageBundle!)).toBe(false);
  });

  it("unbound product binder does not manufacture APPROVED package facts", async () => {
    vi.mocked(loadApprovedFinancialInputBundle).mockResolvedValue({
      companyId: MATTHEWS_PKG.companyId,
      status: "APPROVED_INVENTORY",
      evaluationDate: null,
      selector: "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE",
      cutoff: {
        state: "NEEDS_INPUT",
        reportingPeriodKey: null,
        asOf: null,
        approvedSnapshotId: null,
      },
      boundSnapshotId: null,
      boundSnapshot: null,
      financialInputFingerprint: null,
      authority: classifyApprovedSnapshotAuthority({ reviewedBy: null, approvalRef: null }),
      factKeys: [],
      leverageIr: {
        status: "NEEDS_INPUT",
        totalNetLeverage: null,
        missingInputs: ["evaluationDate"],
        evidence: [],
        inputsUsed: [],
      } as never,
      verifiedCapacity: null,
      missingInputs: ["evaluationDate", "contractual_cutoff"],
      evidence: ["unbound"],
      reusableFor: [
        "dashboard_leverage",
        "debt_capacity",
        "liens_capacity",
        "investments_capacity",
        "restricted_payments_capacity",
        "transaction_simulation",
      ],
    });

    const result = await resolveCanonicalFinancialInputsViaProductBinder({
      packageKey: MATTHEWS_PKG.packageKey,
      companyId: MATTHEWS_PKG.companyId,
    });

    expect(result.sameBoundSnapshotIdentity).toBe(false);
    expect(result.packageBundle!.capacityPublication).toBe("GROSS_PROVISIONAL_ONLY");
    expect(result.packageBundle!.facts.every((f) => f.approvedProvenance == null)).toBe(true);
  });

  it("direct resolve with binder snapshot matches bridge package bundle fingerprint inputs", async () => {
    const snap = makeTestApprovedNs4SnapshotForPackage(MATTHEWS_PKG);
    const direct = await resolveCanonicalFinancialInputs({
      packageKey: MATTHEWS_PKG.packageKey,
      approvedNs4Snapshot: snap,
    });
    expect(direct!.facts[0]!.approvedProvenance?.snapshotId).toBe(snap.snapshotId);
    expect(direct!.notes.some((n) => /UNKNOWN utilization|verified remaining/i.test(n))).toBe(true);
  });
});
