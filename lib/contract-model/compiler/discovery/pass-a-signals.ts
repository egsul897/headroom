/**
 * Phase 2B Pass A - deterministic, deliberately over-selecting candidate
 * generation (task §8 Pass A). Operates over Phase 2A's structural index -
 * every ARTICLE/SECTION/SUBSECTION/CLAUSE/SUBCLAUSE node's OWN text (never
 * the whole document rescanned per node - task §19) is checked against a
 * fixed set of cheap, generic legal-drafting signals. This is NOT the final
 * semantic decision (task §8): a node with zero signals is still eligible
 * for discovery via neighborhood expansion (Pass C) if a sibling/parent
 * fires, and a node with many signals can still be rejected by Pass B.
 *
 * No family/company/document-specific keyword appears here - every pattern
 * is a generic legal-drafting construction that could appear in any debt
 * document (task §20).
 */
import type { StructuralIndex } from "../structural-index";
import type { StructuralNode } from "../types";
import type { DeterministicCandidate } from "./types";
import { EMPTY_SUPERSESSION_INDEX, getNodeSupersessionStatus } from "../amendment/operative-state";
import type { NodeSupersessionIndex } from "../amendment/types";

interface SignalPattern {
  name: string;
  re: RegExp;
}

const SIGNAL_PATTERNS: SignalPattern[] = [
  { name: "dollar_value", re: /\$[\d,]+(?:\.\d+)?/ },
  { name: "percentage", re: /\d+(?:\.\d+)?%/ },
  { name: "ratio_expression", re: /\d+(?:\.\d+)?\s*(?:x\b|to\s*1\.0+|:\s*1\.0+)/i },
  { name: "prohibitive_construction", re: /\b(?:shall not|will not|may not|shall be prohibited|no .*shall)\b/i },
  { name: "permission_construction", re: /\b(?:may |is permitted to|shall be (?:entitled|permitted))\b/i },
  { name: "exception_marker", re: /\b(?:except|provided that|provided,? however|other than|notwithstanding)\b/i },
  { name: "permitted_construct", re: /\bPermitted\s+[A-Z][a-zA-Z]+/ },
  { name: "greater_lesser_of", re: /\b(?:greater|lesser) of\b/i },
  { name: "covenant_verb", re: /\b(?:incur|create|assume|grant|guarantee|pledge|dispose|sell|transfer|merge|consolidate|liquidate|dissolve|designate|redesignate|declare|pay|make (?:any )?(?:Restricted Payment|Investment)|repurchase|redeem)\b/i },
  { name: "cure_or_trigger", re: /\b(?:cure|remedy|springing|trigger event|breach)\b/i },
  { name: "financial_metric", re: /\b(?:EBITDA|Net Income|Leverage Ratio|Coverage Ratio|Fixed Charges|Total Assets|Net Worth)\b/i },
  { name: "refinancing", re: /\b(?:refinanc|refund|replace(?:ment|d)? (?:of|the) (?:existing )?Indebtedness)\b/i },
  { name: "builder_language", re: /\b(?:cumulative|Available Amount|builder basket|Retained Excess Cash Flow)\b/i },
  { name: "shared_cap", re: /\b(?:aggregate(?:d)? (?:amount|basket)|combined (?:with|capacity)|shared (?:capacity|basket))\b/i },
];

const HEADLINE_HEADING_WORDS = /\b(?:Indebtedness|Debt|Liens?|Restricted Payments?|Investments?|Dispositions?|Asset Sales?|Affiliate Transactions?|Financial Covenants?|Guarant(?:y|ies|ee)|Subsidiar(?:y|ies)|Merger|Consolidation|Fundamental Changes?|Change of Control|Sale.?Leaseback|Prepayment|Subordinat|Business|Line of Business|Nature of Business|Amendment|Modification)\b/i;

function detectSignals(text: string): string[] {
  return SIGNAL_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}

/**
 * Runs Pass A over every structural node in one document. A node becomes a
 * deterministic candidate if (a) its own text fires at least one signal, or
 * (b) it is a top-level SECTION whose heading contains a headline covenant
 * word regardless of body signals (a headline section must never be
 * dropped merely because its own chapeau text before the first sub-item is
 * signal-free - the real economics live in its children, which are
 * evaluated independently in the same pass).
 *
 * Phase 3F.1.5 Workstream B (P1-11/Q8 fix) - `supersessionIndex` is
 * OPTIONAL and additive: this function's own job (over-inclusive candidate
 * generation from raw structural text) is unchanged, and a node whose text
 * is historically superseded is still generated as a candidate (history
 * must remain queryable - task's own §8 recall-first discipline is
 * unaffected). What changes is that every candidate now carries an
 * explicit, honest `supersessionStatus` rather than implying "current" by
 * silent omission - see amendment/operative-state.ts's own
 * getNodeSupersessionStatus for the full three-way, fail-closed contract.
 * Omitting the argument (every call site until a caller is wired to real
 * amendment/operative-state output) resolves EMPTY_SUPERSESSION_INDEX,
 * which marks every candidate UNKNOWN_SUPERSESSION_STATUS - an honest
 * downgrade from the prior implicit "current," never a silent regression
 * to it.
 */
export function runPassADeterministicSignals(documentId: string, index: StructuralIndex, supersessionIndex: NodeSupersessionIndex = EMPTY_SUPERSESSION_INDEX): DeterministicCandidate[] {
  const nodes = index.allNodes().filter((n) => n.documentId === documentId);
  const candidates: DeterministicCandidate[] = [];

  for (const node of nodes) {
    const ownText = index.getNodeText(node.nodeId, "OWN");
    const signals = detectSignals(ownText);
    const isHeadlineSection = node.nodeType === "SECTION" && HEADLINE_HEADING_WORDS.test(node.heading);
    if (isHeadlineSection && !signals.includes("headline_heading")) signals.push("headline_heading");

    if (signals.length === 0) continue;
    const supersession = getNodeSupersessionStatus(supersessionIndex, documentId, node.nodeId);
    candidates.push({ documentId, nodeKey: node.nodeKey, nodeId: node.nodeId, sectionRef: node.sectionRef, signals, signalScore: signals.length, supersessionStatus: supersession.status, supersessionReason: supersession.reason });
  }

  return candidates;
}

/** Exposed for Pass C neighborhood expansion - the same enclosing-node text a human reviewer would read to decide whether an exception's own prohibition was missed. */
export function nodeHeading(node: StructuralNode): string {
  return node.heading;
}
