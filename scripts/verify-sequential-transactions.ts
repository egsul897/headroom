/**
 * Manual verification for golden-question-set-v1 Q22-Q25 (sequential/ledger
 * behavior - see docs/golden-questions-v1.md).
 *
 * simulateDebtIncurrence() always measures pro forma against the CURRENT
 * financial snapshot; it has no way to accept "amount already added from a
 * prior hypothetical transaction" and chain that into the next call. That
 * means Q23 ("...then incur $2,000M more unsecured on top of the $500M from
 * Q22...") and Q24 ("...then repay $300M...") cannot be represented as
 * golden_tests rows today - there is no query type for a sequential
 * scenario. Rather than fake it or silently skip it, this script constructs
 * the pro forma financial state by hand at each step and runs it through the
 * exact same pure engine functions the app uses, so the v1 answers are still
 * checked against real engine output, just outside the automated harness.
 *
 * Read-only: makes one DB read (loadCompanyCovenantData) and does the rest
 * with plain object spreads - never writes anything.
 *
 * Run: npx tsx scripts/verify-sequential-transactions.ts
 *
 * Last run: 2026-08-24, against the golden-test-v1 seed data. Output is
 * reproduced verbatim below the code so it's readable without executing
 * anything (numbers WILL drift if COHERENT_DATA's financials/provisions
 * change - re-run this script and update the block below when they do).
 */
import { PrismaClient } from "@prisma/client";
import { computeCovenantPosition, loadCompanyCovenantData, simulateDebtIncurrence, type CompanyCovenantData } from "../lib/covenant-engine";
import { COHERENT_COMPANY, COHERENT_CREDIT_AGREEMENT_ID, COHERENT_INDENTURE_ID } from "../prisma/seed-data";

const prisma = new PrismaClient();

async function main() {
  const data = await loadCompanyCovenantData(prisma, COHERENT_COMPANY.id);
  const position = computeCovenantPosition(data);

  console.log("--- Q22 baseline: $500M secured incurred today ---");
  const q22 = simulateDebtIncurrence(data, position, 500, true);
  console.log({
    overallCapacity: q22.overallCapacity,
    remainingAfter: (q22.overallCapacity ?? 0) - 500,
    binding: q22.binding?.documentId,
    bindingProvision: q22.binding?.bindingProvision?.code,
  });

  console.log("\n--- Q23: pro forma AFTER the $500M secured incurrence, then test +$2,000M unsecured ---");
  const afterQ22: CompanyCovenantData = {
    ...data,
    financials: { ...data.financials, totalDebt: data.financials.totalDebt + 500, securedDebt: data.financials.securedDebt + 500 },
  };
  const posAfterQ22 = computeCovenantPosition(afterQ22);
  const q23 = simulateDebtIncurrence(afterQ22, posAfterQ22, 2000, false);
  console.log({
    status: q23.status,
    binding: q23.binding?.documentId,
    bindingProvision: q23.binding?.bindingProvision?.code,
    proFormaTNL: q23.proForma.totalNetLeverage,
  });

  console.log("\n--- Q24: pro forma AFTER both Q22 and Q23, then a $300M TLB (secured) repayment ---");
  const afterQ23: CompanyCovenantData = {
    ...afterQ22,
    financials: { ...afterQ22.financials, totalDebt: afterQ22.financials.totalDebt + 2000 },
  };
  const posAfterQ23 = computeCovenantPosition(afterQ23);
  const indAfterQ23 = posAfterQ23.documents.find((d) => d.documentId === COHERENT_INDENTURE_ID)!;
  const caAfterQ23 = posAfterQ23.documents.find((d) => d.documentId === COHERENT_CREDIT_AGREEMENT_ID)!;
  const facFlatAfterQ23 = posAfterQ23.provisionCapacities.get(`${COHERENT_INDENTURE_ID}:facility_flat`)!;
  console.log("Before repayment:", {
    TNL: posAfterQ23.metrics.totalNetLeverage,
    SSNL: posAfterQ23.metrics.seniorSecuredNetLeverage,
    indentureSecuredCapacity: indAfterQ23.securedCapacity,
    caSecuredCapacity: caAfterQ23.securedCapacity,
    facilityFlatCapacity: facFlatAfterQ23.capacity,
  });

  const afterQ24: CompanyCovenantData = {
    ...afterQ23,
    financials: { ...afterQ23.financials, totalDebt: afterQ23.financials.totalDebt - 300, securedDebt: afterQ23.financials.securedDebt - 300 },
  };
  const posAfterQ24 = computeCovenantPosition(afterQ24);
  const indAfterQ24 = posAfterQ24.documents.find((d) => d.documentId === COHERENT_INDENTURE_ID)!;
  const caAfterQ24 = posAfterQ24.documents.find((d) => d.documentId === COHERENT_CREDIT_AGREEMENT_ID)!;
  const facFlatAfterQ24 = posAfterQ24.provisionCapacities.get(`${COHERENT_INDENTURE_ID}:facility_flat`)!;
  console.log("After $300M TLB repayment:", {
    TNL: posAfterQ24.metrics.totalNetLeverage,
    SSNL: posAfterQ24.metrics.seniorSecuredNetLeverage,
    indentureSecuredCapacity: indAfterQ24.securedCapacity,
    caSecuredCapacity: caAfterQ24.securedCapacity,
    facilityFlatCapacity: facFlatAfterQ24.capacity,
  });
  console.log("Deltas vs. pre-repayment:", {
    indentureSecuredCapacity: indAfterQ24.securedCapacity! - indAfterQ23.securedCapacity!,
    caSecuredCapacity: caAfterQ24.securedCapacity! - caAfterQ23.securedCapacity!,
    facilityFlatCapacity: facFlatAfterQ24.capacity! - facFlatAfterQ23.capacity!,
  });
  console.log(
    "\nFinding: facility_flat (FLAT_NET_OF_DEBT) moved by the FULL $300M, same as the ratio-based tests - it nets" +
      " directly against outstanding secured debt, so it is not a static 'fixed-dollar' ceiling in the sense v1's" +
      " Q24 answer implies (\"does NOT restore a fixed-dollar basket... in the way a specific election-tied basket" +
      " might reload\"). That framing holds for baskets with no debt-outstanding term in their formula at all" +
      " (e.g. GREATER_OF_FLAT_OR_PCT_EBITDA baskets, which don't move with debt levels either way) - it does not" +
      " hold for FLAT_NET_OF_DEBT baskets specifically. Worth flagging to the reviewer as a refinement to the v1" +
      " question's own framing, not an engine bug.",
  );

  console.log(
    "\nQ25 (solve for the EBITDA growth needed to unlock +$500M more secured capacity) is NOT computed here: it" +
      " requires a genuine 'solve for X' capability (invert threshold*EBITDA - netSecured = target), which the" +
      " engine does not have. Not attempted.",
  );

  await prisma.$disconnect();
}

