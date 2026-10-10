import { describe, expect, it } from "vitest";
import {
  buildSimulateHandoffHref,
  parseSimulateHandoffSearchParams,
  simulateActionFromAskKind,
} from "@/lib/product/unified-position/simulate-handoff";
import { parseTransactionDraft } from "@/lib/product/north-star-workflow/transaction-analysis";

describe("Ask → Simulate handoff", () => {
  it("maps Ask kinds onto Simulate tabs", () => {
    expect(simulateActionFromAskKind("SECURED_DEBT")).toBe("debt");
    expect(simulateActionFromAskKind("UNSECURED_DEBT")).toBe("debt");
    expect(simulateActionFromAskKind("RESTRICTED_PAYMENT")).toBe("rp");
    expect(simulateActionFromAskKind("INVESTMENT")).toBe("investment");
    expect(simulateActionFromAskKind("UNKNOWN")).toBeNull();
  });

  it("builds and parses a round-trip deep link", () => {
    const href = buildSimulateHandoffHref("acme", {
      action: "debt",
      amountMillions: 100,
      secured: true,
      evaluationDate: "2026-08-01",
      source: "ask",
    });
    expect(href).toBe("/acme/simulate?action=debt&amount=100&secured=1&asOf=2026-08-01&from=ask");
    const q = href.split("?")[1]!;
    const parsed = parseSimulateHandoffSearchParams(new URLSearchParams(q));
    expect(parsed).toEqual({
      action: "debt",
      amountMillions: 100,
      secured: true,
      evaluationDate: "2026-08-01",
      source: "ask",
    });
  });

  it("Ask draft for secured debt seeds a Simulate debt handoff", () => {
    const d = parseTransactionDraft("Can we incur $100 million of secured debt on 2026-08-01?");
    const action = simulateActionFromAskKind(d.kind);
    expect(action).toBe("debt");
    const href = buildSimulateHandoffHref("co", {
      action: action!,
      amountMillions: d.amountMillions!,
      secured: d.secured,
      evaluationDate: d.evaluationDate,
      source: "ask",
    });
    expect(href).toContain("amount=100");
    expect(href).toContain("secured=1");
    expect(href).toContain("from=ask");
  });
});
