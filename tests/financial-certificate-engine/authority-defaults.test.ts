/**
 * Fail-closed FCE metadata defaults — missing fields never upgrade to trusted.
 */

import { describe, expect, it } from "vitest";
import {
  publishRemainingCapacity,
  classifyApprovedSnapshotAuthority,
} from "@/lib/financial-certificate-engine";

const BASE_RECORD = {
  usageId: "u1",
  capacityRuleId: "general_debt",
  amountMillions: 25,
  effectiveAsOf: "2026-01-01",
  status: "ACTIVE" as const,
};

const SHAPE_ONLY_CERT = {
  capacityRuleId: "general_debt",
  asOf: "2026-06-30",
  kind: "VERIFIED_COMPLETE" as const,
  approvalState: "APPROVED" as const,
  sourceLabel: "shape-only schedule",
};

describe("FCE authority defaults — utilization metadata", () => {
  it("publishes remaining when evidence + trusted completeness + gate are complete", () => {
    const pub = publishRemainingCapacity({
      capacityRuleId: "general_debt",
      asOf: "2026-06-30",
      grossCapacityMillions: 100,
      gateSatisfied: true,
      records: [
        {
          ...BASE_RECORD,
          authenticity: "AUTHENTIC",
          approvalState: "APPROVED",
          sourceLabel: "counsel ledger",
        },
      ],
      completenessCertificate: {
        ...SHAPE_ONLY_CERT,
        trustedCompletenessProvenance: true,
      },
    });
    expect(pub.status).toBe("REMAINING_SUPPORTED");
    expect(pub.remainingCapacityMillions).toBe(75);
    expect(pub.supportsRemainingClaim).toBe(true);
  });

  it("refuses remaining when authenticity is omitted (not defaulted to AUTHENTIC)", () => {
    const pub = publishRemainingCapacity({
      capacityRuleId: "general_debt",
      asOf: "2026-06-30",
      grossCapacityMillions: 100,
      gateSatisfied: true,
      records: [{ ...BASE_RECORD, approvalState: "APPROVED" }],
      completenessCertificate: {
        ...SHAPE_ONLY_CERT,
        trustedCompletenessProvenance: true,
      },
    });
    expect(pub.supportsRemainingClaim).toBe(false);
    expect(pub.remainingCapacityMillions).toBeNull();
    expect(pub.reason).toMatch(/lacking explicit authenticity\/approvalState/i);
  });

  it("refuses remaining when approvalState is omitted (not defaulted to APPROVED)", () => {
    const pub = publishRemainingCapacity({
      capacityRuleId: "general_debt",
      asOf: "2026-06-30",
      grossCapacityMillions: 100,
      gateSatisfied: true,
      records: [{ ...BASE_RECORD, authenticity: "AUTHENTIC" }],
      completenessCertificate: {
        ...SHAPE_ONLY_CERT,
        trustedCompletenessProvenance: true,
      },
    });
    expect(pub.supportsRemainingClaim).toBe(false);
    expect(pub.remainingCapacityMillions).toBeNull();
  });

  it("refuses remaining when gateSatisfied is omitted (not affirmatively satisfied)", () => {
    const pub = publishRemainingCapacity({
      capacityRuleId: "general_debt",
      asOf: "2026-06-30",
      grossCapacityMillions: 100,
      // gateSatisfied omitted
      records: [
        {
          ...BASE_RECORD,
          authenticity: "AUTHENTIC",
          approvalState: "APPROVED",
        },
      ],
      completenessCertificate: {
        ...SHAPE_ONLY_CERT,
        trustedCompletenessProvenance: true,
      },
    });
    expect(pub.supportsRemainingClaim).toBe(false);
    expect(pub.remainingCapacityMillions).toBeNull();
    expect(pub.reason).toMatch(/gateSatisfied not affirmatively true/i);
  });

  it("ignores completeness certificate shape without trustedCompletenessProvenance", () => {
    const pub = publishRemainingCapacity({
      capacityRuleId: "general_debt",
      asOf: "2026-06-30",
      grossCapacityMillions: 100,
      gateSatisfied: true,
      records: [
        {
          ...BASE_RECORD,
          authenticity: "AUTHENTIC",
          approvalState: "APPROVED",
        },
      ],
      completenessCertificate: SHAPE_ONLY_CERT,
    });
    expect(pub.supportsRemainingClaim).toBe(false);
    expect(pub.remainingCapacityMillions).toBeNull();
    expect(pub.reason).toMatch(/trustedCompletenessProvenance/i);
  });
});

describe("FCE authority defaults — reviewer booleans", () => {
  it("does not grant REAL from productionContext alone or channel alone", () => {
    expect(
      classifyApprovedSnapshotAuthority({
        reviewedBy: "jane.counsel@acme.com",
        approvalRef: "board-1",
        productionContext: true,
      }).kind,
    ).toBe("TEST_ATTRIBUTED_APPROVAL");

    expect(
      classifyApprovedSnapshotAuthority({
        reviewedBy: "jane.counsel@acme.com",
        approvalRef: "board-1",
        trustedProductionApprovalChannel: true,
      }).kind,
    ).toBe("TEST_ATTRIBUTED_APPROVAL");
  });

  it("grants REAL only when both booleans are literal true with non-test identity", () => {
    expect(
      classifyApprovedSnapshotAuthority({
        reviewedBy: "jane.counsel@acme.com",
        approvalRef: "board-1",
        productionContext: true,
        trustedProductionApprovalChannel: true,
      }).kind,
    ).toBe("REAL_REVIEWER_APPROVED");
  });
});