main();

/*
=============================== LAST RUN OUTPUT ===============================
--- Q22 baseline: $500M secured incurred today ---
{
  overallCapacity: 4041,
  remainingAfter: 3541,
  binding: 'coherent-2029-notes-indenture',
  bindingProvision: 'mila_secured'
}

--- Q23: pro forma AFTER the $500M secured incurrence, then test +$2,000M unsecured ---
{
  status: 'clear',
  binding: 'coherent-credit-agreement-2022',
  bindingProvision: 'ca_leverage_cap',
  proFormaTNL: 2.703529411764706
}

--- Q24: pro forma AFTER both Q22 and Q23, then a $300M TLB (secured) repayment ---
Before repayment: {
  TNL: 2.703529411764706,
  SSNL: 0.9170588235294118,
  indentureSecuredCapacity: 3541,
  caSecuredCapacity: 2629,
  facilityFlatCapacity: 1279
}
After $300M TLB repayment: {
  TNL: 2.5270588235294116,
  SSNL: 0.7405882352941177,
  indentureSecuredCapacity: 3841,
  caSecuredCapacity: 2929,
  facilityFlatCapacity: 1579
}
Deltas vs. pre-repayment: {
  indentureSecuredCapacity: 300,
  caSecuredCapacity: 300,
  facilityFlatCapacity: 300
}

Finding: facility_flat (FLAT_NET_OF_DEBT) moved by the FULL $300M, same as the ratio-based tests - it nets
directly against outstanding secured debt, so it is not a static 'fixed-dollar' ceiling in the sense v1's Q24
answer implies ("does NOT restore a fixed-dollar basket... in the way a specific election-tied basket might
reload"). That framing holds for baskets with no debt-outstanding term in their formula at all (e.g.
GREATER_OF_FLAT_OR_PCT_EBITDA baskets, which don't move with debt levels either way) - it does not hold for
FLAT_NET_OF_DEBT baskets specifically. Worth flagging to the reviewer as a refinement to the v1 question's own
framing, not an engine bug.

Q25 (solve for the EBITDA growth needed to unlock +$500M more secured capacity) is NOT computed here: it requires
a genuine 'solve for X' capability (invert threshold*EBITDA - netSecured = target), which the engine does not
have. Not attempted.
================================================================================
*/
