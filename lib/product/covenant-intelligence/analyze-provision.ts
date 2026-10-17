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
import type { AffirmativeKind, CovenantCategoryKey, NonCovenantSubtype } from "./summarize";
import { findRatioTokens, isRatioShapedToken } from "../../contract-model/covenant-computation/covenant-levels";

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

/**
 * Structural classification, classification census steps 1–3.
 * Assigns the NON_COVENANT category (with a subtype) from
 * STRUCTURE-SHAPED signals only — article position, instrument
 * identity, node type, and clause shape — never from
 * agreement-specific strings. Family keyword scoring cannot
 * override it: a definition clause that mentions "Indebtedness"
 * is a definition, not a debt covenant.
 *
 * Fail-closed throughout: anything ambiguous stays OTHER /
 * UNKNOWN and enters the covenant decision queue.
 */

/** Structural article classes that gate NON_COVENANT classification. */
type StructuralArticleClass =
  | "DEFINITION"
  | "REPRESENTATION"
  | "AGENT"
  | "CONDITIONS"
  | "CREDITS"
  | "TAXES"
  | "ASSIGNMENTS"
  | "AMENDMENTS"
  | "MISCELLANEOUS"
  | "NEGATIVE"
  | "AFFIRMATIVE"
  | "COVENANTS"
  | "EOD"
  | "OTHER_ARTICLE";

/** EDGAR split-letter repair for article headings, generalized
 * from isRepresentationArticle's local version: a lone capital
 * letter followed by an all-caps word joins it ("D EFINITIONS"
 * → "DEFINITIONS"). Applied token-wise. */
function despaceHeadingText(heading: string): string {
  const tokens = heading.split(/\s+/);
  const out: string[] = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    if (prev !== undefined && /^[A-Z]$/.test(prev) && /^[A-Z]{2,}/.test(t)) {
      out[out.length - 1] = prev + t;
    } else {
      out.push(t);
    }
  }
  return out.join(" ");
}

/** Classify an ARTICLE heading into its structural role. Pure
 * predicates on the (despaced, uppercased) heading — never on
 * agreement-specific strings. Mixed articles (e.g. an article
 * titled both Representations and Covenants) match nothing:
 * fail-closed. */
function structuralArticleClass(heading: string | undefined): StructuralArticleClass | null {
  if (!heading) return null;
  const h = despaceHeadingText(heading).replace(/\s+/g, " ").trim().toUpperCase();
  const has = (re: RegExp) => re.test(h);
  if (has(/\bDEFINITIONS?\b/) || has(/\bDEFINED TERMS\b/)) return "DEFINITION";
  if (has(/\bREPRESENTATIONS?\b/) && !has(/\bCOVENANTS?\b/)) return "REPRESENTATION";
  if (has(/\bADMINISTRATIVE AGENT\b/) || has(/\bOTHER AGENTS\b/) || /^(THE\s+)?ADMINISTRATIVE$/.test(h)) {
    return "AGENT";
  }
  if (has(/\bCONDITIONS\b/) && !has(/\bCOVENANTS?\b/)) return "CONDITIONS";
  if (has(/\bTHE CREDITS\b/) || has(/\bCOMMITMENTS\b/)) return "CREDITS";
  if (has(/\bTAXES\b/) || has(/\bYIELD PROTECTION\b/) || has(/\bINCREASED COSTS\b/)) return "TAXES";
  if (has(/\bASSIGNMENTS\b/) || has(/\bBENEFIT OF AGREEMENT\b/) || has(/\bBORROWER REPRESENTATIVE\b/) || has(/\bGENERAL PROVISIONS\b/)) {
    return "ASSIGNMENTS";
  }
  if (has(/\bAMENDMENTS\b/) || has(/\bWAIVERS\b/)) return "AMENDMENTS";
  if (has(/\bMISCELLANEOUS\b/)) return "MISCELLANEOUS";
  if (has(/\bEVENTS OF DEFAULT\b/)) return "EOD";
  if (has(/\bNEGATIVE\b/)) return "NEGATIVE";
  if (has(/\bAFFIRMATIVE\b/)) return "AFFIRMATIVE";
  if (has(/\bCOVENANTS\b/)) return "COVENANTS";
  return "OTHER_ARTICLE";
}

const ROMAN_VALUES: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12, XIII: 13,
};

/** The article numeral from an ARTICLE node's sectionRef
 * ("I", "ARTICLE VII", "1" all parse). */
function articleNumeral(sectionRef: string | undefined): number | null {
  if (!sectionRef) return null;
  const token = sectionRef.trim().toUpperCase().split(/\s+/).pop() ?? "";
  const roman = ROMAN_VALUES[token];
  if (roman !== undefined) return roman;
  const digits = parseInt(token, 10);
  return Number.isFinite(digits) ? digits : null;
}

/** Leading integer of a provision's sectionRef ("7.03(f)" → 7). */
function leadingRefNumber(sectionRef: string | undefined): number | null {
  if (!sectionRef) return null;
  const m = sectionRef.trim().match(/^(\d+)/);
  const g = m?.[1];
  return g ? parseInt(g, 10) : null;
}

/** Structural position of a candidate: the enclosing ARTICLE by
 * validated parentage (existing articleHeading semantics), a
 * span-containment fallback (never contradicting parentage), and
 * whether the item sits in a bundled instrument's region. */
interface StructuralPosition {
  candidateNode: StructuralNodeRecord | undefined;
  /** Validated ancestor chain, self first, root last. */
  chain: StructuralNodeRecord[];
  /** Heading of the nearest SECTION node in the chain (self or
   * ancestor) — the section the provision belongs to. */
  sectionHeading: string | undefined;
  /** ARTICLE ancestor by validated parent chain (ancestors only). */
  articleNode: StructuralNodeRecord | null;
  /** Smallest ARTICLE span containing the candidate's span — used
   * ONLY when the parentage walk finds no ARTICLE. */
  containedArticle: StructuralNodeRecord | null;
  /** True when the candidate's span starts at/after the first
   * article-sequence restart (a bundled guaranty / security /
   * intercreditor instrument inside one file). */
  inBundledInstrumentRegion: boolean;
  /** The article whose class gates classification: parentage
   * first; containment only when ref-consistent or bundled. */
  positionArticle: StructuralNodeRecord | null;
  /** Structural classes of the position article, or null. */
  positionClass: StructuralArticleClass | null;
}

