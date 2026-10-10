/**
 * Permanent regression — secured borrowing must satisfy BOTH applicable debt
 * and lien restrictions. Uses seed COHERENT_DATA (no Neon).
 *
 * Labels: MODELED / EVALUATION_SEED_NOT_NS4_APPROVED — not verified remaining.
 */
import { describe, expect, it } from "vitest";
import {
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  simulateDebtIncurrence,
} from "../../lib/covenant-engine";
import { COHERENT_CREDIT_AGREEMENT_ID, COHERENT_DATA, COHERENT_INDENTURE_ID } from "../../prisma/seed-data";

describe("secured debt+lien binding (permanent regression)", () => {
  const position = computeCovenantPosition(COHERENT_DATA);

  it("package-wide MODELED secured is Indenture mila ~$4,041M not CA TNL ~$5,129M", () => {
    expect(position.crossDocumentSecured.capacity).toBeCloseTo(4041, 0);
    expect(position.crossDocumentSecured.bindingDocumentId).toBe(COHERENT_INDENTURE_ID);
    expect(position.crossDocumentUnsecured.capacity).toBeCloseTo(5129, 0);
    expect(position.crossDocumentUnsecured.bindingDocumentId).toBe(COHERENT_CREDIT_AGREEMENT_ID);

    // Without solver context, legacy per-doc min already binds Indenture; with
    // packageAuthoritative the customer remaining is MODELED_CROSS_DOCUMENT.
    const rem = computeRemainingCapacityAfterDebtIncurrence(COHERENT_DATA, position, 0, true);
    expect(rem.packageAuthoritative?.authority).toBe("MODELED_CROSS_DOCUMENT");
    expect(rem.packageAuthoritative?.label).toBe("MODELED / EVALUATION_SEED_NOT_NS4_APPROVED");
    expect(rem.packageAuthoritative?.remainingCapacity).toBeCloseTo(4041, 0);
    expect(rem.packageAuthoritative?.solverAuthority).toBe("NON_AUTHORITATIVE_DIAGNOSTIC");
    expect(rem.remainingCapacity).toBeCloseTo(4041, 0);
    expect(rem.remainingCapacity).not.toBeCloseTo(5129, 0);
  });

  it("unsecured package remaining remains CA TNL ~$5,129M", () => {
    const rem = computeRemainingCapacityAfterDebtIncurrence(COHERENT_DATA, position, 0, false);
    expect(rem.remainingCapacity).toBeCloseTo(5129, 0);
    expect(rem.packageAuthoritative?.remainingCapacity).toBeCloseTo(5129, 0);
  });

  it("simulateDebtIncurrence secured binding document is Indenture", () => {
    const result = simulateDebtIncurrence(COHERENT_DATA, position, 100, true);
    expect(result.binding?.documentId).toBe(COHERENT_INDENTURE_ID);
  });
});
