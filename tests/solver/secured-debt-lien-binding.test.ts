/**
 * Permanent regression — secured borrowing must satisfy BOTH applicable debt
 * and lien restrictions. Guards the Coherent false-favorable path where
 * Indenture Ratio Debt free-rode SCF cl.(6) auto-lien, producing ~$11,933
 * indenture secured capacity and a package-wide solver figure of $5,129M
 * (CA TNL) that omitted Indenture mila_secured / SSNL ($4,041M).
 *
 * Labels: MODELED / EVALUATION_SEED_NOT_NS4_APPROVED — not verified remaining capacity.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { buildSolverContext, getCompanyDashboard } from "../../lib/dashboard-service";
import {
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  loadCompanyCovenantData,
  simulateDebtIncurrence,
} from "../../lib/covenant-engine";
import {
  COHERENT_INDEPENDENT,
  expectedMilaSecuredRoom,
  expectedTnlRoom,
} from "../../lib/product/financial-capacity-workflow";

const COMPANY = "coherent";
const IND = "coherent-2029-notes-indenture";

describe("secured debt+lien binding (permanent regression)", () => {
  it(
    "package-wide MODELED secured is mila $4,041M; solver must not be false-favorable",
    async () => {
      const dash = await getCompanyDashboard(COMPANY);
      const data = await loadCompanyCovenantData(prisma, COMPANY, dash.asOfDate);
      const pos = computeCovenantPosition(data);
      const solver = await buildSolverContext(COMPANY, dash.asOfDate);
      const rem = computeRemainingCapacityAfterDebtIncurrence(data, pos, 0, true, solver);

      const modeled = expectedMilaSecuredRoom(COHERENT_INDEPENDENT.financials);
      const tnl = expectedTnlRoom(COHERENT_INDEPENDENT.financials);
      expect(modeled).toBe(4041);
      expect(tnl).toBe(5129);

      expect(pos.crossDocumentSecured.capacity).toBe(4041);
      expect(pos.crossDocumentSecured.bindingProvision?.code).toBe("mila_secured");
      expect(pos.crossDocumentUnsecured.capacity).toBe(5129);

      expect(rem.packageAuthoritative?.authority).toBe("MODELED_CROSS_DOCUMENT");
      expect(rem.packageAuthoritative?.label).toBe("MODELED / EVALUATION_SEED_NOT_NS4_APPROVED");
      expect(rem.packageAuthoritative?.remainingCapacity).toBe(4041);
      expect(rem.packageAuthoritative?.solverIsFalseFavorable).toBe(false);
      expect(rem.packageAuthoritative?.solverAuthority).toBe("NON_AUTHORITATIVE_DIAGNOSTIC");

      // Pre-fix solver package was $5,129M (CA §6.01(p) without lien + indenture $11,933).
      const solverNative = rem.packageAuthoritative?.solverNativeRemaining;
      expect(solverNative).not.toBeNull();
      expect(solverNative!).toBeLessThanOrEqual(4041 + 0.5);

      // Indenture solver must not report the ratio+SCF ~$11,933 false-favorable max.
      const ind = rem.perDocument.find((d) => d.documentId === IND);
      expect(ind?.remainingCapacity).toBeDefined();
      expect(ind!.remainingCapacity!).toBeLessThan(10_000);
      expect(ind!.remainingCapacity!).toBeLessThanOrEqual(4041 + 0.5);
    },
    120_000,
  );

  it(
    "CLEAR secured path: every DEBT_INCURRENCE leg has its own lien coverage",
    async () => {
      const dash = await getCompanyDashboard(COMPANY);
      const data = await loadCompanyCovenantData(prisma, COMPANY, dash.asOfDate);
      const pos = computeCovenantPosition(data);
      const solver = await buildSolverContext(COMPANY, dash.asOfDate);
      const sim = simulateDebtIncurrence(data, pos, 100, true, solver);
      for (const doc of sim.perDocument) {
        if (doc.status !== "clear" || !doc.solverResult?.permissionPathUsed) continue;
        const legs = doc.solverResult.permissionPathUsed.legs;
        const debtLegs = legs.filter((l) => l.grantType === "DEBT_INCURRENCE");
        const lienLegs = legs.filter((l) => l.grantType === "LIEN");
        for (const debtLeg of debtLegs) {
          const auto = lienLegs.some((l) => l.linkedFrom === debtLeg.permissionId);
          const independent = lienLegs.some((l) => !l.linkedFrom);
          expect(
            auto || independent,
            `${doc.documentId}: debt leg ${debtLeg.permissionId} lacks lien coverage`,
          ).toBe(true);
        }
      }
    },
    120_000,
  );

  it(
    "borrowing proceeds: cash-retained vs immediately-spent (net debt / leverage)",
    async () => {
      const amount = 50;
      const fin = COHERENT_INDEPENDENT.financials;

      // Immediately spent (engine debt-incur convention): cash unchanged.
      const spentNetDebt = fin.totalDebt + amount - fin.cash;
      const spentTnlRoom = 4.25 * fin.ebitda - spentNetDebt;
      const spentSsnlRoom = 3.0 * fin.ebitda - (fin.securedDebt + amount - fin.cash);
      expect(spentTnlRoom).toBe(5079);
      expect(spentSsnlRoom).toBe(3991);

      // Cash retained: proceeds add to cash → net debt unchanged → rooms unchanged.
      const retainedNetDebt = fin.totalDebt + amount - (fin.cash + amount);
      const retainedTnlRoom = 4.25 * fin.ebitda - retainedNetDebt;
      const retainedSsnlRoom = 3.0 * fin.ebitda - (fin.securedDebt + amount - (fin.cash + amount));
      expect(retainedNetDebt).toBe(fin.totalDebt - fin.cash);
      expect(retainedTnlRoom).toBe(5129);
      expect(retainedSsnlRoom).toBe(4041);

      // Live engine uses spent convention for secured incur overlay.
      const dash = await getCompanyDashboard(COMPANY);
      const data = await loadCompanyCovenantData(prisma, COMPANY, dash.asOfDate);
      const overlay = {
        ...data,
        financials: {
          ...data.financials,
          totalDebt: data.financials.totalDebt + amount,
          securedDebt: data.financials.securedDebt + amount,
        },
      };
      const pos = computeCovenantPosition(overlay);
      expect(pos.crossDocumentSecured.capacity).toBe(3991);
      expect(pos.crossDocumentUnsecured.capacity).toBe(5079);
    },
    120_000,
  );
});
