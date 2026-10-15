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
  /** Source locators of the operative spans the numbers were read from (additive). */
  spans?: { path: string; start: number; end: number; resolved: boolean }[];
  /** ABSENT_VERIFIED only: the absence is from this document; the family may sit in an incorporated/base instrument (additive). */
  absentScope?: "DOCUMENT_ONLY_INCORPORATED_BY_REFERENCE";
}

/** Incorporation of another instrument's covenants by reference. */
const INCORPORATED_BY_REFERENCE = /\b(?:covenants?|terms|provisions|agreements?|Articles?|Sections?)\b[^.]{0,240}?\b(?:are|is)\s+(?:hereby\s+)?incorporated\s+(?:herein\s+|into\s+this\s+\w+\s+)?by\s+reference\b|\bincorporate[sd]?\s+(?:herein\s+)?by\s+reference\b[^.]{0,200}?\b(?:covenants?|Articles?|Sections?)\b/i;

/** One operative covenant span: a section body, or a restated covenant's quoted text (never document-wide ROOT text). */

interface OperativeSpan { id: string; path: string; start: number; end: number; resolved: boolean; node: TreeNode | null }

export function covenantChecklist(tree: SectionTree, text: string): ChecklistItem[] {
  // Family per SECTION from the general classifier (lead-in prohibition object, heading, defined terms).
  // An ARTICLE with no numbered sections ("ARTICLE IX FINANCIAL COVENANT  Crown will not permit ...") is itself the
  // operative unit.
  const sections = tree.nodes.filter((n) => n.kind === "SECTION" || (n.kind === "ARTICLE" && !tree.nodes.some((c) => c.kind === "SECTION" && c.parentId === n.id)));
  const famOf = new Map<string, readonly string[]>();
  const restated: OperativeSpan[] = [];
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
    // Captioned clauses ("(a) Mergers, etc. Merge or consolidate ...", "(d) Mergers and Consolidations; Disposition of
    // Assets. The Borrower shall not consolidate ...") are covenant units of their own; a bare imperative under the
    // section's negative stem ("the Borrower will not ...: (a) Mergers, etc. Merge ...") reads as prohibited.
    if (!am && !(s.title && NOT_COVENANT_TITLE.test(s.title))) {
      for (const f of captionFamilies(text.slice(s.headingEnd, s.end))) fams.add(f as CovenantFamily);
    }
    // Enumerated covenant items: an item counts only when its own structural parent's lead-in is an obligor-bound
    // negative stem, or the item itself carries an obligor-bound prohibition.
    if (!am && !(s.title && (NOT_COVENANT_TITLE.test(s.title) || /condition|default|remed|termination|indemn|agent|trustee/i.test(s.title)))) for (const f of covenantItemFamilies(tree, text, s, articleStem(tree, text, s))) fams.add(f);
    if (!am && fams.has("RESTRICTED_PAYMENTS") && prohib.get(s.id)) for (const f of restrictedPaymentItemFamilies(text.slice(s.headingEnd, s.end))) fams.add(f as CovenantFamily);
    // Captioned covenant clauses inside a "Negative Covenants" section ("(g) Restricted Payments; Certain Payments of
    // Indebtedness . (A) The Borrower will not ...") are each a covenant unit.
    if (!am && /\bnegative covenants?\b|^\s*covenants?\b|\bcertain covenants\b/i.test(s.title ?? "")) for (const f of captionedClauseFamilies(text.slice(s.headingEnd, Math.min(s.end, s.headingEnd + 120000)))) fams.add(f as CovenantFamily);
    if (!am && fams.size && prohib.get(s.id)) for (const f of laterProhibitionFamilies(text.slice(s.headingEnd, Math.min(s.end, s.headingEnd + 8000)))) fams.add(f as CovenantFamily);
    // A Restricted Payments section must restrict the obligor's payments: a negated (or article-imperative) declare/pay/
    // make ... dividend/distribution/restricted payment, or an enumerated restricted act. Distribution mechanics of an
    // entity to its own holders (LLC preferred-return and liquidating distributions, in-kind distributions, charter
    // record dates) only name distributions.
    if (fams.has("RESTRICTED_PAYMENTS") && !am && !restrictsPayments(leadOf(s))) fams.delete("RESTRICTED_PAYMENTS");
    // Designating (Un)restricted Subsidiaries and suspending covenants on an investment-grade rating describe how the
    // covenants apply; they restrict no payment, investment or prepayment themselves.
    if (DESIGNATION_OR_SUSPENSION.test(`${s.title ?? ""} ${leadOf(s).slice(0, 200)}`)) for (const f of ["RESTRICTED_PAYMENTS", "INVESTMENTS", "PREPAYMENTS"] as const) fams.delete(f);
    famOf.set(s.id, [...fams]);
    // Each restated covenant is its own operative span (the quoted text), so its numbers never mix with the wrapper.
    if (!am) for (const [k, q] of restatedSpans(text, s.headingEnd, s.end).entries()) {
      const qf = classifyCovenantFamily({ title: q.title, parentTitle: null, leadIn: q.lead, covenantContext: true }).families.filter((f) => !fams.has(f));
      if (!qf.length) continue;
      const id = `${s.id}#restated${k}`;
      famOf.set(id, qf);
      restated.push({ id, path: `${s.path}@${q.start}-${q.end}`, start: q.start, end: q.end, resolved: q.resolved, node: null });
    }
  }
  const units: OperativeSpan[] = [...sections.map((n) => ({ id: n.id, path: n.path, start: n.start, end: n.end, resolved: true, node: n as TreeNode | null })), ...restated];
  // Restatements in text no section covers (an amendment with no numbered sections): each restated covenant is its
  // own span (the quoted text only). Document-wide ROOT text is never an operative span.
  const root = tree.nodes.find((n) => n.kind === "ROOT");
  if (root) {
    const covered = (i: number) => sections.some((s) => s.start <= i && s.end > i);
    for (const [k, q] of restatedSpans(text, 0, text.length, covered).entries()) {
      const fams = classifyCovenantFamily({ title: q.title, parentTitle: null, leadIn: q.lead, covenantContext: true }).families;
      if (!fams.length) continue;
      const id = `${root.id}#restated${k}`;
      famOf.set(id, [...fams]);
      units.push({ id, path: `${root.path || "ROOT"}@${q.start}-${q.end}`, start: q.start, end: q.end, resolved: q.resolved, node: null });
    }
    // Captioned covenant clauses in text no section covers: no bound span, so they fail closed (no ceiling from ROOT).
    const capFams = captionFamilies(text, covered);
    if (capFams.size) { const id = `${root.id}#captions`; famOf.set(id, [...capFams]); units.push({ id, path: `${root.path || "ROOT"}@captions`, start: 0, end: 0, resolved: false, node: null }); }
  }
  const inlineUnits: typeof units = [];
  // Run-in headings the tree did not split (flattened text: "... . N.NN <Caption>. <obligor> will not ..."): inline numbered units outside any classified section, kept only inside a covenant run (an adjacent inline
  // unit also opens with an obligor-bound prohibition).
  // (Inline units only fill families with no tree hit, so a family-bearing encloser does not block them.)
  for (const u of inlineCovenantUnits(text, () => false, sections.map((s) => s.start))) {
    const fams = new Set<string>(classifyCovenantFamily({ title: u.title, parentTitle: null, leadIn: u.lead, covenantContext: true }).families);
    if (fams.has("RESTRICTED_PAYMENTS") && !restrictsPayments(u.lead)) fams.delete("RESTRICTED_PAYMENTS");
    if (DESIGNATION_OR_SUSPENSION.test(`${u.title} ${u.lead.slice(0, 200)}`)) for (const f of ["RESTRICTED_PAYMENTS", "INVESTMENTS", "PREPAYMENTS"]) fams.delete(f);
    if (!fams.size) continue;
    const node = { id: `inline:${u.start}`, kind: "SECTION", path: u.path, title: u.title, start: u.start, headingEnd: u.headingEnd, end: u.end, depth: 1, parentId: null } as unknown as TreeNode;
    famOf.set(node.id, [...fams]); inlineUnits.push({ id: node.id, path: node.path, start: node.start, end: node.end, resolved: true, node });
  }
  // Prohibitions buried inside other clauses: inside a negative-covenant container (an ARTICLE/SECTION titled as
  // covenants but not affirmative, or holding at least two classified covenant sections), each obligor-bound
  // prohibition sentence whose lead-in object names a family is a covenant unit (the smallest section holding it).
  const buriedUnits: typeof units = [];
  const classified = new Set(units.filter((u) => famOf.get(u.id)?.length).map((u) => u.id));
  const containers = tree.nodes.filter((n) => (n.kind === "ARTICLE" || n.kind === "SECTION")
    && !/affirmative|remed|default|condition|representation|warrant|definition/i.test(n.title ?? "")
    && (/\bnegative covenants?\b|^\s*covenants?\b|\bcertain covenants\b|\bcovenants of\b/i.test(n.title ?? "")
      || (n.kind === "ARTICLE" && tree.nodes.filter((c) => c.parentId === n.id && classified.has(c.id)).length >= 2)
      || classified.has(n.id)));
  for (const c of containers) {
    const body = text.slice(c.headingEnd, Math.min(c.end, c.headingEnd + 200000));
    for (const m of body.matchAll(/(?:^|[.;:]\s+|\n\s*)((?:\([a-zA-Z0-9]{1,4}\)\s*)?(?:The|No|Neither|None of|Each)\s+[A-Z][^.;]{0,160}?\b(?:shall|will|may)\s+not\b[^.;]{0,400})/g)) {
      const sent = m[1]!, at = c.headingEnd + m.index! + (m[0].length - sent.length);
      if (!isObligorProhibitionLead(sent) || /\b(?:Trustee|Agent|Lenders?|Holders?|Secured Part(?:y|ies)|Purchasers?)\b/.test(sent.slice(0, 60))) continue;
      const v = classifyCovenantFamily({ title: null, parentTitle: null, leadIn: sent, covenantContext: true });
      // "all or substantially all" is a fundamental change, a sale-leaseback its own covenant, and a sentence about
      // dealings with Affiliates the affiliate covenant only.
      const fams = v.families.filter((f) => v.evidence.includes(`${f}:lead-in`) && !spuriousEvidence(f as ChecklistFamily, sent, 0)
        && !(f !== "AFFILIATE_TRANSACTIONS" && /\bAffiliates?\b/.test(sent))
        && !(f === "ASSET_SALES" && /substantially all|lease[- ]?back|rent or lease/i.test(sent)));
      if (!fams.length) continue;
      const holder = sections.filter((x) => x.start <= at && x.end > at).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] ?? c;
      if (/affiliate/i.test(holder.title ?? "") || /\bAffiliates?\b/.test(text.slice(at, at + 1200))) { const k = fams.indexOf("INVESTMENTS"); if (k >= 0) fams.splice(k, 1); }
      if (!fams.length) continue;
      const node: OperativeSpan = { id: `buried:${at}`, path: holder.path, start: holder.start, end: holder.end, resolved: true, node: holder as TreeNode };
      famOf.set(node.id, fams); buriedUnits.push(node);
      if (buriedUnits.length > 200) break;
    }
  }
  // Amendments and 8-K wrappers carry only part of the agreement: an absence is an absence from this document.
  const opening = text.slice(0, 4000);
  const partialDocument = /\bFORM\s+8-K\b|\bCURRENT REPORT\b/i.test(opening) || /\b(?:AMENDMENT|WAIVER|JOINDER|SUPPLEMENTAL INDENTURE|INCREMENTAL)\b[^\n]{0,80}\b(?:TO|NO\.)\b/.test(opening);
  // Covenants incorporated by reference from another instrument ("the covenants set forth in Article VI of the Credit
  // Agreement are hereby incorporated herein by reference") live outside this document.
  const incorporatesByReference = INCORPORATED_BY_REFERENCE.test(text);
  return CHECKLIST_FAMILIES.map((family) => {
    // Inline units only fill a family the tree found nowhere.
    const treeHits = units.filter((s) => famOf.get(s.id)?.includes(family));
    const inlineHits = inlineUnits.filter((s) => famOf.get(s.id)?.includes(family));
    const hits = treeHits.length ? treeHits : inlineHits.length ? inlineHits : buriedUnits.filter((s) => famOf.get(s.id)?.includes(family));
    if (hits.length === 0) {
      const ev = familyEvidence(text, family);
      const absent = ev.length === 0;
      return {
        family, status: absent ? ("ABSENT_VERIFIED" as const) : ("MISSING" as const), sectionPaths: [],
        ...(absent && (partialDocument || incorporatesByReference) ? { absentScope: "DOCUMENT_ONLY_INCORPORATED_BY_REFERENCE" as const } : {}),
        parts: { fixedCap: false, grower: false, ratio: false, exceptions: 0, prohibition: false }, needsInputs: [],
        note: absent
          ? partialDocument || incorporatesByReference
            ? "absent from this document, incorporated by reference (an amendment, 8-K or incorporating instrument; the base agreement may contain it); not treated as unlimited"
            : "no operative lead-in or heading for this family anywhere in the document; not treated as unlimited"
          : `no operative section found, but the text has ${family} covenant evidence (${ev[0]!.kind}: "${ev[0]!.excerpt}"); not treated as unlimited`,
      };
    }
    const spans = hits.map((h) => ({ path: h.path, start: h.start, end: h.end, resolved: h.resolved }));
    // Fail closed: an operative span whose end could not be bound yields no numbers and no CAP_FOUND.
    if (hits.some((h) => !h.resolved)) {
      return {
        family, status: "NEEDS_INPUT" as const, sectionPaths: [...new Set(hits.map((h) => h.path))],
        parts: { fixedCap: false, grower: false, ratio: false, exceptions: 0, prohibition: false }, needsInputs: ["OPERATIVE_SPAN_UNRESOLVED"],
        note: "operative covenant span could not be bound; no ceiling derived (fail closed)", spans,
      };
    }
    const body = hits.map((s) => text.slice(s.start, s.end)).join("\n");
    const fixedCap = /\$\s?[\d,]{3,}/.test(body);
    const grower = /greater of[^.;]{0,200}%/i.test(body);
    const ratio = /\d+(?:\.\d+)?\s*(?:to|:)\s*1(?:\.0+)?\b/i.test(body);
    const exceptions = hits.reduce((a, s) => a + (s.node ? tree.nodes.filter((n) => n.parentId === s.node!.id || isDesc(tree, n, s.node!)).filter((n) => n.kind === "CLAUSE" && n.depth === s.node!.depth + 1).length : 0), 0);
    const needsInputs: string[] = [];
    for (const [re, name] of [[/consolidated (?:adjusted )?ebitda/i, "EBITDA"], [/total assets/i, "TOTAL_ASSETS"], [/consolidated net income/i, "NET_INCOME"], [/available amount|builder basket|cumulative credit/i, "BUILDER_BASKET_BALANCE"], [/leverage ratio|coverage ratio|fixed charge/i, "RATIO_INPUTS"]] as const) {
      if (re.test(body)) needsInputs.push(name);
    }
    const status: ChecklistStatus = grower || ratio || (needsInputs.length > 0 && !fixedCap) ? "NEEDS_INPUT" : fixedCap ? "CAP_FOUND" : "CONDITIONS_LIMITED";
    return {
      family, status, sectionPaths: [...new Set(hits.map((h) => h.path))],
      parts: { fixedCap, grower, ratio, exceptions, prohibition: hits.some((h) => isProhibitive(text.slice(h.node ? h.node.headingEnd : h.start, h.end))) },
      needsInputs,
      note: status === "CONDITIONS_LIMITED" ? "limited by conditions/exceptions without a numeric cap; never unlimited by default" : "",
      spans,
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

/**
 * Indenture-style Restricted Payments covenants enumerate the restricted acts under one negative stem ("will not ...
 * directly or indirectly, to: (1) declare or pay any dividend ...; (2) purchase, redeem ... any Capital Stock ...;
 * (3) purchase, repurchase, redeem, defease ... any Subordinated Obligations ...; (4) make any Investment"). Each
 * enumerated restricted act that opens with a prepayment or investment verb-object is that covenant too.
 * Only the stem's own items (before the first "except"/proviso paragraph past 8000 chars) are read.
 */
function restrictedPaymentItemFamilies(body: string): Set<string> {
  const out = new Set<string>();
  const head = body.slice(0, 8000).replace(/\s+/g, " ");
  const stem = /\b(?:shall|will)\s+not\b[^.:]{0,300}?(?:directly or indirectly)?[^.:]{0,40}?(?:to|:)\s*(?=\((?:1|a|i)\))/i.exec(head);
  // Article-imperative layout: the negative stem sits in the article preamble and the section opens "(1) declare or pay".
  const imperative = /^\s*\((?:1|a|i|A)\)\s+(?:directly or indirectly,?\s*)?(?:declare|pay|make)\b/.test(head);
  if (!stem && !imperative) return out;
  const items = imperative || !stem ? head : head.slice(stem.index + stem[0].length);
  for (const m of items.matchAll(/\((?:\d{1,2}|[a-h]|i{1,3}|iv|v|vi{0,3})\)\s+([^]{10,400}?)(?=\((?:\d{1,2}|[a-h]|i{1,3}|iv|v|vi{0,3})\)\s|$)/gi)) {
    const it = m[1]!;
    if (/^\s*(?:dividends|distributions|payments?|any\s+\w+\s+(?:made|paid))\b/i.test(it)) continue; // an exception limb, not a restricted act
    if (/^\s*(?:directly or indirectly,?\s*)?(?:purchase|repurchase|redeem|defease|retire|prepay|make any (?:principal )?payment on)\b[^;]{0,300}\b(?:subordinated|junior)\b[^;]{0,60}\b(?:obligations|indebtedness|debt|notes)\b/i.test(it)) out.add("PREPAYMENTS");
    if (/^\s*(?:directly or indirectly,?\s*)?make\s+any\s+(?:Restricted\s+)?Investment\b/i.test(it)) out.add("INVESTMENTS");
  }
  return out;
}

function restrictsPayments(lead: string): boolean {
  const w = lead.slice(0, 2000);
  // Article imperative (an item or sentence that opens with "declare or pay ..." under the article's negative preamble): the first declare/pay/make within 250 chars, no modal before it, with its object.
  const im = /\b(?:declare|pay|make)\b/i.exec(w.slice(0, 250));
  if (im && !/\b(?:shall|will|may|must|is|are|be)\b/i.test(w.slice(0, im.index)) && /^[^.;]{0,160}?\b(?:dividends?|distributions?|restricted (?:junior )?payments?)\b/i.test(w.slice(im.index))) return true;
  if (/\b(?:Liquidator|record date|Preferred Return|Capital Accounts?)\b/.test(w.slice(0, 600))) return false;
  for (const m of w.matchAll(/\b(?:declare|pay|make|purchase|redeem)\b[^.;]{0,120}?\b(?:dividends?|distributions?|restricted (?:junior )?payments?|equity interests|capital stock)\b/gi)) {
    const before = w.slice(Math.max(0, m.index! - 220), m.index!);
    if (/(?:shall|will|may)\s+not\b|\b(?:no|neither)\s+[^.;]{1,140}?\b(?:shall|will|may)\b|\bnot\s+permit\b/i.test(before)) return true;
  }
  return false;
}

/**
 * A covenant section's later sentences that open with their own obligor prohibition ("... Fundamental Changes ... The
 * Company will not, nor will it permit any of its Subsidiaries to, convey, sell, lease, transfer or otherwise dispose of
 * ... assets") state a second covenant in the same section.
 */
const LATER_OBJECT: [string, RegExp][] = [
  ["ASSET_SALES", /\b(?:sell|lease|transfer|convey|dispose)\b[^.;]{0,200}?\b(?:assets?|propert(?:y|ies))\b/i],
  ["INVESTMENTS", /\bmake\b[^.;]{0,60}\b(?:investments?|loans? or advances?|advances? to)\b/i],
  ["RESTRICTED_PAYMENTS", /\b(?:declare|pay|make)\b[^.;]{0,80}\b(?:dividends?|restricted payments?)\b/i],
  ["PREPAYMENTS", /\b(?:prepay|redeem|repurchase|defease)\b[^.;]{0,120}\b(?:subordinated|junior)\b[^.;]{0,40}\b(?:indebtedness|debt|notes)\b/i],
];
function laterProhibitionFamilies(body: string): Set<string> {
  const out = new Set<string>();
  // Stop at an embedded heading the tree did not split ("... . Section N. <Caption>.").
  const stop = body.search(/(?:^|\n|[.;]\s+)(?:SECTION|Section|ARTICLE|Article)\s+[\dIVXLC]+\.?\s+[A-Z]/);
  if (stop > 0) body = body.slice(0, stop);
  for (const m of body.matchAll(/(?:^|[.;]\s+)((?:The|No|Neither)\s+[A-Z][\w-]*(?:\s+[\w-]+){0,4}?\s+(?:will|shall)\s+not\b[^.;]{0,400})/g)) {
    const sent = m[1]!;
    for (const [f, re] of LATER_OBJECT) {
      const om = re.exec(sent);
      if (!om || om.index > 220) continue;
      if (f === "ASSET_SALES" && /all or substantially all|affiliate/i.test(sent)) continue;
      out.add(f);
    }
  }
  return out;
}

function captionedClauseFamilies(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(/(?:^|\n)\s*\(([a-z]{1,2})\)\s+([A-Z][^.\n]{2,90}?)\s?\.[ \t]*(?=\n|\s+(?:\([A-Za-z0-9]{1,4}\)\s*)?[A-Z])/g)) {
    const title = m[2]!.trim();
    if (title.split(/\s+/).length > 12) continue;
    const lead = body.slice(m.index! + m[0].length, m.index! + m[0].length + 2000);
    if (!isObligorProhibitionLead(lead)) continue;
    const fams = new Set<string>(classifyCovenantFamily({ title, parentTitle: null, leadIn: lead, covenantContext: true }).families);
    if (fams.has("RESTRICTED_PAYMENTS") && !restrictsPayments(lead)) fams.delete("RESTRICTED_PAYMENTS");
    if (DESIGNATION_OR_SUSPENSION.test(`${title} ${lead.slice(0, 200)}`)) for (const f of ["RESTRICTED_PAYMENTS", "INVESTMENTS", "PREPAYMENTS"]) fams.delete(f);
    for (const f of fams) out.add(f);
  }
  return out;
}

const IMPERATIVE_OPEN = /^\W*(?:\([a-z0-9]{1,4}\)\s*)?(?:except[^,]{0,200},\s*)?(?:not\s+)?(?:directly\s+or\s+indirectly,?\s*)?(?:incur|create|make|declare|sell|enter into|conduct|merge|permit|pay|prepay|purchase|transfer|consolidate|dispose|cause or make)\b/i;
function inlineCovenantUnits(text: string, insideClassified: (i: number) => boolean, boundaries: number[] = []): { path: string; title: string; start: number; headingEnd: number; end: number; lead: string }[] {
  const re = /(?:^|[.;:)”"]\s+|\s{2,})(?:\d{1,3}[ \t]+(?=(?:SECTION|Section)?[ \t]*\d{1,2}\.\d))?((?:SECTION\s+|Section\s+)?(\d{1,2}\.\d{1,2})|(?:SECTION|Section)\s+(?:\d{3,4}))\.?\s+([A-Z][A-Za-z,;'’&\- ]{2,80}?)\s?\.\s+(?=[A-Z(“"])/g;
  const cands: { path: string; title: string; start: number; headingEnd: number }[] = [];
  for (const m of text.matchAll(re)) {
    const start = m.index! + (m[0].length - m[0].trimStart().length);
    if (insideClassified(start)) continue;
    cands.push({ path: m[2] ? normalizeSectionNumber(m[2]) : m[1]!.replace(/^\D+/, ""), title: m[3]!.trim(), start, headingEnd: m.index! + m[0].length });
    if (cands.length > 2000) break;
  }
  // A unit also ends at the next unit start the tree knows (its sections), so it never reads into a parsed section.
  // Heading lines with no closing period ("N.NN <Caption>" on its own line, body on the next).
  for (const m of text.matchAll(/(?:^|\n)[ \t]*((?:SECTION[ \t]+|Section[ \t]+)?(\d{1,2}\.\d{1,2}))\.?(?:[ \t]+|[ \t]*\n[ \t]*)([A-Z][^\n.]{2,80}?)[ \t]*\n(?![ \t]*\d{1,3}(?:[ \t]+\d{1,3})?[ \t]*\n)/g)) {
    const start = m.index! + (m[0].length - m[0].trimStart().length);
    if (insideClassified(start) || cands.some((c) => Math.abs(c.start - start) < 5)) continue;
    cands.push({ path: normalizeSectionNumber(m[2]!), title: m[3]!.trim(), start, headingEnd: m.index! + m[0].length });
    if (cands.length > 4000) break;
  }
  // Other heading shapes: dotless "Section NNN <Caption>" (3-4 digit numbers only after the Section keyword), an
  // all-caps "N. <CAPTION>" line, and run-in captioned clauses "(x) <Caption> . <obligor> shall not ..." (still subject
  // to the adjacent-prohibition run test below).
  const extra = [
    /(?:^|\n)[ \t]*((?:SECTION|Section)[ \t]+(\d{3,4}))\.?[ \t]+([A-Z][^\n.]{2,80}?)[ \t]*\.?[ \t]*(?:\n|(?=\([a-z0-9]\)|[A-Z]))/g,
    /(?:^|\n)[ \t]*((\d{1,2}))\.(?:[ \t]+|[ \t]*\n[ \t]*)([A-Z][A-Z,;'’&\- ]{4,80}?)[ \t]*\n/g,
    // An unnumbered caption on its own line ("Liens" then a blank line, then "The Issuer will not ...").
    /(?:^|\n[ \t]*\n)[ \t]*(()([A-Z][A-Za-z,;'’&\- ]{2,60}?))[ \t]*\n[ \t]*\n?[ \t]*(?=(?:The|No|Neither)\s)/g,
    // "N.NN <Caption> Enter into ..." / "N.NN <Caption> The Borrower shall not ...": no period, body on the same line.
    /(?:^|\n)[ \t]*(?:\d{1,3}[ \t]+(?=(?:SECTION|Section)[ \t]))?((?:SECTION[ \t]+|Section[ \t]+)?(\d{1,2}\.\d{1,2}))\.?[ \t]+([A-Z][a-z’']+,?(?:[ \t]+(?:[A-Z][a-z’']+|of|on|and|with|to|in|the|or|for|&),?)*?)[ \t]+(?=(?:Enter|Make|Create|Incur|Declare|Sell|Permit|Directly|Pay|Prepay|Merge|Consolidate|Purchase|Dispose|Transfer)\b|(?:The|No|Neither)[ \t]+(?:[A-Z][\w-]*[ \t]+){0,3}(?:shall|will)[ \t]+not\b)/g,
    /(?:^|\n)[ \t]*(\(([a-z]{1,2}|\d{1,2})\))[ \t]+([A-Z][A-Za-z,;'’&\- ]{0,60}?(?:\n[ \t]*[A-Za-z,;'’&\- ]{2,40})?)[ \t]?\.[ \t]+(?=[A-Z])/g,
  ];
  for (const r of extra) for (const m of text.matchAll(r)) {
    const start = m.index! + (m[0].length - m[0].trimStart().length);
    if (insideClassified(start) || cands.some((c) => Math.abs(c.start - start) < 5)) continue;
    cands.push({ path: m[2] || m[3]!.trim(), title: m[3]!.replace(/\s+/g, " ").trim(), start, headingEnd: m.index! + m[0].length });
    if (cands.length > 6000) break;
  }
  cands.sort((a, b) => a.start - b.start);
  const units = cands.map((c, i) => { const end = Math.min(cands[i + 1]?.start ?? text.length, c.headingEnd + 30000, ...boundaries.filter((b) => b > c.headingEnd)); return { ...c, end, lead: text.slice(c.headingEnd, Math.min(end, c.headingEnd + 2000)) }; });
  // Creditor-side actors (secured parties, holders, lenders, trustees, agents) are not obligor covenants.
  const CREDITOR_ACTOR = /^\W*(?:\([a-z0-9]{1,4}\)\s*)?(?:the\s+|each\s+|no\s+)?(?:[A-Z][\w-]*\s+){0,4}(?:Secured Parties|Secured Party|Holders?|Lenders?|Purchasers?|Trustees?|Agents?|Creditors?|Noteholders?)\b[^.;]{0,40}\b(?:will|shall|may)\s+not\b/i;
  // The prohibition must be in the unit's opening sentence (a representation "has not entered into ... ; the Borrower
  // shall ..." is not), and a non-covenant caption (investment company, margin regulations) never opens a unit.
  const opening = (l: string) => { const s0 = l.slice(0, 400); return /\b(?:shall|will|may)\s+not\b|\b(?:neither|none of)\b[^.]{0,150}\b(?:shall|will)\b|\bNo\s+(?:[A-Z][\w-]*\s+){1,4}(?:shall|will|may)\b/i.test(s0) || IMPERATIVE_OPEN.test(l); };
  const prohib = units.map((u) => isObligorProhibitionLead(u.lead) && opening(u.lead) && !NOT_COVENANT_TITLE.test(u.title) && !/margin regulations|investment company/i.test(u.title) && !CREDITOR_ACTOR.test(u.lead.slice(0, 200)));
  // Outside a run, a unit still counts when its caption and its lead-in object name the same covenant family.
  const titled = (u: { title: string; lead: string }) => { const ev = classifyCovenantFamily({ title: u.title, parentTitle: null, leadIn: u.lead }).evidence; return ev.some((e) => e.endsWith(":heading") && ev.includes(e.replace(/:heading$/, ":lead-in"))); };
  return units.filter((u, i) => prohib[i] && (prohib[i - 1] || prohib[i + 1] || titled(u)));
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

/** Families of captioned clauses ("(a) Prohibition of Fundamental Changes. Guarantor shall not ..."); offsets in skip are ignored. */
function captionFamilies(body: string, skip?: (offset: number) => boolean): Set<CovenantFamily> {
  const out = new Set<CovenantFamily>();
  const stem = /\b(?:shall|will)\s+not\b[^.]{0,300}:\s*$/i;
  let n = 0;
  for (const c of body.matchAll(/(?:^|\n)\s*\((?:[a-zA-Z]{1,2}|[ivx]{1,4}|\d{1,2})\)\s*([A-Z][^.\n]{3,90}?)\s*\.\s+(?=[A-Z])/g)) {
    if (c[1]!.split(/\s+/).length > 10 || skip?.(c.index!)) continue;
    if (++n > 400) break;
    const rest = body.slice(c.index! + c[0].length, c.index! + c[0].length + 1500);
    const underStem = stem.test(body.slice(Math.max(0, c.index! - 400), c.index!).trimEnd() + " ") || stem.test(body.slice(0, Math.min(c.index!, 600)));
    for (const f of classifyCovenantFamily({ title: c[1]!.trim(), parentTitle: null, leadIn: underStem ? rest.replace(/^\s*/, "") : rest, covenantContext: true }).families) out.add(f);
  }
  return out;
}

/** Lead-in of a node: its own text before its first child (the stem that governs its enumerated items). */
function ownLead(tree: SectionTree, text: string, n: TreeNode): string {
  const first = tree.nodes.filter((c) => c.parentId === n.id).sort((x, y) => x.start - y.start)[0];
  return text.slice(n.headingEnd, first ? first.start : Math.min(n.end, n.headingEnd + 2000));
}

/** Negative stem ending the parent's lead-in ("The Borrower shall not ... any of the following:"), bound to an obligor;
 *  exception/permission stems ("will not prohibit:", "may incur the following:", "unless:") never govern. */
function governingNegativeStem(lead: string): boolean {
  const tail = lead.trimEnd().slice(-500);
  if (!/:\s*$/.test(tail)) return false;
  const stem = /[^.:;]*\b(?:shall|will|may)\s+not\b[^.:]{0,300}:\s*$/i.exec(tail)?.[0];
  if (!stem || /\b(?:prohibit|apply|applies|restrict|limit|unless|ability|required|obligat\w*|be deemed|include)\b/i.test(stem)) return false;
  return isObligorProhibitionLead(stem);
}

function covenantItemFamilies(tree: SectionTree, text: string, s: TreeNode, inherited = false): Set<CovenantFamily> {
  const out = new Set<CovenantFamily>();
  if (s.end - s.start > 60000) return out;
  const leadCache = new Map<string, boolean>();
  for (const c of tree.nodes) {
    if (c.kind !== "CLAUSE" || c.start < s.headingEnd || c.end > s.end || !isDesc(tree, c, s)) continue;
    const parent = c.parentId ? tree.byId.get(c.parentId) : undefined;
    if (!parent) continue;
    let under = leadCache.get(parent.id);
    if (under === undefined) {
      const lead = ownLead(tree, text, parent);
      // A section's direct items inherit its article's obligor-bound negative stem ("the Borrower shall not ...:" before
      // Section 7.01) unless the section's own lead-in is a permission/exception stem.
      under = governingNegativeStem(lead) || (inherited && parent.id === s.id && !/\b(?:may|prohibit|apply|unless|permitted)\b/i.test(lead.trimEnd().slice(-300)));
      leadCache.set(parent.id, under);
    }
    const item = text.slice(c.headingEnd, Math.min(c.end, c.headingEnd + 600));
    const fams = under ? negatedItemFamilies(item, true) : isObligorProhibitionLead(item) ? negatedItemFamilies(item, false) : [];
    for (const f of fams) out.add(f);
  }
  return out;
}

/** Every "amended (and restated) in its entirety to read as follows:" instruction in a body, with its quoted text. */
function restatedTexts(body: string, skip?: (offset: number) => boolean): { title: string | null; lead: string }[] {
  return restatedSpans(body, 0, body.length, skip).map((q) => ({ title: q.title, lead: q.lead }));
}

const RESTATE_RE = /\b(?:Article|Section)\s+[\dIVXLC]+(?:\.\d+)?(?:\([a-z0-9]{1,4}\))*[^.:]{0,120}?\b(?:amended(?: and restated)?(?: in (?:its|their) entirety)?,?\s+(?:to read\s+)?as follows|(?:deleted|amended)(?: in (?:its|their) entirety)?(?: and)? (?:replaced|restated) (?:in (?:its|their) entirety )?(?:with|by) the following|amended by (?:deleting|replacing)[^:]{0,80}?(?:with|by) the following)[^:]{0,20}:\s*/gi;
/** Next amendment instruction or top-level amendment section after a restated text: where the quoted covenant ends. */
const NEXT_INSTRUCTION = /\n[^\S\n]*(?:\([a-z]{1,3}\)[^\S\n]*)?(?:(?:Article|Section)\s+[\dIVXLC]+(?:\.\d+)?(?:\([a-z0-9]+\))*[^\n.]{0,160}?\b(?:is|are)\s+hereby\s+(?:amended|deleted|replaced|restated)|SECTION\s+\d{1,2}\.\s+[A-Z]|ARTICLE\s+[IVXLC\d]+\b)|[”"][^\S\n]*[.;]?[^\S\n]*\n/g;
const MAX_RESTATED = 20000;

/**
 * Restated covenant spans in text[from, to): the quoted text after each instruction, ending at the next instruction,
 * the closing quote, or `to`. A span with no such end within MAX_RESTATED is unresolved (callers fail closed).
 */
function restatedSpans(text: string, from: number, to: number, skip?: (offset: number) => boolean): { title: string | null; lead: string; start: number; end: number; resolved: boolean }[] {
  const out: { title: string | null; lead: string; start: number; end: number; resolved: boolean }[] = [];
  const body = text.slice(from, to);
  for (const m of body.matchAll(RESTATE_RE)) {
    if (out.length >= 50) break;
    if (skip?.(from + m.index!)) continue;
    const qs = m.index! + m[0].length;
    // A restated definition ("The definition of \u201cX\u201d in Section 1.01 ... to read as follows: \u201cX\u201d means ...") is
    // a definition, not a covenant.
    const pre = body.slice(Math.max(0, m.index! - 240), m.index!);
    if (/\b(?:definitions?|defined\s+terms?)\b[^.;]*$/i.test(pre) || /^[\s\u201c"']*[^\u201d"]{2,80}[\u201d"]\s+(?:shall\s+)?means?\b/.test(body.slice(qs, qs + 120))) continue;
    const lead0 = body.slice(qs, qs + 2000);
    const lead1 = lead0.replace(/^[\s“”"'‘\u0080-\u009f]+/, "");
    const start = from + qs + (lead0.length - lead1.length);
    const tail = body.slice(start - from + 1, Math.min(body.length, start - from + 1 + MAX_RESTATED));
    NEXT_INSTRUCTION.lastIndex = 0;
    const e = NEXT_INSTRUCTION.exec(tail);
    const hitTo = to - start <= MAX_RESTATED;
    const end = e ? start + 1 + e.index + (/^[”"]/.test(e[0]) ? 1 : 0) : hitTo ? to : start;
    const h = /^(?:(?:section\s+)?\d{1,2}\.\d{1,3}\.?(?:\([a-z0-9]{1,4}\))?|ARTICLE\s+[IVXLC\d]+|\([a-z0-9]{1,4}\))\s+([A-Z][^.\n]{2,80}?)\s?[.\n]\s*/i.exec(lead1);
    out.push({ ...(h ? { title: h[1]!.trim(), lead: lead1.slice(h[0].length) } : { title: null, lead: lead1 }), start, end, resolved: !!e || hitTo });
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

const NEG = String.raw`(?:shall|will|may)\s+(?:\([a-z0-9]{1,4}\)\s*)?not\b|\bno\s+[^.;]{1,140}?\b(?:shall|will|may)\b`;
const FAMILY_EVIDENCE: Record<ChecklistFamily, { heading: RegExp; lead: RegExp }> = {
  DEBT: { heading: /\b(?:limitations? on |restrictions? on )?(?:indebtedness|incurrence of (?:indebtedness|debt)|debt)\b/i, lead: /(?:create|incur|assume|guarantee|suffer to exist|issue)[^.;]{0,100}?\b(?:indebtedness|debt)\b/i },
  LIENS: { heading: /\b(?:liens|negative pledge|limitations? on liens)\b/i, lead: /(?:create|incur|assume|grant|suffer to exist)[^.;]{0,100}?\b(?:liens?|mortgage|pledge|security interest)\b/i },
  RESTRICTED_PAYMENTS: { heading: /\b(?:restricted payments|dividends|distributions)\b/i, lead: /(?:declare|pay|make)[^.;]{0,80}?\b(?:dividends?|restricted payments?|distributions?)\b/i },
  INVESTMENTS: { heading: /\b(?:investments|loans,? advances|acquisitions)\b/i, lead: /(?:make|hold|acquire|purchase)[^.;]{0,80}?\b(?:investments?|advances?|capital contributions?)\b/i },
  ASSET_SALES: { heading: /\b(?:asset sales|asset transfers|dispositions?|sales? of assets|disposition of assets)\b/i, lead: /(?:sell|transfer|convey|dispose|lease)[^.;]{0,100}?\b(?:assets?|propert(?:y|ies)|business)\b|\b(?:make|consummate|effect)\b[^.;]{0,40}\bAsset (?:Sales?|Dispositions?)\b/i },
  AFFILIATE_TRANSACTIONS: { heading: /\btransactions? with affiliates\b|\baffiliate transactions\b/i, lead: /(?:enter into|permit to exist|engage in)[^.;]{0,140}?\baffiliates?\b/i },
  FUNDAMENTAL_CHANGES: { heading: /\b(?:mergers?|consolidations?|fundamental changes|merger,? consolidation)\b/i, lead: /\b(?:merge|consolidate|amalgamate|liquidate|dissolve)\b/i },
  PREPAYMENTS: { heading: /\b(?:prepayments? of (?:other )?(?:indebtedness|debt)|restricted debt payments|payments? of (?:subordinated|junior) (?:indebtedness|debt))\b/i, lead: /(?:prepay|redeem|repurchase|defease|retire)[^.;]{0,100}?\b(?:subordinated|junior)?\s*(?:indebtedness|debt)\b/i },
  FINANCIAL_RATIOS: { heading: /\b(?:leverage ratio|coverage ratio|financial covenants?|net worth|fixed charge|minimum liquidity)\b/i, lead: /\b(?:permit|maintain)\b[^.;]{0,100}?\b(?:leverage ratio|coverage ratio|net worth|fixed charge coverage(?: ratio)?|liquidity)\b[^.;]{0,400}?\b(?:to\s+(?:exceed|be\s+(?:less|greater|more)\s+than)|of\s+(?:not\s+)?(?:less|more|greater)\s+than|at\s+(?:least|not\s+less\s+than))|\b(?:maintain)\b[^.;]{0,40}?\b(?:leverage ratio|coverage ratio|net worth|fixed charge coverage)\b/i },
};
const DESIGNATION_OR_SUSPENSION = /\bdesignat\w*\b[^.;]{0,60}\b(?:un)?restricted subsidiar|\b(?:suspension|suspended|suspend)\b[^.;]{0,40}\bcovenants?\b|\bcovenant suspension\b|\bsuspended covenants?\b/i;
const NEG_RE = new RegExp(NEG, "i");
const NOT_COVENANT_TITLE = /\btrustee\b|^[“"]|[“"][^”"]{1,80}[”"]\s*means|definition|defined terms|representation|event of default|evidence of|references to|debt service|senior indebtedness|holder of|of stock|of shares|repayment|status as|opinion|dividend equivalents|designation of|suspension of|limited condition|ratio adjustments?|pro forma|title to|ownership of|pledged|net proceeds|disposition offer|investment company|\brating\b|existing (?:indebtedness|debt)|succession to business|\bterm loans\b|debt documents|purchase transactions/i;

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
  if (family === "ASSET_SALES" && (/\baffiliate transactions?\b/i.test(sent) || /\b(?:transactions?|agreements?|arrangements?|contracts?)\b[^.;]{0,80}\bwith\b[^.;]{0,30}\baffiliates?\b/i.test(sent.replace(/\([^()]{0,400}\)/g, " "))) && !/\b(?:all or substantially all|asset sale|asset disposition)\b/i.test(sent)) return true;
  if ((family === "INVESTMENTS" || family === "RESTRICTED_PAYMENTS" || family === "PREPAYMENTS") && DESIGNATION_OR_SUSPENSION.test(sent)) return true;
  // Debt-incurrence mechanics that mention repaying debt: ratio-debt / refinancing / lien-priority provisos, pro forma
  // calculation and classification rules ("shall not give effect to any repayment", "Ratio Debt ... not in excess of",
  // "the Indebtedness secured by the new Lien shall not have a higher priority", "shall classify Indebtedness").
  if (family === "PREPAYMENTS" && (/\b(?:Ratio Debt|Refinancing Indebtedness|Permitted Refinancing|secured by the new Lien|higher priority|pro forma|calculation|calculated|classify|reclassif|give effect to|Fixed Charge|Leverage Ratio|Coverage Ratio)\b/i.test(sent) || /^\s*(?:\(\w{1,4}\)\s*)?(?:provided|that)\b/i.test(sent))) return true;
  // Subordination payment blockage ("the Company shall not pay principal of ... or redeem the Securities ... if a default on
  // Designated Senior Indebtedness occurs") restricts paying the subordinated instrument itself, not a prepayment covenant.
  if (family === "PREPAYMENTS" && /\b(?:(?:Guarantor\s+)?Senior Indebtedness|Designated Senior|Payment Blockage|Senior Debt)\b/.test(sent) && /\b(?:the\s+)?(?:Securities|Notes|Subsidiary Guarantees?|Debentures)\b/.test(sent)) return true;
  // Statutory limits on an entity's own distributions to its members ("shall not make a distribution to any Member if such
  // distribution would violate Section 18-607 of the Act") restate law, not a negotiated restricted-payment covenant.
  if (family === "RESTRICTED_PAYMENTS" && /\bdistributions?\b[^.]{0,120}\bto\s+(?:(?:any|a|the|such|its)\s+)?(?:[A-Z]\w*\s+){0,3}(?:Members?|Partners?|Unitholders?)\b/i.test(sent) && /\b(?:would violate|in violation of|18-607|17-607|the Act|applicable law)\b/i.test(sent)) return true;
  // Representations (no-conflict / no-lien-creation / within-powers statements) and non-obligor actors (trustee,
  // transferees, a lender or agency) are not covenant evidence.
  if (/\b(?:do not|does not|will not)\s+(?:require|violate|conflict|contravene|result in (?:the creation|a breach))\b|\bare within\b[^.]{0,60}\bpowers\b/i.test(sent)) return true;
  if (/\b(?:the Trustee|any purchaser or other transferee|transferee in good faith|the RUS|the Administrative Agent|the Collateral Agent)\b[^.;]{0,40}\b(?:shall|will|may)\s+(?:not|ever)\b|\bunder no circumstances shall the\b|\bin no event shall any purchaser\b/i.test(sent)) return true;
  // Equity-award dividend equivalents (stock plans) are not a restricted payment.
  if (family === "RESTRICTED_PAYMENTS" && /\bdividend equivalents?\b/i.test(sent)) return true;
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
    // A cross-reference ("4.10 or any Permitted Investments", "1.00 or (2) the ...") is not a heading; an amendment
    // instruction naming the section's caption ("7.11 of the Credit Agreement (Transactions With Affiliates)") is.
    if ((!/^[A-Z]/.test(title) || /^(?:or|and|any|all|the|such)\b/i.test(title)) && !/^of (?:the|this)\b[^()]{0,60}\(/i.test(title)) continue;
    const hm = ev.heading.exec(title);
    // The family must lead the title (allowing "Limitation on", "Restrictions on", "Incurrence of"), not be one
    // word inside an unrelated heading ("Evidence of Debt", "Trustee as Holder of Senior Indebtedness").
    if (family === "RESTRICTED_PAYMENTS" && hm && !restrictsPayments(text.slice(m.index! + m[0].length, m.index! + m[0].length + 2000))) continue;
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
    if (family === "RESTRICTED_PAYMENTS" && !restrictsPayments(text.slice(m.index! + m[0].length, m.index! + m[0].length + 2000))) continue;
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
    // A designation / covenant-suspension paragraph states how covenants apply, not a restriction.
    if ((family === "INVESTMENTS" || family === "RESTRICTED_PAYMENTS" || family === "PREPAYMENTS") && DESIGNATION_OR_SUSPENSION.test(para.slice(0, 400))) continue outer;
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
