/**
 * Pure grant-type classification for counsel-compiled items.
 * Kept free of prisma imports so it is unit-testable in isolation.
 */
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";

export type CounselGrantType = "DEBT_INCURRENCE" | "LIEN" | "RESTRICTED_PAYMENT" | "INVESTMENT";

/**
 * Which executable grant type(s) a counsel-accepted item compiles
 * to. Returns [] when nothing matches — the caller reports
 * INCOMPLETE. The old code defaulted unmatched items (e.g. an
 * asset-sale or merger covenant, which is neither debt, lien, RP,
 * nor investment) to DEBT_INCURRENCE, so an asset-sale basket was
 * compiled as a debt-incurrence permission and inflated debt
 * capacity. No signal → no grant → no permission minted.
 *
 * Rule 60: the classifier uses ONLY the item's own evidence
 * (its category, heading, families, plain English). It must
 * NEVER take a caller-supplied category: that category arrives
 * from the client's FormData (rulebook/actions.ts) and would
 * let a wrong/stale/tampered category mint a wrong-typed
 * Permission — e.g. "DEBT_INCURRENCE" passed for a liens-only
 * covenant mints a debt permission. Counsel's signal flows
 * through the item text (an EDITED plainEnglish is already in
 * the item when compile runs), not through the category param.
 */
export function grantTypesForItem(item: CovenantSummaryItem): CounselGrantType[] {
  const hay = `${item.category} ${item.heading} ${item.families.join(" ")} ${item.plainEnglish}`.toUpperCase();

  // Restricted payments / investments — do not default these into DEBT_INCURRENCE.
  const isRpFamily = /RESTRICTED.?PAYMENT|DIVIDEND|SHARE.?REPURCHASE|\bRP\b|AVAILABLE AMOUNT/.test(hay);
  const isInvestmentFamily = /INVESTMENT|ACQUISITION|PERMITTED INVESTMENT/.test(hay);
  if (isRpFamily && isInvestmentFamily) {
    // Shared RP/Investment article — mint both grant types when baskets mention both.
    const out: CounselGrantType[] = [];
    if (/DIVIDEND|RESTRICTED PAYMENT|SHARE.?REPURCHASE|\bRP\b/.test(hay)) out.push("RESTRICTED_PAYMENT");
    if (/INVESTMENT|ACQUISITION/.test(hay)) out.push("INVESTMENT");
    if (out.length) return [...new Set(out)];
  }
  if (isRpFamily && !/INDEBTEDNESS|DEBT INCURRENCE|INCREMENTAL/.test(hay)) {
    return ["RESTRICTED_PAYMENT"];
  }
  if (isInvestmentFamily && !/INDEBTEDNESS|DEBT INCURRENCE|LIEN|INCREMENTAL/.test(hay)) {
    return ["INVESTMENT"];
  }

  const out: CounselGrantType[] = [];
  if (/LIEN|SECURED|COLLATERAL/.test(hay)) out.push("LIEN");
  if (/DEBT|INDEBTEDNESS|INCURRENCE|INCREMENTAL|BORROW/.test(hay)) out.push("DEBT_INCURRENCE");
  // Secured debt scenarios need both regimes when both families are present.
  if (/LIEN|SECURED/.test(hay) && /DEBT|INDEBTEDNESS/.test(hay)) {
    return ["DEBT_INCURRENCE", "LIEN"];
  }
  return [...new Set(out)];
}
