/**
 * Clause roles, defined-term / cross-reference resolution, and a per-family covenant
 * checklist over a SectionTree. Deterministic; no AI / LLM calls; nothing invented.
 * A family with no numeric cap is NEVER reported as unlimited.
 */
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
  for (const n of tree.nodes) if (n.kind === "SECTION" || n.kind === "CLAUSE") if (!index.has(n.path)) index.set(n.path, n);
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

const FAMILY_TITLE: Record<ChecklistFamily, RegExp> = {
  DEBT: /\b(?:indebtedness|debt)\b(?!.*(?:prepay|payment))/i,
  LIENS: /\bliens?\b|negative pledge/i,
  RESTRICTED_PAYMENTS: /restricted payments?|dividends?|distributions?/i,
  INVESTMENTS: /\binvestments?\b|loans?,? advances/i,
  ASSET_SALES: /asset sales?|dispositions?|sale of assets|disposal|sale[- ]leaseback/i,
  AFFILIATE_TRANSACTIONS: /affiliates?/i,
  FUNDAMENTAL_CHANGES: /fundamental changes?|mergers?|consolidat/i,
  PREPAYMENTS: /prepayments?.*(?:debt|indebtedness)|(?:junior|subordinated).*(?:payment|prepay)|payments? of (?:certain )?(?:debt|indebtedness)/i,
  FINANCIAL_RATIOS: /financial (?:condition )?covenants?|leverage ratio|coverage ratio|fixed charge/i,
};

export type ChecklistStatus = "MISSING" | "NEEDS_INPUT" | "CONDITIONS_LIMITED" | "CAP_FOUND";

export interface ChecklistItem {
  family: ChecklistFamily;
  status: ChecklistStatus;
  sectionPaths: string[];
  parts: { fixedCap: boolean; grower: boolean; ratio: boolean; exceptions: number; prohibition: boolean };
  needsInputs: string[];
  note: string;
}

export function covenantChecklist(tree: SectionTree, text: string): ChecklistItem[] {
  const sections = tree.nodes.filter((n) => n.kind === "SECTION" && n.title);
  return CHECKLIST_FAMILIES.map((family) => {
    let hits = sections.filter((s) => FAMILY_TITLE[family].test(s.title!));
    // Prefer operative (negative/financial covenant) sections over definitions & reps.
    const operative = hits.filter((s) => {
      const body = text.slice(s.headingEnd, Math.min(s.end, s.headingEnd + 1500));
      return family === "FINANCIAL_RATIOS" ? /ratio|not (?:permit|exceed|be less)/i.test(body) : isProhibitive(body);
    });
    if (operative.length) hits = operative;
    else hits = [];
    if (hits.length === 0) {
      return { family, status: "MISSING" as const, sectionPaths: [], parts: { fixedCap: false, grower: false, ratio: false, exceptions: 0, prohibition: false }, needsInputs: [], note: "no operative section found; not treated as unlimited" };
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
      family, status, sectionPaths: hits.map((h) => h.path),
      parts: { fixedCap, grower, ratio, exceptions, prohibition: hits.some((h) => isProhibitive(text.slice(h.headingEnd, h.end))) },
      needsInputs,
      note: status === "CONDITIONS_LIMITED" ? "limited by conditions/exceptions without a numeric cap; never unlimited by default" : "",
    };
  });
}

function isDesc(tree: SectionTree, n: TreeNode, anc: TreeNode): boolean {
  let p = n.parentId ? tree.byId.get(n.parentId) : undefined;
  while (p) {
    if (p.id === anc.id) return true;
    p = p.parentId ? tree.byId.get(p.parentId) : undefined;
  }
  return false;
}