function structuralPositionOf(
  candidateNode: StructuralNodeRecord | undefined,
  candidateSectionRef: string,
  structuralNodes: StructuralNodeRecord[],
): StructuralPosition {
  const nodesById = new Map(structuralNodes.map((n) => [n.nodeId, n]));
  const chain: StructuralNodeRecord[] = [];
  {
    const seen = new Set<string>();
    let node = candidateNode;
    while (node && !seen.has(node.nodeId)) {
      seen.add(node.nodeId);
      chain.push(node);
      node = node.parentNodeId ? nodesById.get(node.parentNodeId) : undefined;
    }
  }
  // Ancestors only (chain[0] is the candidate's own node) —
  // matches the existing articleHeading walk.
  const articleNode = chain.slice(1).find((n) => n.nodeType === "ARTICLE") ?? null;
  let containedArticle: StructuralNodeRecord | null = null;
  if (!articleNode && candidateNode) {
    const cs = candidateNode.charStart;
    const ce = candidateNode.charEnd;
    let best: StructuralNodeRecord | null = null;
    let bestSpan = Infinity;
    for (const n of structuralNodes) {
      if (n.nodeType !== "ARTICLE") continue;
      if (n.charStart <= cs && ce <= n.charEnd) {
        const span = n.charEnd - n.charStart;
        if (span < bestSpan) {
          bestSpan = span;
          best = n;
        }
      }
    }
    containedArticle = best;
  }
  // Bundled-instrument region. The parser emits one ARTICLE
  // sequence per instrument in the file, plus (in EDGAR files) a
  // miniature duplicate sequence for the table of contents.
  // Split the articles (span order) into numeral-ascending runs;
  // the run with the greatest total span is the primary
  // instrument (the credit agreement body — the TOC run is tiny
  // by comparison). A later non-primary run is a bundled
  // instrument (guaranty / security / intercreditor): the region
  // starts at its first article. Runs BEFORE the primary run
  // (the TOC) never start a bundled region.
  const articlesBySpan = structuralNodes
    .filter((n) => n.nodeType === "ARTICLE")
    .sort((a, b) => a.charStart - b.charStart);
  let bundledStart: number | null = null;
  {
    const runs: Array<{ start: number; totalSpan: number }> = [];
    let prev: number | null = null;
    for (const a of articlesBySpan) {
      const num = articleNumeral(a.sectionRef);
      if (num == null) continue;
      if (prev == null || num <= prev || runs.length === 0) {
        runs.push({ start: a.charStart, totalSpan: 0 });
      }
      const current = runs[runs.length - 1];
      if (current) current.totalSpan += Math.max(0, a.charEnd - a.charStart);
      prev = num;
    }
    if (runs.length > 1) {
      let primaryIdx = 0;
      for (let i = 1; i < runs.length; i++) {
        const run = runs[i];
        const primary = runs[primaryIdx];
        if (run && primary && run.totalSpan > primary.totalSpan) primaryIdx = i;
      }
      for (let i = primaryIdx + 1; i < runs.length; i++) {
        const run = runs[i];
        if (run && (bundledStart == null || run.start < bundledStart)) bundledStart = run.start;
      }
    }
  }
  const inBundledInstrumentRegion =
    bundledStart != null && candidateNode != null && candidateNode.charStart >= bundledStart;
  // Containment is admissible only when it does not contradict
  // the section reference: the provision's leading section
  // number must match the containing article's numeral (the
  // parser's own containment + ref-consistency principle), or
  // the item must sit in a bundled instrument's region (whose
  // instruments restart their own numbering).
  let positionArticle: StructuralNodeRecord | null = articleNode;
  if (!positionArticle && containedArticle) {
    const containedNum = articleNumeral(containedArticle.sectionRef);
    const leading = leadingRefNumber(candidateSectionRef);
    if (inBundledInstrumentRegion) {
      positionArticle = containedArticle;
    } else if (containedNum != null && leading != null && containedNum === leading) {
      positionArticle = containedArticle;
    }
  }
  return {
    candidateNode,
    chain,
    sectionHeading: chain.find((n) => n.nodeType === "SECTION")?.heading,
    articleNode,
    containedArticle,
    inBundledInstrumentRegion,
    positionArticle,
    positionClass: structuralArticleClass(positionArticle?.heading ?? undefined),
  };
}

/** A chapeau/title-only item: the excerpt carries nothing beyond
 * the section title (segmentation stems whose clauses are separate
 * items, e.g. "Section 2.09. Termination of Commitment ...").
 * Such items are never classified from article position — the
 * clauses below them carry the substance. */
const OPERATIVE_VERB =
  /\b(shall|will|may|must|agree|waiv|deliver|furnish|maintain|permit|represent|warrant|covenant|undertak|pay|giv|provid|notif|incur|creat|enter)/i;

/** Strict title-only test: after stripping the section marker
 * and the heading, nothing substantive remains. Used by step 3,
 * where the wider chapeau test would also catch operative
 * verb-less basket prongs. */
function isTitleOnlyStem(excerpt: string, heading: string): boolean {
  const norm = excerpt.replace(/\s+/g, " ").trim();
  let rest = norm
    .replace(/^(?:section|§)\s+[0-9a-zA-Z().-]+\.?\s*/i, "")
    .replace(/^[0-9]+(?:\.[0-9]+)*[.\s]+/, "");
  const h = heading.replace(/\s+/g, " ").trim().toLowerCase();
  if (h.length > 3 && rest.toLowerCase().startsWith(h)) rest = rest.slice(h.length);
  rest = rest.replace(/^[\s.:;—–-]+/, "").trim();
  return rest.length <= 30;
}

function isChapeauOnlyExcerpt(excerpt: string, heading: string): boolean {
  const norm = excerpt.replace(/\s+/g, " ").trim();
  let rest = norm
    .replace(/^(?:section|§)\s+[0-9a-zA-Z().-]+\.?\s*/i, "")
    .replace(/^[0-9]+(?:\.[0-9]+)*[.\s]+/, "");
  const h = heading.replace(/\s+/g, " ").trim().toLowerCase();
  if (h.length > 3 && rest.toLowerCase().startsWith(h)) rest = rest.slice(h.length);
  rest = rest.replace(/^[\s.:;—–-]+/, "").trim();
  if (rest.length <= 30) return true;
  // A truncated heading ("Termination") may strip only part of
  // the title ("Termination of Commitment; Increase in
  // Revolving Commitments ."). The remainder is still a title
  // when the whole excerpt is short and carries no operative
  // verb — a one-sentence operative clause ("Each Guarantor
  // waives notice ...") always carries one.
  return norm.length <= 120 && !OPERATIVE_VERB.test(norm);
}

/** A "[Reserved]" placeholder — no operative text. */
function isReservedPlaceholder(excerpt: string, heading: string): boolean {
  const norm = excerpt.replace(/\s+/g, " ").trim();
  const body = norm
    .replace(/^(?:section|§)\s+[0-9a-zA-Z().-]+\.?\s*/i, "")
    .replace(/^[0-9]+(?:\.[0-9]+)*[.\s]+/, "")
    // Clause-marker prefixes: "(j) [Reserved]." / "(d) Reserved ."
    .replace(/^\([a-z0-9]{1,3}\)\s*/i, "")
    .trim();
  return /^\[?reserved\]?[.;]?$/i.test(body) || /\[reserved\]/i.test(heading);
}

/** Families that make an item covenant-mappable for the masking
 * gates: they carry a substantive covenant category (not OTHER,
 * not the generic baskets bucket). */
function hasMappableSubstantiveFamily(families: string[]): boolean {
  return families.some((f) => {
    const cat = FAMILY_TO_CATEGORY[f];
    return (
      cat !== undefined &&
      cat !== "OTHER" &&
      cat !== "BASKETS_EXCEPTIONS_CONDITIONS"
    );
  });
}

/** A schedules/exhibits index parsed as a section item — a list
 * of schedule and exhibit titles, not a provision. Shape: the
 * excerpt is dominated by Schedule/Exhibit enumerations and
 * carries no operative verb. Never classified NON_COVENANT: it
 * is parser residue, explicitly unresolved. */
function isScheduleIndexText(excerpt: string): boolean {
  const markers = (excerpt.match(/\bSchedule\s+[0-9A-Z]/g) ?? []).length +
    (excerpt.match(/\bExhibit\s+[A-Z0-9]/g) ?? []).length;
  return markers >= 4 && !/\bshall\b|\bwill\b/i.test(excerpt);
}

/** Mandatory-prepayment shape: an obligation to prepay ("the
 * Borrowers shall prepay", "shall ... prepay"). Voluntary
 * prepayment rights ("may prepay", "shall have the right to
 * prepay") and application waterfalls ("shall be applied") do
 * NOT match — fail-closed. */
function isMandatoryPrepaymentShape(excerpt: string): boolean {
  if (/\bshall\s+have\s+the\s+right\b/i.test(excerpt)) return false;
  return (
    /\bshall\s*,?\s*(?:\w+\s+){0,2}prepay\b/i.test(excerpt) ||
    /\bshall\b[^.;]{0,60}\bprepay\b/i.test(excerpt) ||
    // "shall, immediately after such Net Proceeds are received
    // ..., prepay" — the comma-adjunct obligation shape.
    /\bshall\s*,[^.;]{0,110}\bprepay\b/i.test(excerpt) ||
    /\bmandatory\s+prepayment/i.test(excerpt)
  );
}

