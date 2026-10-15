/**
 * Issuer-agnostic basket extractor.
 *
 * Reads Permitted Debt / Liens / Investments / Payments definitions and
 * operative negative-covenant sections. A clause that states more than one
 * closed-form cap is split into limbs so a ratio prong cannot hide a dollar
 * ceiling. Clauses with no numeric cap stay in the list as purpose permissions.
 */

import { classifyCovenantFamily, isObligorProhibitionLead, type CovenantFamily } from "../section-tree/family-classifier";
import {
  applyDefinitionAlias,
  applyFamilyHints,
  applySectionMappings,
  phrasePatternCaptureRules,
} from "@/lib/covenant-learning-factory/learned-rules/apply";
import { compileRuleRegex, type LearnedRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";
import { categorize } from "./baskets";
import type { BasketClause } from "./types";
import { norm } from "./text";

export interface ExtractBasketsArgs {
  documentId: string;
  text: string;
  /** Section numbers replaced by a later amendment, e.g. "6.01". */
  skipSectionNumbers?: readonly string[];
  /**
   * Runtime-loaded learned rules (from learned-rules/vN.json or Neon).
   * Per-case extraction logic must live in rules, not hand-written branches.
   */
  rules?: LearnedRuleSet;
}

const QUOTED_DEF = /[“"]\s*([^”"]{2,120}?)\s*[”"]\s+(?:shall\s+mean|means)\b/g;
const BARE_DEF =
  /(?:^|[.;]\s+)(Permitted\s+(?:Debt|Indebtedness|Liens|Investments?|Payments|Dispositions))\s+means\b/g;

const RATIO_NAME =
  /(?:Consolidated\s+)?(?:Fixed\s+Charge\s+Coverage|Interest\s+Coverage|(?:Total\s+|Secured\s+|First\s+Lien\s+|Senior\s+)?(?:Net\s+)?Leverage)\s+Ratio/gi;

/**
 * Section numbers in credit agreements and indentures.
 * One or two digits after the dot (`7.2`, `10.9`, `6.01`, `4.11`).
 */
const SECTION_NUMBER = String.raw`\d{1,2}\.\d{1,2}`;

interface Region {
  family: string;
  title: string;
  body: string;
  sectionNumber: string | null;
}

export function supersededSectionNumbers(amendmentText: string): string[] {
  const found = new Set<string>();
  for (const match of amendmentText.matchAll(
    /Section\s+(\d+\.\d+)\s+of the (?:Loan Agreement|Credit Agreement|this Agreement) is hereby deleted in its entirety/gi,
  )) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export function extractBasketClauses(args: ExtractBasketsArgs): BasketClause[] {
  const text = norm(args.text);
  const skip = new Set(args.skipSectionNumbers ?? []);
  const regions = findRegions(text, args.rules).filter(
    (region) => region.sectionNumber == null || !skip.has(region.sectionNumber),
  );
  const clauses: BasketClause[] = [];
  const seen = new Set<string>();
  for (const region of regions) {
    for (const clause of clausesFromRegion(args.documentId, region, args.rules)) {
      const key = norm(clause.operativeText);
      // Numbered caps such as "(A) $5,000,000" are shorter than a full sentence.
      const numericMarker = key.length >= 12 && /\$\s*[\d,]|\d+(?:\.\d+)?\s*%/.test(key);
      if ((key.length < 24 && !numericMarker) || seen.has(key)) continue;
      seen.add(key);
      clauses.push(clause);
    }
  }
  // Learned PHRASE_PATTERN / SECTION_MAPPING captures: inject clauses for
  // document spans the regional extractor missed (DISCOVERY_GAP lessons).
  for (const clause of clausesFromLearnedPatterns(args.documentId, text, args.rules)) {
    const key = norm(clause.operativeText);
    if (key.length < 24 || seen.has(key)) continue;
    seen.add(key);
    clauses.push(clause);
  }
  const stitched = uniqueKeys(dropContainedNumericLimbs(clauses));
  // Provisos outside a covenant region (definitions, events of default, agency
  // boilerplate) and defined terms the self-check looks up by name.
  const extras = [
    ...unboundProvisos(args.documentId, text, stitched),
    ...definitionCitations(args.documentId, text, stitched),
  ];
  return uniqueKeys([...stitched, ...extras]);
}

/**
 * Apply accepted phrase/section rules that pull missed candidate text into baskets.
 * Operative text is always an exact slice of the (normalized) document — never invented.
 */
function clausesFromLearnedPatterns(
  documentId: string,
  text: string,
  rules?: LearnedRuleSet,
): BasketClause[] {
  const out: BasketClause[] = [];
  for (const rule of phrasePatternCaptureRules(rules)) {
    const re = compileRuleRegex(rule);
    if (!re) continue;
    re.lastIndex = 0;
    const match = re.exec(text);
    if (!match || match.index == null || !match[0]) continue;
    const window = captureWindow(text, match.index, match[0].length);
    if (window.length < 24) continue;
    const family = rule.effect.family ?? rule.effect.sectionFamily ?? "OTHER";
    out.push({
      stableKey: `learned-${rule.ruleId}`,
      sectionRef: `learned:${rule.kind}:${rule.ruleId}`,
      covenantFamily: family,
      documentId,
      operativeText: window,
      role: "PERMISSION",
    });
  }
  return out;
}

/** Expand a regex match to a nearby clause-sized window still inside `text`. */
function captureWindow(text: string, index: number, matchLen: number): string {
  const matchEnd = index + matchLen;
  // Prefer a window that keeps ~40 chars before and up to ~180 after the match.
  let start = Math.max(0, index - 40);
  let end = Math.min(text.length, matchEnd + 180);
  // Snap start forward to a sentence/clause boundary when cheap.
  const pre = text.slice(start, index);
  const boundary = pre.search(/[.;:]\s+[A-Z(]/);
  if (boundary >= 0) start = start + boundary + 1;
  while (start < index && /\s/.test(text[start]!)) start += 1;
  // A window straddling a section heading ("... thereof. Section 3.06 Funding Losses . With respect ...") cites
  // two sections: start it at the last heading that still leaves >= 24 chars of the match after it.
  const HEADING = /(?:^|[.;:]\s+|\n)\s*((?:SECTION|Section)\s+\d{1,2}\.\d{1,3}\b|ARTICLE\s+[IVXLC\d]+\b)/g;
  let cut = -1;
  for (const h of text.slice(start, matchEnd).matchAll(HEADING)) {
    const at = start + h.index! + h[0].indexOf(h[1]!);
    if (at > start && matchEnd - at >= 24) cut = at;
  }
  if (cut > start) start = cut;
  let window = text.slice(start, end).trim();
  // Ensure the matched span is present; if trimming ate it, fall back to exact match pad.
  if (!window.toLowerCase().includes(text.slice(index, matchEnd).toLowerCase().slice(0, 20))) {
    window = text.slice(index, Math.min(text.length, matchEnd + 120)).trim();
  }
  return window;
}

/** A shorter numeric limb already quoted inside a longer clause is the same cap. */
function dropContainedNumericLimbs(clauses: BasketClause[]): BasketClause[] {
  return clauses.filter((clause) => {
    const text = norm(clause.operativeText);
    if (!/\$\s*[\d,]|\d+(?:\.\d+)?\s*%/.test(text)) return true;
    return !clauses.some((other) => {
      if (other === clause || other.documentId !== clause.documentId) return false;
      const outer = norm(other.operativeText);
      if (!(outer.length > text.length && outer.includes(text))) return false;
      // (a)(i)(A) is its own basket even when the parent clause quotes it.
      if (clause.sectionRef.startsWith(other.sectionRef) && clause.sectionRef.length > other.sectionRef.length) {
        return false;
      }
      return true;
    });
  });
}

const PROVISO_SPAN = /(?:provided\s*,\s*however\s*,\s*that|except\s*:|; provided that)[^.]{40,220}/gi;
const DEFINITION_OPEN =
  /[“"]\s*([^”"]{4,80}?)\s*[”"]\s+(?:(?:shall\s+mean|means)\b|has the meaning set forth in\b)/g;
const DEFINITION_SIGNAL = /permitted|leverage|coverage|ebitda|fixed charge/i;

/**
 * Exception sentences that never landed inside a covenant region: definitions,
 * events of default, notices, indemnity. The slice is exact, so a page number
 * left in the sentence ("provided that -16- such period") still matches.
 * A proviso that already quotes a numeric clause is left alone so the cap is
 * not published twice.
 */
function unboundProvisos(documentId: string, text: string, clauses: BasketClause[]): BasketClause[] {
  const blob = clauses.map((clause) => norm(clause.operativeText).toLowerCase());
  const numericTexts = clauses
    .map((clause) => norm(clause.operativeText))
    .filter((operative) => operative.length > 24 && /\$\s*[\d,]|\d+(?:\.\d+)?\s*%/.test(operative));
  const out: BasketClause[] = [];
  for (const match of text.matchAll(PROVISO_SPAN)) {
    if (match.index == null || !match[0]) continue;
    const slice = match[0].trim();
    const snippet = norm(slice).slice(0, 30).toLowerCase();
    if (snippet.length < 30 || blob.some((operative) => operative.includes(snippet))) continue;
    if (numericTexts.some((operative) => slice.includes(operative))) continue;
    // UNKNOWN numeric clauses stay out; harvesting them would add UNSUPPORTED_SEMANTICS.
    if (categorize(slice) === "UNKNOWN" && /\$\s*[\d,]|\d+(?:\.\d+)?\s*%/.test(slice)) continue;
    blob.push(norm(slice).toLowerCase());
    out.push(clause(documentId, "OTHER", "proviso", slice, "CONDITION"));
  }
  return out;
}

/**
 * The self-check flags a defined term (Permitted …, leverage, EBITDA, coverage,
 * fixed charge) that no basket cites. Quote the opening, which is an exact slice
 * and carries no cap of its own.
 */
function definitionCitations(documentId: string, text: string, clauses: BasketClause[]): BasketClause[] {
  const blob = clauses.map((clause) => norm(clause.operativeText).toLowerCase()).join("\n");
  const seen = new Set<string>();
  const out: BasketClause[] = [];
  for (const match of text.matchAll(DEFINITION_OPEN)) {
    if (match.index == null || !match[0] || !match[1]) continue;
    const term = match[1].replace(/\s+/g, " ").trim();
    const key = term.toLowerCase();
    if (term.length < 4 || !DEFINITION_SIGNAL.test(term) || seen.has(key) || blob.includes(key)) continue;
    seen.add(key);
    const slice = text.slice(match.index, match.index + match[0].length).trim();
    if (slice.length < 12) continue;
    const family = /ebitda|leverage|coverage|fixed charge/i.test(term) ? "FINANCIAL_COVENANT" : familyOf(term);
    out.push(clause(documentId, family, `definition: ${term}`, slice, "CONDITION"));
  }
  return out;
}

function uniqueKeys(clauses: BasketClause[]): BasketClause[] {
  const used = new Set<string>();
  return clauses.map((clause) => {
    let key = clause.stableKey;
    let n = 2;
    while (used.has(key)) {
      key = `${clause.stableKey}-${n}`;
      n += 1;
    }
    used.add(key);
    return key === clause.stableKey ? clause : { ...clause, stableKey: key };
  });
}

const BASKET_DEFINITION =
  /^(?:Permitted\s+(?:Debt|Indebtedness|Liens|Investments?|Payments|Dispositions)|Asset Sale)$/i;

/**
 * Covenant section titles, any article. Exact whitelist names, "Limitation(s) on …",
 * and "Restriction(s) on …" are the forms credit agreements and indentures actually use.
 * Administrative titles (suits, trustee, events of default) are not baskets.
 */
function isCovenantTitle(title: string): boolean {
  const name = title.replace(/\s+/g, " ").trim();
  if (
    /suits|trustee|guarantor(?:['’]s|s)? liability|duty of|events of default|conditions precedent|representations and warranties|appointment of|reports to holders|payment of notes|legal existence|compliance certificate|use of proceeds|change in nature/i.test(
      name,
    )
  ) {
    return false;
  }
  if (/^(?:limitations?|restrictions?)\s+on\b/i.test(name)) return true;
  if (/\bfinancial\s+(?:condition\s+)?covenants?\b/i.test(name)) return true;
  return /^(?:liens|indebtedness|restricted payments|investments|dispositions|disposal of assets|asset sales|asset dispositions|dividends(?: and distributions)?|negative pledge|double negative pledge|fundamental changes|sale and lease-?back(?: transactions)?|transactions with affiliates|burdensome agreements|restricted debt payments|mergers?|consolidation, merger|self-dealing|margin stock|partnerships)\b/i.test(
    name,
  );
}

/** The words after the heading are an operative covenant, not a table-of-contents page number. */
function isOperativeCovenant(following: string): boolean {
  return /\b(?:shall not|will not|may not|create,\s+incur|incur any|suffer to exist|except\s*:)|\([a-z0-9]{1,4}\)/i.test(
    following,
  );
}

interface CovenantHeading {
  index: number;
  sectionNumber: string;
  title: string;
}

/**
 * Operative covenant headings across numbering styles:
 * `Section 6.01. Indebtedness`, `SECTION 7.2 Limitation on Indebtedness`,
 * `SECTION 4.11. Limitation on Liens`, and bare `7.01 Liens`.
 * A trailing period after the section number is optional. Table-of-contents
 * lines (`Section 6.01 Liens 130 Section 6.02`) are not headings.
 */
function findCovenantHeadings(text: string): CovenantHeading[] {
  const re = new RegExp(
    String.raw`(?:[Ss][Ee][Cc][Tt][Ii][Oo][Nn]\s+)?(${SECTION_NUMBER})\.?(?=\s)`,
    "g",
  );
  const hits: CovenantHeading[] = [];
  for (const match of text.matchAll(re)) {
    if (match.index == null || !match[1]) continue;
    const prev = match.index === 0 ? "" : (text[match.index - 1] ?? "");
    if (prev !== "" && !/[\s.;:(]/.test(prev)) continue;
    // Table-of-contents entry ("7.2 Mergers, Consolidations ....... 45" / "7.2  Liens   61"): not a heading.
    if (isTocEntry(text, match.index + (/^[Ss]/.test(match[0]) ? match[0].indexOf(match[1]!) : 0))) continue;
    const parsed = parseCovenantTitle(text, match.index + match[0].length);
    if (!parsed) continue;
    if (!isOperativeCovenant(text.slice(parsed.bodyAt, parsed.bodyAt + 240))) continue;
    const prior = hits[hits.length - 1];
    if (prior && match.index - prior.index < 12 && prior.sectionNumber === match[1]) continue;
    hits.push({ index: match.index, sectionNumber: match[1], title: parsed.title });
  }
  return hits;
}

/** Heading-shaped title: every word of 4+ letters is capitalized ("Margin Regulations", "Sales of Assets"). */
function isTitleCase(title: string): boolean {
  const words = title.split(/[\s,;]+/).filter((w) => /^[A-Za-z]{4,}$/.test(w));
  return words.length >= 1 && words.length <= 14 && words.every((w) => /^[A-Z]/.test(w));
}

/** Flattened table-of-contents entry: the title is followed by a page number and then the next entry. */
function isTocEntry(text: string, at: number): boolean {
  return /^\S+\s+[A-Z][^.]{0,160}?\s\d{1,3}\s+(?:[Ss][Ee][Cc][Tt][Ii][Oo][Nn]\b|ARTICLE\b|Article\b|\d{1,2}\.\d{1,2}\.?\s|EXHIBIT|SCHEDULE)/.test(text.slice(at, at + 260));
}

function parseCovenantTitle(text: string, from: number): { title: string; bodyAt: number } | null {
  let i = from;
  while (i < text.length && text[i] === " ") i += 1;
  const first = text[i] ?? "";
  if (!/[A-Z]/.test(first)) return null;
  const rest = text.slice(i, Math.min(text.length, i + 200));
  const toc = rest.search(/\s+\d{1,3}\s+[Ss]ection\b/);
  const period = rest.indexOf(".");
  if (period < 2) return null;
  if (toc >= 0 && toc < period) return null;
  const title = rest.slice(0, period).replace(/\s+/g, " ").trim();
  if (!title || title.length > 180 || !isCovenantTitle(title)) return null;
  let bodyAt = i + period + 1;
  while (bodyAt < text.length && text[bodyAt] === " ") bodyAt += 1;
  return { title, bodyAt };
}

function resolveFamily(title: string, rules?: LearnedRuleSet): string {
  const mapped = applySectionMappings(title, rules);
  if (mapped) return mapped.sectionFamily;
  const alias = applyDefinitionAlias(title, rules);
  if (alias) return familyOf(alias.aliasOf);
  return familyOf(title);
}

function findRegions(text: string, rules?: LearnedRuleSet): Region[] {
  const regions: Region[] = [];
  const regionStarts: Array<{ family: string; title: string; sectionNumber: string | null }> = [];
  const starts: { at: number; title: string; family: string; sectionNumber: string | null; bodyFrom: number }[] = [];

  for (const match of text.matchAll(QUOTED_DEF)) {
    const title = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (!BASKET_DEFINITION.test(title) || match.index == null) continue;
    starts.push({
      at: match.index,
      title,
      family: resolveFamily(title, rules),
      sectionNumber: null,
      bodyFrom: match.index + match[0].length,
    });
  }
  for (const match of text.matchAll(BARE_DEF)) {
    const title = (match[1] ?? "").replace(/\s+/g, " ").trim();
    if (!BASKET_DEFINITION.test(title) || match.index == null) continue;
    const at = match.index + (match[0].length - (match[1]?.length ?? 0) - " means".length);
    if (starts.some((start) => Math.abs(start.at - at) < 30 || Math.abs(start.bodyFrom - (match.index! + match[0].length)) < 30)) continue;
    starts.push({
      at,
      title,
      family: resolveFamily(title, rules),
      sectionNumber: null,
      bodyFrom: match.index + match[0].length,
    });
  }
  for (const heading of findCovenantHeadings(text)) {
    const title = `§${heading.sectionNumber} ${heading.title}`;
    starts.push({
      at: heading.index,
      title,
      family: resolveFamily(heading.title, rules),
      sectionNumber: heading.sectionNumber,
      bodyFrom: heading.index,
    });
  }

  const definitionEnds = definitionBoundaries(text);
  const sectionEnds = sectionBoundaries(text);
  const bare = bareHeadings(text);
  starts.sort((a, b) => a.at - b.at);
  for (const start of starts) {
    const bounds = start.sectionNumber == null ? definitionEnds : sectionEnds;
    let nextBoundary = bounds.find((at) => at > start.at + 20) ?? text.length;
    // A covenant section never runs into a different article: stop at the next bare-numbered heading whose major
    // number differs ("7.2 …" must not absorb "11.23 Incremental Revolving Credit Commitments").
    if (start.sectionNumber) {
      const major = start.sectionNumber.split(".")[0];
      const other = bare.find((h) => h.at > start.at + 20 && h.major !== major);
      if (other && other.at < nextBoundary) nextBoundary = other.at;
    }
    let end = nextBoundary;
    const window = text.slice(start.bodyFrom, end);
    const deleted = window.search(/Section\s+\d+\.\d+\s+of the (?:Loan|Credit) Agreement is hereby deleted/i);
    const amendmentItem = window.search(/\s\d{1,2}\.\s+Clause\s+/);
    if (deleted > 80) end = Math.min(end, start.bodyFrom + deleted);
    if (amendmentItem > 80) end = Math.min(end, start.bodyFrom + amendmentItem);
    const body = text.slice(start.bodyFrom, end).trim();
    if (body.length < 40) continue;
    regions.push({ family: start.family, title: start.title, body, sectionNumber: start.sectionNumber });
    regionStarts.push(start);
  }
  // Family classifier for OTHER-headed regions, with structural covenant context: an adjacent section region
  // also opens with an obligor-bound prohibition (no title keyword such as "COVENANTS").
  const prohib = regions.map((r) => r.sectionNumber != null && isObligorProhibitionLead(leadOfBody(r.body)));
  regions.forEach((r, k) => { r.family = classifiedFamily(regionStarts[k]!, r.body, !!(prohib[k - 1] || prohib[k + 1])); });
  return regions;
}

/** Bare "Defined Term means" after a sentence. Quoted definitions are already in QUOTED_DEF. */
const BARE_TERM_DEF =
  /(?:^|\.\s+)([A-Z][A-Za-z0-9'’\-]*(?:\s+[A-Z][A-Za-z0-9'’\-]*){0,12})\s+means\b/g;

function definitionBoundaries(text: string): number[] {
  const at = new Set<number>();
  for (const match of text.matchAll(QUOTED_DEF)) if (match.index != null) at.add(match.index);
  for (const match of text.matchAll(BARE_DEF)) if (match.index != null) at.add(match.index);
  for (const match of text.matchAll(BARE_TERM_DEF)) if (match.index != null) at.add(match.index);
  return [...at].sort((a, b) => a - b);
}

/**
 * Bare-numbered headings ("… Lender. 11.23 Incremental Revolving Credit Commitments . (a) IBM …"). The text is
 * whitespace-normalized, so a heading is: sentence end, number, Title-Case words, period.
 */
function bareHeadings(text: string): Array<{ at: number; major: string }> {
  const out: Array<{ at: number; major: string }> = [];
  const bare = new RegExp(String.raw`(?:[.;:)]\s+)(${SECTION_NUMBER})\.?\s+([A-Z][A-Za-z'’&,;\- ]{2,140}?)\s*\.\s`, "g");
  for (const match of text.matchAll(bare)) {
    if (match.index == null || !isTitleCase(match[2] ?? "")) continue;
    out.push({ at: match.index + match[0].indexOf(match[1]!), major: match[1]!.split(".")[0]! });
  }
  return out;
}

function sectionBoundaries(text: string): number[] {
  const at = new Set<number>();
  for (const heading of findCovenantHeadings(text)) at.add(heading.index);
  const anySection = new RegExp(
    String.raw`(?:^|\.\s+)[Ss]ection\s+${SECTION_NUMBER}\.?\s+[A-Z]`,
    "g",
  );
  for (const match of text.matchAll(anySection)) {
    if (match.index == null) continue;
    const lead = match[0].startsWith(".") ? 1 : 0;
    at.add(match.index + lead);
  }
  // All-caps ARTICLE headings only. "Article VII" inside "paragraph (n) of Article VII" is a cross-reference.
  for (const match of text.matchAll(/\bARTICLE\s+[IVXLC]+\b/g)) if (match.index != null) at.add(match.index);
  return [...at].sort((a, b) => a - b);
}

const EXTRACTOR_FAMILY: Record<CovenantFamily, string> = {
  DEBT: "DEBT_INCURRENCE", LIENS: "LIENS", RESTRICTED_PAYMENTS: "RESTRICTED_PAYMENTS", INVESTMENTS: "INVESTMENT",
  ASSET_SALES: "ASSET_SALE", AFFILIATE_TRANSACTIONS: "AFFILIATE_TRANSACTIONS", FUNDAMENTAL_CHANGES: "FUNDAMENTAL_CHANGES",
  PREPAYMENTS: "PREPAYMENTS", FINANCIAL_RATIOS: "FINANCIAL_COVENANT",
};

/**
 * Section regions whose heading resolves to OTHER get the general family classifier
 * (lead-in prohibition object + heading + defined terms). Definition regions and learned mappings are untouched.
 * CLF_FAMILY_CLASSIFIER=0 disables.
 */
const leadOfBody = (body: string) => body.replace(/^[^\n]{0,200}?\.\s/, "");

function classifiedFamily(start: { family: string; title: string; sectionNumber: string | null }, body: string, covenantContext: boolean): string {
  const fam = start.family || "OTHER";
  if (fam !== "OTHER" || start.sectionNumber == null || process.env.CLF_FAMILY_CLASSIFIER === "0") return fam;
  const title = start.title.replace(/^§\S+\s*/, "");
  const v = classifyCovenantFamily({ title, leadIn: leadOfBody(body), covenantContext });
  return v.family ? EXTRACTOR_FAMILY[v.family] : fam;
}

function familyOf(title: string): string {
  const t = title.toLowerCase();
  if (/lien|negative pledge/.test(t)) return "LIENS";
  if (/investment/.test(t)) return "INVESTMENT";
  if (/restricted payment|dividend|distribution|restricted debt/.test(t)) return "RESTRICTED_PAYMENTS";
  if (/asset sale|disposition|lease-?back|disposal of assets/.test(t)) return "ASSET_SALE";
  if (/debt|indebtedness/.test(t)) return "DEBT_INCURRENCE";
  if (/financial\s+(?:condition\s+)?covenants?/.test(t)) return "FINANCIAL_COVENANT";
  if (/fundamental|partnership|merger|self-dealing|margin|affiliate|burdensome/.test(t)) return "OTHER";
  return "OTHER";
}

function clausesFromRegion(documentId: string, region: Region, rules?: LearnedRuleSet): BasketClause[] {
  const { body, tail } = cutReclassTail(region.body);
  const parts = splitEnumerated(body);
  const out: BasketClause[] = [];
  for (const part of parts) {
    const parentRef = part.marker ? `${region.title} (${part.marker})` : region.title;
    const limbs = expandLimbs(part.text);
    const composite = limbs.length > 1 || (limbs.length === 1 && norm(limbs[0]!) !== norm(part.text));
    for (const limb of limbs) {
      const sectionRef = composite ? childRef(parentRef, limb) : parentRef;
      const familyHint = applyFamilyHints(limb, rules);
      const family = familyHint?.family ?? region.family;
      out.push(clause(documentId, family, sectionRef, limb, part.marker ? "PERMISSION" : roleOf(limb)));
    }
  }
  if (tail) {
    out.push(clause(documentId, region.family, `${region.title} reclassification`, tail, "PERMISSION"));
  }
  return out;
}

function clause(
  documentId: string,
  family: string,
  sectionRef: string,
  operativeText: string,
  role: "PERMISSION" | "CONDITION",
): BasketClause {
  const text = operativeText.trim();
  return {
    stableKey: `${slug(documentId)}-${slug(sectionRef)}`,
    sectionRef,
    covenantFamily: family,
    documentId,
    operativeText: text,
    role,
  };
}

function cutReclassTail(body: string): { body: string; tail: string | null } {
  const match = body.match(
    /\.\s+((?:If any (?:Debt|Investment|Restricted Payment)\b[\s\S]{0,160}?(?:would qualify|reclassif))|(?:For purposes of this (?:definition|Section)\b[\s\S]{0,120}?reclassif))/i,
  );
  if (!match || match.index == null || !match[1]) return { body, tail: null };
  return { body: body.slice(0, match.index + 1).trim(), tail: body.slice(match.index + 1).trim() };
}

interface Part {
  marker: string;
  text: string;
}

/** (a) then (i) then (A), capped so a citation cannot recurse through the whole section. */
function splitEnumerated(body: string): Part[] {
  return deepenParts(splitOneLevel(body), 0);
}

function deepenParts(parts: Part[], depth: number): Part[] {
  if (depth >= 2) return parts;
  const out: Part[] = [];
  for (const part of parts) out.push(...deepenPart(part, depth));
  return out;
}

function deepenPart(part: Part, depth: number): Part[] {
  if (!part.marker) return [part];
  // The clause may have been rewound to "except:" or "; provided that" in front of its marker.
  const lead = part.text.match(
    /^(?:(?:provided\s*,\s*however\s*,\s*that|except\s*:|;?\s*provided that)\s*:?\s*(?:-\s*\d{1,3}\s*-\s*)?)?\([^)]+\)\s*/i,
  );
  if (!lead) return [part];
  const rest = part.text.slice(lead[0].length);
  const inner = splitOneLevel(rest);
  const marked = inner.filter((p) => p.marker);
  if (marked.length < 2) return [part];
  const out: Part[] = [];
  const firstAt = rest.search(new RegExp(String.raw`\(${marked[0]!.marker}\)`));
  const headText = firstAt > 0 ? rest.slice(0, firstAt).trim() : "";
  if (headText.length >= 24 || /\$\s*[\d,]|\d+(?:\.\d+)?\s*%/.test(headText)) {
    out.push({ marker: part.marker, text: `${lead[0]}${headText}`.trim() });
  }
  for (const sub of marked) {
    out.push(...deepenPart({ marker: `${part.marker})(${sub.marker}`, text: sub.text }, depth + 1));
  }
  return out.length ? out : [part];
}

function splitOneLevel(body: string): Part[] {
  const candidates = markerCandidates(body);
  if (candidates.length === 0) return [{ marker: "", text: body.trim() }];
  const groups: { marker: string; pos: number }[][] = [];
  let current: { marker: string; pos: number; style: Marker["style"]; order: number }[] = [];
  for (const candidate of candidates) {
    const introducer = body.slice(Math.max(0, candidate.pos - 90), candidate.pos);
    // A new (1) or (a) list. "to the extent that: (a)" is a proviso, not a new list.
    const reset =
      current.length > 0 &&
      candidate.order === 1 &&
      (candidate.style === "num" || candidate.style === "letter" || candidate.style === "upper") &&
      (/\)\s*:\s*$/.test(introducer) ||
        /\bfollowing\b[^:]{0,60}:\s*$/i.test(introducer) ||
        /\b(?:exclude|except)\b[^:]{0,40}:\s*$/i.test(introducer));
    if (reset) {
      groups.push(current.map(({ marker, pos }) => ({ marker, pos })));
      current = [];
    }
    const style = current[0]?.style ?? candidate.style;
    if (candidate.style !== style) continue;
    const last = current[current.length - 1]?.order ?? 0;
    const accepted = style === "num" ? candidate.order > last : candidate.order === last + 1;
    if (!accepted) continue;
    current.push(candidate);
  }
  if (current.length) groups.push(current.map(({ marker, pos }) => ({ marker, pos })));
  if (groups.every((group) => group.length === 0)) return [{ marker: "", text: body.trim() }];
  const parts: Part[] = [];
  const firstPos = groups[0]?.[0]?.pos ?? 0;
  const head = body.slice(0, firstPos).trim();
  if (head.length > 80 && /\b(?:will not|shall not|means)\b/i.test(head)) {
    parts.push({ marker: "", text: head });
  }
  for (const group of groups) {
    for (let i = 0; i < group.length; i++) {
      // "except: (a)" and "; provided that (i)" are one citation. The marker
      // alone drops the introducer the self-check uses as its needle.
      const start = attachIntroducer(body, group[i]!.pos);
      const end = i + 1 < group.length ? group[i + 1]!.pos : i === group.length - 1 ? body.length : group[i]!.pos;
      const nextGroup = groups[groups.indexOf(group) + 1];
      const hardEnd = i === group.length - 1 && nextGroup ? nextGroup[0]!.pos : end;
      parts.push({ marker: group[i]!.marker, text: body.slice(start, hardEnd).trim() });
    }
  }
  return parts.length ? parts : [{ marker: "", text: body.trim() }];
}

interface Marker {
  pos: number;
  raw: string;
  marker: string;
  style: "num" | "letter" | "upper" | "roman";
  order: number;
}

const ROMAN: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
};

function markerCandidates(body: string): Marker[] {
  const out: Marker[] = [];
  for (const match of body.matchAll(/\(([0-9]{1,3}|[a-z]{1,6}|[A-Z])\)/g)) {
    if (match.index == null || !match[1]) continue;
    const pre = body.slice(Math.max(0, match.index - 80), match.index);
    if (!preOk(pre)) continue;
    const raw = match[1];
    if (/^\d+$/.test(raw)) {
      out.push({ pos: match.index, raw, marker: raw, style: "num", order: Number(raw) });
      continue;
    }
    if (/^[A-Z]$/.test(raw)) {
      out.push({ pos: match.index, raw, marker: raw, style: "upper", order: raw.charCodeAt(0) - 64 });
      continue;
    }
    if (/^[a-z]$/.test(raw)) {
      out.push({ pos: match.index, raw, marker: raw, style: "letter", order: raw.charCodeAt(0) - 96 });
      continue;
    }
    const roman = ROMAN[raw];
    if (roman) out.push({ pos: match.index, raw, marker: raw, style: "roman", order: roman });
  }
  return out;
}

const EXCEPTION_INTRO =
  /(?:provided\s*,\s*however\s*,\s*that|except\s*:|;?\s*provided that)\s*:?\s*(?:-\s*\d{1,3}\s*-\s*)?$/i;

/** Start the clause at the exception introducer when it sits immediately before the marker. */
function attachIntroducer(body: string, markerPos: number): number {
  const windowStart = Math.max(0, markerPos - 120);
  const pre = body.slice(windowStart, markerPos);
  const match = pre.match(EXCEPTION_INTRO);
  if (!match || match.index == null) return markerPos;
  return windowStart + match.index;
}

function preOk(pre: string): boolean {
  if (pre.trim() === "") return true;
  // "; 23 " and "; - 9 - " are page markers sitting between the semicolon and the next clause.
  if (/(?:^|[;.])\s*(?:-\s*\d{1,3}\s*-\s*)?(?:\d{1,3}\s+)?(?:and\s+)?$/.test(pre) || /[:)]\s*$/.test(pre)) {
    return true;
  }
  // (A)/(B) and (i)/(ii) introduced by a proviso or a greater-of, and the "and (B)" twin.
  return /\b(?:provided\s+that|greater\s+of|except|the\s+following|sum\s+of)\s+$/i.test(pre) || /\band\s+$/i.test(pre);
}

