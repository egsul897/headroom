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
 */
export function resolveDefinedTermCap(item: {
  operativeLanguageExcerpt?: string | null;
  applicableDefinitions?: Array<{ term: string; excerpt: string }> | null;
}): number | null {
  const excerpt = item.operativeLanguageExcerpt ?? "";
  const capMatch = excerpt.match(/\bnot\s+(?:to\s+)?exceed(?:ing)?\s+(?:the\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)+)/);
  if (!capMatch) return null;
  const term = capMatch[1]!.replace(/\s+/g, " ").trim().toLowerCase();
  const def = (item.applicableDefinitions ?? []).find(
    (d) => d.term.replace(/\s+/g, " ").trim().toLowerCase() === term,
  );
  if (!def) return null;
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
  const g = text.match(/\bGUARANTEES?\s+(?:CONSTITUTING|OF)\b/);
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
  return /\bLIENS?\b[^.]{0,200}?\bSECURING\s+(?:INDEBTEDNESS|DEBT)\b/.test(text);
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
function isDefinitionsArticleItem(item: CovenantSummaryItem): boolean {
  return /^1\.01(?![0-9])/.test(item.sectionRef ?? "");
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
  const hasDebtPermission = hasDebtWord && hasDebtPermissionEvidence(evidenceHay) && !isGuarantee && !isLienSecured;
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
  if (isInvestmentFamily && !hasDebtPermission && !hasLienWord && hasInvestmentPermissionEvidence(evidenceHay)) {
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
