/**
 * Pure grant-type classification for counsel-compiled items.
 * Kept free of prisma imports so it is unit-testable in isolation.
 */
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";
import { isRepresentationArticle } from "../covenant-intelligence/analyze-provision";
import { parseMoneyMillions } from "./money";

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
  // Rule 202: the analyzer also frames classification as
  // "imposes an affirmative or ongoing obligation related to
  // [regime]" — the regime label ("related to restricted
  // payments and investments") launders into grants (Asure
  // 7.03(p), a pure Investments clause, minted a false RP
  // Permission from it). The verb is narrow: "imposes a lien"
  // or "imposes a restriction" does not match.
  if (
    !/\b(operates as|is a general|states an?|is an?|imposes an? (?:affirmative|ongoing))\b/i.test(lead)
  )
    return plainEnglish;
  return plainEnglish.slice(closeQuote + 2 + sentenceEnd + 2);
}

function stripPostureMeta(text: string): string {
  return text.replace(/\b(?:prohibition\/permission\s+)?posture could not be determined[^.]*\.?/gi, "");
}

function operativeText(plainEnglish: string): string {
  let end = plainEnglish.length;
  for (const marker of BOILERPLATE_MARKERS) {
    const idx = plainEnglish.indexOf(marker);
    if (idx !== -1 && idx < end) end = idx;
  }
  // Rule 208 (revised): strip the analyzer's posture meta-phrase
  // ("prohibition/permission posture could not be determined") from
  // the haystack — its word "permission" launders into modal
  // permission evidence for DEBT on posture-indeterminate items
  // (Expand 6.02(bb)). The phrase is uncertainty boilerplate,
  // never operative language. Applied here so every haystack built
  // from plainEnglish gets it; EDITED items (counsel's words) never
  // carry the phrase, so the strip is a no-op for them.
  return stripPostureMeta(plainEnglish.slice(0, end));
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
function hasDebtCapFrame(hay: string): boolean {
  return (
    /\bNOT\b[^.]{0,30}\bEXCEED(ING)?\b/.test(hay) ||
    /\bUP\s+TO\s+\$/.test(hay) ||
    /\bMAXIMUM\b[^.]{0,40}\$/.test(hay)
  );
}

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
  if (hasDebtCapFrame(hay)) return true;
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
  return (
    /\b(?:CONSTITUTES?\s+(?:AN?\s+)?(?:EVENT\s+OF\s+)?DEFAULT|FAILURE\s+TO\s+(?:PAY|OBSERVE|PERFORM|COMPLY)|ASSERTED\s+AGAINST)\b/.test(hay) ||
    // Rule 209h: the payment trigger in its verb form — "any Loan
    // Party shall fail to make any payment ... in respect of any
    // Material Indebtedness, when and as the same shall become
    // due" (Strata 5.02, Events-of-Default text the parser filed
    // as a §5.02 section) — and the collateral-validity triggers:
    // a Collateral Document that "shall fail to create a valid
    // security interest", a Lien that "shall cease to be a
    // perfected, first priority Lien" (Strata 5.02(p); Asure
    // 8.01(k)). Both are default EVENTS, not permissions.
    /\bFAIL(?:URE)?\s+TO\s+(?:MAKE\s+(?:ANY\s+)?PAYMENTS?\b|PAY\b)[^.]{0,140}?\bINDEBTEDNESS\b/.test(hay) ||
    /\b(?:CEASE\s+TO|FAIL\s+TO)\s+(?:CREATE|BE)\b[^.]{0,80}?\b(?:VALID|PERFECTED|FIRST\s+PRIORITY)\b/.test(hay)
  );
}

/**
 * Rule 209 (audit-driven — representation step 2, grant-detection
 * precision): the F7 census re-measured on the classification-era
 * tree found grant instances minted for NON-BASKET provisions —
 * Events-of-Default text, guaranty/agency mechanics, definitions
 * fragments, restrictive-agreement exceptions, payment mechanics —
 * plus wrong-type grants on genuine clauses. Every mechanism in
 * this rule is structure-shaped and restrictive-only, and was
 * verified per-item against the 7-agreement corpus (1,688 items):
 * every removed grant was hand-read against its source text, and
 * the two gains (an RP clause and an investments clause whose
 * genuine grants a bogus LIEN signal was suppressing) are pinned
 * in the test suite. Deliberately NOT a posture gate: genuine
 * baskets carry OBLIGATION postures (Aon 6.11(o) purchase-money
 * liens; Asure 7.03(p)), MAINTENANCE_TEST (Solaris 7.02(d), a
 * modeled greater-of investment basket) and GENERAL_PROHIBITION
 * (Strata 6.02(c), whose summarizer quote carries no permission
 * modal at all) — gating on posture would kill genuine grants,
 * so posture stays evidence, not a grant gate.
 */

