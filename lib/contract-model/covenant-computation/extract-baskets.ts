/**
 * Issuer-agnostic basket extractor.
 *
 * Reads Permitted Debt / Liens / Investments / Payments definitions and
 * operative negative-covenant sections. A clause that states more than one
 * closed-form cap is split into limbs so a ratio prong cannot hide a dollar
 * ceiling. Clauses with no numeric cap stay in the list as purpose permissions.
 */

import { hasOperativePermissionEvidence } from "./amount-role";
import {
  applyDefinitionAlias,
  applyFamilyHints,
  applySectionMappings,
  phrasePatternCaptureRules,
} from "@/lib/covenant-learning-factory/learned-rules/apply";
import { compileRuleRegex, type LearnedRuleSet } from "@/lib/covenant-learning-factory/learned-rules/types";
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
const SECTION_HEAD =
  /(?:Section\s+)?(\d{1,2}\.\d{2})\s+(Limitation on [^.]{3,90}|Financial Covenants|Liens|Indebtedness|Restricted Payments|Investments|Disposition of Assets|Dividends and Distributions|Asset Sales|Double Negative Pledge|Negative Pledge|Partnerships;[^.]{0,70}|Fundamental Changes|Self-Dealing|Margin Stock)\s*\.\s+(?=[A-Z(“"])/g;

const RATIO_NAME =
  /(?:Consolidated\s+)?(?:Fixed\s+Charge\s+Coverage|Interest\s+Coverage|(?:Total\s+|Secured\s+|First\s+Lien\s+|Senior\s+)?(?:Net\s+)?Leverage)\s+Ratio/gi;

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
      if (key.length < 24 || seen.has(key)) continue;
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
  return uniqueKeys(dropContainedNumericLimbs(clauses));
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
      // A learned pattern does not inherit PERMISSION from its precedent's label.
      role: hasOperativePermissionEvidence(window) ? "PERMISSION" : "DISCOVERY",
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
      return outer.length > text.length && outer.includes(text);
    });
  });
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

function isCovenantHeading(sectionNumber: string, title: string): boolean {
  const article = Number(sectionNumber.split(".")[0]);
  const name = title.replace(/\s+/g, " ").trim();
  if (/suits|trustee|guarantor liability|duty of/i.test(name)) return false;
  if (article === 4 && /^Limitation on /i.test(name)) return true;
  return /^(?:Liens|Indebtedness|Restricted Payments|Investments|Disposition of Assets|Dividends and Distributions|Asset Sales|Double Negative Pledge|Negative Pledge|Financial Covenants|Fundamental Changes|Self-Dealing|Margin Stock)$/i.test(
    name,
  ) || /^Partnerships\b/i.test(name);
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
  for (const match of text.matchAll(SECTION_HEAD)) {
    if (match.index == null || !match[1] || !match[2]) continue;
    const heading = match[2].replace(/\s+/g, " ").trim();
    if (!isCovenantHeading(match[1], heading)) continue;
    const title = `§${match[1]} ${heading}`;
    starts.push({
      at: match.index,
      title,
      family: resolveFamily(heading, rules),
      sectionNumber: match[1],
      bodyFrom: match.index,
    });
  }

  const definitionEnds = definitionBoundaries(text);
  const sectionEnds = sectionBoundaries(text);
  starts.sort((a, b) => a.at - b.at);
  for (const start of starts) {
    const bounds = start.sectionNumber == null ? definitionEnds : sectionEnds;
    const nextBoundary = bounds.find((at) => at > start.at + 20) ?? text.length;
    let end = nextBoundary;
    const window = text.slice(start.bodyFrom, end);
    const deleted = window.search(/Section\s+\d+\.\d+\s+of the (?:Loan|Credit) Agreement is hereby deleted/i);
    const amendmentItem = window.search(/\s\d{1,2}\.\s+Clause\s+/);
    if (deleted > 80) end = Math.min(end, start.bodyFrom + deleted);
    if (amendmentItem > 80) end = Math.min(end, start.bodyFrom + amendmentItem);
    const body = text.slice(start.bodyFrom, end).trim();
    if (body.length < 40) continue;
    regions.push({ family: start.family || "OTHER", title: start.title, body, sectionNumber: start.sectionNumber });
  }
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

function sectionBoundaries(text: string): number[] {
  const at = new Set<number>();
  for (const match of text.matchAll(SECTION_HEAD)) if (match.index != null) at.add(match.index);
  for (const match of text.matchAll(/(?:^|\.\s+)Section\s+\d{1,2}\.\d{2}\s+[A-Z]/g)) {
    if (match.index == null) continue;
    const lead = match[0].startsWith(".") ? 1 : 0;
    at.add(match.index + lead);
  }
  for (const match of text.matchAll(/\bARTICLE\s+[IVXLC]+\b/g)) if (match.index != null) at.add(match.index);
  return [...at].sort((a, b) => a - b);
}

function familyOf(title: string): string {
  const t = title.toLowerCase();
  if (/lien|negative pledge/.test(t)) return "LIENS";
  if (/investment/.test(t)) return "INVESTMENT";
  if (/restricted payment|dividend|distribution/.test(t)) return "RESTRICTED_PAYMENTS";
  if (/asset sale|disposition/.test(t)) return "ASSET_SALE";
  if (/debt|indebtedness/.test(t)) return "DEBT_INCURRENCE";
  if (/financial covenant/.test(t)) return "FINANCIAL_COVENANT";
  if (/fundamental|partnership|merger|self-dealing|margin/.test(t)) return "OTHER";
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

function splitEnumerated(body: string): Part[] {
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
      (candidate.style === "num" || candidate.style === "letter") &&
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
      const start = group[i]!.pos;
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
  style: "num" | "letter" | "roman";
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
  for (const match of body.matchAll(/\(([0-9]{1,3}|[a-z]{1,6})\)/g)) {
    if (match.index == null || !match[1]) continue;
    const pre = body.slice(Math.max(0, match.index - 60), match.index);
    if (!preOk(pre)) continue;
    const raw = match[1];
    if (/^\d+$/.test(raw)) {
      out.push({ pos: match.index, raw, marker: raw, style: "num", order: Number(raw) });
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

function preOk(pre: string): boolean {
  if (pre.trim() === "") return true;
  // "; 23 " and "; - 9 - " are page markers sitting between the semicolon and the next clause.
  return /(?:^|[;.])\s*(?:-\s*\d{1,3}\s*-\s*)?(?:\d{1,3}\s+)?(?:and\s+)?$/.test(pre) || /[:)]\s*$/.test(pre);
}

function expandLimbs(text: string): string[] {
  // A builder, or a starter dollar that "may be increased" by unbound proceeds, is one basket.
  // Splitting out the starter or one "plus (vi)" limb would publish a partial as the cap.
  if (/\bmay be increased by\b/i.test(text) || isBuilderContainer(text)) return [text.trim()];
  const spans = capSpans(text);
  if (spans.length === 0) return [text.trim()];
  if (spans.length === 1 && !poison(text)) return [text.trim()];
  return spans;
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

function capSpans(text: string): string[] {
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
  return kept.map((span) => text.slice(span.start, span.end).trim());
}

function childRef(parentRef: string, excerpt: string): string {
  const sum = excerpt.match(/sum of \(([a-z])\)/i);
  const lead = excerpt.match(/^\(([a-z0-9]+)\)/);
  const id = sum?.[1] ?? lead?.[1];
  if (!id) return parentRef;
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
