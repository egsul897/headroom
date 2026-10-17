import { describe, expect, it } from "vitest";
import { classifyCovenantFamily } from "@/lib/contract-model/section-tree/family-classifier";

describe("affiliate covenants naming a list of related parties", () => {
  it("'enter into any transaction with any officer, director, employee, shareholder or any Person not dealing at arm's length or any affiliate' is an affiliate covenant without a sibling run", () => {
    const lead = "The Corporation shall not and shall not permit any of its Subsidiaries to enter into any transaction with any officer, director, employee, shareholder or any Person not dealing at arm’s length or any affiliate of any of the foregoing unless such transaction is on terms no less favorable to the Corporation.";
    expect(classifyCovenantFamily({ title: "Transactions with Affiliates", leadIn: lead }).family).toBe("AFFILIATE_TRANSACTIONS");
  });
});

