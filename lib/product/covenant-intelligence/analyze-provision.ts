/**
 * Substantive, source-backed provision analysis built on KF extractors.
 * Explains what the provision does — does not invent capacity or permission.
 */

import { detectPatternsInText, getPattern } from "../../knowledge-factory/patterns/library";
import { extractConditionsAndExceptions } from "../../knowledge-factory/pipeline/conditions";
import {
  isAdministrativeProvision,
  isEventOfDefaultTrigger,
} from "../../knowledge-factory/taxonomy/families";
import type {
  CovenantCandidateRecord,
  CrossReferenceRecord,
  DefinitionRecord,
  StructuralNodeRecord,
} from "../../knowledge-factory/types";
import type { CovenantCategoryKey } from "./summarize";

export type ProvisionPosture =
  | "GENERAL_PROHIBITION"
  | "ENUMERATED_PERMISSION"
  | "MAINTENANCE_TEST"
  | "CONDITIONAL_PERMISSION"
  | "OBLIGATION"
  | "UNRESOLVED";

/**
 * A defined term attached to a provision. `resolved` is an identity
 * claim, not a text-length claim: true only when a detected
 * definition OCCURRENCE in the same document backs the entry (a
 * DefinitionRecord carrying the definition's own text). A term the provision uses but the document does not define
 * is attached with `resolved: false` and an empty excerpt — visible,
 * never silently absent. `ambiguous` marks the distinct failure
 * where the document carries two or more DIFFERING definitions for
 * the term: unresolved because picking one would be a guess.
 */
export interface ApplicableDefinition {
  term: string;
  excerpt: string;
  resolved: boolean;
  ambiguous?: boolean;
}

/**
 * Structural resolution of one cross-reference, carried additively
 * alongside the legacy `crossReferences: string[]`. Semantics are
 * the structural layer's: `resolved` means a UNIQUE same-document
 * target (targetNodeId set). Ambiguous targets and unresolvable
 * references stay unresolved with a machine-readable reason —
 * resolution never guesses, and a resolved edge is a SYSTEM
 * structural fact, not counsel verification or legal authority.
 */
export interface CrossReferenceResolution {
  ref: string;
  resolved: boolean;
  targetNodeId?: string;
  targetSectionRef?: string;
  ambiguous?: boolean;
  reason?: string;
}

export interface ProvisionAnalysis {
  /** Rule 192: the candidate excerpt is a prefix of a longer
   * operative span (4000-char cap) — tail clauses are missing. */
  operativeExcerptTruncated?: boolean;
  /** Heading of the enclosing ARTICLE node (walked via parentNodeId), if any. Powers the representations guard: a section in a pure Representations article states facts, it does not grant capacity. */
  articleHeading?: string;
  sectionRef: string;
  heading: string;
  category: CovenantCategoryKey;
  categoryLabel: string;
  families: string[];
  posture: ProvisionPosture;
  /** Genuine plain-English explanation of operative substance. */
  plainEnglish: string;
  restriction: string | null;
  permissions: string[];
  coveredEntities: string[];
  entityScopeNotes: string[];
  exceptions: string[];
  conditions: string[];
  basketsAndThresholds: string[];
  draftingPatterns: string[];
  applicableDefinitions: ApplicableDefinition[];
  crossReferences: string[];
  /** Additive: structural resolution per cross-reference (see
   * CrossReferenceResolution). The string[] above stays for
   * compatibility and is derived from these entries. */
  crossReferenceResolutions?: CrossReferenceResolution[];
  /** Additive disclosure (Rule 159 pattern): true when the
   * provision references more defined terms than the per-provision
   * listing bound; the omitted mentions are unresolved, not absent. */
  definitionCoverageIncomplete?: boolean;
  definitionMentionsOmitted?: number;
  dependencies: string[];
  operativeLanguageExcerpt: string;
  sourceCitation: string;
  unresolved: string[];
  /** Competing readings when the excerpt supports material ambiguity. */
  alternativeInterpretations: string[];
  /** Explicit assumptions underlying the primary reading. */
  assumptions: string[];
  /** Where judgment was required beyond mechanical extraction. */
  judgmentCalls: string[];
  epistemicStatus: "DISCOVERED_CANDIDATE";
  interpretationNote: string;
}

const FAMILY_TO_CATEGORY: Record<string, CovenantCategoryKey> = {
  INDEBTEDNESS: "DEBT_INCURRENCE",
  INCREMENTAL_DEBT_AND_FACILITIES: "DEBT_INCURRENCE",
  RATIO_BASED_PERMISSIONS: "DEBT_INCURRENCE",
  LIENS: "LIENS_SECURED_DEBT",
  RESTRICTED_PAYMENTS: "RESTRICTED_PAYMENTS_INVESTMENTS",
  INVESTMENTS: "RESTRICTED_PAYMENTS_INVESTMENTS",
  ASSET_SALES: "ASSET_SALES",
  AFFILIATE_TRANSACTIONS: "AFFILIATE_TRANSACTIONS",
  GUARANTEES: "GUARANTEES",
  FUNDAMENTAL_CHANGES: "MERGERS_FUNDAMENTAL_CHANGES",
  FINANCIAL_MAINTENANCE_COVENANTS: "FINANCIAL_MAINTENANCE",
  EVENTS_OF_DEFAULT: "EVENTS_OF_DEFAULT",
  AVAILABLE_AMOUNT_AND_BUILDER_BASKETS: "BASKETS_EXCEPTIONS_CONDITIONS",
  SHARED_CAPACITY_PROVISIONS: "BASKETS_EXCEPTIONS_CONDITIONS",
  GENERAL_CONDITIONS_AND_EXCEPTIONS: "BASKETS_EXCEPTIONS_CONDITIONS",
  MANDATORY_PREPAYMENTS: "DEBT_INCURRENCE",
  JUNIOR_DEBT_PREPAYMENTS: "DEBT_INCURRENCE",
  RESTRICTED_SUBSIDIARIES: "OTHER",
  UNRESTRICTED_SUBSIDIARIES: "OTHER",
  DESIGNATIONS: "OTHER",
};

const CATEGORY_LABELS: Record<CovenantCategoryKey, string> = {
  DEBT_INCURRENCE: "Debt incurrence",
  LIENS_SECURED_DEBT: "Liens and secured debt",
  RESTRICTED_PAYMENTS_INVESTMENTS: "Restricted payments and investments",
  ASSET_SALES: "Asset sales",
  AFFILIATE_TRANSACTIONS: "Affiliate transactions",
  GUARANTEES: "Guarantees",
  MERGERS_FUNDAMENTAL_CHANGES: "Mergers and fundamental changes",
  FINANCIAL_MAINTENANCE: "Financial maintenance covenants",
  EVENTS_OF_DEFAULT: "Events of default",
  BASKETS_EXCEPTIONS_CONDITIONS: "Relevant baskets, exceptions, conditions and defined terms",
  OTHER: "Other provisions",
};

