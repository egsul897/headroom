/**
 * Inventory of covenant sections, plus any numeric term the basket splitter
 * did not already quote.
 *
 * A section inside a covenant article is always returned. Superseded sections
 * stay in the list so a later amendment cannot hide the fact that the earlier
 * text was replaced.
 */

import type { BasketClause, CovenantSection } from "./types";
import { norm, percentOfPhrase } from "./text";

export interface ReadSectionsArgs {
  documentId: string;
  text: string;
  skipSectionNumbers?: readonly string[];
  /** Clause letters deleted by a later amendment, e.g. 7.01(h). */
  skipClauses?: readonly { sectionNumber: string; marker: string }[];
}

const COVENANT_ARTICLE = /\b(?:COVENANTS|SUCCESSORS|EVENTS\s+OF\s+DEFAULT|DEFAULTS?)\b/i;
const EXTRA_TITLE =
  /^(?:Mandatory\s+Prepayments?|Excess\s+Cash\s+Flow|Change\s+of\s+Control|Sale\s+and\s+Leaseback|Transactions\s+with\s+Affiliates)\b/i;
const DEFINITION =
  /[“"]\s*(Change of Control|Sale and Leaseback Transaction)\s*[”"]\s+(?:shall\s+mean|means)\b/g;

export function supersededClauseMarkers(amendmentText: string): { sectionNumber: string; marker: string }[] {
  const found: { sectionNumber: string; marker: string }[] = [];
  for (const match of amendmentText.matchAll(
    /Clause\s+\(([a-z0-9]+)\)\s+of\s+Section\s+(\d+\.\d+)\s+of the (?:Loan|Credit) Agreement is hereby deleted/gi,
  )) {
    if (match[1] && match[2]) found.push({ sectionNumber: match[2], marker: match[1] });
  }
  return found;
}

export function listCovenantSections(args: ReadSectionsArgs): CovenantSection[] {
  const text = norm(args.text);
  const skip = new Set(args.skipSectionNumbers ?? []);
  const sections = [
    ...articleSections(text, args.documentId),
    ...insertedSections(text, args.documentId),
    ...namedDefinitions(text, args.documentId),
  ];
  const out: CovenantSection[] = [];
  for (const section of sections) {
    const key = `${section.sectionNumber}|${section.title}`;
    const prior = out.findIndex((row) => `${row.sectionNumber}|${row.title}` === key);
    if (prior >= 0) {
      if (section.body.length > (out[prior]?.body.length ?? 0)) out[prior] = section;
      continue;
    }
    const superseded = skip.has(section.sectionNumber);
    out.push({
      ...section,
      superseded,
      body: superseded ? "" : section.body,
      note: superseded ? "Replaced in full by a later amendment. The replacement is a separate row." : section.note,
    });
  }
  return out;
}

/** Numeric terms in `section` whose core text is not already inside an extracted clause. */
export function uncoveredNumericClauses(section: CovenantSection, covered: readonly string[]): BasketClause[] {
  if (section.superseded || section.body.length < 40) return [];
  const body = exciseClauses(section.body, section.sectionNumber, section.note);
  const clauses: BasketClause[] = [];
  const seen = new Set<string>();
  for (const span of numericSpans(body)) {
    const text = span.trim();
    if (text.length < 8 || seen.has(text)) continue;
    const core = numericCore(text);
    if (!core) continue;
    if (covered.some((prior) => section.body.includes(prior) && (prior.includes(norm(core)) || prior.includes(text)))) continue;
    seen.add(text);
    const family = familyOf(`${section.article} ${section.title}`);
    clauses.push({
      stableKey: `${slug(section.documentId)}-${slug(section.sectionNumber)}-${slug(section.title)}-${slug(core).slice(0, 24)}`,
      sectionRef: `§${section.sectionNumber} ${section.title}`.replace(/\s+/g, " ").trim(),
      covenantFamily: family,
      documentId: section.documentId,
      operativeText: text,
      role: "CONDITION",
    });
  }
  return clauses;
}

