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
 *
 * Rule 165 (audit-driven, two real agreements): grant signals must
 * come from OPERATIVE text only, with word boundaries:
 *
 * - The summary's boilerplate tails (defined-terms inventory,
 *   cross-provision dependencies, disclaimer, unresolved list) are
 *   metadata, not operative text. A defined term named "Acquisition
 *   Agreement" must not mint an INVESTMENT permission.
 * - Classifier outputs (category, families) are not grant evidence:
 *   a Representations article was classified LIENS, which minted a
 *   $200M LIEN Permission from a representations article. Operative
 *   text is the only evidence.
 * - Unbounded substring matching minted grants from party names
 *   and ordinary words: /BORROW/ matched "Borrower" (every covenant
 *   mentions the Borrower) → DEBT_INCURRENCE for a Successors
 *   section, a Letters-of-Credit section, and a financial-covenant
 *   section; /LIEN/ matched "client" inside "attorney-client" →
 *   LIEN for a GAAP-reporting fragment; /SECURED/ matched inside
 *   "unsecured". Every keyword below is word-bounded, and DEBT
 *   requires INDEBTEDNESS / DEBT / an INCUR* verb — "Borrower",
 *   "Borrowing Base", and "borrowing capacity" are not incurrence.
 */
const BOILERPLATE_MARKERS = [
  "Controlling defined terms",
  "Cross-provision dependencies",
  "This is Headroom's AI-generated",
  "Unresolved:",
];

function operativeText(plainEnglish: string): string {
  let end = plainEnglish.length;
  for (const marker of BOILERPLATE_MARKERS) {
    const idx = plainEnglish.indexOf(marker);
    if (idx !== -1 && idx < end) end = idx;
  }
  return plainEnglish.slice(0, end);
}

/**
 * Rule 169 (audit-driven): a DEBT grant needs affirmative evidence of
 * an actual borrowing permission, not just debt-related keywords. A
 * "Noteless Agreement; Evidence of Indebtedness" section mentions
 * Indebtedness throughout but grants no borrowing; a pure prohibition
 * ("shall not create, incur ... any Indebtedness") grants nothing;
 * an unrelated monetary threshold ("Indebtedness in excess of $200M
 * constitutes an Event of Default") is a trigger, not capacity. The
 * evidence is structural, not a word list: either a CAP on incurrence
 * ("shall not exceed $X", "not exceeding ... $X", "up to $X") with a
 * debt word in the same clause, or a permission modal ("except",
 * "permitted", "permission", "may incur/create/issue/borrow") with a
 * debt word in the same clause. Bounded words only — the summary
 * template's plural "exceptions/permissions" does not match the
 * singular modal patterns, so template boilerplate cannot launder
 * a grant. Failing closed: no permission evidence → no DEBT grant.
 */
function hasDebtPermissionEvidence(hay: string): boolean {
  // Cap frame: a cap on incurrence ("shall not exceed $X", "not
  // exceeding ... $X", "up to $X", "maximum ... $X") plus a debt
  // word ANYWHERE in the item's operative text. No proximity window:
  // the summary interleaves template sentences and basket tails
  // between the cap and the debt word (a real 6.01(e) item has ~280
  // chars between them), so a tight window false-negatives genuine
  // baskets. The item is a single provision, so a cap + a debt word
  // in the same item is presumptively a cap on that debt. The NOT...
  // EXCEED pattern itself stays sentence-bounded ([^.]).
  const capFrame =
    /\bNOT\b[^.]{0,30}\bEXCEED(ING)?\b/.test(hay) ||
    /\bUP\s+TO\s+\$/.test(hay) ||
    /\bMAXIMUM\b[^.]{0,40}\$/.test(hay);
  if (capFrame) return true;
  const modal =
    /\b(EXCEPT|PERMITTED|PERMISSION|MAY\s+(INCUR|CREATE|ISSUE|BORROW))\b[^.]{0,120}\b(INDEBTEDNESS|DEBT)\b|\b(INDEBTEDNESS|DEBT)\b[^.]{0,120}\b(EXCEPT|PERMITTED|PERMISSION|MAY\s+(INCUR|CREATE|ISSUE|BORROW))\b/.test(hay);
  return modal;
}