/**
 * Step 1: the NON_COVENANT classification. Runs BEFORE family
 * keyword scoring can label definitions, representations,
 * mechanics, boilerplate, or [reserved] placeholders as
 * covenants. Returns the subtype, or null when the item must go
 * through covenant classification.
 *
 * Guards (fail-closed): items carrying a substantive mappable
 * family are kept out of the mechanics/boilerplate gates in
 * Miscellaneous and Credits articles (the masking population);
 * chapeau-only stems are never gated; an EoD-shaped item is never
 * gated (isEod is passed in so the gate cannot claim a trigger).
 */
function classifyNonCovenant(params: {
  excerpt: string;
  heading: string;
  families: string[];
  primary: string;
  isEod: boolean;
  position: StructuralPosition;
}): NonCovenantSubtype | null {
  const { excerpt, heading, families, primary, isEod, position } = params;
  if (isReservedPlaceholder(excerpt, heading)) return "RESERVED";
  if (isEod) return null;
  if (isScheduleIndexText(excerpt)) return null;
  // An ARTICLE node item is the article head/chapeau itself —
  // never gated by its own article's class.
  if (position.candidateNode?.nodeType === "ARTICLE") return null;

  const cls = position.positionClass;

  // Subsidiary-designation machinery: operates the
  // restricted/unrestricted subsidiary regime — it is not a
  // covenant grant. Shape: the enclosing SECTION is a
  // designation section and the item's primary family is a
  // designation family. Never inside a Negative Covenants
  // article (there designations run as operative limitations),
  // and never chapeau-only (the section stem carries the
  // regime's framing, classified elsewhere).
  if (
    cls !== "NEGATIVE" &&
    ["RESTRICTED_SUBSIDIARIES", "UNRESTRICTED_SUBSIDIARIES", "DESIGNATIONS"].includes(primary) &&
    position.sectionHeading !== undefined &&
    /\bdesignation of\b|\bsubsidiary designation\b/i.test(
      despaceHeadingText(position.sectionHeading),
    ) &&
    !isChapeauOnlyExcerpt(excerpt, heading)
  ) {
    return "MECHANICS";
  }

  switch (cls) {
    case "DEFINITION":
      return "DEFINITION";
    case "REPRESENTATION":
      return "REPRESENTATION";
    case "AGENT":
    case "CONDITIONS":
    case "TAXES":
    case "ASSIGNMENTS":
    case "AMENDMENTS":
      return "MECHANICS";
    case "MISCELLANEOUS": {
      // Carve-out: a guaranty-obligations section embedded in
      // the miscellaneous article (the "obligations absolute" /
      // guaranty waiver provisions) is an operative guarantee
      // provision, not boilerplate — its GUARANTEES family is
      // the operative subject, and step 3 promotes it. Shape:
      // the enclosing section names the guaranty regime and the
      // GUARANTEES family is present.
      const section = despaceHeadingText(position.sectionHeading ?? "");
      if (
        /\b(obligations\s+absolute|guaranty|guarantees?)\b/i.test(section) &&
        families.includes("GUARANTEES")
      ) {
        return null;
      }
      // A representations section inside a bundled instrument
      // whose span containment lands in an overreaching
      // miscellaneous span is representation content.
      if (isRepresentationArticle(position.sectionHeading)) return "REPRESENTATION";
      return "BOILERPLATE";
    }
    case "CREDITS":
      if (isChapeauOnlyExcerpt(excerpt, heading)) return null;
      // Incremental-facility clauses are the operative terms of
      // a debt permission, not facility mechanics — when the
      // INCREMENTAL family goes undetected they must stay in
      // the covenant queue (fail-closed). Shape: the excerpt
      // works an "Incremental" defined-term regime (or the
      // enclosing section is the incremental section).
      if (
        (excerpt.match(/\bIncremental\b/g) ?? []).length >= 2 ||
        /\bincremental\b/i.test(position.sectionHeading ?? "")
      ) {
        return null;
      }
      // Census step 4 (mechanics shapes): three closed
      // facility-mechanics shapes inside THE CREDITS state
      // mechanics even when their text carries a mappable
      // family keyword — they apply or protect facility
      // economics and grant no basket: (i) application-of-
      // proceeds waterfalls ("shall be applied as follows /
      // to prepay ... in accordance with"), (ii) break-funding
      // compensation (Interest Period + compensation/loss
      // language), (iii) letter-of-credit absolute-obligation
      // waiver enumerations (exchange/release/non-perfection
      // of Collateral + waiver of or consent to departure
      // from the Security Agreement / guaranty — the applicant's
      // reimbursement duty is unconditional; "guarantee" there
      // is the OBJECT of a waiver, not a guarantee grant).
      const flat = excerpt.replace(/\s+/g, " ");
      if (
        /\bshall be applied\b[^.]{0,60}\b(as follows|to prepay|in accordance|in the following order)\b/i.test(
          flat,
        ) ||
        /\bapplication of (the )?proceeds\b/i.test(flat)
      ) {
        return "MECHANICS";
      }
      if (
        /\bInterest (Period|Payment Date)\b/.test(flat) &&
        /\bcompensat\w*\b|\bfunding losses?\b|\bbreakage\b|\bloss, cost or expense\b/i.test(flat)
      ) {
        return "MECHANICS";
      }
      if (
        /\b(exchange|release|non-?perfection)\b[^.]{0,80}\bCollateral\b/i.test(flat) &&
        /\bwaiver of or consent to departure from\b/i.test(flat)
      ) {
        return "MECHANICS";
      }
      // The mandatory-prepayment guard runs AFTER the three
      // shapes above: its vetted patterns detect prepayment
      // vocabulary anywhere in an excerpt, and application /
      // break-funding clauses mention prepayment incidentally
      // — the shapes identify what the clause DOES, the guard
      // protects the actual prepayment provisions (the trigger
      // clauses that order prepayment, whose text matches none
      // of the three mechanics shapes).
      if (isMandatoryPrepaymentShape(excerpt)) return null;
      // Past that guard, a MANDATORY_PREPAYMENTS family on the
      // item is inherited or mentioned, not operative (a mixed
      // Optional/Mandatory prepayment section's stem excerpt
      // contains the mandatory subsection's "shall prepay", and
      // Rule 193 inheritance carries the family onto the
      // optional subsection's clauses) — it does not block the
      // mechanics gate. Other substantive families still do
      // (the masked incremental population).
      if (
        hasMappableSubstantiveFamily(
          families.filter((f) => f !== "MANDATORY_PREPAYMENTS"),
        )
      ) {
        return null;
      }
      return "MECHANICS";
    case "EOD": {
      // Census step 4 (article context): inside an Events of
      // Default article, only the trigger section states
      // operative default events — the remedies, application,
      // and interpretive sections are post-default machinery
      // (the census's K3A remedies population). The trigger
      // section is the one whose heading IS the EoD title;
      // trigger-shaped items never reach this switch (the
      // isEod guard above returns null for them, and the
      // category step classifies position-evidenced triggers
      // as EVENTS_OF_DEFAULT).
      const sec = despaceHeadingText(position.sectionHeading ?? "");
      if (/\bevents of default\b/i.test(sec) && !/\bremedies\b/i.test(sec)) return null;
      return "MECHANICS";
    }
    default:
      break;
  }

  // Bundled-instrument rule: a provision of a bundled guaranty /
  // security / intercreditor instrument (or an exhibit form)
  // whose primary family maps to no covenant category is content
  // of THAT instrument, not a covenant of the credit agreement —
  // explicitly classified as mechanics of the bundled
  // instrument. Families beyond the primary are the instrument's
  // own subject matter (an intercreditor clause is ABOUT liens);
  // they do not make it a credit-agreement covenant. Items whose
  // PRIMARY family maps (a security agreement's lien grant, a
  // guaranty's guarantee) keep their covenant classification:
  // the gate claims only the otherwise-OTHER population.
  if (
    position.inBundledInstrumentRegion &&
    (FAMILY_TO_CATEGORY[primary] ?? "OTHER") === "OTHER" &&
    !isChapeauOnlyExcerpt(excerpt, heading)
  ) {
    // Carve-out: a guaranty contribution/subrogation section is
    // a substantive guarantee provision (it allocates guarantor
    // liability), not instrument mechanics — its GUARANTEES
    // family is the operative subject; step 3 promotes it.
    const section = despaceHeadingText(position.sectionHeading ?? "");
    if (/\b(contribution|subrogation)\b/i.test(section) && families.includes("GUARANTEES")) {
      return null;
    }
    if (isRepresentationArticle(position.sectionHeading)) return "REPRESENTATION";
    return "MECHANICS";
  }
  return null;
}

