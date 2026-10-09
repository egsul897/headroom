import { describe, expect, it } from "vitest";
import {
  parseTransactionDraft,
  listDemoTransactionFixtures,
} from "@/lib/product/north-star-workflow";

describe("transaction draft parsing", () => {
  it("extracts date, amount, and secured debt kind without inventing missing fields", () => {
    const d = parseTransactionDraft("Can we incur $100 million of secured debt on 2026-08-01?");
    expect(d.evaluationDate).toBe("2026-08-01");
    expect(d.amountMillions).toBe(100);
    expect(d.kind).toBe("SECURED_DEBT");
    expect(d.secured).toBe(true);
    expect(d.missingConfirmations).toEqual([]);
  });

  it("fails closed on missing evaluation date", () => {
    const d = parseTransactionDraft("Can we incur $75 million restricted payment?");
    expect(d.evaluationDate).toBeNull();
    expect(d.amountMillions).toBe(75);
    expect(d.kind).toBe("RESTRICTED_PAYMENT");
    expect(d.missingConfirmations).toContain("evaluationDate (YYYY-MM-DD)");
  });
});

describe("demo transaction fixtures", () => {
  it("exposes synthetic $100M / $75M / $150M demos labeled not certified", () => {
    const fx = listDemoTransactionFixtures();
    expect(fx.map((f) => f.amountMillions).sort((a, b) => a - b)).toEqual([75, 100, 150]);
    for (const f of fx) {
      expect(f.authorityNote).toMatch(/NOT_CERTIFIED_4E|SYNTHETIC/);
    }
  });
});