export function grantTypesForItem(item: CovenantSummaryItem): CounselGrantType[] {
  // Rule 166: an event-of-default trigger is a consequence, never a
  // grant of capacity. A Defaults article genuinely contains the
  // words "secured Indebtedness" (cross-default carve-outs, default
  // thresholds), so the operative-text keywords below would mint
  // DEBT + LIEN Permissions from it — $200M of fabricated capacity
  // from a defaults article in a real agreement. A Permission
  // represents something the borrower MAY do; a default trigger
  // represents something that, if it happens, constitutes default.
  // The item's own category (summary evidence, not caller input) is
  // the signal: EVENTS_OF_DEFAULT items never mint any grant type.
  if (item.category === "EVENTS_OF_DEFAULT") return [];

  // Rule 168: a financial-maintenance covenant is a test the borrower
  // must PASS ("will maintain ... ratio ... not less than 4.0"), not a
  // grant of capacity. Its operative text genuinely contains
  // "Acquisition" (a Covenant Reset Period for acquisitions), which
  // minted an INVESTMENT Permission from a leverage covenant — a
  // nonsense combination (an "investment permission" with a
  // leverage-ratio formula). Maintenance items never mint any grant
  // type; ratio-gated incurrence (category OTHER, "may incur ... so
  // long as leverage ...") still compiles through the ratio branch.
  if (item.category === "FINANCIAL_MAINTENANCE") return [];

  const hay = `${item.heading} ${operativeText(item.plainEnglish)}`.toUpperCase();

  const hasDebtWord = /\bINDEBTEDNESS\b|\bDEBT\b|\bINCUR(RING|RED|RENCE)?\b|\bINCREMENTAL\b/.test(hay);
  // Rule 169: debt words alone are not a grant — they must carry
  // affirmative borrowing-permission evidence (cap frame or modal).
  // The RP/Investment early returns below key off this guarded
  // signal, so an RP item that merely MENTIONS Indebtedness without
  // permission evidence still returns RP-only instead of falling
  // through into a spurious DEBT grant.
  const hasDebtPermission = hasDebtWord && hasDebtPermissionEvidence(hay);
  const hasLienWord = /\bLIENS?\b|\bSECURED\b|\bCOLLATERAL\b/.test(hay);

  // Restricted payments / investments — do not default these into DEBT_INCURRENCE.
  const isRpFamily = /\bRESTRICTED\s+PAYMENTS?\b|\bDIVIDENDS?\b|\bSHARE\s+REPURCHASES?\b|\bRP\b|\bAVAILABLE\s+AMOUNT\b/.test(hay);
  const isInvestmentFamily = /\bINVESTMENTS?\b|\bACQUISITIONS?\b|\bPERMITTED\s+INVESTMENTS?\b/.test(hay);
  if (isRpFamily && isInvestmentFamily) {
    // Shared RP/Investment article — mint both grant types when baskets mention both.
    const out: CounselGrantType[] = [];
    if (/\bDIVIDENDS?\b|\bRESTRICTED\s+PAYMENTS?\b|\bSHARE\s+REPURCHASES?\b|\bRP\b/.test(hay)) out.push("RESTRICTED_PAYMENT");
    if (/\bINVESTMENTS?\b|\bACQUISITIONS?\b/.test(hay)) out.push("INVESTMENT");
    if (out.length) return [...new Set(out)];
  }
  if (isRpFamily && !hasDebtPermission && !hasLienWord) {
    return ["RESTRICTED_PAYMENT"];
  }
  if (isInvestmentFamily && !hasDebtPermission && !hasLienWord) {
    return ["INVESTMENT"];
  }

  const out: CounselGrantType[] = [];
  if (hasLienWord) out.push("LIEN");
  if (hasDebtPermission) out.push("DEBT_INCURRENCE");
  // Secured debt scenarios need both regimes when both families are present.
  if (hasLienWord && hasDebtPermission) {
    return ["DEBT_INCURRENCE", "LIEN"];
  }
  return [...new Set(out)];
}