function articleSections(text: string, documentId: string): CovenantSection[] {
  const articles = bodyArticles(text);
  const out: CovenantSection[] = [];
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i]!;
    if (!article.covenant) continue;
    const end = articleEnd(text, article.bodyFrom, articles[i + 1]?.at ?? text.length);
    const body = text.slice(article.bodyFrom, end);
    if (isContentsArticle(body)) continue;
    const heads = headings(body);
    if (heads.length === 0) {
      if (looksLikeContents(body)) continue;
      out.push(section(documentId, article.number, article.title, body, article.title));
      continue;
    }
    for (let h = 0; h < heads.length; h++) {
      const head = heads[h]!;
      const next = heads[h + 1]?.at ?? body.length;
      const slice = body.slice(head.at, next).trim();
      out.push(section(documentId, head.number, head.title, slice, article.title));
    }
  }
  for (const head of headings(text)) {
    if (!EXTRA_TITLE.test(head.title)) continue;
    if (out.some((row) => row.sectionNumber === head.number)) continue;
    const nextHeading = headings(text).find((other) => other.at > head.at);
    const nextArticle = bodyArticles(text).find((article) => article.at > head.at);
    const end = Math.min(nextHeading?.at ?? text.length, nextArticle?.at ?? text.length);
    out.push(section(documentId, head.number, head.title, text.slice(head.at, end).trim(), "outside covenant articles"));
  }
  return out.filter((section, _, all) => {
    if (section.sectionNumber.includes(".")) return true;
    return !all.some((other) => other.article === section.article && other.sectionNumber.includes("."));
  });
}

function insertedSections(text: string, documentId: string): CovenantSection[] {
  const out: CovenantSection[] = [];
  const full = /Section\s+(\d+\.\d+)\s+of the (?:Loan|Credit) Agreement is hereby deleted in its entirety[\s\S]{0,500}?inserted the following:\s*(\d+\.\d+)\s+([^.]{3,160}?)\.\s*/gi;
  for (const match of text.matchAll(full)) {
    if (match.index == null || !match[2] || !match[3]) continue;
    const heading = `${match[2]} ${match[3]}`;
    const insertedAt = text.indexOf(heading, match.index);
    const start = insertedAt >= 0 ? insertedAt : match.index + match[0].length;
    const end = amendmentCut(text, start + heading.length);
    out.push(section(documentId, match[2], match[3].replace(/\s+/g, " ").trim(), text.slice(start, end).trim(), "amendment insertion"));
  }
  const replacedClause =
    /Clause\s+\(([a-z0-9]+)\)\s+of\s+Section\s+(\d+\.\d+)[\s\S]{0,500}?inserted the following:\s*(\([a-z0-9]+\))/gi;
  const addedClause =
    /Section\s+(\d+\.\d+)[\s\S]{0,200}?insert as a new clause\s+\(([a-z0-9]+)\)[\s\S]{0,400}?:\s*(\([a-z0-9]+\))/gi;
  for (const match of [...text.matchAll(replacedClause), ...text.matchAll(addedClause)]) {
    if (match.index == null) continue;
    const sectionNumber = match[2] && match[1] && /^\d/.test(match[2]) ? match[2] : match[1] ?? "";
    const marker = (match[3] ?? match[2] ?? "").replace(/[()]/g, "");
    const markerText = match[3] ?? "";
    if (!/^[567]\./.test(sectionNumber) || !marker || !markerText.startsWith("(")) continue;
    const start = text.indexOf(markerText, match.index);
    if (start < 0) continue;
    const end = amendmentCut(text, start + markerText.length);
    out.push(
      section(documentId, `${sectionNumber}(${marker})`, `clause (${marker}) inserted`, text.slice(start, end).trim(), "amendment insertion"),
    );
  }
  const added =
    /inserting therein as new Sections?\s+[^:]{0,80}?\s+the following:\s*(\d+\.\d+)\s+([^.]{3,80}?)\.\s*/gi;
  for (const match of text.matchAll(added)) {
    if (match.index == null || !match[1] || !match[2]) continue;
    const heading = `${match[1]} ${match[2]}`;
    const start = text.indexOf(heading, match.index);
    if (start < 0) continue;
    const end = amendmentCut(text, start + heading.length);
    const block = text.slice(start, end);
    out.push(section(documentId, match[1], match[2].replace(/\s+/g, " ").trim(), block.trim(), "amendment insertion"));
    for (const next of block.matchAll(/(?:^|\.\s+)(\d+\.\d+)\s+([A-Z][^.]{3,80}?)\.\s+/g)) {
      if (!next[1] || !next[2] || next[1] === match[1] || next.index == null) continue;
      const at = start + next.index + (next[0].startsWith(".") ? 1 : 0);
      const nextEnd = amendmentCut(text, at + next[0].length);
      out.push(section(documentId, next[1], next[2].replace(/\s+/g, " ").trim(), text.slice(at, nextEnd).trim(), "amendment insertion"));
    }
  }
  return out;
}