function sectionForNode(
  nodeId: string | undefined,
  nodes: StructuralNodeRecord[],
): { sectionRef: string; heading: string } {
  if (!nodeId) return { sectionRef: "n/a", heading: "Document body" };
  const n = nodes.find((x) => x.nodeId === nodeId);
  // Rule 200: a heading split across two source lines carries a
  // literal newline (Aon 6.17 rendered "Additional\nGuarantors").
  // A heading is one line — collapse internal whitespace. The
  // sectionRef fallback gets the same treatment (a missing
  // sectionRef must not become a multi-line ref).
  return {
    sectionRef: normalizeWs(n?.sectionRef || n?.heading || nodeId),
    heading: normalizeWs(n?.heading || n?.sectionRef || "Untitled provision"),
  };
}

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function clip(s: string, n: number): string {
  const t = normalizeWs(s);
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** True when an ARTICLE heading is a PURE Representations article ("Representations [and Warranties]" — no "Covenants"). Mixed articles and headings with extra words do NOT match (fail-closed). */
export function isRepresentationArticle(heading: string | undefined): boolean {
  if (!heading) return false;
  // EDGAR HTML extraction splits words into a single letter + rest
  // ("R EPRESENTATIONS AND W ARRANTIES"). Join a lone capital
  // letter to a following all-caps word before testing — applied
  // only here, only for this test.
  const despace = heading.replace(/\b([A-Z])\s+([A-Z]{2,})\b/g, "$1$2");
  return /^\s*(?:ARTICLE|Article|SECTION|Section|§)?\s*(?:[IVXLC\d.]+\s*(?:[-:–—]\s*)?)?Representations?(?:\s+and\s+Warranties?)?\s*$/i.test(
    despace,
  );
}

/** Interpretation language ("shall not be construed …") is not a covenant. */
const CONSTRUED_RE = /\bshall\s+not\s+be\s+(?:construed|deemed|interpreted)\b/i;

/**
 * Bare negative-covenant stems: the chapeau states the prohibited
 * act without a "shall not" (the "shall not" lives in the Article
 * chapeau). "Create, incur [or assume] [or suffer to exist]" (liens
 * / debt), "Make any Restricted Payment" (RP), "Make any
 * Investment(s)" (investments), "Enter into or suffer to exist"
 * (misc.). Shared by the GENERAL_PROHIBITION rule and the chapeau
 * frame test — the two must agree on what counts as a prohibition
 * frame, or a chapeau the analyzer calls a prohibition would not
 * frame its sub-clauses as permissions.
 */
const PROHIBITION_STEM =
  /\bCreate,\s*incur(?:\s*,?\s*(?:or\s+)?assume)?(?:\s+or\s+suffer\s+to\s+exist)?\b|\bMake\s+any\s+(?:Restricted\s+Payments?|Investments?)\b|\bEnter\s+into\s+or\s+suffer\s+to\s+exist\b/i;

/**
 * True when a provision must not be presented as a prohibition, permission,
 * or maintenance test: event-of-default triggers, administrative provisions
 * (defeasance, trustee mechanics, interpretation clauses), and
 * interpretation language. These get posture UNRESOLVED with an honest
 * explanation, never an inverted permission/prohibition.
 */
function isNonOperative(excerpt: string, heading: string, families: string[]): boolean {
  return (
    families.includes("EVENTS_OF_DEFAULT") ||
    isEventOfDefaultTrigger(heading, excerpt) ||
    isAdministrativeProvision(heading, excerpt) ||
    CONSTRUED_RE.test(excerpt)
  );
}

function detectPosture(excerpt: string, heading: string, families: string[], parentChapeau?: string): ProvisionPosture {
  const hay = `${heading}\n${excerpt}`;
  // Never invert a trigger / administrative provision into a permission or
  // prohibition. §8.01(j) cross-default starts with "(j)" — without this
  // guard the letter-clause rule below labeled it ENUMERATED_PERMISSION.
  if (isNonOperative(excerpt, heading, families)) return "UNRESOLVED";
  // Classic negative-covenant stem (shall-not often lives in the Article chapeau).
  if (
    PROHIBITION_STEM.test(hay) ||
    (/\bLimitation on\b/i.test(heading) && /\bexcept\s*:/i.test(hay))
  ) {
    return "GENERAL_PROHIBITION";
  }
  // A "shall not … except …" negative covenant is a general prohibition
  // whatever operative verb follows — the previous version required the
  // literal pair "create, incur", so a plain "shall not incur Indebtedness
  // except …" fell through to UNRESOLVED.
  if (/\b(?:shall|will|may)\s+not\b/i.test(hay) && /\bexcept\b/i.test(hay)) {
    return "GENERAL_PROHIBITION";
  }
  if (
    families.includes("FINANCIAL_MAINTENANCE_COVENANTS") ||
    /\bPermit the Consolidated\b/i.test(hay) ||
    (/\bFinancial Condition Covenants?\b/i.test(heading) &&
      /\bto exceed\b|\bto be less than\b/i.test(hay))
  ) {
    return "MAINTENANCE_TEST";
  }
  if (/\bshall\s+not\b|\bwill\s+not\b|\bmay\s+not\b/i.test(hay) && !/\bexcept\b/i.test(hay)) {
    return "GENERAL_PROHIBITION";
  }
  // "Neither X nor Y shall ..." is a prohibition with no "not" — a common
  // drafting form in credit agreements and indentures alike. Without this
  // it falls through to OBLIGATION, inverting the covenant's meaning.
  // [\s\S] (not ".") spans newlines: PDF excerpts break lines mid-sentence.
  if (/\bneither\b[\s\S]{0,120}\bshall\b/i.test(hay)) {
    return "GENERAL_PROHIBITION";
  }
  // A bare letter-clause "(a) …" is not by itself a permission — EoD
  // triggers, definitions, and administrative lists all use letter clauses.
  // Require permission language for the letter-clause branch.
  const letterClausePermission =
    /^\s*\([a-z0-9]+\)/i.test(excerpt.trim()) &&
    /\b(?:may|permitted|entitled|allowed|shall\s+be\s+permitted)\b/i.test(hay);
  if (letterClausePermission || /\bnot to exceed\b|\bgreater of\b/i.test(hay)) {
    return /\bprovided that\b|\bso long as\b|\bno Default\b|\bpro forma\b/i.test(hay)
      ? "CONDITIONAL_PERMISSION"
      : "ENUMERATED_PERMISSION";
  }
  if (/\bshall\b/i.test(hay) && !/\bshall\s+not\b/i.test(hay)) return "OBLIGATION";
  // Chapeau inheritance: a bare sub-clause with NO posture signal of
  // its own (no shall-not, no may, no shall, no cap) under a
  // prohibition-with-except chapeau ("shall not ... except:") IS an
  // enumerated permission — it is one of the chapeau's exceptions.
  // This is the universal negative-covenant structure (chapeau
  // prohibition + excepted sub-clauses), not a document pattern:
  // Solaris 7.01(a)-(m) (bare "(a) Liens for taxes...") all fell
  // through to UNRESOLVED because the sub-clause excerpt carries no
  // frame of its own. The parent chapeau supplies it. Fail-closed:
  // requires a real prohibition+except frame in the chapeau, a
  // sub-clause with no own prohibition language, and a non-operative
  // guard that already ran. A sub-clause with its own "shall not"
  // or "shall" is caught by the rules above and never reaches here.
  if (parentChapeau) {
    // A cross-reference ("permitted by Section 7.02(aa)") is a
    // pointer to another section's permission, not an own
    // permission signal. Strip xref-framed "permitted" before
    // the own-signal test (Tenable 7.01(kk) "permitted by Section
    // 7.02(aa)" is a cross-reference, not an own signal). A
    // genuine own "permitted" frame ("permitted to incur") is
    // untouched — the strip only fires on "permitted by/under/
    // pursuant to Section/§".
    const excerptSansXref = excerpt.replace(
      /\bpermitted\s+(?:by|under|pursuant\s+to)\s+(?:Section|§|Sections)\b[^.;]{0,40}/gi,
      "",
    );
    const ownSignal = /\b(?:shall|will|may)\s+not\b|\bneither\b|\bmay\b|\bpermitted\b|\bentitled\b|\ballowed\b|\bnot\s+to\s+exceed\b|\bgreater\s+of\b/i.test(excerptSansXref);
    // Prohibition-with-except frame: either an explicit "shall not ...
    // except/other than" or a bare negative-covenant stem (see
    // PROHIBITION_STEM) whose "shall not" lives in the Article
    // chapeau (Solaris 7.01 "Create, incur or assume ... other
    // than"; Solaris 7.02 "Make any Investments, except:"). Both
    // are the universal chapeau-prohibition + excepted-sub-clauses
    // structure.
    const chapeauProhibitsWithExcept =
      (/\b(?:shall|will|may)\s+not\b/i.test(parentChapeau) ||
        PROHIBITION_STEM.test(parentChapeau)) &&
      /\bexcept\b|\bother\s+than\b/i.test(parentChapeau);
    if (!ownSignal && chapeauProhibitsWithExcept) {
      return /\bprovided\s+that\b|\bso\s+long\s+as\b|\bno\s+Default\b|\bpro\s+forma\b/i.test(excerpt)
        ? "CONDITIONAL_PERMISSION"
        : "ENUMERATED_PERMISSION";
    }
  }
  return "UNRESOLVED";
}

function extractEntities(excerpt: string, heading: string): {
  coveredEntities: string[];
  entityScopeNotes: string[];
} {
  const hay = `${heading} ${excerpt}`;
  const covered: string[] = [];
  const notes: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\bParent Borrower\b/i, "Parent Borrower"],
    [/\bBorrower\b/i, "Borrower"],
    [/\bLoan Part(?:y|ies)\b/i, "Loan Parties"],
    [/\bGuarantor/i, "Guarantor(s)"],
    [/\bSubsidiary Guarantor/i, "Subsidiary Guarantor(s)"],
    [/\bRestricted Subsidiar/i, "Restricted Subsidiaries"],
    [/\bUnrestricted Subsidiar/i, "Unrestricted Subsidiaries"],
    [/\bForeign Subsidiar/i, "Foreign Subsidiaries"],
    [/\bSubsidiar(?:y|ies)\b/i, "Subsidiaries"],
  ];
  for (const [re, label] of checks) {
    if (re.test(hay) && !covered.includes(label)) covered.push(label);
  }
  if (/\bshall not permit any of its Subsidiaries\b/i.test(hay)) {
    notes.push("Obligation extends to Subsidiaries (shall-not-permit formulation).");
  }
  if (covered.length === 0) {
    notes.push("Covered entities are not explicit in the retrieved excerpt — unresolved.");
  }
  return { coveredEntities: covered, entityScopeNotes: notes };
}