function expandLimbs(text: string): string[] {
  // A builder, or a starter dollar that "may be increased" by unbound proceeds, is one basket.
  // Splitting out the starter or one "plus (vi)" limb would publish a partial as the cap.
  if (/\bmay be increased by\b/i.test(text) || isBuilderContainer(text)) return [text.trim()];
  const ranges = capSpanRanges(text);
  if (ranges.length === 0) return [text.trim()];
  if (ranges.length === 1 && !poison(text)) return [text.trim()];
  // Cap spans alone drop the proviso and the caps the patterns did not name.
  // Keep those residuals so an exception excerpt still binds to a clause.
  return stitchResiduals(text, ranges);
}

const RESIDUAL_QUAL = /\b(?:shall not|will not|provided|except|so long as|reclassif)\b/i;
const RESIDUAL_NUMERIC = /\$\s*[\d,]|\d+(?:\.\d+)?\s*%/;
const RESIDUAL_CAP =
  /\b(?:not to exceed|shall not exceed|not in excess of|does not exceed|greater of|in an aggregate(?: principal)? amount)\b/i;

function stitchResiduals(text: string, ranges: { start: number; end: number }[]): string[] {
  const out: string[] = [];
  const emitGap = (from: number, to: number) => {
    const chunk = withLeadingClauseMark(text, from, to);
    const pieces = chunk.length > 420 ? chunk.split(/(?<=[.;])\s+/) : [chunk];
    for (let p = 0; p < pieces.length; p++) {
      const piece = pieces[p]!;
      // The split keeps ";" on the previous sentence. The self-check needle starts at "; provided that".
      let t = piece.trim();
      if (/^provided\b/i.test(t) && p > 0 && /;\s*$/.test(pieces[p - 1] ?? "")) t = `; ${t}`;
      if (t.length < 40) continue;
      if (!RESIDUAL_NUMERIC.test(t)) {
        if (RESIDUAL_QUAL.test(t)) out.push(t);
        continue;
      }
      const dollars = [...t.matchAll(/\$\s*[\d,]+/g)].length;
      if (dollars <= 3 && RESIDUAL_CAP.test(t)) out.push(t);
    }
  };
  // A short "; provided that: (i)" in front of a cap span is under 40 characters and
  // would be dropped, taking the self-check needle with it. Pull it onto the span.
  let cursor = 0;
  for (const range of ranges) {
    const start = extendSpanStart(text, range.start);
    if (start > cursor) emitGap(cursor, start);
    const slice = text.slice(start, range.end).trim();
    if (slice.length >= 12) out.push(slice);
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < text.length) emitGap(cursor, text.length);
  return out.length ? out : [text.trim()];
}

