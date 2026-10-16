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

/**
 * Rule 176 helper: strip the analyzer's classification lead sentence
 * ("Section X (\"heading\") operates as ... / is a general ... /
 * states ... .") from the plainEnglish haystack. The lead sentence
 * names the analyzer's category ("liens and secured debt regime",
 * "debt incurrence prohibition") — category words that would
 * otherwise launder into grants. The lead ends at the first ". "
 * after the heading's closing quote; headings never contain a
 * period+space, so that boundary is safe. Bounded (<=400 chars,
 * must contain a classification verb) — anything else is left
 * untouched rather than risk stripping real substance.
 */
function stripClassificationLead(plainEnglish: string): string {
  // The analyzer writes the heading with curly quotes
  // ("1(c)(b)(j)") — an ASCII-only search never matches real
  // items (that is exactly how the first version of this strip
  // shipped passing its tests but not fixing the real item).
  const closes = [plainEnglish.indexOf('")'), plainEnglish.indexOf("\u201d)")].filter(
    (i) => i !== -1,
  );
  if (!closes.length) return plainEnglish;
  const closeQuote = Math.min(...closes);
  const afterQuote = plainEnglish.slice(closeQuote + 2);
  const sentenceEnd = afterQuote.indexOf(". ");
  if (sentenceEnd === -1 || sentenceEnd > 400) return plainEnglish;
  const lead = plainEnglish.slice(0, closeQuote + 2 + sentenceEnd);
  if (!/\b(operates as|is a general|states an?|is an?)\b/i.test(lead)) return plainEnglish;
  return plainEnglish.slice(closeQuote + 2 + sentenceEnd + 2);
}

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

/**
 * Rule 170 (audit-driven): an INVESTMENT grant needs affirmative
 * evidence of an actual investment permission, mirroring Rule 169's
 * DEBT guard. A real agreement's §16.3(xiv) is an EBITDA add-back
 * ("any fees, costs and expenses ... in connection with any proposed
 * or completed acquisition, investment, disposition ...") — it
 * mentions acquisition/investment but permits no investment, and
 * minted an INVESTMENT grant. The evidence is a permission modal
 * ("may make/acquire/invest", "permitted investments", "except",
 * "permission") with an investment word in the same clause, or a
 * cap on investments ("investments not exceeding $X", "up to $X
 * in investments"). Failing closed: no permission evidence → no
 * INVESTMENT grant.
 */
function hasInvestmentPermissionEvidence(hay: string): boolean {
  const capFrame =
    /\b(INVESTMENTS?|ACQUISITIONS?)\b[^.]{0,120}\bNOT\b[^.]{0,30}\bEXCEED(ING)?\b|\bNOT\b[^.]{0,30}\bEXCEED(ING)?\b[^.]{0,120}\b(INVESTMENTS?|ACQUISITIONS?)\b/.test(hay) ||
    /\bUP\s+TO\s+\$[^.]{0,120}\b(INVESTMENTS?|ACQUISITIONS?)\b|\b(INVESTMENTS?|ACQUISITIONS?)\b[^.]{0,120}\bUP\s+TO\s+\$/.test(hay);
  if (capFrame) return true;
  const modal =
    /\b(MAY\s+(MAKE|ACQUIRE|INVEST)|PERMITTED|EXCEPT|PERMISSION)\b[^.]{0,120}\b(INVESTMENTS?|ACQUISITIONS?)\b|\b(INVESTMENTS?|ACQUISITIONS?)\b[^.]{0,120}\b(MAY\s+(MAKE|ACQUIRE|INVEST)|PERMITTED|EXCEPT|PERMISSION)\b/.test(hay);
  return modal;
}

/**
 * Rule 195 (audit-driven): a grandfathering clause grants nothing
 * new. "Liens existing on the Effective Date" (Aon 6.11(l)) merely
 * grandfathers liens that already exist — and its $5M is a
 * DISCLOSURE threshold (liens over $5M must be listed on
 * Schedule 6.11), not a basket cap. Minting DEBT + LIEN FLAT $5M
 * from it fabricates capacity. The guard fires only when the
 * clause is PURELY about existing liens/debt (no creation verb):
 * a mixed clause ("existing Liens and Liens created to
 * refinance them") keeps its grants — the refinance permission
 * is evaluated normally.
 */
function isGrandfatheringOnly(hay: string): boolean {
  const existing = /\b(?:LIENS?|INDEBTEDNESS)\s+(?:EXISTING|OUTSTANDING)\s+(?:ON|AS\s+OF)\b/.test(hay);
  if (!existing) return false;
  // A creation / acquisition / refinance verb means the clause
  // also permits NEW liens/debt (a mixed clause) — only pure
  // grandfathering (existing liens/debt, no new permission)
  // returns true.
  const creates = /\b(?:CREAT\w*|INCUR\w*|ISSU\w*|BORROW\w*|ACQUIR\w*|REFINANC\w*)\b/.test(hay);
  return !creates;
}