function extractBaskets(excerpt: string): string[] {
  const out: string[] = [];
  const greaterOfMatches = [
    ...excerpt.matchAll(
      // Limb markers vary by drafter: (x)/(y), (i)/(ii), (1)/(2).
      // The old regex hard-coded x/y and silently dropped the rest.
      // Rule 191: the old regex also required the limb separator
      // to be "and"/"," and the percent to be a bare numeral —
      // real drafting is "greater of $1B or ten percent (10%) of
      // Consolidated Net Worth". The "or" separator and the
      // words + parenthesized-numeral percent ("ten percent
      // (10%)") are the standard forms; missing them dropped the
      // grower leg and the compiler minted a flat amount for a
      // greater-of basket (Aon 6.16(l) compiled to FLAT $1B).
      // Words-only percents ("ten percent" with no numeral) are
      // still not parsed — a known gap, not silently assumed.
      /greater of\s*\(?(?:[a-z0-9]{1,3}\)\s*)?\$?\s*([\d,]+(?:\.\d+)?)\s*(million|billion|thousand)?\s*(?:and|or|,)\s*\(?(?:[a-z0-9]{1,3}\)\s*)?(?:[A-Za-z]+\s+percent\s*)?\(?\s*([\d.]+)\s*%\s*\)?\s*of\s+([A-Za-z][A-Za-z0-9\s]+?)(?:\s*\(|,|;|\.| at )/gi,
    ),
  ];
  const greaterOf = greaterOfMatches.slice(0, 16);
  // Spans of the (capped) greater-of matches: a bare amount inside
  // one of these spans IS the limb — skip it. A bare amount at a
  // different position is a separate basket and must be kept (the
  // old string-inclusion dedup dropped a distinct $150M clause-(b)
  // basket because the greater-of entry's text contained "$150M").
  const greaterOfSpans: Array<[number, number]> = greaterOf.map((m) => [
    m.index ?? 0,
    (m.index ?? 0) + (m[0]?.length ?? 0),
  ]);
  for (const m of greaterOf) {
    // Preserve the fixed limb's unit: "greater of (x) $150.0 million" is a
    // $150,000,000 limb, not a $150.0 limb. Dropping "million" understated
    // the basket a million-fold in the live Quila output.
    const unit = m[2] ? ` ${m[2]}` : "";
    // "Greater of" with a SPACE: the compiler's greater-of
    // branch matches /greater of/i on the baskets text, and
    // "Greater-of" (hyphen) does not contain "greater of".
    out.push(`Greater of basket: $${m[1]}${unit} and ${m[3]}% of ${normalizeWs(m[4] ?? "")}`);
  }
  // Preserve the unit on every dollar amount: "$150.0 million" stays
  // "$150.0 million", never bare "$150.0".
  const amounts = [...excerpt.matchAll(/\$\s?[\d,]+(?:\.\d+)?\s*(million|billion|thousand)?/gi)];
  for (const m of amounts.slice(0, 40)) {
    const amount = normalizeWs(m[0] ?? "");
    const idx = m.index ?? 0;
    const insideGreaterOf = greaterOfSpans.some(([s, e]) => idx >= s && idx < e);
    if (!insideGreaterOf) {
      out.push(`Amount/threshold: ${amount}`);
    }
  }
  const ratios = excerpt.match(/\d+(?:\.\d+)?\s+to\s+1\.00/gi) ?? [];
  for (const r of ratios.slice(0, 8)) out.push(`Ratio threshold: ${normalizeWs(r)}`);
  if (/\bAvailable Amount\b|\bCumulative Credit\b|\bbuilder\b/i.test(excerpt)) {
    out.push("Builder / Available Amount construct referenced.");
  }
  if (/\bat any (?:one )?time outstanding\b/i.test(excerpt)) {
    out.push("Cap measured on outstanding amount at any time.");
  }
  if (/\bper fiscal year\b|\bin any fiscal year\b/i.test(excerpt)) {
    out.push("Cap measured on a per-fiscal-year basis.");
  }
  // Caps bound display size, set well above any real section's basket
  // count: silently dropping the 11th basket (old cap: 10) was worse
  // than a long list.
  return out.slice(0, 40);
}

function extractRestriction(excerpt: string, heading: string, posture: ProvisionPosture, categoryLabel: string): string | null {
  const createIncur = excerpt.match(
    /Create,\s*incur,\s*assume or suffer to exist[^.…]{0,160}?(?:except|$)/i,
  );
  if (createIncur) {
    return clip(createIncur[0].replace(/\bexcept\s*:?\s*$/i, "").trim() + " — except as expressly permitted", 320);
  }
  const makeRp = excerpt.match(/Make any Restricted Payment[^.…]{0,120}/i);
  if (makeRp) return clip(makeRp[0], 280);

  const prohib =
    excerpt.match(
      /(?:shall not|will not|may not)[^.…]{10,220}(?:except|\.|provided)/i,
    ) ??
    excerpt.match(/(?:shall not|will not|may not)[^.…]{10,220}/i);
  if (prohib) return clip(prohib[0].replace(/\bexcept\b.*$/i, "").trim(), 280);

  if (posture === "MAINTENANCE_TEST") {
    const m =
      excerpt.match(/Permit the Consolidated[^.…]{10,220}(?:exceed|less than)[^.…]{0,80}/i) ??
      excerpt.match(/Permit[^.…]{10,160}(?:exceed|less than)[^.…]{0,60}/i);
    if (m) return `Maintenance restriction: ${clip(m[0], 280)}`;
  }
  if (posture === "GENERAL_PROHIBITION") {
    return `General prohibition on ${categoryLabel.toLowerCase()} activity (heading “${clip(heading, 80)}”), subject to enumerated exceptions if any appear in the text.`;
  }
  return null;
}

function extractPermissions(
  excerpt: string,
  posture: ProvisionPosture,
  nonOperative = false,
): string[] {
  // An event-of-default trigger's letter clauses are trigger sub-paragraphs,
  // not permissions; an administrative provision's are not permissions either.
  if (nonOperative) return [];
  const perms: string[] = [];
  if (
    posture === "ENUMERATED_PERMISSION" ||
    posture === "CONDITIONAL_PERMISSION" ||
    /\bexcept\b/i.test(excerpt)
  ) {
    // Letter-clause baskets: (a) ... ; (b) ... — split depth-aware below.
    for (const clause of splitLetterClauses(excerpt)) {
      perms.push(clause);
    }
    if (perms.length === 0 && /\bexcept\b/i.test(excerpt)) {
      // Rule 187: a chapeau excerpt often ENDS with "except:" — the
      // letter clauses live in child items, not in this excerpt.
      // Minting "Except: :" from the bare colon (or "Except: (a)"
      // from a bare pointer) is junk, not a permission. Require
      // substantive words after the "except" before minting.
      const after = excerpt.split(/\bexcept\b/i)[1] ?? "";
      const rest = after.replace(/^[\s:;,.\u2014\u2013-]+/, "").trim();
      if (rest && /[A-Za-z]{3,}/.test(rest)) perms.push(clip(`Except: ${rest}`, 280));
    }
  }
  return perms.slice(0, 12);
}

/**
 * Split an enumerated list into its letter clauses, respecting nesting.
 *
 * The previous implementation cut clauses with /[^;.]{15,220}/, which
 * truncated a clause at the first "." — the "." in "U.S.$150.0 million"
 * cut a basket to "...not to exceed U" — at the first ";" (severing a
 * basket's own proviso from the basket), and at 220 chars (long baskets
 * lost their cap). Nested markers such as the (x)/(y) limbs of a
 * greater-of also leaked across clause boundaries.
 *
 * A marker starts a new clause only when it sits at paren depth 0 AND
 * follows a list separator (`;`, `.`, `:`) or the start of the excerpt.
 * That keeps "(x) $50,000,000 and (y) 10.0%" inside its (b) basket (it
 * follows "of" / "and", not a separator) while splitting "(a) ... ; (b)"
 * correctly. Clause text is kept whole up to 400 chars — periods and
 * semicolons inside a clause are content, not boundaries.
 */
const CLAUSE_MARKER = /\(([a-z]|\d+|[ivx]{1,5})\)/i;

function splitLetterClauses(excerpt: string): string[] {
  const starts: number[] = [];
  let depth = 0;
  for (let i = 0; i < excerpt.length; i += 1) {
    const ch = excerpt[i];
    if (ch === "(") {
      const rest = excerpt.slice(i);
      const marker = rest.match(CLAUSE_MARKER);
      if (marker && marker.index === 0) {
        // Look back past whitespace for the preceding significant char.
        let j = i - 1;
        while (j >= 0 && /\s/.test(excerpt[j]!)) j -= 1;
        const prev = j < 0 ? "" : excerpt[j]!;
        const isBoundary = depth === 0 && (prev === "" || prev === ";" || prev === "." || prev === ":");
        if (isBoundary) {
          starts.push(i);
          // Skip the marker's own parens — they don't change nesting depth.
          i += marker[0].length - 1;
          continue;
        }
      }
      depth += 1;
      continue;
    }
    if (ch === ")" && depth > 0) depth -= 1;
  }
  if (starts.length === 0) return [];
  const out: string[] = [];
  for (let k = 0; k < starts.length; k += 1) {
    const start = starts[k]!;
    const end = starts[k + 1] ?? excerpt.length;
    let clause = excerpt.slice(start, end).trim();
    // Strip one trailing list separator (the ";" or "." ending the clause).
    clause = clause.replace(/[;.]+$/, "").trim();
    if (clause.length < 5) continue;
    out.push(clip(clause, 400));
  }
  return out;
}

/** Per-provision listing bound for attached definition entries.
 * A resource bound, NOT a scan cap: matching runs over ALL of the
 * document's definitions. If a pathological provision references
 * more distinct terms than the bound, the excess mentions are
 * counted and disclosed as INCOMPLETE coverage on the item (Rule
 * 159 pattern — silent truncation is a lie) and the affected terms
 * are treated as unresolved, never as absent. */
export const MAX_DEFINITION_ENTRIES_PER_PROVISION = 100;

/** Term normalization shared by the definition index and mention
 * detection: case-folded, whitespace-collapsed, surrounding quotes
 * and punctuation trimmed — the same discipline Rule 197 applies
 * when it looks a term up, so producer and consumers agree on term
 * identity. Grammatical VARIANTS are never unified here:
 * exact-on-normalized matching only (the structural index's
 * getDefinition discipline; findDefinedTermVariant is barred from
 * silent matching). */
export function normalizeDefinedTermKey(term: string): string {
  return term
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,;:]+|[.,;:]+$/g, "")
    .toLowerCase();
}

