/**
 * Rule 34 — derived transaction IDs must not collide under truncation.
 *
 * buildConsumeTransaction derived the transactionId as
 * `ask-sim-<company>-<date>-<ruleId>-<amount>` sliced to 120
 * chars. With a long ruleId the slice cut off the AMOUNT — the
 * distinguishing suffix — so two simulates for different amounts
 * produced the SAME transactionId. The id feeds proposed usage
 * ids (`<transactionId>::<effectId>`) and transactionRef
 * provenance, so a collision conflates two different simulations.
 * Long ids now keep the cap but append a hash of the full string
 * instead of silently dropping the amount.
 */
import { describe, expect, it } from "vitest";
import { buildConsumeTransaction } from "../../lib/product/unified-position/consume-transaction";

describe("buildConsumeTransaction transactionId", () => {
  it("different amounts with a long ruleId produce different ids", () => {
    const ruleId = `rule:${"very-long-rule-identifier-".repeat(4)}basket`;
    const a = buildConsumeTransaction({
      companyId: "cmv9xxnzx0000cxtotzje4io0",
      instrumentKey: "inst",
      evaluationDate: "2026-06-30",
      amountDollars: "100000000",
      ruleId,
      label: "test",
    });
    const b = buildConsumeTransaction({
      companyId: "cmv9xxnzx0000cxtotzje4io0",
      instrumentKey: "inst",
      evaluationDate: "2026-06-30",
      amountDollars: "200000000",
      ruleId,
      label: "test",
    });
    expect(a.transaction.transactionId).not.toBe(b.transaction.transactionId);
    expect(a.transaction.transactionId.length).toBeLessThanOrEqual(120);
    expect(b.transaction.transactionId.length).toBeLessThanOrEqual(120);
  });

  it("short ids keep the exact readable form", () => {
    const t = buildConsumeTransaction({
      companyId: "co",
      instrumentKey: "inst",
      evaluationDate: "2026-06-30",
      amountDollars: "100000000",
      ruleId: "rule-a",
      label: "test",
    });
    expect(t.transaction.transactionId).toBe("ask-sim-co-2026-06-30-rule-a-100000000");
  });

  it("same inputs produce the same id (deterministic)", () => {
    const args = {
      companyId: "cmv9xxnzx0000cxtotzje4io0",
      instrumentKey: "inst",
      evaluationDate: "2026-06-30",
      amountDollars: "100000000",
      ruleId: `rule:${"very-long-rule-identifier-".repeat(4)}basket`,
      label: "test",
    };
    expect(buildConsumeTransaction(args).transaction.transactionId).toBe(
      buildConsumeTransaction(args).transaction.transactionId,
    );
  });
});
