/**
 * Fail-closed FCE metadata defaults — missing fields never upgrade to trusted.
 * Look-alike user JSON flags never mint production trust.
 */

import { describe, expect, it } from "vitest";
import {
  publishRemainingCapacity,
  classifyApprovedSnapshotAuthority,
  mintTrustedCompletenessCertificate,
  mintTrustedProductionApprovalChannel,
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

function mintedCert(label = "authorized loader schedule") {
  return mintTrustedCompletenessCertificate(SHAPE_ONLY_CERT, {
    authorizedApplicationLoader: true,
    provenanceLabel: label,
  });
}

describe("FCE authority defaults — utilization metadata", () => {
  it("publishes remaining when evidence + minted trusted completeness + gate are complete", () => {
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
      completenessCertificate: mintedCert(),
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
      completenessCertificate: mintedCert(),
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
      completenessCertificate: mintedCert(),
    });
    expect(pub.supportsRemainingClaim).toBe(false);
    expect(pub.remainingCapacityMillions).toBeNull();
  });

  it("refuses remaining when gateSatisfied is omitted (not affirmatively satisfied)", () => {
    const pub = publishRemainingCapacity({
      capacityRuleId: "general_debt",
      asOf: "2026-06-30",
      grossCapacityMillions: 100,
      records: [
        {
          ...BASE_RECORD,
          authenticity: "AUTHENTIC",
          approvalState: "APPROVED",
        },
      ],
      completenessCertificate: mintedCert(),
    });
    expect(pub.supportsRemainingClaim).toBe(false);
    expect(pub.remainingCapacityMillions).toBeNull();
    expect(pub.reason).toMatch(/gateSatisfied not affirmatively true/i);
  });

  it("ignores completeness certificate shape and look-alike trustedCompletenessProvenance flags", () => {
    const shapeOnly = publishRemainingCapacity({
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
    expect(shapeOnly.supportsRemainingClaim).toBe(false);
    expect(shapeOnly.reason).toMatch(/minted trusted provenance/i);

    const lookAlike = publishRemainingCapacity({
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
      // User/API JSON cannot mint trust by setting the enumerable flag.
      completenessCertificate: {
        ...SHAPE_ONLY_CERT,
        trustedCompletenessProvenance: true,
      } as typeof SHAPE_ONLY_CERT & { trustedCompletenessProvenance: true },
    });
    expect(lookAlike.supportsRemainingClaim).toBe(false);
    expect(lookAlike.remainingCapacityMillions).toBeNull();
  });
});

describe("FCE authority defaults — reviewer channel tokens", () => {
  it("does not grant REAL from productionContext alone or bare boolean channel", () => {
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
        productionContext: true,
        trustedProductionApprovalChannel: true, // bare boolean from user JSON
      }).kind,
    ).toBe("TEST_ATTRIBUTED_APPROVAL");
  });

  it("grants REAL only with minted channel token + productionContext + non-test identity", () => {
    const channel = mintTrustedProductionApprovalChannel({ authorizedApplicationLoader: true });
    expect(
      classifyApprovedSnapshotAuthority({
        reviewedBy: "jane.counsel@acme.com",
        approvalRef: "board-1",
        productionContext: true,
        trustedProductionApprovalChannel: channel,
      }).kind,
    ).toBe("REAL_REVIEWER_APPROVED");
  });
});