/**
 * Direct debt-permission evidence for Rule 209e: a cap frame, or
 * a modal pair whose modal ASSERTS this clause's permission —
 * a carve-out opener (EXCEPT), a direct permissive verb (MAY
 * INCUR ...), or PERMITTED standing alone ("Secured Indebtedness
 * and Liens permitted"). Two modal forms do NOT count: the
 * reference form ("Indebtedness permitted by / under / pursuant
 * to Section X", "permitted hereunder", "was permitted to be
 * secured" — the permission lives in the clause pointed at, or
 * was conferred in the past by one, not this one) and the PERMISSION
 * noun (in this corpus it is the summarizer's "Permission
 * substance:" label, which sits next to whatever the clause
 * quotes — including clauses that grant something else).
 */
function hasDirectDebtPermissionEvidence(hay: string): boolean {
  if (hasDebtCapFrame(hay)) return true;
  const modal = "(?:EXCEPT|MAY\\s+(?:INCUR|CREATE|ISSUE|BORROW)|PERMITTED(?!\\s+(?:BY|UNDER|PURSUANT|HEREUNDER|TO)\\b))";
  return new RegExp(
    `\\b${modal}\\b[^.]{0,120}\\b(?:INDEBTEDNESS|DEBT)\\b|\\b(?:INDEBTEDNESS|DEBT)\\b[^.]{0,120}\\b${modal}\\b`,
  ).test(hay);
}

/**
 * Lien-permission evidence for Rule 209f: the modal must be a
 * permission REFERENCE ("any Lien permitted by Section 7.01") or
 * the PERMISSION noun (including the summarizer's "Permission
 * substance:" label quote, the same channel Rule 169 relies on) —
 * a bare "Permitted" adjective ("Permitted Acquisition",
 * "Permitted Liens" as a defined term) is not evidence that THIS
 * clause permits a lien.
 */
function hasLienPermissionEvidence(hay: string): boolean {
  return /\b(PERMITTED\s+(?:BY|UNDER|PURSUANT)|PERMISSION)\b[^.]{0,120}\b(LIENS?|COLLATERAL|SECURITY\s+INTERESTS?)\b|\b(LIENS?|COLLATERAL|SECURITY\s+INTERESTS?)\b[^.]{0,120}\b(PERMITTED\s+(?:BY|UNDER|PURSUANT)|PERMISSION)\b/.test(
    hay,
  );
}

/** Rule 209j: the clause's operative head is a restrictions frame. */
function isRestrictionsFrame(item: CovenantSummaryItem): boolean {
  const excerpt = (item.operativeLanguageExcerpt ?? "").toUpperCase();
  return (
    /^\s*(?:\([A-Z0-9]+\))?\s*(?:ANY\s+)?RESTRICTIONS?\b/.test(excerpt) ||
    /\bCONTRACTUAL\s+OBLIGATIONS?\b[^.]{0,130}?\b(?:ENCUMBERS?|RESTRICTS?)\b/.test(excerpt)
  );
}

/** Rule 209k: the clause's operative head is a fee/expense component. */
function isFeeComponentClause(item: CovenantSummaryItem): boolean {
  const excerpt = (item.operativeLanguageExcerpt ?? "").toUpperCase();
  return /^\s*(?:\([A-Z0-9]+\))?\s*(?:ANY\s+)?(?:FEES|COSTS\s+AND\s+EXPENSES)\b/.test(excerpt);
}

/** Rule 209l: the clause's operative head is a payment verb frame. */
function isPaymentFrameClause(item: CovenantSummaryItem): boolean {
  const excerpt = (item.operativeLanguageExcerpt ?? "").toUpperCase();
  return /^\s*(?:\([A-Z0-9]+\))?\s*(?:PREPAY|REDEEM|DEFEASE|MANDATORY|REGULARLY\s+SCHEDULED)\b/.test(excerpt);
}

/** Rule 209m: the excerpt is solely the [reserved] placeholder
 * (tolerating the filing's page-number tail, "(aa) [reserved]; 118"). */
function isReservedClause(item: CovenantSummaryItem): boolean {
  return /^\s*(?:\([A-Z0-9]+\))?\s*\[RESERVED\]\s*[.;]?\s*(?:\d+\s*)?$/i.test(
    item.operativeLanguageExcerpt ?? "",
  );
}

/** Rule 209p: the excerpt introduces two or more defined terms —
 * definitions text, whatever sectionRef it carries. Quote forms
 * are the filing's own (straight or curly, spaces tolerated inside
 * the quotes). */