/** A DefinitionRecord backs an entry only when it carries the
 * definition's own detected text — a record IS a detected
 * definition occurrence (span + text from the definitions
 * article), so a non-empty excerpt is the occurrence's text.
 * (Before this fix, `resolved` was `excerpt.length > 20` — a
 * length proxy that certified any long fallback window and
 * failed short genuine definitions.) */
function definitionRecordBacks(d: DefinitionRecord): boolean {
  return (d.excerpt ?? "").trim().length > 0;
}

interface DefinitionMatchResult {
  entries: ApplicableDefinition[];
  coverageIncomplete: boolean;
  omittedMentions: number;
}

/**
 * Attach definitions for a provision, honestly:
 *
 * Pass 1 — every definition in the document whose term the excerpt
 * USES. Matching semantics are Rule 199, unchanged: match the term
 * as a whole word/phrase, not a substring (the old `includes`
 * matched "SEC" inside "unsecured"); lookarounds require a
 * non-alphanumeric on both sides; internal whitespace is `\s+` so a
 * term split across a line break still matches; case-insensitive.
 * What changes is COVERAGE and the meaning of `resolved`: the scan
 * runs over an index of ALL definitions (the old code read only
 * `defs.slice(0, 300)` and stopped at 10 hits, so on a syndicated
 * §1.01 with 300+ terms, later terms were silently unmatchable
 * depending on detector ordering). A token prefilter — a term can
 * whole-phrase match only when one of its tokens occurs in the
 * excerpt — keeps the full index affordable without a scan cap.
 * Duplicate records for one term: identical definitions collapse
 * to one resolved entry; DIFFERING definitions make the entry
 * ambiguous (unresolved — picking one would be a guess).
 *
 * Pass 2 — defined-term-shaped mentions (quoted terms; capitalized
 * multi-word phrases in definitional use position) with NO record
 * in the document become explicit `resolved: false` entries, so
 * "used but not defined here" is visible and feeds the
 * unresolved-question and structural-quality rates instead of
 * producing no entry at all.
 */