/** Prohibition frame in the provision's own lead: a bare
 * prohibition stem, or a "shall/will not" in the opening text.
 * An affirmative covenant never opens with its prohibition. */
function hasProhibitionLead(excerpt: string, heading: string): boolean {
  const hay = `${heading}\n${excerpt.replace(/\s+/g, " ").trim()}`;
  // Census step 4 (frame scoping): the bare-stem test reads the
  // provision's LEAD only. A stem is a chapeau frame — it opens
  // the section. Scanning the whole excerpt inverted real
  // affirmative covenants whose subordinate tail carries a stem
  // phrase (a post-closing dissolution directive ending "...or
  // make any investments in such entity" read as an RP stem).
  if (PROHIBITION_STEM.test(hay.slice(0, 240))) return true;
  // A "shall/will not" is the provision's frame only when it
  // LEADS — before any affirmative obligation shape. A
  // post-closing directive ("shall cause X to be dissolved
  // and, until so dissolved, such entity shall not conduct...")
  // carries a subordinate interim restriction, not a
  // prohibition lead.
  const lead = hay.slice(0, 400);
  const notIdx = lead.search(/\b(shall|will)\s+not\b/i);
  if (notIdx >= 0) {
    const obligationIdx = Math.min(
      ...[OBLIGATION_LEAD.exec(lead)?.index ?? Infinity, CAUSE_LEAD.exec(lead)?.index ?? Infinity],
    );
    if (obligationIdx === Infinity || notIdx < obligationIdx) return true;
  }
  // Line-of-business frame: "will engage only in lines of
  // business substantially similar to ..." is a RESTRICTION
  // (the borrower may not enter other lines), however the
  // agreement files it — including inside an affirmative
  // article.
  return /\b(engage|conduct|carry on)\b[^.;]{0,80}\bonly\b/i.test(hay);
}

/** Tight obligation-verb shapes that open an affirmative
 * covenant ("shall deliver", "shall maintain", "shall permit
 * inspection", "will furnish"...). Used only inside a MIXED
 * covenants article, where article position alone cannot
 * distinguish affirmative from negative covenants. */
const OBLIGATION_LEAD =
  /\b(shall|will)\s+(deliver|furnish|provide|maintain|keep|permit|give|file|pay|promptly\s+(deliver|furnish|provide|give|notify))\b/i;
/** "Shall cause X to become / execute / deliver / enter into"
 * (joinder and control-agreement shapes) — a bare "will cause
 * each Subsidiary to" causative frame is not one. */
const CAUSE_LEAD = /\b(shall|will)\s+cause\b[^;]{0,80}\b(become|execute|deliver|enter into|comply|agree|dissolv)\w*\b/i;

/** A delivery FRAME: the section's chapeau sentence that only
 * says deliveries go to the Agent/Lenders — WHAT is delivered
 * lives in the enumerated descendant clauses (separate items).
 * Shape: after the title, a short single frame whose verb is
 * deliver/furnish/provide and which names no delivered object. */
function isDeliveryFrame(excerpt: string, heading: string, sectionHeading?: string): boolean {
  void heading;
  void sectionHeading;
  const rest = excerpt
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:section|§)\s+[0-9a-zA-Z().-]+\.?\s*/i, "")
    .replace(/^[0-9]+(?:\.[0-9]+)*[.\s]+/, "");
  // Anchor on the first delivery verb. Everything before it
  // must be title/subject matter (no second operative verb);
  // everything from it onward is the frame tail, which must be
  // short and name no delivered object. (The section TITLE
  // names the objects — "Financial Statements; ... Information"
  // — so object words are only disqualifying in the tail; a
  // tail mention of "sufficient copies" is copy count, not
  // content, and is not an object word here.)
  const m = /\b(deliver|furnish|provide|supply)\b/i.exec(rest);
  if (!m || m.index > 160) return false;
  const head = rest.slice(0, m.index);
  if (/\b(deliver|furnish|provid|suppl|maintain|permit|represent|warrant|agree|incur|prepay|redeem)\w*\b/i.test(head)) {
    return false;
  }
  const tail = rest.slice(m.index);
  if (tail.length > 220) return false;
  return !/\b(financial statements|certificates?|reports?|information|notices?|documents|budgets?|computations?)\b/i.test(
    tail,
  );
}

/** Obligation kind from the enclosing section's heading — the
 * agreement's own organization of its affirmative covenants. */
function affirmativeKindFor(sectionHeading: string | undefined): AffirmativeKind {
  const h = despaceHeadingText(sectionHeading ?? "");
  if (/\bbooks\b|\brecords\b|\binspection\b|\bvisitation\b/i.test(h)) return "BOOKS_INSPECTION";
  if (/\bexistence\b|\bqualification\b/i.test(h)) return "EXISTENCE";
  if (/\btaxes\b|\bpayment of obligations\b/i.test(h)) return "TAXES";
  if (/\bproperties\b|\binsurance\b/i.test(h)) return "PROPERTIES_INSURANCE";
  if (
    /\bfurther assurances\b|\badditional (guarantors|collateral)\b|\bjoinder\b|\bcovenant to guarantee\b|\bguarantee obligations\b/i.test(
      h,
    )
  ) {
    return "FURTHER_ASSURANCES";
  }
  if (/\bcompliance\b|\bmaterial contracts\b|\benvironmental\b/i.test(h)) return "COMPLIANCE";
  if (/\bnotices?\b/i.test(h)) return "NOTICE";
  if (/\bfinancial statements\b|\bcertificates?\b|\breports?\b|\breporting\b|\binformation\b|\bbudgets?\b/i.test(h)) {
    return "REPORTING";
  }
  return "OTHER_AFFIRMATIVE";
}

/**
 * Step 2: the AFFIRMATIVE classification. Operative affirmative
 * covenants ARE covenants — they stay in the pipeline — but
 * they are not negative covenants or basket grants, and OTHER
 * mislabels them.
 *
 * Gate A (pure Affirmative article): article position is the
 * agreement's own organization — every operative item in it is
 * an affirmative covenant. Guards (fail-closed): chapeau-only
 * stems (their clauses are separate items), prohibition leads,
 * financial-maintenance primaries, EoD-shaped items, and
 * anything step 1 already classified are never claimed.
 *
 * Gate B (mixed "Covenants" article — affirmative and negative
 * covenants under one article title): position alone cannot
 * separate them, so an item is claimed only when its section
 * names an affirmative subject OR its lead carries a tight
 * obligation-verb shape, and it has no prohibition lead.
 */
const AFFIRMATIVE_SECTION_SUBJECT =
  /\b(financial statements|financial reporting|certificates|other information|notices|existence|taxes|properties|insurance|compliance|material contracts|books|records|inspection|further assurances|additional guarantors|maintenance|reporting)\b/i;