function isDefinitionShaped(item: CovenantSummaryItem): boolean {
  const excerpt = (item.operativeLanguageExcerpt ?? "").toUpperCase();
  const intros = excerpt.match(/["\u201C][^"\u201D]{1,80}["\u201D]\s+(?:MEANS|HAS THE MEANING|SHALL MEAN)\b/g);
  return (intros?.length ?? 0) >= 2;
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

/**
 * Rule 197 (audit-driven): resolve a cap stated as a defined term.
 * Strata 6.01(k) caps "other unsecured Indebtedness" at "the
 * Threshold Amount" — no dollar figure in the clause, so the
 * compiler minted INCOMPLETE, even though the document defines
 * "Threshold Amount" as $750,000. When the clause's operative
 * excerpt caps by a defined term AND the item carries that term's
 * definition AND the definition is a BARE dollar amount
 * ("means $ 750,000."), return the amount in $M. Any other
 * definition shape — formula ("the greater of $X or Y%"),
 * conditional ("$X, as adjusted"), percentage — fails closed
 * (null). The first "means" in the definition excerpt is the
 * definition's own; a later definition's amount in the same
 * excerpt is never borrowed.
 *
 * H3 honesty: an entry the summary marks `resolved: false` never
 * supplies a cap — under the honest flag that means the document
 * does not define the term here, defines it ambiguously
 * (differing duplicates), or defines it in text the extractor
 * could not back with a source occurrence. Entries with NO flag
 * (legacy stored summaries and pinned fixtures) stay eligible, as
 * before. If several eligible entries carry the term with
 * DIFFERING excerpts, the term is ambiguous and also fails
 * closed — a cap is never picked from competing definitions.
 */
export function resolveDefinedTermCap(item: {
  operativeLanguageExcerpt?: string | null;
  applicableDefinitions?: Array<{ term: string; excerpt: string; resolved?: boolean }> | null;
}): number | null {
  const excerpt = item.operativeLanguageExcerpt ?? "";
  const capMatch = excerpt.match(/\bnot\s+(?:to\s+)?exceed(?:ing)?\s+(?:the\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)/);
  if (!capMatch) return null;
  const term = capMatch[1]!.replace(/\s+/g, " ").trim().toLowerCase();
  const eligible = (item.applicableDefinitions ?? []).filter(
    (d) =>
      d.term.replace(/\s+/g, " ").trim().toLowerCase() === term && d.resolved !== false,
  );
  if (eligible.length === 0) return null;
  if (new Set(eligible.map((d) => (d.excerpt ?? "").trim())).size > 1) return null;
  const def = eligible[0]!;
  const meansIdx = def.excerpt.search(/\bmeans\b/i);
  if (meansIdx < 0) return null;
  const afterMeans = def.excerpt.slice(meansIdx);
  const amountMatch = afterMeans.match(/^\s*means\s*\$\s*([\d,]+(?:\.\d{2})?)\s*\./i);
  if (!amountMatch) return null;
  const money = parseMoneyMillions(`$${amountMatch[1]}`);
  return money;
}

/**
 * Rule 198 (audit-driven): a Guarantee is not a debt incurrence.
 * Strata 6.04(e) permits "Guarantees constituting Indebtedness
 * permitted by Section 6.01" capped at the Threshold Amount
 * ($750k). Rule 197 newly resolved that cap, and the DEBT grant
 * fired on "Indebtedness" + cap frame — minting a $750k DEBT
 * Permission. But the clause permits GUARANTEEING debt that is
 * already permitted by Section 6.01; the $750k is a guarantee
 * cap, not an incurrence basket, and counting it as debt
 * capacity double-counts (the guaranteed debt is already
 * counted under its own Section 6.01 basket). The distinguisher
 * is position: in a guarantee permission the guarantee word
 * PRECEDES the debt word (the debt is the guaranteed
 * obligation, the object); in a debt basket that merely lists
 * guarantees as a form of Indebtedness ("Indebtedness,
 * including Guarantees of ...") the debt word comes first and
 * the DEBT grant stands. Checked per text (hay and excerpt
 * separately) — the concatenation order must not decide it.
 */
function isGuaranteePermission(text: string): boolean {
  // Rule 209c: the frame also fires in the other standard
  // drafting forms — "Guarantees by any Borrower of
  // Indebtedness of any other Person" (Strata 6.01(d)) and
  // "Guarantee Obligations of any Person in respect of
  // Indebtedness of any other Person" (Solaris / Tenable
  // 7.03(d)). The position check below (the guarantee word
  // precedes the debt word) still protects debt baskets that
  // list guarantees as a form of Indebtedness.
  const g = text.match(/\bGUARANTEES?\s+(?:CONSTITUTING|OF|BY)\b|\bGUARANTEE\s+OBLIGATIONS\s+OF\b/);
  if (!g || g.index == null) return false;
  const d = text.match(/\b(?:INDEBTEDNESS|DEBT)\b/);
  return !d || d.index == null || g.index < d.index;
}

/**
 * Rule 201 (audit-driven): a lien clause capping "Liens securing
 * Indebtedness" does not mint DEBT. Asure 7.01(t) permits
 * "other Liens securing Indebtedness outstanding in an
 * aggregate principal amount not to exceed $5,000,000" — the
 * $5M is a LIEN cap (liens on up to $5M of already-permitted
 * Indebtedness), not an incurrence basket. The Indebtedness
 * is the secured obligation (the object of "securing"), not a
 * new incurrence. A debt basket secured by liens ("Indebtedness
 * ... secured by Liens") has the debt word first and says
 * "secured by", not "Liens securing" — the pattern does not
 * fire there. A combined clause ("Liens securing Indebtedness
 * AND Indebtedness not to exceed $X") loses its DEBT grant
 * (fail-closed) — that shape is rare.
 */
function isLienSecuredObligation(text: string): boolean {
  // The gap bound is 200, not 80: the real Strata 6.02(l) has ~85
  // chars between "Liens" and "securing Indebtedness" ("incurred
  // in the ordinary course of business of the Borrowers and
  // their Subsidiaries"). The [^.] already blocks cross-sentence
  // matches, so a wider same-sentence gap is safe.
  // Rule 209d: the verb forms count too — "such Liens secure
  // Indebtedness permitted by Section 6.01(e)" (Strata 6.02(d),
  // Expand 6.02(g)) is the same lien-framed shape with "secure"
  // instead of "securing". Verbs only: the participle adjective
  // in "Secured Indebtedness" is a defined term for DEBT, and
  // counting it would pair every "Limitation on Liens" heading
  // with the debt it names. And so does the lien-RENEWAL frame
  // ("as a condition to the modification, replacement, renewal
  // or extension of any Lien permitted by ...", Solaris 7.02(w)
  // / Tenable 7.01(w)), whose proviso ("the Indebtedness
  // secured ... is otherwise permitted") is a condition on the
  // renewal, not an incurrence permission.
  return (
    /\bLIENS?\b[^.]{0,200}?\bSECUR(?:ING|ES?)\b\s+(?:INDEBTEDNESS|DEBT)\b/.test(text) ||
    /\b(?:MODIFICATION|REPLACEMENT|RENEWAL|EXTENSION)\b[^.]{0,160}?\bOF\s+ANY\s+LIEN\b/.test(text)
  );
}

/**
 * Rule 204 (audit-driven): the definitions article never grants
 * capacity. Asure 1.01(f)(i)(d)(n) — a CONDITION inside the
 * "Permitted Acquisition" definition ("the aggregate Cost of
 * Acquisition ... does not exceed $10,000,000") — minted a
 * LIEN $10M Permission from the word "Collateral" in its
 * excerpt. A definition condition is not a permission; it
 * constrains a defined term, it does not grant capacity. In
 * US credit agreements the definitions article is Section
 * 1.01 ("Defined Terms") — a structural convention, not an
 * agreement-specific pattern. A document whose definitions
 * live elsewhere is simply not covered (the guard is
 * incomplete, not wrong).
 */
export function isDefinitionsArticleItem(item: CovenantSummaryItem): boolean {
  const heading = item.articleHeading ?? "";
  // Phase C: a whole Definitions article grants nothing, whatever
  // its number. The articleHeading comes from the parser's
  // validated parent chain (D6), so this is a structural fact,
  // not a label guess. Tenable 1.02(d) ("dividends" in the
  // Definitions article) minted a false RP grant without it.
  if (/\bDefinitions?\b|\bDefined\s+Terms\b/i.test(heading)) return true;
  // D17 narrowing: the §1.01 number rule is a FALLBACK for items
  // with no structural article evidence, not an override of it.
  // When the validated parent chain attributes the item to an
  // article whose heading carries a title, that title is
  // affirmative structural evidence about which article the item
  // sits in; a titled heading that does not say Definitions means
  // the item is not in the definitions article, whatever its
  // section number — an operative §1.01 (e.g. the operative
  // provisions of an instrument whose definitions live in §1.02
  // or another article) must not lose its grants purely by
  // numbering convention. A bare designator ("ARTICLE I" with no
  // title) carries no title evidence, so the number rule still
  // decides there, exactly as it does when no heading was
  // attributed at all (the Asure case this rule was written for).
  if (articleHeadingTitle(heading).length > 0) return false;
  return /^1\.01(?![0-9])/.test(item.sectionRef ?? "");
}

/**
 * The title portion of an article heading: a leading article
 * designator ("ARTICLE I", "Article 2", "ARTICLE VII —") is
 * stripped, and what remains is the heading's title — or "" when
 * the heading is absent or is only a designator.
 */
function articleHeadingTitle(heading: string): string {
  const withoutDesignator = heading.replace(
    /^\s*ARTICLE\s+(?:[IVXLC]+|\d+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve)\b/i,
    "",
  );
  return withoutDesignator.replace(/^[^A-Za-z0-9]+/, "").trim();
}

/**
 * Rule 203 tightening: an excerpt counts as a single clause
 * only if it carries no sub-clause markers after its own
 * leading marker is stripped. Strata 6.08(a)'s excerpt is a
 * composite (the (a) clause PLUS its (i)/(ii) exceptions,
 * one of which mentions Indebtedness) — reading it as
 * evidence laundered a false DEBT grant into an RP clause.
 * Asure 7.03(p)'s excerpt is a single clause (no markers
 * after its own "(p)") — evidence still applies there.
 */
function excerptHasSubClauses(excerpt: string, sectionRef: string): boolean {
  let rest = excerpt.trim();
  const ownSuffix = sectionRef.match(/\(([^)]+)\)\s*$/)?.[1];
  if (ownSuffix) {
    const escaped = ownSuffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = rest.match(new RegExp(`^\\(\\s*${escaped}\\s*\\)`));
    if (m) rest = rest.slice(m[0].length);
  }
  return /\(\s*(?:[a-zA-Z]|[ivxlcdmIVXLCDM]+|[0-9]+)\s*\)/.test(rest);
}

/**
 * Rule 207: an incremental-facility provision (Article 2 mechanic —
 * the borrower requests additional commitments from lenders) is not
 * an incurrence basket. Expand §2.19(b) ("Incremental Increase",
 * notice to the Administrative Agent, Applicable Rate, Additional
 * Lender) minted a spurious DEBT $5M Permission from a fee/minimum
 * amount inside the facility mechanics. Guard: category OTHER (a
 * covenant-category item mentioning an incremental facility is a
 * basket referencing it, not the facility itself) AND the text is
 * ABOUT the facility mechanic — "Incremental Increase" itself, or
 * an incremental-facility noun plus a second mechanic signal
 * (Administrative Agent / Applicable Rate / Additional Lender /
 * Increasing Lender). A basket merely referencing an incremental
 * facility ("Indebtedness incurred pursuant to an Incremental
 * Agreement") has no mechanic signal and survives.
 */
function isIncrementalFacilityItem(item: CovenantSummaryItem): boolean {
  if (item.category !== "OTHER") return false;
  const text = `${item.heading ?? ""} ${item.plainEnglish ?? ""} ${item.operativeLanguageExcerpt ?? ""}`;
  if (/\bINCREMENTAL\s+INCREASE\b/i.test(text)) return true;
  if (
    /\bINCREMENTAL\s+(AGREEMENT|TERM|REVOLVING|FACILIT(?:Y|IES)|COMMITMENT|LOAN)\b/i.test(text) &&
    /\b(ADMINISTRATIVE\s+AGENT|APPLICABLE\s+RATE|ADDITIONAL\s+LENDER|INCREASING\s+LENDER)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

export function grantTypesForItem(item: CovenantSummaryItem): CounselGrantType[] {
  // Classification census steps 1–2: a NON_COVENANT item
  // (definition / representation / mechanics / boilerplate /
  // [reserved]) and an AFFIRMATIVE covenant mint NO basket
  // grants — belt-and-braces at the grant layer, so no consumer
  // can mint a Permission from an item the classifier has
  // already determined is not a basket grant.
  if (item.category === "NON_COVENANT" || item.category === "AFFIRMATIVE") return [];

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
  // Rule 204: the definitions article never grants capacity.
  if (isDefinitionsArticleItem(item)) return [];

  // Representations guard: a section in a PURE Representations
  // article (article heading is "Representations [and
  // Warranties]" — no "Covenants") states facts; it does not grant
  // capacity. Solaris 5.12 (margin-stock / Investment Company Act
  // representations), 5.07 (title representation), 5.24 (outbound
  // investment representation) all minted false RP / INVESTMENT /
  // LIEN grants from incidental words ("investment company",
  // "Liens" in a title-representation heading). Counsel accepting
  // such an item must not mint a Permission from it. Fail-closed:
  // mixed articles ("Representations, Warranties and Covenants")
  // and headings with extra words do NOT match — those items
  // keep today's behavior and counsel decides.
  if (isRepresentationArticle(item.articleHeading)) {
    return [];
  }

  // Rule 207: an incremental-facility provision never grants capacity.
  if (isIncrementalFacilityItem(item)) return [];

  // Rule 209i: an Events-of-Default ARTICLE grants nothing,
  // whatever category the classifier filed its clauses under —
  // Asure 8.01(k) (a Collateral Document ceasing to create a
  // valid Lien) was filed LIENS_SECURED_DEBT inside the
  // "EVENTS" article and minted a LIEN Permission from trigger
  // text. (Rule 166 keys on category; this keys on the article
  // the parser placed the item in, like the Rule 204 guard.)
  // A Conditions Precedent article is the same shape the other
  // way: satisfaction mechanics are conditions, not grants.
  if (/\bEVENTS?\b/i.test(item.articleHeading ?? "")) return [];
  if (/\bCONDITIONS?\s+(?:PRECEDENT|TO\s)/i.test(item.articleHeading ?? "")) return [];

  // Rule 209n/o: schedule / definition enumeration fragments
  // and article-level items grant nothing. The parser labels
  // Solaris's definitions region with bare-integer refs ("40",
  // "40(a)") — the "Excluded Property" / "Excluded Subsidiary"
  // / ERISA-Event definition lists minted LIEN Permissions
  // (two of them MODELED, from book-value thresholds inside
  // the definitions) because their narration repeated the
  // classifier's liens label. Operative covenant sections are
  // decimal-numbered; a bare integer or a pure roman numeral
  // names an enumeration or an article, never a basket clause.
  if (/^\d+\s*(?:\(|$)/.test(item.sectionRef ?? "")) return [];
  if (/^[IVXLCDM]+$/.test((item.sectionRef ?? "").trim())) return [];

  // Rule 209j: a restrictive-agreements clause grants nothing.
  // Its exceptions permit RESTRICTIONS in other agreements —
  // "restrictions imposed by any agreement relating to secured
  // Indebtedness permitted by this Agreement" (Solaris /
  // Tenable 7.10(e)/(g)/(m)); the burdensome-agreements
  // covenant carries the same frame in its text (Asure 7.09).
  // The permission runs to the restriction; the referenced debt
  // is permitted, if at all, by the clause it points at.
  if (isRestrictionsFrame(item)) return [];

  // Rule 209k: a fee/expense component grants nothing. Aon
  // 6.14(xiv) is an EBITDA add-back component ("any fees, costs
  // and expenses ... in connection with any proposed or
  // completed acquisition, investment, disposition, issuance,
  // repayment, refinancing or amendment ... of any
  // Indebtedness ..., not to exceed 5% of the aggregate
  // consideration") — a computation component whose cap frame
  // and incidental debt word minted a DEBT Permission.
  if (isFeeComponentClause(item)) return [];

  // Rule 209m: a [reserved] clause grants nothing — Solaris
  // 7.02(aa) minted RP + INVESTMENT from the classification
  // lead alone; its entire operative text is the placeholder.
  if (isReservedClause(item)) return [];

  // Rule 209p: definition-shaped text grants nothing. An item
  // whose excerpt introduces two or more defined terms is
  // definitions text whatever its sectionRef claims — Solaris
  // 7.03(iv) (the tail of the "Indebtedness" definition plus
  // the "Specified Communications" / "Specified Equity
  // Contribution" definitions) minted an RP Permission from
  // boilerplate. Baskets do not define terms; a single inline
  // basket name stays below the threshold.
  if (isDefinitionShaped(item)) return [];

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

  // Rule 203: a CLAUSE item's own operative excerpt is grant
  // evidence. The analyzer's plainEnglish sometimes summarizes
  // a cap as a basket ("Amount/threshold: $500,000") without
  // the operative "not exceeding" language (Asure 7.03(p) — a
  // genuine $500k Investment basket whose plainEnglish carries
  // no investment evidence, so it minted nothing). The clause's
  // excerpt IS its operative text (the parser bounds the span
  // to the clause), so reading it as evidence is sound. A
  // CHAPEAU item's excerpt is a composite of all its
  // sub-clauses — reading it as evidence would launder a
  // sub-clause's permission into the parent (the Rule 176
  // concern) — so chapeau items stay plainEnglish-only. A
  // clause ref ends with a parenthesized group.
  const isClauseItem = /\([^)]+\)\s*$/.test(item.sectionRef ?? "");
  // Rule 203 tightening: excerpt evidence only when the
  // excerpt is a single clause (no sub-clause markers).
  const evidenceHay =
    isClauseItem && !excerptHasSubClauses(item.operativeLanguageExcerpt ?? "", item.sectionRef ?? "")
      ? `${hay} ${(item.operativeLanguageExcerpt ?? "").toUpperCase()}`
      : hay;
  const hasDebtWord = /\bINDEBTEDNESS\b|\bDEBT\b|\bINCUR(RING|RED|RENCE)?\b|\bINCREMENTAL\b/.test(evidenceHay);
  // Rule 169: debt words alone are not a grant — they must carry
  // affirmative borrowing-permission evidence (cap frame or modal).
  // The RP/Investment early returns below key off this guarded
  // signal, so an RP item that merely MENTIONS Indebtedness without
  // permission evidence still returns RP-only instead of falling
  // through into a spurious DEBT grant.
  // Rule 198: a guarantee permission (guarantee word precedes the
  // debt word) is not a debt incurrence — the $750k guarantee cap
  // in Strata 6.04(e) is not an incurrence basket.
  const isGuarantee =
    isGuaranteePermission(hay) || isGuaranteePermission((item.operativeLanguageExcerpt ?? "").toUpperCase());
  // Rule 201: a lien clause capping "Liens securing
  // Indebtedness" is not a debt incurrence.
  const isLienSecured =
    isLienSecuredObligation(hay) || isLienSecuredObligation((item.operativeLanguageExcerpt ?? "").toUpperCase());
  let hasDebtPermission = hasDebtWord && hasDebtPermissionEvidence(evidenceHay) && !isGuarantee && !isLienSecured;
  // Rule 209l: a payment-frame clause grants no incurrence. The
  // junior-debt-payment covenants (Solaris / Tenable 7.08) and
  // the mandatory-prepayment mechanics (Asure 2.05(b)) PERMIT
  // PAYING debt — prepaying, redeeming, defeasing — not
  // incurring it, yet their "except refinancing ... with
  // Indebtedness permitted by Section 7.03" exception language
  // laundered DEBT grants (Tenable 7.08(a) even carried a
  // neighbor's greater-of formula). The frame is the clause's
  // operative head: incurrence baskets name the permitted debt
  // first and never open with a payment verb. ("Purchase" is
  // deliberately NOT a payment-frame head — purchase-money
  // clauses are genuine incurrence baskets.)
  if (hasDebtPermission && isPaymentFrameClause(item)) hasDebtPermission = false;
  // Rule 209e: on an item whose own category family is LIENS or
  // GUARANTEES, a DEBT grant needs DIRECT evidence — a cap
  // frame or a modal that asserts this clause's own permission.
  // The general modal channel is too weak there: those clauses
  // reference debt "permitted by Section X" as their OBJECT
  // (the lien secures it; the guarantee covers it), and the
  // summarizer's "Permission substance:" label puts a
  // PERMISSION token next to any debt word — Asure 7.01(f), a
  // deposits clause in the liens covenant that expressly
  // EXCLUDES Indebtedness, minted DEBT from the label alone,
  // and Asure 7.01(s) / Expand 6.02(cc) / Tenable 7.01(kk)
  // minted it from reference-form modals. A clause that itself
  // permits the debt ("Secured Indebtedness and Liens
  // permitted", or a stated cap) keeps its DEBT grant.
  if (
    hasDebtPermission &&
    (item.category === "LIENS_SECURED_DEBT" || item.category === "GUARANTEES") &&
    !hasDirectDebtPermissionEvidence(evidenceHay)
  ) {
    hasDebtPermission = false;
  }
  // Rule 209a: "Secured" alone is not a lien signal. It is an
  // adjective inside defined terms and ratio names — "Secured
  // Obligations" (the facility's own obligations, Strata
  // 6.01(a)/(c)), "Secured Net Leverage Ratio" (Solaris
  // 7.08(a); Solaris 7.06(m), whose genuine RP grant the bogus
  // LIEN was suppressing), "senior secured notes" as a debt
  // description (Tenable 7.03(t)) — and on this corpus 18 LIEN
  // grants rested on it, every one a non-lien provision on
  // hand inspection. A lien grant needs LIENS or COLLATERAL
  // in the operative narration.
  const hasLienWordRaw = /\bLIENS?\b|\bCOLLATERAL\b/.test(hay);
  // Rule 209f: a LIEN grant on a CLAUSE item filed under a
  // DIFFERENT family needs lien-permission evidence of its own
  // (a cap frame, or a permission modal in reference form next
  // to a lien word), judged on the guard haystack (narration +
  // excerpt — the restrictive-only channel of Rule 195).
  // Without it, lien words inside conditions and mechanics
  // mint capacity: an LC cash-collateralization duty triggered
  // by an Event of Default (Asure 2.03(q), Strata 2.06(j)), a
  // payments waterfall (Strata 2.18(b)), a mandatory pledge of
  // intercompany notes (Asure 7.02(d)), a name-change notice
  // protecting the Agent's EXISTING security interest (Strata
  // 6.03(h)). Section-level items are exempt: a stem
  // summarizes its whole section, its grant's evidence is the
  // section it heads (stem semantics are owned downstream by
  // the SECTION_STEM handling), not its own narration.
  const lienEvidence = hasDebtCapFrame(guardHay) || hasLienPermissionEvidence(guardHay);
  const hasLienWord =
    hasLienWordRaw &&
    !(item.category !== "LIENS_SECURED_DEBT" && isClauseItem && !lienEvidence);

  // Restricted payments / investments — do not default these into DEBT_INCURRENCE.
  // Rule 209b: the Available Amount is a CAPACITY MEASURE the
  // RP covenant references ("Restricted Payments up to the
  // Available Amount"), not an RP act — a mandatory-prepayment
  // mechanic that merely recomputes it (Solaris 2.05(b)) is
  // not an RP permission. The RP family requires an RP-act
  // word, as the branch's own push test already did.
  const isRpFamily = /\bRESTRICTED\s+PAYMENTS?\b|\bDIVIDENDS?\b|\bSHARE\s+REPURCHASES?\b|\bRP\b/.test(hay);
  const isInvestmentFamily = /\bINVESTMENTS?\b|\bACQUISITIONS?\b|\bPERMITTED\s+INVESTMENTS?\b/.test(hay);
  if (isRpFamily && isInvestmentFamily) {
    // Shared RP/Investment article — mint both grant types when baskets mention both.
    const out: CounselGrantType[] = [];
    // Rule 209g: on a CLAUSE item, a family whose words appear
    // only in the narration — never in the clause's own text —
    // is dropped when the clause's own text names the OTHER
    // family. The unresolved-posture lead ("relates to
    // restricted payments and investments, but ...") is not in
    // Rule 202's strip list, so its regime label paired every
    // clause of an investments-only covenant (Asure 7.03) with
    // an RP grant the clause never makes. The clause's own
    // words are the ground truth (Rule 203). When the excerpt
    // names NEITHER family, both grants are kept (fail-closed:
    // the support question then belongs to the chapeau, and
    // chapeau evidence handling is a separate stream's work).
    // EDITED items are exempt — counsel's text governs (Rule 60).
    const excerptUpper = (item.operativeLanguageExcerpt ?? "").toUpperCase();
    const excerptGrounding =
      isClauseItem &&
      !excerptHasSubClauses(item.operativeLanguageExcerpt ?? "", item.sectionRef ?? "") &&
      item.reviewerDecision !== "EDITED";
    const rpInExcerpt = /\bRESTRICTED\s+PAYMENTS?\b|\bDIVIDENDS?\b|\bSHARE\s+REPURCHASES?\b|\bRP\b/.test(excerptUpper);
    const invInExcerpt = /\bINVESTMENTS?\b|\bACQUISITIONS?\b/.test(excerptUpper);
    if (
      /\bDIVIDENDS?\b|\bRESTRICTED\s+PAYMENTS?\b|\bSHARE\s+REPURCHASES?\b|\bRP\b/.test(hay) &&
      !(excerptGrounding && !rpInExcerpt && invInExcerpt)
    )
      out.push("RESTRICTED_PAYMENT");
    if (
      /\bINVESTMENTS?\b|\bACQUISITIONS?\b/.test(hay) &&
      !(excerptGrounding && !invInExcerpt && rpInExcerpt)
    )
      out.push("INVESTMENT");
    if (out.length) return [...new Set(out)];
  }
  if (isRpFamily && !hasDebtPermission && !hasLienWord) {
    return ["RESTRICTED_PAYMENT"];
  }
  // Rule 170: investment words alone are not a grant — they must
  // carry affirmative investment-permission evidence.
  // Rule 209q: an item the classifier filed as DEBT_INCURRENCE
  // whose debt evidence FAILED does not fall through to an
  // INVESTMENT grant on adjective evidence ("Permitted
  // Acquisition"). Solaris 7.03(v) is a ratio-gated assumed-
  // indebtedness basket; it minted INVESTMENT from the
  // acquisition phrase in its text. The debt family's claim on
  // the item is prior — its permission question is a debt-
  // evidence question, answered fail-closed.
  if (
    isInvestmentFamily &&
    !hasDebtPermission &&
    !hasLienWord &&
    hasInvestmentPermissionEvidence(evidenceHay) &&
    !(hasDebtWord && item.category === "DEBT_INCURRENCE")
  ) {
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