function relatedDefinitions(
  excerpt: string,
  defs: DefinitionRecord[],
): DefinitionMatchResult {
  const byKey = new Map<string, DefinitionRecord[]>();
  for (const d of defs) {
    const key = normalizeDefinedTermKey(d.term);
    if (key.length < 3) continue;
    const arr = byKey.get(key);
    if (arr) arr.push(d);
    else byKey.set(key, [d]);
  }

  // Prefilter tokens: alphanumeric runs of the excerpt. A term
  // whose every token is absent cannot whole-phrase match, so
  // skipping it discards nothing that could have hit.
  const excerptTokens = new Set(
    excerpt.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
  );
  const termMayMatch = (key: string): boolean =>
    key
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 2)
      .some((t) => excerptTokens.has(t));

  const matched: Array<{ key: string; index: number }> = [];
  for (const [key, records] of byKey) {
    if (!termMayMatch(key)) continue;
    const term = records[0]!.term;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    const m = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i").exec(excerpt);
    if (m) matched.push({ key, index: m.index });
  }
  matched.sort(
    (a, b) => a.index - b.index || b.key.length - a.key.length || (a.key < b.key ? -1 : 1),
  );

  const positioned: Array<ApplicableDefinition & { position: number }> = [];
  const matchedKeys = new Set<string>();
  for (const { key, index } of matched) {
    matchedKeys.add(key);
    const records = byKey.get(key)!;
    const backing = records.filter(definitionRecordBacks);
    const distinctExcerpts = new Set(backing.map((d) => (d.excerpt ?? "").trim()));
    if (backing.length > 0 && distinctExcerpts.size === 1) {
      positioned.push({
        term: records[0]!.term,
        excerpt: clip(backing[0]!.excerpt, 220),
        resolved: true,
        position: index,
      });
    } else if (backing.length > 0) {
      positioned.push({
        term: records[0]!.term,
        excerpt: "",
        resolved: false,
        ambiguous: true,
        position: index,
      });
    } else {
      positioned.push({
        term: records[0]!.term,
        excerpt: "",
        resolved: false,
        position: index,
      });
    }
  }

  // Pass 2: used-but-undefined mentions.
  const candidates: Array<{ display: string; key: string; index: number; quoted: boolean }> = [];
  const quotedRe = /[“"]([^“”"]{2,80})[”"]|"([^"]{2,80})"/g;
  let qm: RegExpExecArray | null;
  while ((qm = quotedRe.exec(excerpt)) !== null) {
    const raw = (qm[1] ?? qm[2] ?? "").trim();
    if (raw) {
      candidates.push({ display: raw, key: normalizeDefinedTermKey(raw), index: qm.index, quoted: true });
    }
  }
  const phraseRe = /\b[A-Z][A-Za-z0-9]*(?:[ \t]+(?:[A-Z][A-Za-z0-9]*|of|the|and|for|&))+/g;
  let pm: RegExpExecArray | null;
  while ((pm = phraseRe.exec(excerpt)) !== null) {
    const words = pm[0].split(/[ \t]+/);
    if (words.filter((w) => /^[A-Z]/.test(w)).length < 2) continue;
    // "The Borrower" is the term "Borrower" in use position.
    const display = pm[0].replace(/^(?:The|A|An)[ \t]+/, "");
    candidates.push({ display, key: normalizeDefinedTermKey(display), index: pm.index, quoted: false });
  }
  const USE_PREFIX =
    /(?:the|any|each|such|a|an|of|under|than|per|in|to|for|with|without|by|as)[ \t]+$/i;
  candidates.sort((a, b) => a.index - b.index);
  const seenMention = new Set<string>(matchedKeys);
  for (const c of candidates) {
    if (c.key.length < 3 || seenMention.has(c.key)) continue;
    if (/^(section|article|clause|schedule|exhibit)\b/.test(c.key)) continue;
    // A term the document DOES define is pass 1's business — never
    // report it undefined over a mention-shape mismatch.
    if (byKey.has(c.key)) continue;
    // A mention immediately followed by its own definition
    // statement (“X” means …) is defined by this very text.
    const after = excerpt.slice(c.index + c.display.length, c.index + c.display.length + 24);
    if (/^[”"]?\s*(?:means|shall mean|has the meaning)/.test(after)) continue;
    // Unquoted phrases count only in definitional use position
    // (preceded by a determiner/preposition); a bare capitalized
    // phrase is as often a party name as a term. Quoted mentions
    // are unambiguous term signals and skip this guard.
    if (!c.quoted) {
      const before = excerpt.slice(Math.max(0, c.index - 12), c.index);
      if (!USE_PREFIX.test(before)) continue;
    }
    seenMention.add(c.key);
    positioned.push({ term: c.display, excerpt: "", resolved: false, position: c.index });
  }

  // Listing bound: keep resolved entries preferentially (they feed
  // executable consumers like Rule 197), count the rest, disclose.
  let omittedMentions = 0;
  let kept = positioned;
  if (positioned.length > MAX_DEFINITION_ENTRIES_PER_PROVISION) {
    const byPriority = [...positioned].sort(
      (a, b) => Number(b.resolved) - Number(a.resolved) || a.position - b.position,
    );
    kept = byPriority.slice(0, MAX_DEFINITION_ENTRIES_PER_PROVISION);
    omittedMentions = positioned.length - kept.length;
  }
  kept.sort((a, b) => a.position - b.position);
  return {
    entries: kept.map(({ position: _position, ...rest }) => rest),
    coverageIncomplete: omittedMentions > 0,
    omittedMentions,
  };
}

/** Cross-reference dedupe key: the designator ("Section",
 * "Article", "§") and spacing differ between detector records and
 * raw text for the SAME reference; identity is the reference body. */
function crossRefKey(ref: string): string {
  return normalizeWs(ref)
    .replace(/^(?:section|article|§)\s*/i, "")
    .toLowerCase();
}

/**
 * Structured cross-reference resolutions for one provision, from
 * the CrossReferenceRecords the upload path already loads.
 * Semantics are the structural layer's, never upgraded: a ref is
 * resolved only when a record resolves it to a UNIQUE target node
 * (targetNodeId). Conflicting records or an ambiguity flag make
 * it ambiguous; text-only mentions (no structural record) stay
 * unresolved with a reason — schedules/exhibits and
 * cross-document references are unresolved by design upstream
 * and keep their upstream reason here.
 */
function crossReferenceResolutionsFor(
  nodeId: string | undefined,
  excerpt: string,
  xrefs: CrossReferenceRecord[],
): CrossReferenceResolution[] {
  const out: CrossReferenceResolution[] = [];
  const covered = new Set<string>();
  if (nodeId) {
    const groups = new Map<string, CrossReferenceRecord[]>();
    for (const x of xrefs) {
      if (x.fromNodeId !== nodeId) continue;
      const arr = groups.get(x.rawReference);
      if (arr) arr.push(x);
      else groups.set(x.rawReference, [x]);
    }
    for (const [ref, records] of groups) {
      covered.add(crossRefKey(ref));
      const targets = new Map<string, CrossReferenceRecord>();
      let ambiguousRecord: CrossReferenceRecord | undefined;
      for (const r of records) {
        if (r.targetAmbiguous === true && !ambiguousRecord) ambiguousRecord = r;
        if (r.resolved === true && r.targetNodeId) targets.set(r.targetNodeId, r);
      }
      if (ambiguousRecord || targets.size > 1) {
        out.push({
          ref,
          resolved: false,
          ambiguous: true,
          targetSectionRef: (ambiguousRecord ?? records[0])?.targetSectionRef ?? undefined,
          reason: ambiguousRecord?.unresolvedReason ?? "AMBIGUOUS_TARGET",
        });
      } else if (targets.size === 1) {
        const [targetNodeId, rec] = [...targets.entries()][0]!;
        out.push({
          ref,
          resolved: true,
          targetNodeId,
          targetSectionRef: rec.targetSectionRef ?? undefined,
        });
      } else {
        const resolvedNoTarget = records.find((r) => r.resolved === true);
        const rec = resolvedNoTarget ?? records[0]!;
        out.push({
          ref,
          resolved: false,
          targetSectionRef: rec.targetSectionRef ?? undefined,
          reason:
            rec.unresolvedReason ??
            (resolvedNoTarget ? "RESOLVED_WITHOUT_TARGET" : "TARGET_NOT_FOUND"),
        });
      }
    }
  }
  const fromText =
    excerpt.match(/\b(?:Section|Article|§)\s*[\dA-Za-z.()-]+/g)?.map((s) => normalizeWs(s)) ?? [];
  for (const ref of fromText) {
    const key = crossRefKey(ref);
    if (covered.has(key)) continue;
    covered.add(key);
    out.push({ ref, resolved: false, reason: "NO_STRUCTURAL_RECORD" });
  }
  return out;
}

function buildPlainEnglish(params: {
  sectionRef: string;
  heading: string;
  categoryLabel: string;
  posture: ProvisionPosture;
  restriction: string | null;
  permissions: string[];
  coveredEntities: string[];
  exceptions: string[];
  conditions: string[];
  baskets: string[];
  definitions: Array<{ term: string; resolved: boolean }>;
  dependencies: string[];
  unresolved: string[];
  isEod: boolean;
}): string {
  const parts: string[] = [];
  const entity =
    params.coveredEntities.length > 0
      ? params.coveredEntities.join(", ")
      : "entities not clearly identified in the excerpt";

  if (params.isEod) {
    // An EoD trigger is neither a permission nor a prohibition on the
    // underlying activity — it defines when a failure becomes a default.
    parts.push(
      `Section ${params.sectionRef} (“${clip(params.heading, 100)}”) states an event-of-default trigger covering ${entity}.`,
    );
    if (params.restriction) parts.push(params.restriction);
    parts.push(
      "It does not itself permit or prohibit the underlying activity; it defines when the described failure or default becomes an Event of Default.",
    );
  } else {
  switch (params.posture) {
    case "GENERAL_PROHIBITION":
      parts.push(
        `Section ${params.sectionRef} (“${clip(params.heading, 100)}”) is a general ${params.categoryLabel.toLowerCase()} prohibition covering ${entity}.`,
      );
      if (params.restriction) parts.push(params.restriction);
      if (params.permissions.length > 0) {
        parts.push(
          `It is subject to enumerated exceptions/permissions, including: ${params.permissions
            .slice(0, 4)
            .join("; ")}.`,
        );
      } else if (params.exceptions.length > 0) {
        parts.push(`Exception language is present (${params.exceptions.length} signal(s)), but individual baskets were not fully segmented from this excerpt.`);
      } else {
        parts.push("No enumerated exception list was segmented from this excerpt — exception set may be unresolved.");
      }
      break;
    case "ENUMERATED_PERMISSION":
    case "CONDITIONAL_PERMISSION":
      parts.push(
        `Section ${params.sectionRef} (“${clip(params.heading, 100)}”) operates as a ${
          params.posture === "CONDITIONAL_PERMISSION" ? "conditional" : "enumerated"
        } permission within the ${params.categoryLabel.toLowerCase()} regime for ${entity}.`,
      );
      if (params.permissions[0]) parts.push(`Permission substance: ${params.permissions[0]}`);
      else if (params.restriction) parts.push(params.restriction);
      break;
    case "MAINTENANCE_TEST":
      parts.push(
        `Section ${params.sectionRef} (“${clip(params.heading, 100)}”) is a financial maintenance covenant applying to ${entity}.`,
      );
      if (params.restriction) parts.push(params.restriction);
      parts.push("Pass/fail and remaining headroom are unresolved without approved financial inputs.");
      break;
    case "OBLIGATION":
      parts.push(
        `Section ${params.sectionRef} (“${clip(params.heading, 100)}”) imposes an affirmative or ongoing obligation related to ${params.categoryLabel.toLowerCase()} for ${entity}.`,
      );
      break;
    default:
      parts.push(
        `Section ${params.sectionRef} (“${clip(params.heading, 100)}”) relates to ${params.categoryLabel.toLowerCase()}, but its prohibition/permission posture could not be determined from the excerpt.`,
      );
  }
  }

  if (params.baskets.length > 0) {
    parts.push(`Material baskets/thresholds identified: ${params.baskets.slice(0, 4).join("; ")}.`);
  }
  if (params.conditions.length > 0) {
    parts.push(`Conditions/provisos signaled: ${params.conditions.slice(0, 3).join("; ")}.`);
  }
  const unresolvedDefs = params.definitions.filter((d) => !d.resolved).map((d) => d.term);
  const resolvedDefs = params.definitions.filter((d) => d.resolved).map((d) => d.term);
  if (resolvedDefs.length > 0) {
    parts.push(`Controlling defined terms (definition located in this document): ${resolvedDefs.slice(0, 5).join(", ")}.`);
  }
  if (unresolvedDefs.length > 0) {
    parts.push(`Defined terms referenced but not resolved in-package: ${unresolvedDefs.slice(0, 4).join(", ")}.`);
  }
  if (params.dependencies.length > 0) {
    parts.push(`Cross-provision dependencies: ${params.dependencies.slice(0, 3).join("; ")}.`);
  }
  parts.push(
    "This is Headroom’s AI-generated, source-backed interpretation for counsel review — not a determination of current capacity, utilization, or amendment-operative status.",
  );
  if (params.unresolved.length > 0) {
    parts.push(`Unresolved: ${params.unresolved.slice(0, 3).join("; ")}.`);
  }
  return parts.join(" ");
}

function buildAlternativesAndAssumptions(params: {
  posture: ProvisionPosture;
  excerpt: string;
  permissions: string[];
  exceptions: string[];
  baskets: string[];
  unresolved: string[];
}): { alternativeInterpretations: string[]; assumptions: string[]; judgmentCalls: string[] } {
  const alternativeInterpretations: string[] = [];
  const assumptions: string[] = [];
  const judgmentCalls: string[] = [];
  const hay = params.excerpt;

  assumptions.push("Cited excerpt is treated as representative of the operative section body.");
  assumptions.push("Amendment precedence has not been independently resolved unless separately analyzed.");

  if (params.posture === "GENERAL_PROHIBITION" && (params.permissions.length > 0 || params.exceptions.length > 0)) {
    alternativeInterpretations.push(
      "Primary reading: general prohibition with enumerated exceptions. Competing reading: some listed baskets may operate as free-standing permissions if the chapeau does not clearly govern them.",
    );
    judgmentCalls.push("Whether exception clauses are exhaustive or illustrative requires counsel judgment on the chapeau and list structure.");
  }
  if (params.posture === "CONDITIONAL_PERMISSION" || /\bso long as\b|\bprovided that\b|\bsubject to\b/i.test(hay)) {
    alternativeInterpretations.push(
      "Primary reading: permission is unavailable unless stated conditions are satisfied. Competing reading: some conditions may be timing or notice requirements rather than substantive eligibility tests.",
    );
    judgmentCalls.push("Classification of provisos as conditions precedent versus ongoing covenants involves judgment.");
  }
  if (/\b(?:or|,)\s*(?:at the option of|in the Borrower's discretion)\b/i.test(hay) || /\beither\b[\s\S]+\bor\b/i.test(hay)) {
    alternativeInterpretations.push(
      "The provision appears to offer alternative paths; the strongest supported path is reported first, but counsel should confirm which path is intended for the contemplated transaction.",
    );
  }
  if (params.baskets.length > 1) {
    alternativeInterpretations.push(
      "Multiple baskets/thresholds appear in the excerpt — they may be cumulative, mutually exclusive, or shared-capacity. Primary analysis lists them without assuming stacking rules.",
    );
    judgmentCalls.push("Stacking / shared-capacity treatment among listed baskets is a judgment call without explicit aggregation language.");
  }
  if (params.unresolved.some((u) => /definition/i.test(u))) {
    assumptions.push("Unresolved defined terms are flagged rather than imputed from market practice.");
  }
  if (alternativeInterpretations.length === 0 && params.posture === "UNRESOLVED") {
    alternativeInterpretations.push(
      "Posture could not be determined confidently; treat the plain-English summary as a provisional reading pending counsel review of the full section.",
    );
    judgmentCalls.push("Provision posture classification was unresolved from the excerpt.");
  }
  return { alternativeInterpretations, assumptions, judgmentCalls };
}

export function analyzeProvision(params: {
  sourceId: string;
  documentTitle: string;
  candidate: CovenantCandidateRecord;
  definitions: DefinitionRecord[];
  structuralNodes: StructuralNodeRecord[];
  crossReferences?: CrossReferenceRecord[];
  /** Parent chapeau text (text before the first sub-clause marker in the parent candidate's excerpt) — powers chapeau inheritance in detectPosture. Optional; absent → existing behavior. */
  parentChapeau?: string;
}): ProvisionAnalysis {
  const { sectionRef, heading } = sectionForNode(params.candidate.nodeId, params.structuralNodes);
  // Enclosing ARTICLE heading: powers the representations guard.
  // A section in a pure Representations article (Solaris Art. V:
  // 5.07 title, 5.12 margin-stock, 5.24 outbound-investment)
  // states facts — it does not grant capacity, and counsel
  // accepting it must not mint a Permission from its incidental
  // "Liens"/"Investment" words.
  //
  // Phase C (Hardening Initiative, D6): articleHeading comes ONLY
  // from the parser's validated parent chain (containment +
  // ref-consistency, stage-structure.ts). The old dotted-ref
  // numbering fallback (first-match ARTICLE by label) is removed:
  // in a bundled document with two Article Vs it returns the
  // wrong instrument's heading, defeating the Representations
  // guard in the wrong direction (Tenable 5.07). With the fixed
  // parser, Aon 6.16(l) parents to Article VI by containment +
  // ref, so the fallback is no longer needed. No ARTICLE
  // ancestor → undefined (unresolved), never a label guess.
  const articleHeading = (() => {
    const byId = new Map(params.structuralNodes.map((n) => [n.nodeId, n]));
    const seen = new Set<string>();
    let node = params.candidate.nodeId ? byId.get(params.candidate.nodeId) : undefined;
    while (node?.parentNodeId && !seen.has(node.nodeId)) {
      seen.add(node.nodeId);
      node = byId.get(node.parentNodeId);
      if (node?.nodeType === "ARTICLE") return node.heading;
    }
    return undefined;
  })();
  const excerpt = params.candidate.excerpt || "";
  const primary = params.candidate.families[0] ?? "UNKNOWN";
  const nonOperative = isNonOperative(excerpt, heading, params.candidate.families);
  const isEod =
    params.candidate.families.includes("EVENTS_OF_DEFAULT") ||
    isEventOfDefaultTrigger(heading, excerpt);
  // Category follows substance, not just the first family tag: an EoD
  // trigger stays EVENTS_OF_DEFAULT even if the classifier also tagged a
  // subject family, and an administrative provision is OTHER.
  const category = isAdministrativeProvision(heading, excerpt)
    ? "OTHER"
    : isEod
      ? "EVENTS_OF_DEFAULT"
      : (FAMILY_TO_CATEGORY[primary] ?? "OTHER");
  const categoryLabel = CATEGORY_LABELS[category];
  const posture = detectPosture(excerpt, heading, params.candidate.families, params.parentChapeau);
  const { coveredEntities, entityScopeNotes } = extractEntities(excerpt, heading);
  const basketsAndThresholds = extractBaskets(excerpt);
  const restriction = extractRestriction(excerpt, heading, posture, categoryLabel);
  const permissions = extractPermissions(excerpt, posture, nonOperative);

  const condRecords = extractConditionsAndExceptions(params.sourceId, excerpt, params.structuralNodes, 40);
  const conditions = condRecords
    .filter((c) => c.kind === "CONDITION" || c.kind === "PROVISO")
    .map((c) => `${c.signals.join(",")}: ${clip(c.excerpt, 160)}`);
  const exceptions = condRecords
    .filter((c) => c.kind === "EXCEPTION")
    .map((c) => `${c.signals.join(",")}: ${clip(c.excerpt, 160)}`);

  const patternIds = detectPatternsInText(`${heading}\n${excerpt}`);
  const draftingPatterns = patternIds.map((id) => getPattern(id)?.name ?? id);

  const definitionResult = relatedDefinitions(excerpt, params.definitions);
  const applicableDefinitions = definitionResult.entries;
  const crossReferenceResolutions = crossReferenceResolutionsFor(
    params.candidate.nodeId,
    excerpt,
    params.crossReferences ?? [],
  );
  // The legacy string[] is derived from the structured resolutions
  // (record-backed refs in record order, then text-only refs),
  // preserving its historical contents and cap.
  const crossReferences = crossReferenceResolutions.map((r) => r.ref).slice(0, 12);
  const dependencies: string[] = [];
  for (const ref of crossReferences.slice(0, 6)) {
    dependencies.push(`Depends on / references ${ref}`);
  }
  for (const d of applicableDefinitions.slice(0, 4)) {
    dependencies.push(
      d.resolved
        ? `Meaning controlled by definition of “${d.term}”`
        : `References “${d.term}” but definition text was not resolved in-package`,
    );
  }
  if (/\bsubject to\b|\bin accordance with\b|\bas defined in\b/i.test(excerpt) && dependencies.length === 0) {
    dependencies.push("Operative effect appears contingent on another provision or definition.");
  }

  const unresolved: string[] = [...entityScopeNotes.filter((n) => /unresolved/i.test(n))];
  // Representations note: a section in a pure Representations
  // article states facts — counsel sees why it grants nothing.
  if (isRepresentationArticle(articleHeading)) {
    unresolved.push(
      "Section sits in the Representations article — a statement of fact, not a grant of capacity; it mints no Permission even when accepted.",
    );
  }
  if (!restriction && posture === "UNRESOLVED") {
    unresolved.push("Could not determine whether the provision is a prohibition, permission, or maintenance test");
  }
  if (posture === "GENERAL_PROHIBITION" && permissions.length === 0 && exceptions.length === 0) {
    unresolved.push("Exception/basket list not segmented from excerpt — full section review required");
  }
  if (applicableDefinitions.some((d) => !d.resolved)) {
    unresolved.push("One or more controlling definitions lack resolved definition text");
  }
  if (basketsAndThresholds.length === 0 && (posture === "ENUMERATED_PERMISSION" || posture === "CONDITIONAL_PERMISSION")) {
    unresolved.push("No dollar/ratio basket ceiling identified in the excerpt");
  }
  unresolved.push("Whether this provision is currently operative after amendments is unresolved");
  unresolved.push("Numerical capacity/utilization is unresolved without approved financial inputs and ledger");
  // Rule 157: a summary built from an ambiguous structural node must say
  // so. Phase-2 precedent aggregates showed 6,913 of 37,790 structural
  // nodes (~18%) flagged ambiguous, and candidate discovery deliberately
  // keeps ambiguous sections when they carry a usable sectionRef — but
  // nothing downstream disclosed that the section boundaries and
  // attribution came from ambiguous structure. The disclosure rides on
  // `unresolved`, which the document page renders and Ask surfaces, so
  // counsel sees it wherever the summary is read.
  const sourceNode = params.candidate.nodeId
    ? params.structuralNodes.find((n) => n.nodeId === params.candidate.nodeId)
    : undefined;
  if (sourceNode?.ambiguous) {
    unresolved.push(
      "Source structure for this section was flagged ambiguous during parsing — verify section boundaries and attribution before relying on this summary",
    );
  }
  // Rule 192: disclose a PREFIX excerpt — the operative span ran
  // past the 4000-char cap, so clauses beyond the cap (which may
  // carry their own baskets) are not in this summary.
  if (params.candidate.excerptTruncated) {
    unresolved.push(
      "Operative excerpt truncated at 4000 characters — clauses beyond the cap are not in this summary; verify the full section before relying on this item",
    );
  }
  // Definition-coverage disclosure (Rule 159 pattern): the
  // provision references more defined terms than the listing
  // bound. The unlisted mentions are unresolved, not absent —
  // say so wherever the summary is read.
  if (definitionResult.coverageIncomplete) {
    unresolved.push(
      `Definition coverage incomplete: this provision references more defined terms than the per-provision listing bound (${MAX_DEFINITION_ENTRIES_PER_PROVISION}); ${definitionResult.omittedMentions} mention(s) are not listed and are treated as unresolved, not absent`,
    );
  }

  const plainEnglish = buildPlainEnglish({
    sectionRef,
    heading,
    categoryLabel,
    posture,
    restriction,
    permissions,
    coveredEntities,
    exceptions,
    conditions,
    baskets: basketsAndThresholds,
    definitions: applicableDefinitions,
    dependencies,
    unresolved,
    isEod,
  });

  const { alternativeInterpretations, assumptions, judgmentCalls } = buildAlternativesAndAssumptions({
    posture,
    excerpt,
    permissions,
    exceptions,
    baskets: basketsAndThresholds,
    unresolved,
  });

  return {
    operativeExcerptTruncated: params.candidate.excerptTruncated,
    articleHeading,
    sectionRef,
    heading,
    category,
    categoryLabel,
    families: params.candidate.families,
    posture,
    plainEnglish,
    restriction,
    permissions,
    coveredEntities,
    entityScopeNotes,
    exceptions,
    conditions,
    basketsAndThresholds,
    draftingPatterns,
    applicableDefinitions,
    crossReferences,
    crossReferenceResolutions,
    definitionCoverageIncomplete: definitionResult.coverageIncomplete || undefined,
    definitionMentionsOmitted: definitionResult.omittedMentions || undefined,
    dependencies,
    operativeLanguageExcerpt: excerpt.slice(0, 700),
    sourceCitation: `${params.sourceId} · ${sectionRef}`,
    unresolved,
    alternativeInterpretations,
    assumptions,
    judgmentCalls,
    epistemicStatus: "DISCOVERED_CANDIDATE",
    interpretationNote:
      "AI-first source-backed interpretation for customer counsel review. Uses structural classification, condition/exception signals, drafting patterns, and definition matching. Not external legal verification; not executable capacity until counsel approves and the rulebook path is ready.",
  };
}