/**
 * Rule 195 (audit-driven): a default trigger grants nothing. A
 * lien/claim "made or asserted against" Collateral (Strata
 * 5.02(c)) is an Event-of-Default trigger — it does not permit
 * liens, yet the bare LIEN word minted a $150k LIEN Permission
 * from it. The guard fires on trigger phrasing (constitutes a
 * default, failure to pay/observe/perform/comply, asserted
 * against) — but NOT when the text carries a no-default
 * CONDITION ("provided no Event of Default has occurred"), which
 * is a permission with a condition, not a trigger.
 */
function isDefaultTrigger(hay: string): boolean {
  if (/\bNO\s+(?:EVENT\s+OF\s+)?DEFAULT\b/.test(hay)) return false;
  return /\b(?:CONSTITUTES?\s+(?:AN?\s+)?(?:EVENT\s+OF\s+)?DEFAULT|FAILURE\s+TO\s+(?:PAY|OBSERVE|PERFORM|COMPLY)|ASSERTED\s+AGAINST)\b/.test(hay);
}

/**
 * Rule 196 (audit-driven): a LIEN clause is a RESIDUAL basket when
 * its operative text grants "other Liens" — the standard drafting
 * convention for the catch-all lien basket (Aon 6.11(t): "other
 * Liens securing an aggregate principal amount..."). A residual
 * basket permits liens generally, so it may pair with an
 * independent DEBT Permission for a secured election. A
 * specific-purpose basket ("Liens for taxes", "purchase-money
 * Liens", "Liens on acquired property") never pairs — it permits
 * liens only for its named purpose. The adjacent "other Liens"
 * phrasing is the signal: "Liens other than Permitted Liens" (an
 * exclusion, not a residual basket) does not match.
 */
export function isResidualLienBasket(item: { plainEnglish?: string; operativeLanguageExcerpt?: string | null }): boolean {
  const text = `${item.plainEnglish ?? ""} ${item.operativeLanguageExcerpt ?? ""}`;
  return /\bother\s+Liens\b/i.test(text);
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

  // Rule 176 (audit-driven, corrected): grant evidence comes from
  // the plainEnglish MINUS the analyzer's classification lead
  // sentence. That sentence — "operates as a enumerated permission
  // within the liens and secured debt regime" — is itself
  // grant-shaped: it contains "permission" + "debt" + "liens", and
  // minted DEBT + LIEN from a conditions-precedent clause whose
  // substance ("Agent shall have received searches ... evidence
  // that no Liens exist thereon other than Permitted Liens") grants
  // nothing. The first attempt at this rule preferred the raw
  // excerpt as the haystack, but the excerpt's incidental mentions
  // ("other than Liens permitted under Section 6.02") then minted
  // a spurious LIEN on a genuine debt basket — the plainEnglish
  // paraphrase distills to operative substance, so the lead
  // sentence is stripped and the distilled substance kept. EDITED
  // items are exempt: counsel's edited plainEnglish IS the
  // provision's words (Rule 60), so its first sentence is kept.
  const sourceText =
    item.reviewerDecision === "EDITED"
      ? operativeText(item.plainEnglish)
      : stripClassificationLead(operativeText(item.plainEnglish));
  const hay = `${item.heading} ${sourceText}`.toUpperCase();

  // Rule 195: grandfathering-only and default-trigger clauses
  // grant nothing. The guards read the cleaned haystack PLUS
  // the operative excerpt: the analyzer's plainEnglish sometimes
  // drops the ground-truth phrase (Aon 6.11(l)'s plainEnglish
  // never says "existing on the Effective Date" — only the
  // excerpt does). The guards are RESTRICTIVE-only (they can
  // only remove grants, never mint them), so the excerpt's
  // incidental mentions cannot launder a grant here — unlike
  // the grant-evidence checks below, which stay plainEnglish-only
  // per Rule 176.
  const guardHay = `${hay} ${(item.operativeLanguageExcerpt ?? "").toUpperCase()}`;
  if (isGrandfatheringOnly(guardHay)) return [];
  if (isDefaultTrigger(guardHay)) return [];

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
  // Rule 170: investment words alone are not a grant — they must
  // carry affirmative investment-permission evidence.
  if (isInvestmentFamily && !hasDebtPermission && !hasLienWord && hasInvestmentPermissionEvidence(hay)) {
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
