/**
 * Clause roles, defined-term / cross-reference resolution, and a per-family covenant
 * checklist over a SectionTree. Deterministic; no AI / LLM calls; nothing invented.
 * A family with no numeric cap is NEVER reported as unlimited.
 */
import { type CovenantFamily, negatedItemFamilies, classifyCovenantFamily, isObligorProhibitionLead } from "./family-classifier";
import { normalizeSectionNumber, sectionOf, type SectionTree, type TreeNode } from "./parse";

export type ClauseRole = "PROHIBITION" | "BASKET" | "EXCEPTION_PROVISO" | "DEFINITION" | "CROSS_REFERENCE" | "OTHER";

/** Text of the node excluding its children (the node's own words). */
export function ownText(tree: SectionTree, text: string, node: TreeNode): string {
  const kids = node.childIds.map((id) => tree.byId.get(id)!).sort((a, b) => a.start - b.start);
  let out = "";
  let at = node.start;
  for (const k of kids) {
    out += text.slice(at, Math.max(at, k.start));
    at = Math.max(at, k.end);
  }
  return out + text.slice(at, node.end);
}

const PROHIBIT = /\b(?:shall|will)\s+not\b[^.;]{0,120}?\b(?:create|incur|assume|permit|make|declare|pay|sell|transfer|dispose|enter|merge|consolidate|prepay|redeem|purchase|suffer|guarantee|engage|amend)/i;
/** Article-lead-in style ("…will not:  Section 10.01 Indebtedness. Incur, create…"). */
const IMPERATIVE_LEAD = /^\s*(?:\([a-z0-9]+\)\s*)?(?:incur|create|make|declare|sell|enter into|merge|permit|pay|prepay|purchase|transfer|consolidate|dispose|directly or indirectly)\b/i;
export function isProhibitive(body: string): boolean {
  return PROHIBIT.test(body.slice(0, 600)) || IMPERATIVE_LEAD.test(body);
}
const EXCEPT_LEAD = /^\s*(?:\([a-z0-9]+\)\s*)?(?:provided|except|notwithstanding|other than|so long as|unless)\b/i;
const MONEY = /\$\s?\d|\d+(?:\.\d+)?\s?%|greater of|lesser of/i;
const XREF = /\b(?:Section|clause|paragraph|subsection)\s+\(?(\d{1,2}\.\d{1,3})?((?:\s?\([a-zA-Z0-9]{1,5}\))*)/g;

export function roleOf(tree: SectionTree, text: string, node: TreeNode): ClauseRole {
  if (node.kind === "ROOT" || node.kind === "ARTICLE") return "OTHER";
  const own = ownText(tree, text, node).slice(0, 1500);
  const sec = sectionOf(tree, node);
  if (/definitions?|defined terms/i.test(sec?.title ?? "") || /^\s*(?:\([a-z0-9]+\)\s*)?[“"][^”"]{2,80}[”"]\s+(?:means|shall mean|has the meaning)/.test(own)) return "DEFINITION";
  if (EXCEPT_LEAD.test(own) || /provided,?\s+(?:however,?\s+)?that/i.test(own.slice(0, 200))) return "EXCEPTION_PROVISO";
  if (node.kind === "SECTION" ? isProhibitive(own.slice(node.headingEnd - node.start)) : PROHIBIT.test(own.slice(0, 600))) return "PROHIBITION";
  if (node.kind === "CLAUSE") {
    // A clause under a prohibition (the "except:" list) is a permitted basket.
    const parent = node.parentId ? tree.byId.get(node.parentId) : undefined;
    const parentOwn = parent ? ownText(tree, text, parent).slice(0, 1500) : "";
    const parentBody = parent && parent.kind === "SECTION" ? parentOwn.slice(parent.headingEnd - parent.start) : parentOwn;
    if (parent && isProhibitive(parentBody) && /except|other than|following/i.test(parentOwn)) return "BASKET";
    if (MONEY.test(own)) return "BASKET";
  }
  const stripped = own.replace(XREF, "").replace(/\s+/g, " ").trim();
  if (own.length < 300 && stripped.length < own.length * 0.6 && XREF.test(own)) return "CROSS_REFERENCE";
  XREF.lastIndex = 0;
  return "OTHER";
}

// ---------- definitions + cross references ----------

export interface DefinedTerm {
  term: string;
  start: number;
  end: number;
  nodeId: string | null;
}

export interface CrossRef {
  fromNodeId: string;
  at: number;
  raw: string;
  target: string;
  status: "RESOLVED" | "UNRESOLVED_NOT_FOUND" | "UNRESOLVED_EXTERNAL" | "UNRESOLVED_RELATIVE";
  targetNodeId: string | null;
}

const DEF_RE = /[“"]\s*([A-Z][A-Za-z0-9’'\-&/ ,.()]{1,80}?)\s*[”"]\s+(?:means|shall mean|has the meaning|shall have the meaning)/g;

export function definedTerms(tree: SectionTree, text: string): DefinedTerm[] {
  const out: DefinedTerm[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(DEF_RE)) {
    const term = m[1]!.trim();
    if (seen.has(term)) continue;
    seen.add(term);
    const start = m.index!;
    const node = deepestAt(tree, start);
    out.push({ term, start, end: start + m[0].length, nodeId: node?.id ?? null });
  }
  return out;
}

function deepestAt(tree: SectionTree, at: number): TreeNode | null {
  let best: TreeNode | null = null;
  for (const n of tree.nodes) if (n.kind !== "ROOT" && n.start <= at && n.end > at && (!best || n.depth >= best.depth)) best = n;
  return best;
}

export function resolveCrossRefs(tree: SectionTree, text: string): CrossRef[] {
  const index = new Map<string, TreeNode>();
  // Duplicate paths (e.g. a schedule list echoing headings): prefer the node with the larger span.
  for (const n of tree.nodes) {
    if (n.kind !== "SECTION" && n.kind !== "CLAUSE") continue;
    const prev = index.get(n.path);
    if (!prev || n.end - n.start > prev.end - prev.start) index.set(n.path, n);
  }
  const out: CrossRef[] = [];
  const re = /\bSections?\s+(\d{1,2}\.\d{1,3})((?:\([a-zA-Z0-9]{1,5}\))*)/g;
  for (const m of text.matchAll(re)) {
    const at = m.index!;
    const from = deepestAt(tree, at);
    if (!from) continue;
    // Skip the heading of the section itself.
    if (from.kind === "SECTION" && at < from.headingEnd && at <= from.start + 12) continue;
    const num = normalizeSectionNumber(m[1]!);
    const target = num + (m[2] ?? "");
    const tail = text.slice(at + m[0].length, at + m[0].length + 60);
    let status: CrossRef["status"];
    let targetNode: TreeNode | undefined;
    if (/^\s*of\s+(?:the\s+)?(?!this\b)(?:[A-Z][a-z]+\s+){0,3}(?:Agreement|Indenture|Code|Act|Note|Notes|Guarantee)/.test(tail)) {
      status = "UNRESOLVED_EXTERNAL";
    } else {
      targetNode = index.get(target);
      if (!targetNode && m[2]) {
        // Resolve to the deepest existing prefix; still unresolved at the requested depth.
        status = "UNRESOLVED_NOT_FOUND";
      } else status = targetNode ? "RESOLVED" : "UNRESOLVED_NOT_FOUND";
    }
    out.push({ fromNodeId: from.id, at, raw: m[0], target, status, targetNodeId: targetNode?.id ?? null });
  }
  return out;
}

// ---------- checklist ----------

export const CHECKLIST_FAMILIES = [
  "DEBT", "LIENS", "RESTRICTED_PAYMENTS", "INVESTMENTS", "ASSET_SALES", "AFFILIATE_TRANSACTIONS",
  "FUNDAMENTAL_CHANGES", "PREPAYMENTS", "FINANCIAL_RATIOS",
] as const;
export type ChecklistFamily = (typeof CHECKLIST_FAMILIES)[number];


export type ChecklistStatus = "MISSING" | "ABSENT_VERIFIED" | "NEEDS_INPUT" | "CONDITIONS_LIMITED" | "CAP_FOUND";

export interface ChecklistItem {
  family: ChecklistFamily;
  status: ChecklistStatus;
  sectionPaths: string[];
  parts: { fixedCap: boolean; grower: boolean; ratio: boolean; exceptions: number; prohibition: boolean };
  needsInputs: string[];
  note: string;
}

export function covenantChecklist(tree: SectionTree, text: string): ChecklistItem[] {
  // Family per SECTION from the general classifier (lead-in prohibition object, heading, defined terms).
  // An ARTICLE with no numbered sections ("ARTICLE IX FINANCIAL COVENANT  Crown will not permit ...") is itself the
  // operative unit.
  const sections = tree.nodes.filter((n) => n.kind === "SECTION" || (n.kind === "ARTICLE" && !tree.nodes.some((c) => c.kind === "SECTION" && c.parentId === n.id)));
  const famOf = new Map<string, readonly string[]>();
  const leadOf = (s: (typeof sections)[number]) => text.slice(s.headingEnd, Math.min(s.end, s.headingEnd + 2000));
  const prohib = new Map(sections.map((s) => [s.id, isObligorProhibitionLead(leadOf(s))]));
  for (const [i, s] of sections.entries()) {
    const parent = s.parentId ? tree.byId.get(s.parentId) : undefined;
    // Covenant run: an adjacent sibling section (same parent) also opens with an obligor-bound prohibition.
    const sib = (j: number) => { const o = sections[j]; return !!o && o.parentId === s.parentId && prohib.get(o.id) === true; };
    const am = amendedText(`${s.title ?? ""} ${leadOf(s)}`);
    const v = am
      ? classifyCovenantFamily({ title: am.title, parentTitle: null, leadIn: am.lead, covenantContext: true })
      : classifyCovenantFamily({ title: s.title, parentTitle: parent?.title ?? null, leadIn: leadOf(s), covenantContext: sib(i - 1) || sib(i + 1) });
    // Restated articles/sections quoted later in the body ("(g) Article IX of the Credit Agreement is hereby amended and
    // restated in its entirety to read as follows: From and after ..."): classify each quoted text too.
    const fams = new Set(v.families);
    // Enumerated covenant items (LLC separateness / "shall not take any of the following actions" lists): an item-level
    // prohibition with a family object counts, but only inside an obligor-bound prohibition section body.
    // Captioned clauses ("(a) Mergers, etc. Merge or consolidate ...", "(d) Mergers and Consolidations; Disposition of
    // Assets. The Borrower shall not consolidate ...") are covenant units of their own; a bare imperative under the
    // section's negative stem ("the Borrower will not ...: (a) Mergers, etc. Merge ...") reads as prohibited.
    if (!am && !(s.title && NOT_COVENANT_TITLE.test(s.title))) {
      const body = text.slice(s.headingEnd, s.end);
      const stem = /\b(?:shall|will)\s+not\b[^.]{0,300}:\s*$/i;
      for (const c of body.matchAll(/(?:^|\n)\s*\([a-z]{1,2}\)\s*([A-Z][^.\n]{3,90}?)\s*\.\s+(?=[A-Z])/g)) {
        if (c[1]!.split(/\s+/).length > 10) continue;
        const rest = body.slice(c.index! + c[0].length, c.index! + c[0].length + 1500);
        const underStem = stem.test(body.slice(Math.max(0, c.index! - 400), c.index!).trimEnd() + " ") || stem.test(body.slice(0, Math.min(c.index!, 600)));
        for (const f of classifyCovenantFamily({ title: c[1]!.trim(), parentTitle: null, leadIn: underStem ? rest.replace(/^\s*/, "") : rest, covenantContext: true }).families) fams.add(f);
      }
    }
    if (!am && !(s.title && (NOT_COVENANT_TITLE.test(s.title) || /condition|default|remed|termination|indemn|agent|trustee/i.test(s.title)))) for (const f of covenantItemFamilies(text.slice(s.headingEnd, s.end), articleStem(tree, text, s))) fams.add(f);
    if (!am) for (const q of restatedTexts(text.slice(s.headingEnd, s.end))) for (const f of classifyCovenantFamily({ title: q.title, parentTitle: null, leadIn: q.lead, covenantContext: true }).families) fams.add(f);
    famOf.set(s.id, [...fams]);
  }
  // Restatements in text no section covers (an amendment with no numbered sections) belong to the document root.
  const root = tree.nodes.find((n) => n.kind === "ROOT");
  const units = [...sections];
  if (root) {
    const covered = (i: number) => sections.some((s) => s.start <= i && s.end > i);
    const rootFams = new Set<string>();
    for (const q of restatedTexts(text, covered)) for (const f of classifyCovenantFamily({ title: q.title, parentTitle: null, leadIn: q.lead, covenantContext: true }).families) rootFams.add(f);
    if (rootFams.size) { famOf.set(root.id, [...rootFams]); units.push(root); }
  }
  // Amendments and 8-K wrappers carry only part of the agreement: an absence is an absence from this document.
  const opening = text.slice(0, 4000);
  const partialDocument = /\bFORM\s+8-K\b|\bCURRENT REPORT\b/i.test(opening) || /\b(?:AMENDMENT|WAIVER|JOINDER|SUPPLEMENTAL INDENTURE|INCREMENTAL)\b[^\n]{0,80}\b(?:TO|NO\.)\b/.test(opening);
  return CHECKLIST_FAMILIES.map((family) => {
    const hits = units.filter((s) => famOf.get(s.id)?.includes(family));
    if (hits.length === 0) {
      const ev = familyEvidence(text, family);
      const absent = ev.length === 0;
      return {
        family, status: absent ? ("ABSENT_VERIFIED" as const) : ("MISSING" as const), sectionPaths: [],
        parts: { fixedCap: false, grower: false, ratio: false, exceptions: 0, prohibition: false }, needsInputs: [],
        note: absent
          ? partialDocument
            ? "absent from this document (an amendment or 8-K, not the full agreement; the base agreement may contain it); not treated as unlimited"
            : "no operative lead-in or heading for this family anywhere in the document; not treated as unlimited"
          : `no operative section found, but the text has ${family} covenant evidence (${ev[0]!.kind}: "${ev[0]!.excerpt}"); not treated as unlimited`,
      };
    }
    const body = hits.map((s) => text.slice(s.start, s.end)).join("\n");
    const fixedCap = /\$\s?[\d,]{3,}/.test(body);
    const grower = /greater of[^.;]{0,200}%/i.test(body);
    const ratio = /\d+(?:\.\d+)?\s*(?:to|:)\s*1(?:\.0+)?\b/i.test(body);
    const exceptions = hits.reduce((a, s) => a + tree.nodes.filter((n) => n.parentId === s.id || isDesc(tree, n, s)).filter((n) => n.kind === "CLAUSE" && n.depth === s.depth + 1).length, 0);
    const needsInputs: string[] = [];
    for (const [re, name] of [[/consolidated (?:adjusted )?ebitda/i, "EBITDA"], [/total assets/i, "TOTAL_ASSETS"], [/consolidated net income/i, "NET_INCOME"], [/available amount|builder basket|cumulative credit/i, "BUILDER_BASKET_BALANCE"], [/leverage ratio|coverage ratio|fixed charge/i, "RATIO_INPUTS"]] as const) {
      if (re.test(body)) needsInputs.push(name);
    }
    const status: ChecklistStatus = grower || ratio || (needsInputs.length > 0 && !fixedCap) ? "NEEDS_INPUT" : fixedCap ? "CAP_FOUND" : "CONDITIONS_LIMITED";
    return {
      family, status, sectionPaths: [...new Set(hits.map((h) => h.path))],
      parts: { fixedCap, grower, ratio, exceptions, prohibition: hits.some((h) => isProhibitive(text.slice(h.headingEnd, h.end))) },
      needsInputs,
      note: status === "CONDITIONS_LIMITED" ? "limited by conditions/exceptions without a numeric cap; never unlimited by default" : "",
    };
  });
}

/**
 * An amendment instruction section ("Section 10.1 of the Agreement is hereby amended in its entirety to read as
 * follows: Section 10.1. Debt. The Company will not ...", "The following shall be added as a new Section 10.8:")
 * carries the amended covenant as quoted text: classify that text by its own heading and lead-in, not the wrapper.
 */
function amendedText(lead: string): { title: string; lead: string } | null {
  const m = /\b(?:amended(?: and restated)?(?: in (?:its|their) entirety)? to read as follows|(?:added|inserted) (?:as )?(?:a )?new (?:Section|clause)[^:]{0,60}?):\s*/i.exec(lead.slice(0, 300));
  if (!m) return null;
  const rest = lead.slice(m.index + m[0].length).replace(/^[\s“”"'‘\u0080-\u009f]+/, ""); // opening quote (incl. C1-mangled cp1252 quotes)
  const h = /^\s*(?:section\s+)?\d{1,2}\.\d{1,3}\.?\s+([A-Z][^.\n]{2,80})\.\s*/i.exec(rest);
  if (!h) return null;
  return { title: h[1]!.trim(), lead: rest.slice(h[0].length) };
}

/** True when the section's enclosing ARTICLE opens with a negative stem ("the Borrower shall not, ...:") before its first section. */
function articleStem(tree: SectionTree, text: string, s: TreeNode): boolean {
  let p = s.parentId ? tree.byId.get(s.parentId) : undefined;
  while (p && p.kind !== "ARTICLE") p = p.parentId ? tree.byId.get(p.parentId) : undefined;
  if (!p) return false;
  const first = tree.nodes.filter((n) => n.kind === "SECTION" && n.start > p!.start && n.start < p!.end).sort((a, b) => a.start - b.start)[0];
  const lead = text.slice(p.headingEnd, first ? first.start : Math.min(p.end, p.headingEnd + 1500)).slice(-600);
  return /\b(?:shall|will)\s+not\b[^.:]{0,300}:\s*$/i.test(lead) && !/\b(?:prohibit|apply|unless)\b/i.test(lead);
}

function covenantItemFamilies(body: string, inherited = false): Set<CovenantFamily> {
  const out = new Set<CovenantFamily>();
  if (body.length > 60000) return out;
  // A negative stem governs the items that follow its colon until the next stem.
  // A negative stem ends in a colon introducing the list ("shall not ... take any of the following actions:", "will not,
  // directly or indirectly:").
  const stemRe = /\b(?:shall|will|may)\s+not\b[^.:]{0,300}?:/gi;
  // Exception and condition stems ("will not prohibit any of the following:", "will not apply to:", "unless:", "restriction
  // on the ability of ... to:") introduce permissions or conditions, not prohibited acts; they also end the prior stem.
  const EXC = /\b(?:prohibit|apply|applies|restrict|limit|unless|ability|required|obligat\w*|be deemed|include)\b/i;
  const stems = [...body.matchAll(stemRe)].map((m) => ({ at: m.index! + m[0].length, neg: !EXC.test(m[0]) }));
  const itemRe = /(?:^|\n|;\s+|:\s+)\s*\(((?:[ivxl]{1,6})|[a-z]{1,2}|\d{1,2})\)\s+([^\n;]{10,600})/g;
  for (const m of body.matchAll(itemRe)) {
    const at = m.index!;
    const gov = stems.filter((st) => st.at <= at + 3).pop();
    const underStem = (!!gov && gov.neg && at - gov.at < 4000) || (inherited && (!gov || gov.neg));
    for (const f of negatedItemFamilies(m[2]!, underStem)) out.add(f);
  }
  return out;
}

/** Every "amended (and restated) in its entirety to read as follows:" instruction in a body, with its quoted text. */
function restatedTexts(body: string, skip?: (offset: number) => boolean): { title: string | null; lead: string }[] {
  const out: { title: string | null; lead: string }[] = [];
  const re = /\b(?:Article|Section)\s+[\dIVXLC]+(?:\.\d+)?[^.:]{0,120}?\bamended(?: and restated)?(?: in (?:its|their) entirety)? to read as follows:\s*/gi;
  for (const m of body.matchAll(re)) {
    if (out.length >= 50) break;
    if (skip?.(m.index!)) continue;
    const rest = body.slice(m.index! + m[0].length, m.index! + m[0].length + 2000).replace(/^[\s“”"'‘\u0080-\u009f]+/, "");
    const h = /^(?:(?:section\s+)?\d{1,2}\.\d{1,3}\.?|ARTICLE\s+[IVXLC\d]+)\s+([A-Z][^.\n]{2,80})[.\n]\s*/i.exec(rest);
    out.push(h ? { title: h[1]!.trim(), lead: rest.slice(h[0].length) } : { title: null, lead: rest });
  }
  return out;
}

function isDesc(tree: SectionTree, n: TreeNode, anc: TreeNode): boolean {
  let p = n.parentId ? tree.byId.get(n.parentId) : undefined;
  while (p) {
    if (p.id === anc.id) return true;
    p = p.parentId ? tree.byId.get(p.parentId) : undefined;
  }
  return false;
}

// ---------- family evidence (deterministic absence check) ----------

const NEG = String.raw`(?:shall|will|may)\s+not\b|\bno\s+[^.;]{1,140}?\b(?:shall|will|may)\b`;
const FAMILY_EVIDENCE: Record<ChecklistFamily, { heading: RegExp; lead: RegExp }> = {
  DEBT: { heading: /\b(?:limitations? on |restrictions? on )?(?:indebtedness|incurrence of (?:indebtedness|debt)|debt)\b/i, lead: /(?:create|incur|assume|guarantee|suffer to exist|issue)[^.;]{0,100}?\b(?:indebtedness|debt)\b/i },
  LIENS: { heading: /\b(?:liens|negative pledge|limitations? on liens)\b/i, lead: /(?:create|incur|assume|grant|suffer to exist)[^.;]{0,100}?\b(?:liens?|mortgage|pledge|security interest)\b/i },
  RESTRICTED_PAYMENTS: { heading: /\b(?:restricted payments|dividends|distributions)\b/i, lead: /(?:declare|pay|make)[^.;]{0,80}?\b(?:dividends?|restricted payments?|distributions?)\b/i },
  INVESTMENTS: { heading: /\b(?:investments|loans,? advances|acquisitions)\b/i, lead: /(?:make|hold|acquire|purchase)[^.;]{0,80}?\b(?:investments?|advances?|capital contributions?)\b/i },
  ASSET_SALES: { heading: /\b(?:asset sales|asset transfers|dispositions?|sales? of assets|disposition of assets)\b/i, lead: /(?:sell|transfer|convey|dispose|lease)[^.;]{0,100}?\b(?:assets?|propert(?:y|ies)|business)\b/i },
  AFFILIATE_TRANSACTIONS: { heading: /\btransactions? with affiliates\b|\baffiliate transactions\b/i, lead: /(?:enter into|permit to exist|engage in)[^.;]{0,140}?\baffiliates?\b/i },
  FUNDAMENTAL_CHANGES: { heading: /\b(?:mergers?|consolidations?|fundamental changes|merger,? consolidation)\b/i, lead: /\b(?:merge|consolidate|amalgamate|liquidate|dissolve)\b/i },
  PREPAYMENTS: { heading: /\b(?:prepayments? of (?:other )?(?:indebtedness|debt)|restricted debt payments|payments? of (?:subordinated|junior) (?:indebtedness|debt))\b/i, lead: /(?:prepay|redeem|repurchase|defease|retire)[^.;]{0,100}?\b(?:subordinated|junior)?\s*(?:indebtedness|debt)\b/i },
  FINANCIAL_RATIOS: { heading: /\b(?:leverage ratio|coverage ratio|financial covenants?|net worth|fixed charge|minimum liquidity)\b/i, lead: /\b(?:permit|maintain)\b[^.;]{0,100}?\b(?:leverage ratio|coverage ratio|net worth|fixed charge coverage(?: ratio)?|liquidity)\b[^.;]{0,400}?\b(?:to\s+(?:exceed|be\s+(?:less|greater|more)\s+than)|of\s+(?:not\s+)?(?:less|more|greater)\s+than|at\s+(?:least|not\s+less\s+than))|\b(?:maintain)\b[^.;]{0,40}?\b(?:leverage ratio|coverage ratio|net worth|fixed charge coverage)\b/i },
};
const NEG_RE = new RegExp(NEG, "i");
const NOT_COVENANT_TITLE = /\btrustee\b|^[“"]|[“"][^”"]{1,80}[”"]\s*means|definition|defined terms|representation|event of default|evidence of|references to|debt service|senior indebtedness|holder of|of stock|of shares|repayment|status as|opinion/i;

/**
 * Lead-in text that names a family's verb/object but is not that covenant: affiliate-transaction text for asset sales,
 * lender funding mechanics for investments, payment waterfalls, LLC dissolution timing, secured-debt (liens) clauses
 * for debt.
 */
function spuriousEvidence(family: ChecklistFamily, sent: string, at: number): boolean {
  if (/\b(?:shall|will|may)\s+be\s+applied\b[^.]{0,200}\b(?:first|second)\b|\bpriority of payments\b|\bwaterfall\b|\bfirst,\s+to\b[^.]{0,200}\bsecond,\s+to\b/i.test(sent)) return true;
  const before = sent.slice(Math.max(0, at - 160), at);
  // Affiliate-transaction text ("any transaction ... with any Affiliate", "Affiliate Transaction"), not every sentence
  // that mentions an Affiliate: a disposition covenant with an affiliate carve-out stays asset-sales evidence.
  if (family === "ASSET_SALES" && (/\baffiliate transactions?\b/i.test(sent) || /\b(?:transactions?|agreements?|arrangements?|contracts?)\b[^.;]{0,80}\bwith\b[^.;]{0,30}\baffiliates?\b/i.test(sent)) && !/\b(?:all or substantially all|asset sale|asset disposition)\b/i.test(sent)) return true;
  if (family === "INVESTMENTS" && (/\b(?:lenders?|banks?|issuing bank|swingline lender|agent)s?\b[^.;]{0,80}$/i.test(before) || /\b(?:not be obligated|obligated to)\b/i.test(sent) || /\badvances?\b/i.test(sent) && /\b(?:lenders?|borrowing)\b/i.test(sent))) return true;
  if (family === "FUNDAMENTAL_CHANGES" && !/\b(?:merge|consolidate|amalgamate)\b/i.test(sent) && /\b(?:dissol|liquidat|wind(?:ing)? up)\w*\b[^.]{0,200}\b(?:prior to|until|upon the (?:first )?(?:to )?occur|liquidation event|the act)\b/i.test(sent)) return true;
  if (family === "DEBT" && /\b(?:liens?|mortgages?|security interests?)\s+(?:securing|to secure)\b[^.;]{0,60}\b(?:indebtedness|debt)\b/i.test(sent)) return true;
  if (family === "DEBT" && /\b(?:indebtedness|debt)\b[^.;]{0,80}\bsecured by\b[^.;]{0,80}\b(?:mortgage|lien|security interest|pledge)/i.test(sent)) return true;
  return false;
}

/**
 * Evidence that a covenant family exists in the document: a heading line naming it ("6.01 Liens") or an
 * operative lead-in (a negated obligation within the same sentence for negative covenants; a maintain/permit
 * test for financial ratios). Empty array ⇒ the family is verifiably absent. Deterministic, no per-issuer logic.
 */
export function familyEvidence(text: string, family: ChecklistFamily): { kind: "HEADING" | "LEAD_IN"; excerpt: string }[] {
  const ev = FAMILY_EVIDENCE[family];
  const out: { kind: "HEADING" | "LEAD_IN"; excerpt: string }[] = [];
  // Headings: a numbered heading line whose title names the family.
  const headRe = /(?:^|\n)\s*(?:section\s+)?\d{1,2}\.\d{1,3}\.?\s+([^\n.]{3,90})/gi;
  for (const m of text.matchAll(headRe)) {
    const title = m[1]!.trim();
    const hm = ev.heading.exec(title);
    // The family must lead the title (allowing "Limitation on", "Restrictions on", "Incurrence of"), not be one
    // word inside an unrelated heading ("Evidence of Debt", "Trustee as Holder of Senior Indebtedness").
    if (hm && hm.index <= 25 && !NOT_COVENANT_TITLE.test(title)) { out.push({ kind: "HEADING", excerpt: m[0].trim().slice(0, 80) }); break; }
  }
  // Clause-caption headings: "(d) Mergers and Consolidations; Disposition of Assets. The Borrower will not ...".
  if (!out.length) for (const m of text.matchAll(/(?:^|\n)\s*\([a-z]{1,2}\)\s+([A-Z][^.\n]{3,90}?)\s*\.\s+(?=[A-Z])/g)) {
    const title = m[1]!.trim();
    // Only a caption followed by an obligation: drop it only when the sentence after it carries no modal, negation or
    // imperative (a representation, "Schedule 5.2(i) sets forth ...", or a default trigger, "Borrower fails to pay ...").
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 400);
    const first = after.split(/(?<=\.)\s+(?=[A-Z(])/)[0] ?? after;
    // Equity-plan mechanics ("Merger or Change in Control. In the event of a merger, each outstanding Option shall be
    // assumed ...") govern awards, not the issuer's conduct.
    if (/\b(?:outstanding\s+)?(?:options?|awards?|purchase rights?|offering periods?|participants?|the plan)\b/i.test(first) && !NEG_RE.test(first)) continue;
    if (!(/\b(?:shall|will|must|agrees?|covenants?)\b/i.test(first) || NEG_RE.test(first) || /\b(?:neither|nor)\b/i.test(first) ||
      /(?:^|,\s*)(?:Merge|Consolidate|Create|Incur|Make|Declare|Sell|Enter|Permit|Pay|Prepay|Transfer|Dispose|Maintain|Wind|Liquidate|Dissolve|Engage|Suffer)\b/.test(first))) continue;
    if (title.split(/\s+/).length > 10 || NOT_COVENANT_TITLE.test(title)) continue;
    if (title.split(/[;,]|\band\b/).some((part) => { const hm = ev.heading.exec(part.trim()); return !!hm && hm.index <= 25; })) { out.push({ kind: "HEADING", excerpt: m[0].trim().slice(0, 80) }); break; }
  }
  // Operative lead-ins: a sentence with the family's operative verb/object, negated (or a ratio test).
  outer: for (const para of text.split(/\n\s*\n|\n(?=\s*(?:\(?[a-z0-9]{1,4}[.)]|section\s+\d|\d{1,2}\.\d)\s)/i)) {
  // A paragraph that is a definition ("\"Guarantee Obligation\" means ... (ii) to advance or supply funds ... to
  // maintain ... net worth") states no covenant, in any of its clauses.
  const isDefinition = /^\s*[“"][^”"]{1,80}[”"]\s*(?:\([^)]{0,60}\)\s*)?(?:means|shall mean|has the meaning)/i.test(para);
  for (const sent of para.split(/(?<=[.;:])\s+/)) {
    if (sent.length > 2000) continue;
    const lm = ev.lead.exec(sent);
    if (!lm) continue;
    if (isDefinition) continue outer;
    const imperative = false;
    if (spuriousEvidence(family, sent, lm.index)) continue;
    if (imperative) { out.push({ kind: "LEAD_IN", excerpt: sent.trim().slice(0, 100) }); break outer; }
    if (family === "FINANCIAL_RATIOS") {
      // A ratio test is an obligation: a modal or undertaking must govern the test verb. A narrative summary
      // ("The Credit Agreement contains certain covenants, a financial covenant ... requiring ... to maintain")
      // is not.
      const before = sent.slice(Math.max(0, lm.index - 160), lm.index);
      // An article imperative ("Permit the Consolidated Leverage Ratio ... to exceed", "Maintain Liquidity of at least")
      // under the article's "will not / will:" stem is an obligation too.
      const imperativeTest = /^\s*(?:\([a-z0-9]+\)\s*)?(?:(?:[A-Z][\w’'&/-]*\s+){0,6}[A-Z][\w’'&/-]*\s*\.\s+)?(?:Permit|Maintain)\b/.test(sent) && lm.index <= sent.search(/\b(?:Permit|Maintain)\b/);
      if ((!imperativeTest && !/\b(?:shall|will|agrees?|covenants?\s+(?:and agrees?\s+)?that)\b/i.test(before)) || /\bcontains?\b[^.;]{0,80}\bcovenants?\b/i.test(sent)) continue;
    }
    if (family !== "FINANCIAL_RATIOS") {
      // The negated obligation must govern the operative verb: negation within 160 chars before it.
      const before = sent.slice(Math.max(0, lm.index - 160), lm.index + 1);
      const nm = [...before.matchAll(new RegExp(NEG, "gi"))].pop();
      if (!nm) continue;
      // Between the negation and the operative verb: only the obligor/permission chain ("and shall not permit any
      // Subsidiary to, directly or indirectly,"), never a different predicate ("shall not apply to", "not be required").
      const between = before.slice(nm.index! + nm[0].length);
      if (/\b(?:apply|be|been|constitute|include|affect|count|limit|restrict|prohibit|prevent|require|deem)\b/i.test(between) || /^\s*be\b/i.test(between)) continue;
      if (/\bexceed\b/i.test(between) || /\bno opinion\b/i.test(nm[0]) || /\bexpress\b/i.test(before.slice(Math.max(0, nm.index! - 20), nm.index! + 4))) continue;
      if (family === "ASSET_SALES" && /all or substantially all/i.test(sent)) continue; // that is a fundamental change
    }
    if (/\bmeans\b|\bshall mean\b/.test(sent.slice(0, 200))) continue; // definitions
    out.push({ kind: "LEAD_IN", excerpt: sent.trim().slice(0, 100) });
    break outer;
  }
  }
  return out;
}
