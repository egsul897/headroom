/**
 * Priority 3 — Position / Simulate / Ask share operative identity surfaces.
 * Provider-free / DB-free: does not invent VEP or bypass REQUIRE.
 */
import { describe, expect, it } from "vitest";
import { parseTransactionDraft } from "@/lib/product/north-star-workflow/transaction-analysis";
import { buildSimulateHandoffHref, simulateActionFromAskKind } from "@/lib/product/unified-position/simulate-handoff";
import { VERIFIED_EXECUTION_POLICY } from "@/lib/contract-model/verified-execution";
import { publishRemainingCapacity } from "@/lib/financial-certificate-engine/utilization-honesty";
import { resolveUtilization } from "@/lib/capacity/utilization-resolver";

describe("unified product consistency (Priority 3)", () => {
  it("Ask draft fields equal Simulate handoff query identity", () => {
    const question = "Can we incur $150 million of secured debt as of 2026-06-30?";
    const draft = parseTransactionDraft(question);
    expect(draft.kind).toBe("SECURED_DEBT");
    expect(draft.amountMillions).toBe(150);
    expect(draft.evaluationDate).toBe("2026-06-30");
    expect(draft.secured).toBe(true);

    const action = simulateActionFromAskKind(draft.kind);
    expect(action).toBeTruthy();
    const href = buildSimulateHandoffHref("demo-co", {
      action: action!,
      amountMillions: draft.amountMillions!,
      secured: draft.secured,
      evaluationDate: draft.evaluationDate,
      source: "ask",
    });
    expect(href).toContain("150");
    expect(href).toContain("2026-06-30");
    expect(href.toLowerCase()).toMatch(/secur|debt|borrow/);
  });

  it("verified execution policy is REQUIRE (no ALLOW_MISSING customer path)", () => {
    expect(VERIFIED_EXECUTION_POLICY).toBe("REQUIRE");
  });

  it("FCE remaining publication delegates to #237 — no remaining without completeness", () => {
    const pub = publishRemainingCapacity({
      capacityRuleId: "basket-a",
      asOf: "2026-06-30",
      grossCapacityMillions: 100,
      records: [
        {
          usageId: "u1",
          capacityRuleId: "basket-a",
          amountMillions: 10,
          effectiveAsOf: "2026-01-01",
          status: "ACTIVE",
        },
      ],
      completenessCertificate: null,
    });
    expect(pub.supportsRemainingClaim).toBe(false);
    expect(pub.remainingCapacityMillions).toBeNull();

    const canonical = resolveUtilization({
      capacityRuleId: "basket-a",
      asOf: "2026-06-30",
      currency: "USD_MILLIONS",
      records: [
        {
          usageId: "u1",
          kind: "ATTRIBUTED_RULE",
          amount: 10,
          currency: "USD_MILLIONS",
          effectiveAsOf: "2026-01-01",
          capacityRuleId: "basket-a",
          sharedCapacityId: null,
          legacyBasketFamily: null,
          entityKey: null,
          status: "ACTIVE",
          approvalState: "APPROVED",
          sourceLabel: "t",
          authenticity: "AUTHENTIC",
        },
      ],
      completenessCertificate: null,
    });
    expect(canonical.supportsRemainingClaim).toBe(false);
    expect(pub.supportsRemainingClaim).toBe(canonical.supportsRemainingClaim);
  });
});