function classifyAffirmative(params: {
  excerpt: string;
  heading: string;
  families: string[];
  primary: string;
  isEod: boolean;
  position: StructuralPosition;
  candidateNodeType?: string;
}): AffirmativeKind | null {
  const { excerpt, heading, families, primary, isEod, position } = params;
  if (isEod) return null;
  if (primary === "FINANCIAL_MAINTENANCE_COVENANTS" || families[0] === "EVENTS_OF_DEFAULT") return null;
  // Fragment inheritance: a CLAUSE fragment under an
  // affirmative-subject section of an affirmative article is
  // part of that section's covenant — its operative stem is
  // the section's own item ("(a) the occurrence of any
  // Default" under §Notices; a bare infinitive prong
  // "Perform its obligations under material agreements..."
  // whose "shall" lives in the stem). SECTION stems
  // themselves never inherit (they are the stem, separately
  // accounted). The fragment shapes are: chapeau-only text,
  // or a lead carrying no shall/will at all.
  const leadHasNoModal = !/\b(shall|will)\b/i.test(excerpt.replace(/\s+/g, " ").slice(0, 200));
  if (
    position.positionClass === "AFFIRMATIVE" &&
    params.candidateNodeType !== undefined &&
    params.candidateNodeType !== "SECTION" &&
    params.candidateNodeType !== "ARTICLE" &&
    (isChapeauOnlyExcerpt(excerpt, heading) || leadHasNoModal) &&
    AFFIRMATIVE_SECTION_SUBJECT.test(despaceHeadingText(position.sectionHeading ?? ""))
  ) {
    return affirmativeKindFor(position.sectionHeading);
  }
  if (isChapeauOnlyExcerpt(excerpt, heading)) return null;
  if (isDeliveryFrame(excerpt, heading, position.sectionHeading)) return null;
  if (hasProhibitionLead(excerpt, heading)) return null;
  // A business-scope section is a restriction by subject,
  // whichever article files it.
  if (/\b(nature of business|conduct of business|lines? of business|business activities)\b/i.test(
    despaceHeadingText(position.sectionHeading ?? ""),
  )) {
    return null;
  }
  const cls = position.positionClass;
  if (cls === "AFFIRMATIVE") {
    return affirmativeKindFor(position.sectionHeading);
  }
  if (cls === "COVENANTS") {
    const section = despaceHeadingText(position.sectionHeading ?? "");
    const affirmativeSubject = AFFIRMATIVE_SECTION_SUBJECT.test(section);
    const lead = excerpt.replace(/\s+/g, " ").slice(0, 400);
    if (affirmativeSubject || OBLIGATION_LEAD.test(lead) || CAUSE_LEAD.test(lead)) {
      return affirmativeKindFor(position.sectionHeading);
    }
  }
  return null;
}

