/**
 * Adversarial (non-Coherent) + modeled-binding proofs for secured debt∩lien.
 *
 * Engine-level: election debt+lien gate and COUNTED maxCapacity (see election.test).
 * Package-level: computeRemainingCapacityAfterDebtIncurrence must not publish a
 * solver-native package min that is more favorable than MODELED cross-document
 * binding — labeled MODELED / EVALUATION_SEED_NOT_NS4_APPROVED, never CERTIFIED.
 *
 * Independent expectations from contractual ratio rooms (not engine output):
 *   SSNL ≤ 3.0x → 3×1700 − (2221−1162) = 4041
 *   TNL ≤ 4.25x → 4.25×1700 − (3258−1162) = 5129
 */
import { describe, expect, it } from "vitest";
import {
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  type CompanyCovenantData,
} from "../../lib/covenant-engine";

function syntheticPackage(): CompanyCovenantData {
  return {
    companyId: "synth-adversarial",
    documents: [
      {
        id: "synth-indenture",
        name: "Synthetic Notes Indenture",
        type: "INDENTURE",
        capacityFormulas: {
          secured: { op: "REF", code: "mila_secured" },
          unsecured: { op: "REF", code: "tnl_unsecured" },
        },
      },
      {
        id: "synth-ca",
        name: "Synthetic Credit Agreement",
        type: "CREDIT_AGREEMENT",
        capacityFormulas: {
          secured: { op: "REF", code: "ca_secured" },
          unsecured: { op: "REF", code: "ca_tnl" },
        },
      },
    ],
    provisions: [
      {
        id: "p-mila",
        documentId: "synth-indenture",
        code: "mila_secured",
        basketName: "MILA secured",
        sectionRef: "§3.3(b)(i)(C)",
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 3.0,
        params: { debtBasis: "secured" },
      },
      {
        id: "p-tnl",
        documentId: "synth-indenture",
        code: "tnl_unsecured",
        basketName: "TNL unsecured",
        sectionRef: "§ratio",
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 4.25,
        params: { debtBasis: "total" },
      },
      {
        id: "p-ca-sec",
        documentId: "synth-ca",
        code: "ca_secured",
        basketName: "CA secured",
        sectionRef: "§6.01",
        // Intentionally looser than Indenture SSNL — false-favorable if chosen for secured.
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 4.25,
        params: { debtBasis: "total" },
      },
      {
        id: "p-ca-tnl",
        documentId: "synth-ca",
        code: "ca_tnl",
        basketName: "CA TNL",
        sectionRef: "§6.11",
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 4.25,
        params: { debtBasis: "total" },
      },
    ],
    financials: {
      ebitda: 1700,
      cash: 1162,
      totalDebt: 3258,
      securedDebt: 2221,
      interestExpense: 190,
      cumulativeNetIncome: 520,
      equityProceedsSinceIssue: 2150,
      assumedNewDebtRatePct: 6.5,
    },
    ledger: [],
  };
}

describe("secured debt package binding (adversarial synthetic)", () => {
  it("MODELED package secured binds to Indenture SSNL $4041, not CA TNL-shaped $5129", () => {
    const data = syntheticPackage();
    const pos = computeCovenantPosition(data);
    expect(pos.crossDocumentSecured.status).toBe("modeled");
    expect(pos.crossDocumentSecured.capacity).toBeCloseTo(4041, 5);
    expect(pos.crossDocumentSecured.bindingDocumentId).toBe("synth-indenture");
    expect(pos.crossDocumentUnsecured.capacity).toBeCloseTo(5129, 5);

    const rem = computeRemainingCapacityAfterDebtIncurrence(data, pos, 0, true);
    expect(rem.packageAuthoritative?.authority).toBe("MODELED_CROSS_DOCUMENT");
    expect(rem.packageAuthoritative?.label).toBe("MODELED / EVALUATION_SEED_NOT_NS4_APPROVED");
    expect(rem.packageAuthoritative?.remainingCapacity).toBeCloseTo(4041, 5);
    expect(rem.remainingCapacity).toBeCloseTo(4041, 5);
    // Must not publish the looser TNL-shaped $5129 as secured package remaining.
    expect(rem.remainingCapacity!).toBeLessThan(5000);
  });

  it("does not promote modeled binding to certified permission", () => {
    const data = syntheticPackage();
    const pos = computeCovenantPosition(data);
    const rem = computeRemainingCapacityAfterDebtIncurrence(data, pos, 100, true);
    expect(rem.packageAuthoritative?.authority).toBe("MODELED_CROSS_DOCUMENT");
    expect(rem.packageAuthoritative?.label).toBe("MODELED / EVALUATION_SEED_NOT_NS4_APPROVED");
    expect(rem.packageAuthoritative?.label.startsWith("MODELED")).toBe(true);
    expect(rem.packageAuthoritative?.solverAuthority).toBe("NON_AUTHORITATIVE_DIAGNOSTIC");
    expect(rem.remainingCapacity).toBeCloseTo(3941, 5);
  });
});