function namedDefinitions(text: string, documentId: string): CovenantSection[] {
  const out: CovenantSection[] = [];
  const ends = [...text.matchAll(/[“"]\s*[^”"]{2,80}?\s*[”"]\s+(?:shall\s+mean|means)\b/g)].map((match) => match.index ?? 0);
  for (const match of text.matchAll(DEFINITION)) {
    if (match.index == null || !match[1]) continue;
    const start = match.index;
    const end = ends.find((at) => at > start + 10) ?? Math.min(text.length, start + 4000);
    out.push(section(documentId, "definition", match[1], text.slice(start, end).trim(), "definition"));
  }
  return out;
}

function section(documentId: string, sectionNumber: string, title: string, body: string, article: string): CovenantSection {
  return { documentId, sectionNumber, title: title.replace(/\s+/g, " ").trim(), article, body, superseded: false, note: "" };
}

interface ArticleHit {
  at: number;
  number: string;
  title: string;
  bodyFrom: number;
  covenant: boolean;
}

const ARTICLE_WORD = String.raw`\d+|[IVXLC]+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE`;

function articleEnd(text: string, from: number, nextArticle: number): number {
  const rest = text.slice(from, nextArticle);
  const re = /\bSECTION\s+\d{1,2}\s+[A-Z]{4,}/g;
  for (const match of rest.matchAll(re)) {
    if (match.index != null && match.index > 40) return from + match.index;
  }
  return nextArticle;
}

function looksLikeContents(body: string): boolean {
  const head = body.slice(0, 800);
  if (/Section\s+\d+\.\d+\s+[A-Z][^.]{0,80}\s+\d{1,3}\s+Section/.test(head)) return true;
  const pageLines = head.match(/\b\d{1,2}\.\d{1,2}\s+[A-Z][^.]{0,80}\.\s+\d{1,3}\b/g) ?? [];
  return pageLines.length >= 3;
}

function isContentsArticle(body: string): boolean {
  return looksLikeContents(body);
}

/** Title words after ARTICLE N, stopped before the first section heading or the next sentence. */
function articleTitle(rawWindow: string): string | null {
  let window = rawWindow.replace(/^\s*\.\s*/, "").replace(/^\s+/, "").slice(0, 240);
  if (/\.{4,}/.test(window) || !/^[A-Z]/.test(window)) return null;
  let title = window.split(/\s+(?:Section|SECTION)\s+\d|\s+\d{1,2}\.\d{1,2}\b/)[0] ?? window;
  title = title.split(/\.\s+/)[0] ?? title;
  const sentence = title.match(/^(.*?)\s+(?=(?:If|Until|So long as|Upon|Subject|Notwithstanding|Any|No|The|Each|From)\b)/);
  if (sentence?.[1] && sentence[1].trim().length >= 3) title = sentence[1];
  const cleaned = title.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "").replace(/\s+\d{1,3}$/, "");
  if (!cleaned || /^(?:of|or|to|and|for|in|under|notwithstanding|section)\b/i.test(cleaned)) return null;
  if (/\s\d{1,3}\s+ARTICLE\b/i.test(cleaned) || /\s\d{2,3}$/.test(cleaned)) return null;
  return cleaned.slice(0, 80);
}

function bodyArticles(text: string): ArticleHit[] {
  const out: ArticleHit[] = [];
  const push = (index: number, rawWindow: string, articleNumber: string) => {
    const title = articleTitle(rawWindow);
    if (!title) return;
    const covenant = title.length <= 60 && (COVENANT_ARTICLE.test(title) || /AFFIRMATIVE|NEGATIVE/i.test(title));
    out.push({
      at: index,
      number: articleNumber,
      title,
      // Keep the article heading in the slice so the first "Section N.NN" is visible to the scanner.
      bodyFrom: index,
      covenant,
    });
  };
  for (const match of text.matchAll(new RegExp(String.raw`\bARTICLE\s+(${ARTICLE_WORD})\b`, "gi"))) {
    if (match.index == null || !match[1]) continue;
    push(match.index, text.slice(match.index + match[0].length, match.index + match[0].length + 240), match[1]);
  }
  for (const match of text.matchAll(
    /\bSECTION\s+(\d{1,2})\s+((?:AFFIRMATIVE|NEGATIVE|FINANCIAL)\s+COVENANTS|EVENTS\s+OF\s+DEFAULT(?:\s+AND\s+REMEDIES)?|DEFAULTS?)\b/gi,
  )) {
    if (match.index == null || !match[1] || !match[2]) continue;
    if (/\.{4,}/.test(text.slice(match.index, match.index + match[0].length + 40))) continue;
    out.push({
      at: match.index,
      number: match[1],
      title: match[2].replace(/\s+/g, " ").trim(),
      bodyFrom: match.index,
      covenant: true,
    });
  }
  if (!out.some((row) => row.covenant)) {
    for (const match of text.matchAll(/(?:^|[.]\s+)((?:AFFIRMATIVE|NEGATIVE)\s+COVENANTS|FINANCIAL\s+COVENANTS)\b/gi)) {
      if (match.index == null || !match[1]) continue;
      out.push({
        at: match.index,
        number: "covenants",
        title: match[1].replace(/\s+/g, " ").trim(),
        bodyFrom: match.index,
        covenant: true,
      });
      break;
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

interface Heading {
  at: number;
  number: string;
  title: string;
}

const SENTENCE_START = /^(?:The|If|This|Such|Any|Each|No|In|To|For|From|Upon|After|When|Where|Unless|Notwithstanding|Provided|So)\b/;

function headings(text: string): Heading[] {
  const out: Heading[] = [];
  const push = (index: number, number: string, rawTitle: string, gluedPeriod: boolean) => {
    const title = rawTitle.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
    if (title.length < 3 || title.length > 140) return;
    if (/\b(?:hereof|thereof|means)\b/i.test(title)) return;
    if (gluedPeriod && SENTENCE_START.test(title)) return;
    if (out.some((row) => row.number === number && Math.abs(row.at - index) < 48)) return;
    out.push({ at: index, number, title });
  };
  const re =
    /(?:^\s*|[.:;]\s+(?:\d{1,12}\s+){0,3}|[A-Z]{3,}\s+)(?:(?:Section|SECTION)\s+)?(\d{1,2}\.\d{1,2})(\.\s+|\s+)([A-Z\[][^.]{2,160}?)\s*\.(?=\s+[A-Z(“"(])/g;
  for (const match of text.matchAll(re)) {
    if (match.index == null || !match[1] || !match[2] || !match[3]) continue;
    push(match.index, match[1], match[3], match[2].startsWith("."));
  }
  const precededBySentence =
    /\s(?:Section|SECTION)\s+(\d{1,2}\.\d{1,2})(\.\s+|\s+)([A-Z\[][^.]{2,160}?)\s*\.(?=\s+[A-Z(“"(])/g;
  for (const match of text.matchAll(precededBySentence)) {
    if (match.index == null || !match[1] || !match[2] || !match[3]) continue;
    push(match.index, match[1], match[3], match[2].startsWith("."));
  }
  for (const match of text.matchAll(/\s(?:Section|SECTION)\s+(\d{1,2}\.\d{1,2})(?:\.\s+|\s+)\[Reserved\]/gi)) {
    if (match.index == null || !match[1]) continue;
    push(match.index, match[1], "[Reserved]", false);
  }
  return out.sort((a, b) => a.at - b.at);
}

function amendmentCut(text: string, from: number): number {
  const window = text.slice(from);
  const next = window.search(/\s\d{1,2}\.\s+(?:Section|Clause|ARTICLE|The first)\b/);
  if (next > 40) return from + next;
  return Math.min(text.length, from + 6000);
}

export function buildSectionCoverage(
  sections: readonly CovenantSection[],
  baskets: readonly { sourceDocumentId: string; sectionRef: string; citationExcerpt: string; capStatus: string; capKind: string; category: string }[],
): import("./types").CovenantSectionCoverage[] {
  return sections.map((section) => {
    const note = section.note.replace(/skip-clause:\S+/g, "").replace(/\s+/g, " ").trim();
    const base = {
      documentId: section.documentId,
      sectionNumber: section.sectionNumber,
      title: section.title,
      article: section.article,
      note,
    };
    if (section.superseded) {
      return { ...base, status: "SUPERSEDED" as const, clauseCount: 0, note: note || "Replaced in full by a later amendment." };
    }
    const body = exciseClauses(section.body, section.sectionNumber, section.note);
    const related = baskets.filter((basket) => basketBelongs(basket, section, body));
    const missing = numericCores(body).filter((core) => !related.some((basket) => norm(basket.citationExcerpt).includes(norm(core))));
    if (numericCores(body).length === 0) {
      const explicitUnlimited =
        related.length > 0 && related.every((basket) => basket.category === "UNLIMITED" && basket.capKind === "UNLIMITED");
      return {
        ...base,
        status: related.length === 0 ? ("NO_NUMERIC_TERM" as const) : explicitUnlimited ? ("COMPUTED" as const) : ("NO_NUMERIC_CAP_CONDITIONAL" as const),
        clauseCount: related.length,
      };
    }
    if (missing.length > 0) {
      return {
        ...base,
        status: "NEEDS_INPUT" as const,
        clauseCount: related.length,
        note: `Uncovered numeric term: ${missing[0]}`.slice(0, 180),
      };
    }
    if (related.some((basket) => basket.capStatus === "NEEDS_INPUT" || basket.capStatus === "UNKNOWN" || basket.category === "RECLASS")) {
      return { ...base, status: "NEEDS_INPUT" as const, clauseCount: related.length, note: note || "A numeric term in this section has no closed form." };
    }
    if (related.some((basket) => basket.capStatus === "COMPUTED")) {
      return { ...base, status: "COMPUTED" as const, clauseCount: related.length };
    }
    return { ...base, status: "NO_NUMERIC_CAP_CONDITIONAL" as const, clauseCount: related.length };
  });
}

function basketBelongs(
  basket: { sourceDocumentId: string; sectionRef: string; citationExcerpt: string },
  section: CovenantSection,
  body: string,
): boolean {
  if (basket.sourceDocumentId !== section.documentId) return false;
  const cite = norm(basket.citationExcerpt);
  const hay = norm(body);
  if (!cite || !hay) return false;
  if (hay.includes(cite) || cite.includes(hay)) return true;
  const head = hay.slice(0, 80);
  return head.length > 24 && cite.includes(head);
}

function numericCores(body: string): string[] {
  const cores: string[] = [];
  for (const span of numericSpans(body)) {
    const core = numericCore(span);
    if (core) cores.push(core);
  }
  return [...new Set(cores)];
}

function exciseClauses(body: string, sectionNumber: string, note: string): string {
  const markers = [...note.matchAll(/skip-clause:(\d+\.\d+)\(([a-z0-9]+)\)/g)]
    .filter((match) => match[1] === sectionNumber)
    .map((match) => match[2]!);
  let text = body;
  for (const marker of markers) {
    const untilNext = new RegExp(`\\(${marker}\\)[\\s\\S]*?;\\s+or\\s+(?=\\([a-z]\\))`, "i");
    text = untilNext.test(text) ? text.replace(untilNext, " ") : text.replace(new RegExp(`\\(${marker}\\)[\\s\\S]*?(?=\\([a-z]\\)\\s+[A-Z]|$)`, "i"), " ");
  }
  return text;
}

const DAY_TRIGGER = String.raw`(?:within|no later than|not later than|no fewer than|at least|for a period of|prior to|after receipt|following|that is|more than|not exceeding|not to exceed|given)`;
const DAY_UNIT = String.raw`(?:consecutive\s+)?(?:Business\s+)?days?`;
const RATIO_NAME =
  /(?:Consolidated\s+)?(?:Fixed\s+Charge\s+Coverage|Interest\s+Coverage|(?:Total\s+|Secured\s+|First\s+Lien\s+|Senior\s+)?(?:Net\s+)?Leverage)\s+Ratio/i;

function numericSpans(body: string): string[] {
  const spans: string[] = [];
  for (const match of body.matchAll(/\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?/g)) {
    if (match.index == null) continue;
    const window = dollarWindow(body, match.index, match[0].length);
    if (/denominations of|integral multiple|\$\s*2,000|\$\s*1,000\b/i.test(window)) continue;
    if (/\$\s*1(?:\.00)?\b/.test(window) && /\bincur\b/i.test(window)) continue;
    spans.push(window);
  }
  for (const match of body.matchAll(
    new RegExp(
      `${DAY_TRIGGER}[^.]{0,90}?(?:\\(\\s*\\d+\\s*\\)|\\b\\d+\\b|\\b(?:forty-five|ninety|sixty|thirty|twenty|fifteen|ten|five|one)\\b)\\s*(?:${DAY_UNIT}|months?\\b)|${DAY_UNIT}\\s+prior\\b`,
      "gi",
    ),
  )) {
    if (match.index == null) continue;
    spans.push(body.slice(match.index, match.index + match[0].length));
  }
  for (const match of body.matchAll(
    /\b(?:at least|not less than|not more than|greater than|less than|equal to|more than)\s+\d+(?:\.\d+)?\s*%(?!\s*of\b)/gi,
  )) {
    if (match.index == null) continue;
    spans.push(body.slice(match.index, match.index + match[0].length));
  }
  for (const match of body.matchAll(/\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?/g)) {
    if (match.index == null) continue;
    const start = Math.max(0, match.index - 180);
    const pre = body.slice(start, match.index);
    const name = pre.search(/(?:Ratio|ratio|Capitalization)\b[^.]{0,80}$/);
    spans.push(body.slice(name >= 0 ? start + name : match.index, match.index + match[0].length));
  }
  for (const match of body.matchAll(
    /(?:\d+(?:\.\d+)?\s*%|(?:[a-z]+(?:-[a-z]+)?(?:\s+[a-z]+){0,5}\s+)?percent\s*\(\s*\d+(?:\.\d+)?\s*%\s*\))\s+of\s+(?:the\s+)?[^.;]{3,160}/gi,
  )) {
    if (match.index == null) continue;
    spans.push(body.slice(match.index, match.index + match[0].length));
  }
  for (const match of body.matchAll(/\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?/g)) {
    if (match.index == null) continue;
    const start = Math.max(0, match.index - 180);
    const pre = body.slice(start, match.index);
    const name = pre.search(/(?:Ratio|ratio)\b[^.]{0,80}$/);
    spans.push(body.slice(name >= 0 ? start + name : match.index, match.index + match[0].length));
  }
  for (const match of body.matchAll(new RegExp(`${RATIO_NAME.source}[^.]{0,220}`, "gi"))) {
    if (match.index == null) continue;
    if (/\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?/.test(match[0])) continue;
    if (!/\b(?:equal to or greater than|less than or equal to|no greater than|at least)\b/i.test(match[0])) continue;
    spans.push(match[0].trim());
  }
  return spans;
}

function dollarWindow(body: string, index: number, length: number): string {
  const preStart = Math.max(0, index - 90);
  const pre = body.slice(preStart, index);
  if (/greater\s+of/i.test(pre)) {
    const rest = body.slice(preStart);
    const grower = rest.match(/greater of[\s\S]{0,220}?\d+(?:\.\d+)?%\s+of\s+[^.;]{3,80}/i);
    if (grower?.[0]) return grower[0].trim();
  }
  const after = body.slice(index + length, index + length + 16);
  const million = after.match(/^\s+million\b/i);
  const end = index + length + (million?.[0].length ?? 0);
  let start = Math.max(0, index - 120);
  const local = body.slice(start, index);
  const prevDollar = local.lastIndexOf("$");
  if (prevDollar >= 0) start += prevDollar + 1;
  const tightened = body.slice(start, index);
  const role = tightened.match(
    /(in excess of|not to exceed|does not exceed|shall not exceed|not in excess of|up to an aggregate amount of|aggregate (?:principal |similar )?amount of|less than|Dollars\s*\()\s*(?:\([^)]*\)\s*)?$/i,
  );
  if (role?.index != null) start += role.index;
  else {
    const boundary = Math.max(tightened.lastIndexOf(". "), tightened.lastIndexOf("; "));
    if (boundary >= 0) start += boundary + 2;
  }
  return body.slice(start, end).trim();
}

function numericCore(text: string): string | null {
  const dollar = text.match(/\$\s*[\d,]+(?:\.\d+)?(?:\s+million)?/);
  if (dollar && !(/\$\s*1(?:\.00)?\b/.test(dollar[0]) && /\bincur\b/i.test(text))) return dollar[0].replace(/\s+/g, " ");
  const days = text.match(
    /\(\s*\d+\s*\)\s*(?:consecutive\s+)?(?:Business\s+)?(?:days?|months?)|\b\d+\s+(?:consecutive\s+)?(?:Business\s+)?(?:days?|months?)|\b(?:forty-five|ninety|sixty|thirty|twenty|fifteen|ten|five|one)\s+(?:consecutive\s+)?(?:Business\s+)?(?:days?|months?)/i,
  );
  if (days) return days[0];
  const pct = percentOfPhrase(text);
  if (pct) return `${pct.pct}%`;
  const barePct = text.match(/percent\s*\(\s*\d+(?:\.\d+)?\s*%\s*\)|\d+(?:\.\d+)?\s*%/i);
  if (barePct) return barePct[0];
  const ratio = text.match(/\d+(?:\.\d+)?\s+to\s+\d+(?:\.\d+)?/);
  if (ratio) return ratio[0];
  const named = text.match(RATIO_NAME);
  return named?.[0] ?? null;
}

function familyOf(title: string): string {
  const t = title.toLowerCase();
  if (/event of default|defaults/.test(t)) return "EVENTS_OF_DEFAULT";
  if (/report|compliance certificate|information/.test(t)) return "REPORTING";
  if (/change of control/.test(t)) return "CHANGE_OF_CONTROL";
  if (/merger|consolidation|successor/.test(t)) return "MERGER";
  if (/affiliate/.test(t)) return "AFFILIATE";
  if (/prepayment|excess cash/.test(t)) return "PREPAYMENT";
  if (/sale and leaseback|asset sale|disposition/.test(t)) return "ASSET_SALE";
  if (/lien|negative pledge/.test(t)) return "LIENS";
  if (/investment/.test(t)) return "INVESTMENT";
  if (/restricted payment|dividend|distribution/.test(t)) return "RESTRICTED_PAYMENTS";
  if (/debt|indebtedness/.test(t)) return "DEBT_INCURRENCE";
  if (/financial covenant/.test(t)) return "FINANCIAL_COVENANT";
  if (/insurance|guarant|pledge|assur|existence|tax|maintenance|preservation/.test(t)) return "AFFIRMATIVE";
  return "OTHER";
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/§/g, "s")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Attach skip-clause notes so numeric extraction can drop a replaced letter. */
export function annotateSkippedClauses(sections: CovenantSection[], skipped: readonly { sectionNumber: string; marker: string }[]): CovenantSection[] {
  return sections.map((section) => {
    const hits = skipped.filter((skip) => skip.sectionNumber === section.sectionNumber);
    if (!hits.length || section.superseded) return section;
    const note = hits.map((hit) => `skip-clause:${hit.sectionNumber}(${hit.marker})`).join(" ");
    return { ...section, note: `${section.note} ${note}`.trim() };
  });
}