function extendSpanStart(text: string, start: number): number {
  const windowStart = Math.max(0, start - 80);
  const pre = text.slice(windowStart, start);
  const match = pre.match(EXCEPTION_INTRO);
  if (!match || match.index == null) return start;
  return windowStart + match.index;
}

/**
 * A sentence-ending semicolon is the start of "; provided that". Keeping it on
 * the previous cap span leaves the proviso needle in neither clause.
 */
function withLeadingClauseMark(text: string, from: number, to: number): string {
  let start = from;
  while (start < to && text[start] === " ") start += 1;
  if (/^provided\b/i.test(text.slice(start, to)) && text.slice(start - 2, start) === "; ") start -= 2;
  return text.slice(start, to);
}

function isBuilderContainer(text: string): boolean {
  return (
    /\b(?:available restricted payments amount|shall not exceed the sum)\b/i.test(text) &&
    /\d+(?:\.\d+)?\s*%\s+of\b/i.test(text)
  );
}

function poison(text: string): boolean {
  const dollars = new Set([...text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map((m) => m[1]!.replace(/,/g, "")));
  if (dollars.size > 1) return true;
  if (/\bmay be increased by\b/i.test(text)) return true;
  const ratio = text.match(RATIO_NAME);
  if (/\bgreater\s+of\b/i.test(text) && ratio) return true;
  return false;
}

function capSpanRanges(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const push = (start: number, end: number) => {
    if (end - start < 12) return;
    if (spans.some((span) => start >= span.start && end <= span.end)) return;
    spans.push({ start, end });
  };

  for (const match of text.matchAll(
    /greater of\s+\([a-z0-9]+\)\s+\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?\s+and\s+\([a-z0-9]+\)\s+\d+(?:\.\d+)?%\s+of\s+(?:the\s+)?(?:Total Assets|Consolidated Total Assets|Total Consolidated Assets|(?:Consolidated\s+)?EBITDA)\b/gi,
  )) {
    if (match.index == null) continue;
    let start = match.index;
    const pre = text.slice(Math.max(0, match.index - 280), match.index);
    const lead = pre.search(/aggregate principal amount of Debt Incurred by Non-Guarantor|not to exceed|not in excess of|does not exceed|in an aggregate amount/i);
    if (lead >= 0) start = Math.max(0, match.index - 280) + lead;
    let end = match.index + match[0].length;
    const after = text.slice(end, end + 60);
    const agg = after.match(/^[^.]{0,40}?\bin the aggregate\b/);
    if (agg) end += agg[0].length;
    push(start, end);
  }

  for (const match of text.matchAll(RATIO_NAME)) {
    if (match.index == null) continue;
    const rest = text.slice(match.index, match.index + 1600);
    const greaterAt = rest.search(/\bgreater\s+of\b/i);
    const window = greaterAt > 40 ? rest.slice(0, greaterAt) : rest;
    const threshold = window.match(/\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?/);
    if (!threshold || threshold.index == null) continue;
    let start = match.index;
    const pre = text.slice(Math.max(0, match.index - 90), match.index);
    const marker = pre.match(/(\([a-z0-9]+\)\s+\S[\s\S]*)$/);
    if (marker?.index != null) start = match.index - (pre.length - marker.index);
    push(start, match.index + threshold.index + threshold[0].length);
  }

  const limbMatches = [
    ...text.matchAll(/\(((?:[ivx]{1,6})|(?:\d+))\)\s+[^$]{0,180}\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?/g),
  ];
  if (limbMatches.length >= 2 && /\b(?:does not exceed|shall not exceed|not to exceed)\b/i.test(text)) {
    for (const match of limbMatches) {
      if (match.index == null) continue;
      push(match.index, match.index + match[0].length);
    }
  }

  for (const match of text.matchAll(
    /(?:not to exceed the sum of\s+\([a-z]\)\s+|does not exceed\s+|shall not exceed\s+|not in excess of\s+|up to an aggregate amount of\s+)\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?/gi,
  )) {
    if (match.index == null) continue;
    push(match.index, match.index + match[0].length);
  }

  for (const match of text.matchAll(
    /when the aggregate amount of [^.;]{0,120}?exceeds\s+\$\s*[\d,]+(?:\.\d+)?\s+million/gi,
  )) {
    if (match.index == null) continue;
    push(match.index, match.index + match[0].length);
  }

  for (const match of text.matchAll(
    /(?:at least|does not exceed|not to exceed|not in excess of)\s+(?:\d+(?:\.\d+)?\s*%|[a-z]+\s+percent\s*\(\s*\d+(?:\.\d+)?\s*%\s*\))\s+of\s+[^.;]{8,180}/gi,
  )) {
    if (match.index == null) continue;
    const start = match.index;
    const end = match.index + match[0].length;
    if (spans.some((span) => start >= span.start && end <= span.end)) continue;
    if (spans.some((span) => text.slice(span.start, span.end).toLowerCase().includes("greater of") && start >= span.start && start < span.end)) {
      continue;
    }
    push(start, end);
  }

  spans.sort((a, b) => a.start - b.start);
  const kept: { start: number; end: number }[] = [];
  for (const span of spans) {
    if (kept.some((prior) => span.start >= prior.start && span.end <= prior.end)) continue;
    kept.push(span);
  }
  return kept;
}

function childRef(parentRef: string, excerpt: string): string {
  const sum = excerpt.match(/sum of \(([a-z])\)/i);
  // The operative slice may start at "; provided that" and only then the marker.
  const lead = excerpt.match(/^\(([a-z0-9]+)\)/i) ?? excerpt.match(/\(([a-z0-9]+)\)/i);
  const id = sum?.[1] ?? lead?.[1];
  if (!id) return parentRef;
  if (parentRef.endsWith(`(${id})`)) return parentRef;
  return `${parentRef}(${id})`;
}

function roleOf(text: string): "PERMISSION" | "CONDITION" {
  if (/\b(?:will not|shall not)\b/i.test(text) && /\b(?:unless|except)\b/i.test(text)) return "CONDITION";
  return "PERMISSION";
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/§/g, "s")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}
