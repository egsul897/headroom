/**
 * Authentic CONMED multi-family: extract → fidelity compile → REQUIRE enum/cap/sim.
 * Remaining always null. No invented baskets.
 */
import { describe, expect, it } from "vitest";
import {
  compileConmedAuthenticMultiFamily,
  evaluateAuthenticTransaction,
  extractConmedMultiFamilyCandidates,
} from "@/lib/product/authentic-multi-family";
import { parseTransactionDraft } from "@/lib/product/north-star-workflow/transaction-analysis";

describe("authentic multi-family CONMED", () => {
  it("extracts source-backed RP / Investments / Asset Sale candidates from fixture", () => {
    const c = extractConmedMultiFamilyCandidates();
    expect(c.map((x) => x.family).sort()).toEqual(
      ["ASSET_SALES", "INVESTMENTS", "RESTRICTED_PAYMENTS"].sort(),
    );
    expect(c.every((x) => x.operativeSourceText.length > 40)).toBe(true);
    expect(c.every((x) => x.documentId.includes("conmed"))).toBe(true);
  });

  it("compiles three independently GROSS-executable units with remaining null", () => {
    const compiled = compileConmedAuthenticMultiFamily("2024-12-31");
    expect(compiled.independentlyExecutableFamilies.sort()).toEqual(
      ["ASSET_SALES", "INVESTMENTS", "RESTRICTED_PAYMENTS"].sort(),
    );
    expect(compiled.failedFamilies).toEqual([]);
    expect(compiled.verifiedPackage?.rules.length).toBe(3);
    for (const u of compiled.units) {
      expect(u.status).toBe("VERIFIED_EXECUTABLE_GROSS");
      expect(u.fidelityVerdict).toBe("PASS");
      expect(u.verifiedRemainingUsd).toBeNull();
      expect(u.operativeDocumentId).toBeTruthy();
      expect(u.sourceCitation).toMatch(/§7\./);
      expect(u.grossCapacityUsd).toBeGreaterThan(0);
    }
    const rp = compiled.units.find((u) => u.family === "RESTRICTED_PAYMENTS")!;
    expect(rp.grossCapacityUsd).toBe(40_000_000);
  });

  it("REQUIRE path enum + capacity + simulate for RP / investment / asset sale", () => {
    const compiled = compileConmedAuthenticMultiFamily("2024-12-31");
    for (const kind of ["RESTRICTED_PAYMENT", "INVESTMENT", "ASSET_SALE"] as const) {
      const ev = evaluateAuthenticTransaction({
        compiled,
        kind,
        amountMillions: 20,
        evaluationDate: "2024-12-31",
      });
      expect(ev.pathEnumerationAuthority).toBe("CERTIFIED_4E");
      expect(ev.pathCount).toBeGreaterThanOrEqual(1);
      expect(ev.selectedPathId).toBeTruthy();
      expect(ev.capacityOutcome).toBeTruthy();
      expect(ev.simulationOutcome).toBeTruthy();
      expect(ev.verifiedRemainingUsd).toBeNull();
      // Never claim affirmative customer PERMITTED without completeness.
      expect(ev.overallConclusion).toMatch(/not VERIFIED_TRANSACTION_PERMITTED/);
      expect(ev.overallConclusion).not.toMatch(/\bVERIFIED_TRANSACTION_PERMITTED\b(?!.*null)/);
      expect(ev.truthfulBlocker).toBeTruthy();
    }
  });

  it("parseTransactionDraft classifies asset sale asks", () => {
    const d = parseTransactionDraft(
      "Can we complete a $40 million asset sale disposition on 2024-12-31?",
    );
    expect(d.kind).toBe("ASSET_SALE");
    expect(d.amountMillions).toBe(40);
    expect(d.evaluationDate).toBe("2024-12-31");
  });
});