export interface ProvisionAnalysis {
  /** Rule 192: the candidate excerpt is a prefix of a longer
   * operative span (4000-char cap) — tail clauses are missing. */
  operativeExcerptTruncated?: boolean;
  /**
   * Formula representation (step 3): the parent section's chapeau
   * text (the same text detectPosture inherits), carried so the
   * formula scan can read a cap stated in the stem that governs
   * this clause. Contract text from the parent node's own span.
   */
  parentChapeau?: string;
  /** The candidate's full operative span when the excerpt is a
   * truncated prefix (formula parse only; display excerpt and the
   * Rule 192 disclosure are unchanged). */
  operativeFullSpan?: string;
  /** The structural node type of this item's own node — the
   * formula parse's full-span guard reads it (clause-level spans
   * only; a section-level span covers sibling clauses with
   * independent caps). */
  operativeNodeType?: string;
  /** Heading of the enclosing ARTICLE node (walked via parentNodeId), if any. Powers the representations guard: a section in a pure Representations article states facts, it does not grant capacity. */
  articleHeading?: string;
  sectionRef: string;
  heading: string;
  category: CovenantCategoryKey;
  categoryLabel: string;
  /** Classification census step 1: for NON_COVENANT items, the
   * structural reason the item is not an operative covenant.
   * Absent for covenant items. */
  nonCovenantSubtype?: NonCovenantSubtype;
  /** Classification census step 2: for AFFIRMATIVE items, the
   * obligation kind. Absent for non-affirmative items. */
  affirmativeKind?: AffirmativeKind;
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

export const FAMILY_TO_CATEGORY: Record<string, CovenantCategoryKey> = {
  INDEBTEDNESS: "DEBT_INCURRENCE",
  INCREMENTAL_DEBT_AND_FACILITIES: "DEBT_INCURRENCE",
  RATIO_BASED_PERMISSIONS: "DEBT_INCURRENCE",
  LIENS: "LIENS_SECURED_DEBT",
  RESTRICTED_PAYMENTS: "RESTRICTED_PAYMENTS_INVESTMENTS",
  INVESTMENTS: "RESTRICTED_PAYMENTS_INVESTMENTS",
  ASSET_SALES: "ASSET_SALES",
  AFFILIATE_TRANSACTIONS: "AFFILIATE_TRANSACTIONS",
  RESTRICTIVE_AGREEMENTS: "RESTRICTIVE_AGREEMENTS",
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
  RESTRICTIVE_AGREEMENTS: "Restrictive agreements",
  GUARANTEES: "Guarantees",
  MERGERS_FUNDAMENTAL_CHANGES: "Mergers and fundamental changes",
  FINANCIAL_MAINTENANCE: "Financial maintenance covenants",
  EVENTS_OF_DEFAULT: "Events of default",
  BASKETS_EXCEPTIONS_CONDITIONS: "Relevant baskets, exceptions, conditions and defined terms",
  NON_COVENANT: "Non-covenant provision",
  AFFIRMATIVE: "Affirmative covenants",
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
  // Ratio thresholds via the unified covenant-level tokenizer: the old
  // pattern only saw "N to 1.00", so a level written "4.50:1.00" or
  // "4.5 to 1" never became a "Ratio threshold:" label and Rule 180
  // never saw the covenant. Bare x/times tokens are multiples in basket
  // text, not levels, and time-shaped tokens are not ratios; both stay
  // out, exactly as the completeness checker's filter.
  const ratios = findRatioTokens(excerpt).filter((t) => !t.bare && isRatioShapedToken(t));
  for (const r of ratios.slice(0, 8)) out.push(`Ratio threshold: ${normalizeWs(r.raw)}`);
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
  /** Per-SECTION-node context (classification census step 4),
   * computed by the summarize pass: the section's covenant
   * subject (from its stem candidate's families, or a strict
   * majority of its clause candidates' families) and its
   * recovered full title when the node heading is a truncated
   * fragment. Keyed by SECTION nodeId. Optional; absent →
   * heading/title arbitration only. */
  sectionContext?: Map<string, { subjectCategory?: CovenantCategoryKey; title?: string }>;
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
  // Classification census step 1: structural NON_COVENANT
  // classification runs BEFORE family keyword scoring — article
  // position, instrument identity, and node shape are stronger
  // evidence than keyword families (a definition clause that
  // mentions "Indebtedness" is a definition, not a debt
  // covenant). The gate never claims an EoD-shaped item.
  const candidateNode = params.candidate.nodeId
    ? params.structuralNodes.find((n) => n.nodeId === params.candidate.nodeId)
    : undefined;
  const structuralPos = structuralPositionOf(candidateNode, sectionRef, params.structuralNodes);
  const nonCovenantSubtype = classifyNonCovenant({
    excerpt,
    heading,
    families: params.candidate.families,
    primary,
    isEod,
    position: structuralPos,
  });
  // Classification census step 2: AFFIRMATIVE classification —
  // operative affirmative covenants (reporting, notices,
  // existence, taxes, maintenance, compliance, books/inspection,
  // further assurances) get their real category instead of OTHER
  // or a subject-keyword label. Runs after step 1 (a designation
  // mechanics clause or [reserved] placeholder inside an
  // affirmative article is NON_COVENANT, not an affirmative
  // covenant) and before family mapping.
  const affirmativeKind = nonCovenantSubtype
    ? null
    : classifyAffirmative({
        excerpt,
        heading,
        families: params.candidate.families,
        primary,
        isEod,
        position: structuralPos,
        candidateNodeType: params.structuralNodes.find((n) => n.nodeId === params.candidate.nodeId)
          ?.nodeType,
      });
  // Classification census step 3: covenant-gated primary
  // selection (masking). When an item IS a covenant item —
  // steps 1–2 did not claim it, it is not EoD-shaped, not
  // administrative, and not a title-only stem — and its
  // position-0 family maps to no covenant category (UNKNOWN /
  // RESTRICTED_SUBSIDIARIES / UNRESTRICTED_SUBSIDIARIES /
  // DESIGNATIONS), a MAPPABLE family in its detected list can
  // still win the category — under arbitration, never by list
  // position alone. Steps 1–2 running first is what makes this
  // safe: the census hand-verified that of 493 OTHER items
  // with a mappable family beyond position 0, only 81 are true
  // masking — the rest are incidental mentions inside
  // definitions, representations, CP items, and mechanics,
  // which steps 1–2 have already classified. Promotion changes
  // ONLY the category outcome (posture and permission
  // extraction read the full family list and the operative
  // text, unchanged).
  // ---- Classification census step 4: parent-section / article
  // context. Steps 1–3 classified from the item's own text and
  // article position; the census's largest remaining failure
  // classes are exactly the ones whose evidence lives in the
  // ENCLOSING section (a clause's covenant is its section's
  // covenant) or the enclosing article (EoD trigger fragments
  // whose trigger frame is the section chapeau). The context
  // computed here — the section's subject and the clause's own
  // operative lead subject — arbitrates; it never overrides
  // steps 1–2 and never fires on keyword evidence alone.
  const sectionNode = structuralPos.chain.find((n) => n.nodeType === "SECTION");
  const sectionCtx = sectionNode ? params.sectionContext?.get(sectionNode.nodeId) : undefined;
  const sectionText = despaceHeadingText(sectionCtx?.title ?? structuralPos.sectionHeading ?? "");
  const SECTION_SUBJECTS: Array<[RegExp, CovenantCategoryKey]> = [
    [/\bindebtedness\b|\bincremental\b|\bincrease\b|\bpriority\b|\bprepayments?\b/i, "DEBT_INCURRENCE"],
    [/\bliens\b|\bsecured debt\b/i, "LIENS_SECURED_DEBT"],
    [/\brestricted\b|\binvestments\b/i, "RESTRICTED_PAYMENTS_INVESTMENTS"],
    [/\basset sales\b|\bdispositions\b|\basset\b|\bip rights\b|\bintellectual property\b/i, "ASSET_SALES"],
    [/\bguarantee\b|\bguaranty\b/i, "GUARANTEES"],
    [/\baffiliate/i, "AFFILIATE_TRANSACTIONS"],
    [/\bfundamental\b|\bmergers\b|\bconsolidation\b/i, "MERGERS_FUNDAMENTAL_CHANGES"],
    [/\bfinancial\b/i, "FINANCIAL_MAINTENANCE"],
  ];
  const sectionCats: CovenantCategoryKey[] = [];
  for (const [re, cat] of SECTION_SUBJECTS) if (re.test(sectionText)) sectionCats.push(cat);
  if (sectionCtx?.subjectCategory && !sectionCats.includes(sectionCtx.subjectCategory)) {
    sectionCats.push(sectionCtx.subjectCategory);
  }
  // The clause's own operative lead subject: the first covenant
  // subject named in its opening words, with cross-reference
  // mentions ("permitted by Section 7.02") stripped — a pointer
  // to another section's permission is not the clause's subject.
  const LEAD_SUBJECTS: Array<[RegExp, CovenantCategoryKey]> = [
    [/\bindebtedness\b|\bincremental\b/i, "DEBT_INCURRENCE"],
    [/\bobligations\b[^.;]{0,80}\b(?:incurred|assumed)\b/i, "DEBT_INCURRENCE"],
    [/\bliens?\b|\bencumbrances?\b/i, "LIENS_SECURED_DEBT"],
    [/\brestricted payments?\b|\bdividends?\b|\bdistributions?\b|\brepurchas\w*\b|\bbuybacks?\b/i, "RESTRICTED_PAYMENTS_INVESTMENTS"],
    [/\binvestments?\b/i, "RESTRICTED_PAYMENTS_INVESTMENTS"],
    [/\bdispositions?\b|\basset sales?\b|\bmaterial ip\b|\bintellectual property\b/i, "ASSET_SALES"],
    [/\baffiliate\b/i, "AFFILIATE_TRANSACTIONS"],
    [/\bguarantee\b|\bguaranty\b|\bguarantees\b|\bkeepwell\b/i, "GUARANTEES"],
    [/\bmergers?\b|\bmerge\b|\bconsolidat\w*\b|\bfundamental\b/i, "MERGERS_FUNDAMENTAL_CHANGES"],
    [/\bfinancial covenants?\b|\bleverage ratio\b|\bcoverage ratio\b/i, "FINANCIAL_MAINTENANCE"],
  ];
  const leadText = excerpt
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:section|§)\s+[0-9a-zA-Z().-]+\.?\s*/i, "")
    .replace(/^\([a-z0-9]{1,3}\)\s*/i, "")
    .slice(0, 260)
    // Strip the cross-reference itself (the pointer phrase and
    // the section ref token) — NOT a fixed tail of following
    // text: the words after the ref are the clause's own
    // operative continuation ("permitted under Section 7.02, to
    // the extent any such Investment is deemed to be a
    // Disposition" — the Disposition is the clause's frame).
    .replace(/\bpermitted\s+(?:by|under|pursuant\s+to)\s+(?:Section|§|Sections)\s*[0-9A-Za-z().-]*/gi, " ");
  const leadSubject = ((): CovenantCategoryKey | null => {
    // Frame guards: leads that name a frame, not a subject.
    // (i) A restrictions frame ("customary restrictions in
    // leases...", "restrictions imposed by...") — the provision
    // IS a restrictive-agreements item; the nouns after it are
    // the objects restrictions attach to, not its covenant.
    if (/^(customary\s+)?restrictions\b/i.test(leadText)) return null;
    // (ii) A compliance-state condition ("the Successor
    // Borrower shall be in Pro Forma Financial Covenant
    // Compliance") — a condition of the host covenant naming
    // another covenant's test as its state.
    if (/\bshall be in\b[^.;]{0,70}\bCompliance\b/i.test(leadText)) return null;
    // (iii) A mandatory-prepayment shape in the lead: the
    // operative verb is "shall prepay" — the provision is a
    // prepayment provision whatever event (a Disposition, an
    // asset sale) triggers it.
    if (isMandatoryPrepaymentShape(excerpt.replace(/\s+/g, " ").slice(0, 500))) {
      return "DEBT_INCURRENCE";
    }
    let best: { idx: number; cat: CovenantCategoryKey } | null = null;
    for (const [re, cat] of LEAD_SUBJECTS) {
      const m = re.exec(leadText);
      if (!m) continue;
      // A subject word inside a regulatory regime's defined
      // name ("Outbound Investment Rule(s)") names the regime,
      // not the provision's covenant.
      if (/^\s+Rules?\b/.test(leadText.slice(m.index + m[0].length, m.index + m[0].length + 8))) {
        continue;
      }
      if (best === null || m.index < best.idx) best = { idx: m.index, cat };
    }
    return best?.cat ?? null;
  })();
  // A pure cross-reference pointer: the item's whole operative
  // content is "X permitted by Section Y" — it grants and
  // restricts nothing itself. The test is strict about what
  // precedes the pointer: only the pointed subject's own noun
  // phrase ("Guarantees", "the making of Restricted Payments",
  // "any Restricted Payment"). A clause with its own object
  // qualified by a pointer ("non-cash consideration RECEIVED
  // IN CONNECTION WITH any Disposition expressly permitted by
  // Section 7.05") is a substantive prong whose permission
  // operates on its own object — not a pointer.
  const isPureCrossReference = ((): boolean => {
    const norm = excerpt.replace(/\s+/g, " ").trim();
    if (norm.length > 220) return false;
    const m = norm.match(/\bpermitted\s+(?:by|under|pursuant\s+to)\s+(?:Section|§)\b/i);
    if (!m) return false;
    const before = norm
      .slice(0, m.index)
      .replace(/^(?:section|§)\s+[0-9a-zA-Z().-]+\.?\s*/i, "")
      .replace(/^\([a-z0-9]{1,3}\)\s*/i, "")
      .trim();
    if (before.length > 45) return false;
    if (/\b(received|arising|incurred|in connection with|entered into|made pursuant)\b/i.test(before)) {
      return false;
    }
    const sans = norm.replace(
      /\b[\w\s]{0,40}?\bpermitted\s+(?:by|under|pursuant\s+to)\s+(?:Section|§)\b[^.;]*/i,
      "",
    );
    if (/\b(shall|will|may|must)\b/i.test(sans)) return false;
    return true;
  })();
  // EoD by position: a clause of the EoD trigger section whose
  // own text carries no trigger phrasing (the chapeau carries
  // the frame — the census's K4a population), and EoD by span
  // containment for fragments whose parentage/refs are broken
  // but which sit inside an EoD-titled article's span with no
  // covenant family of their own and no remedies lead.
  const sectionHeadingD = despaceHeadingText(structuralPos.sectionHeading ?? "");
  const isEodByPosition =
    structuralPos.positionClass === "EOD" &&
    /\bevents of default\b/i.test(sectionHeadingD) &&
    !/\bremedies\b/i.test(sectionHeadingD);
  const isEodByContainment = ((): boolean => {
    if (isEod || isEodByPosition || articleHeading) return false;
    const ca = structuralPos.containedArticle;
    if (!ca) return false;
    if (!/\bevents of default\b/i.test(despaceHeadingText(ca.heading ?? ""))) return false;
    if (hasMappableSubstantiveFamily(params.candidate.families)) return false;
    if (/\bremedies\b/i.test(excerpt.replace(/\s+/g, " ").slice(0, 300))) return false;
    return true;
  })();
  const eodPosition = isEodByPosition || isEodByContainment;

  const promotedFamily = ((): string | null => {
    if (nonCovenantSubtype || affirmativeKind) return null;
    if (isEod || eodPosition || isAdministrativeProvision(heading, excerpt)) return null;
    // Schedule/exhibit indexes stay explicitly unresolved by
    // design (step 1) — no step-4 arbitration over them.
    if (isScheduleIndexText(excerpt)) return null;
    if ((FAMILY_TO_CATEGORY[primary] ?? "OTHER") !== "OTHER") return null;
    // Title-only stems never promote. NOTE the STRICT title
    // test (nothing left after the title), not the wider
    // chapeau test — basket prongs are verb-less noun phrases
    // by drafting convention ("Dispositions of Accounts in
    // connection with the compromise or settlement thereof")
    // and are operative clauses, not titles. The
    // SECTION-with-descendants stem guard below covers the
    // prohibition-chapeau stems.
    if (isTitleOnlyStem(excerpt, heading)) return null;
    // No article context at all: the item's position is
    // unresolved (EoD fragments and residue land here) — never
    // promote on keyword evidence alone. Step 4 admits the
    // containment-validated position article as context (the
    // parentage walk misses items whose refs were misread,
    // but span containment + ref-numeral agreement is itself
    // structural evidence).
    if (!articleHeading && !structuralPos.positionArticle) return null;
    const articleText = despaceHeadingText(
      articleHeading ?? structuralPos.positionArticle?.heading ?? "",
    );
    if (/\bevents of default\b/i.test(articleText)) return null;
    // Stem guard: a SECTION item with structural descendants
    // is a stem — its clauses are separate items and carry the
    // substance. (A leaf section — a single-paragraph financial
    // covenant — still promotes.)
    if (
      candidateNode?.nodeType === "SECTION" &&
      params.structuralNodes.some((n) => n.parentNodeId === candidateNode.nodeId)
    ) {
      return null;
    }
    const mappable = params.candidate.families.slice(1).filter((f) => {
      const cat = FAMILY_TO_CATEGORY[f];
      return cat && cat !== "OTHER" && cat !== "BASKETS_EXCEPTIONS_CONDITIONS";
    });
    if (mappable.length === 0) return null;
    // Arbitration order (step 4 completes step 3's):
    // (1) The section's subject, when the clause's own lead
    //     CORROBORATES it — when the lead names both the
    //     section's covenant and another subject, the section's
    //     frame governs and the other subject is the object the
    //     frame operates on (a deemed-disposition prong of
    //     §Dispositions whose lead says "Investments"; a
    //     ratio-debt prong of §Indebtedness whose lead also
    //     says "junior lien").
    if (sectionCats.length > 0 && !isPureCrossReference) {
      for (const cat of sectionCats) {
        const named = LEAD_SUBJECTS.some(([re, c]) => c === cat && re.test(leadText));
        if (!named) continue;
        const f = mappable.find((f) => FAMILY_TO_CATEGORY[f] === cat);
        if (f) return f;
      }
    }
    // (2) The clause's own operative lead subject, when a
    //     detected family carries it — the clause's own words
    //     outrank its section (a guarantee prong inside an
    //     Investments section IS a guarantee clause). Two
    //     guards: a pure cross-reference pointer is exempt (its
    //     lead names another section's permission); and when
    //     the lead subject CONFLICTS with the section's subject,
    //     the lead wins only if the prong does not SPEAK its
    //     section frame's vocabulary — a prong whose own text
    //     carries the frame's signature terms (an affiliate
    //     exception conditioned on arm's-length terms) is an
    //     instance of the frame taking another form, and stays
    //     with it; a prong whose text never speaks the frame's
    //     language (guarantee obligations inside an Investments
    //     list, with no investment vocabulary anywhere in it)
    //     is an independent basket housed in the list.
    if (leadSubject && !isPureCrossReference) {
      const conflictsSection = sectionCats.length > 0 && !sectionCats.includes(leadSubject);
      const textHead = excerpt.replace(/\s+/g, " ").slice(0, 500);
      const speaksFrame = sectionCats.some(
        (cat) =>
          LEAD_SUBJECTS.some(([re, c]) => c === cat && re.test(textHead)) ||
          // The affiliate frame's signature condition is the
          // arm's-length standard — a prong conditioned on it
          // speaks the frame even without the word "Affiliate".
          (cat === "AFFILIATE_TRANSACTIONS" && /\barms?\W{0,2}length\b/i.test(textHead)),
      );
      const exitPhrase =
        /\bin reliance on\b|\bpermitted\s+(?:by|under|pursuant\s+to)\s+(?:Section|§)/i.test(
          textHead,
        );
      if (!conflictsSection || exitPhrase || !speaksFrame) {
        const f = mappable.find((f) => FAMILY_TO_CATEGORY[f] === leadSubject);
        if (f) return f;
      }
    }
    // (3) Section–family agreement: the enclosing section's own
    //     subject (the agreement's organization) arbitrates
    //     among the detected families. If the section names a
    //     covenant subject, ONLY a detected family of that
    //     subject promotes — a mismatch means the detected
    //     families are incidental mentions or the item's own
    //     family went undetected, and the item stays unresolved
    //     rather than taking a wrong label. (This is also what
    //     picks INVESTMENTS over an incidental ratio-test family
    //     inside §Investments, and ASSET_SALES over INVESTMENTS
    //     inside §Dispositions.)
    if (sectionCats.length > 0) {
      return mappable.find((f) => sectionCats.includes(FAMILY_TO_CATEGORY[f]!)) ?? null;
    }
    // Subject-neutral section: promote only an UNANIMOUS
    // detected category, and only outside the covenant and
    // facility articles — inside them a neutral heading means
    // the item's own covenant type is one the family vocabulary
    // does not cover (restrictive agreements, swap covenants,
    // bespoke restrictions), where a detected family is a
    // mention by construction. Guaranty-article waivers and
    // obligations clauses are the population this path serves.
    const distinctCats = new Set(mappable.map((f) => FAMILY_TO_CATEGORY[f]!));
    if (distinctCats.size !== 1) return null;
    const cls = structuralPos.positionClass;
    if (cls === "NEGATIVE" || cls === "AFFIRMATIVE" || cls === "COVENANTS" || cls === "CREDITS") {
      return null;
    }
    if (
      /\bletters?\b|\bpayments\b|\bbreak funding\b|\bcomput|\binterest\b|\bborrowing/i.test(sectionText)
    ) {
      return null;
    }
    return mappable[0] ?? null;
  })();
  // Section-category inheritance (step 4): a clause with NO
  // mappable family of its own, inside a section whose subject
  // is unique, whose own lead does not name a different
  // operative subject, takes its section's category. Easement
  // and zoning prongs of a Liens covenant, a rabbi-trust prong
  // of an Investments covenant, an ASR prong of a Restricted
  // Payments covenant: the family vocabulary has no word for
  // the prong's noun, but the provision's covenant identity is
  // its section's — that is how the agreement itself organizes
  // it, and how a reader classifies it.
  const inheritedCategory = ((): CovenantCategoryKey | null => {
    if (promotedFamily || nonCovenantSubtype || affirmativeKind) return null;
    if (isEod || eodPosition || isAdministrativeProvision(heading, excerpt)) return null;
    if (isScheduleIndexText(excerpt)) return null;
    if ((FAMILY_TO_CATEGORY[primary] ?? "OTHER") !== "OTHER") return null;
    if (isPureCrossReference) return null;
    const hasMappable = params.candidate.families.some((f) => {
      const c = FAMILY_TO_CATEGORY[f];
      return c && c !== "OTHER" && c !== "BASKETS_EXCEPTIONS_CONDITIONS";
    });
    if (hasMappable) return null;
    const nodeType = candidateNode?.nodeType;
    if (nodeType !== "CLAUSE" && nodeType !== "SUBCLAUSE" && nodeType !== "SUBSECTION") {
      return null;
    }
    if (isTitleOnlyStem(excerpt, heading)) return null;
    const subjects = [...new Set(sectionCats)];
    if (subjects.length !== 1) return null;
    const subject = subjects[0]!;
    if (subject === "EVENTS_OF_DEFAULT" || subject === "BASKETS_EXCEPTIONS_CONDITIONS") {
      return null;
    }
    // Contradiction guard: the clause's own lead names a
    // DIFFERENT operative subject (a distributions-for-taxes
    // clause mis-segmented under a debt section is an RP
    // provision, not a debt provision — it waits for its own
    // vocabulary, it does not inherit).
    if (leadSubject && leadSubject !== subject) return null;
    if (!articleHeading && !structuralPos.positionArticle) return null;
    const articleText = despaceHeadingText(
      articleHeading ?? structuralPos.positionArticle?.heading ?? "",
    );
    if (/\bevents of default\b/i.test(articleText)) return null;
    return subject;
  })();
  // Demotion (step 4): the primary family maps, but stronger
  // structural evidence contradicts it.
  const demotedCategory = ((): CovenantCategoryKey | null => {
    if (nonCovenantSubtype || affirmativeKind || isEod || eodPosition) return null;
    if (isScheduleIndexText(excerpt)) return null;
    const primaryCat = FAMILY_TO_CATEGORY[primary];
    if (!primaryCat || primaryCat === "OTHER" || primaryCat === "BASKETS_EXCEPTIONS_CONDITIONS") {
      return null;
    }
    // NOTE on pure cross-reference pointers ("Guarantees
    // permitted by Section 7.02" inside §Investments; "any
    // Restricted Payment permitted by Section 6.05" inside the
    // affiliate covenant): an earlier version of this rule
    // classified a pointer by its POINTED subject. The census's
    // standard is the opposite — the pointed subject is a
    // cross-reference subject, and the pointer is an exception
    // OF its home covenant ("parent-section context" is the
    // determination). Pointers therefore take their home
    // classification (primary / section arbitration) uniformly;
    // no pointed-subject demotion.
    // Section-subject demotion: the enclosing section's
    // unique subject is a different covenant, that covenant's
    // family IS detected on the item, and the item's own lead
    // does not corroborate the primary family (an incremental
    // facility clause tagged INVESTMENTS by an incidental
    // "Permitted Investments" mention is a debt provision).
    const subjects = [...new Set(sectionCats)];
    if (subjects.length === 1 && subjects[0] !== primaryCat) {
      const present = params.candidate.families.some(
        (f) => FAMILY_TO_CATEGORY[f] === subjects[0],
      );
      if (present && leadSubject !== primaryCat) return subjects[0];
    }
    return null;
  })();
  // Position-unresolved fragment demotion (step 4): an item
  // with NO article context at all (parentage and containment
  // both unresolved) whose text carries no operative modal is
  // an enumeration fragment of something larger — typically a
  // defined term's limb list, mis-segmented. Its family tags
  // are body-keyword hits inside a noun-phrase list; they do
  // not support a determinate covenant category. Demote to
  // OTHER (honest unresolved) rather than keep a label the
  // evidence cannot carry.
  const fragmentDemoted =
    !nonCovenantSubtype &&
    !affirmativeKind &&
    !isEod &&
    !eodPosition &&
    !articleHeading &&
    structuralPos.positionArticle === null &&
    candidateNode?.nodeType !== "SECTION" &&
    candidateNode?.nodeType !== "ARTICLE" &&
    (FAMILY_TO_CATEGORY[primary] ?? "OTHER") !== "OTHER" &&
    !/\b(shall|will|may|must)\b/i.test(excerpt.replace(/\s+/g, " ").slice(0, 500)) &&
    // A present-tense operative act ("the undersigned hereby
    // guarantees...", "hereby confirms...") is operative text,
    // not a noun-phrase limb — joinder and supplement grants
    // speak this way and carry no article parentage.
    !/\bhereby\b/i.test(excerpt.replace(/\s+/g, " ").slice(0, 500));
  const effectivePrimary = promotedFamily ?? primary;
  // Category follows substance, not just the first family tag: an EoD
  // trigger stays EVENTS_OF_DEFAULT even if the classifier also tagged a
  // subject family, and an administrative provision is OTHER.
  const category: CovenantCategoryKey = nonCovenantSubtype
    ? "NON_COVENANT"
    : affirmativeKind
      ? "AFFIRMATIVE"
      : isAdministrativeProvision(heading, excerpt)
        ? "OTHER"
        : isScheduleIndexText(excerpt)
          ? "OTHER"
          : isEod || eodPosition
            ? "EVENTS_OF_DEFAULT"
            : fragmentDemoted
              ? "OTHER"
            : (demotedCategory ??
              inheritedCategory ??
              (FAMILY_TO_CATEGORY[effectivePrimary] ?? "OTHER"));
  const categoryLabel = CATEGORY_LABELS[category];
  // A NON_COVENANT item has no covenant posture: UNRESOLVED is
  // the honest determinate statement (it is not a prohibition,
  // permission, or maintenance test), and it keeps the item out
  // of every routine/auto-accept path.
  const posture =
    category === "NON_COVENANT"
      ? "UNRESOLVED"
      : detectPosture(excerpt, heading, params.candidate.families, params.parentChapeau);
  const { coveredEntities, entityScopeNotes } = extractEntities(excerpt, heading);
  const basketsAndThresholds = extractBaskets(excerpt);
  // A NON_COVENANT item restricts nothing — never surface a
  // restriction string mined from its incidental text.
  const restriction =
    category === "NON_COVENANT"
      ? null
      : extractRestriction(excerpt, heading, posture, categoryLabel);
  const permissions = extractPermissions(excerpt, posture, nonOperative || category === "NON_COVENANT");

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
  if (category === "NON_COVENANT" && nonCovenantSubtype) {
    unresolved.push(
      `Classified non-covenant (${nonCovenantSubtype.toLowerCase()}) from structural position — not an operative covenant; no covenant decision is required for this item.`,
    );
  }
  if (!restriction && posture === "UNRESOLVED" && category !== "NON_COVENANT") {
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
    parentChapeau: params.parentChapeau,
    operativeFullSpan: params.candidate.fullSpanText,
    operativeNodeType: sourceNode?.nodeType,
    articleHeading,
    sectionRef,
    heading,
    category,
    categoryLabel,
    nonCovenantSubtype: nonCovenantSubtype ?? undefined,
    affirmativeKind: affirmativeKind ?? undefined,
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
