/**
 * Phase 3C Layer 1a - deterministic source-side economic/structural
 * inventory (task §9). Independently authored against this task's own
 * signal list - inevitable vocabulary overlap with coverage-audit/signals.ts
 * is expected (both detect the same real legal-drafting constructions for
 * different purposes: that module flags coverage REGIONS worth auditing,
 * this one extracts actual VALUE-BEARING items - real parsed numbers, not
 * boolean presence - for reconciliation against the proposed IR). The one
 * exception is countInlineEnumerationMarkers, reused directly from
 * coverage-audit/signals.ts rather than reimplemented: it is a pure,
 * generic, already-tested utility with no Phase 2B/2D conclusion
 * dependency, and task §8 explicitly wants the SAME generalized structural-
 * completeness signal here ("capable of raising suspicion on the
 * generalized shape of the LSB §6.13 omission without knowing §6.13
 * exists") - reusing a proven, already-tuned heuristic is the right call
 * per this task's own §5 "determine what can be reused safely" audit step.
 *
 * No company/package/family-specific keyword or threshold appears here
 * (Architecture Invariants #29) - every pattern is a generic legal-drafting
 * construction, and every numeric value comes from parsing the real source
 * text, never a hardcoded expectation.
 */
import { countInlineEnumerationMarkers } from "../coverage-audit/signals";
import { hashParts } from "../hashing";
import type { SourceInventory, SourceInventoryItem, SourceInventoryItemKind } from "./types";
import { EMPTY_SUPERSESSION_INDEX, getNodeSupersessionStatus } from "../amendment/operative-state";
import type { NodeSupersessionIndex } from "../amendment/types";
import { CONDITION_SUSPICION_PATTERNS } from "./condition-suspicion";

export const SOURCE_INVENTORY_ALGORITHM_VERSION = "phase-3c-source-inventory.v1";

interface PatternDef {
  kind: SourceInventoryItemKind;
  re: RegExp;
  /** Parse the matched text into a numeric value, or null for non-numeric kinds. */
  parseValue?: (match: RegExpMatchArray) => number | null;
}

function parseMoney(raw: string): number | null {
  const digits = raw.replace(/[^\d.]/g, "");
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

const PATTERNS: PatternDef[] = [
  { kind: "AMOUNT", re: /[$£€]\s?[\d,]+(?:\.\d+)?(?:\s?(?:million|billion))?/gi, parseValue: (m) => parseMoney(m[0]) },
  { kind: "PERCENT", re: /\d+(?:\.\d+)?\s?%/g, parseValue: (m) => Number(m[0].replace("%", "").trim()) / 100 },
  { kind: "RATIO", re: /\d+(?:\.\d+)?\s*(?:to\s*1\.0*\b|:\s*1\.0*\b|x\b)/gi, parseValue: (m) => Number((m[0].match(/^\d+(?:\.\d+)?/) ?? ["0"])[0]) },
  { kind: "COMPARISON_OPERATOR", re: /\b(?:greater of|lesser of|not to exceed|not less than|at least|no more than|not more than|shall not exceed|equal to or greater than|equal to or less than)\b/gi },
  // Phase 3F.1.6.RX-FINAL Terminal Closure, Workstream D (FINDING-5 /
  // BLOCKER-9's condition-omission defect class, THIRD recurrence - see
  // docs/phase-3f1-6-rx-final-blocker-closure/27-part-b-blocker9-
  // recertification.json). Every prior remediation (3F.1.6.R, then
  // 3F.1.6.RX Part A) fixed this by adding newly-discovered idioms to a
  // single flat CONDITIONAL_PHRASE alternation - which is exactly why the
  // exact same defect class kept recurring with different vocabulary. This
  // pass replaces "keep enumerating exact idioms" with condition-
  // suspicion.ts's compositional slot-grammar frames (see that file's own
  // extensive doc comment for the full rationale and honest limits): one
  // legacy alternation (kept verbatim, below, for non-regression) plus
  // eight new structural/morphological frames that generalize to drafting
  // variants none of them individually enumerate.
  //
  // Phase 3F.1-terminal Architecture Decision, Part A: this deterministic
  // pattern set was independently recertified a fourth time and found to
  // still be a closed-vocabulary architecture one level down - see
  // condition-suspicion.ts's own updated header. It is kept here UNCHANGED
  // as the cheap, precise, zero-cost evidence layer it always was; the
  // architectural fix for genuinely novel phrasing is
  // condition-suspicion-classifier.ts's real semantic LLM call, invoked as
  // an independent second routing gate in verify.ts - never by widening the
  // patterns in this file. Spread across multiple
  // PatternDef entries (all kind CONDITIONAL_PHRASE) rather than merged
  // into one regex, because one of the new frames (EVENT_TRIGGER_DEFINED_TERM)
  // is deliberately CASE-SENSITIVE (its entire signal is capitalization) and
  // cannot share a `gi` flag with the other, case-insensitive frames.
  ...CONDITION_SUSPICION_PATTERNS.map((p) => ({ kind: p.kind, re: p.re }) as PatternDef),
  { kind: "EXCEPTION_MARKER", re: /\b(?:provided,?\s+however|except\s+that|other than|excluding|with\s+the\s+exception\s+of)\b/gi },
  { kind: "PROVISO_MARKER", re: /\bprovided,?\s+further\b/gi },
  { kind: "SHARED_CAP_MARKER", re: /\b(?:combined with|shared\s+(?:capacity|basket)|in the aggregate (?:with|under))\b/gi },
  { kind: "BUILDER_SIGNAL", re: /\b(?:cumulative(?:ly)?|builder|Retained (?:Excess )?Cash Flow|Available Amount)\b/gi },
  { kind: "RECLASSIFICATION_SIGNAL", re: /\breclassif(?:y|ied|ication)|redesignat(?:e|ed|ion)\b/gi },
  { kind: "ENTITY_SCOPE_TERM", re: /\b(?:Restricted Subsidiary|Restricted Subsidiaries|Unrestricted Subsidiary|Unrestricted Subsidiaries|Borrower|Guarantor|Loan Part(?:y|ies)|domestic subsidiary|foreign subsidiary)\b/gi },
  { kind: "TRANSACTION_ACTION_SIGNAL", re: /\b(?:incur(?:rence)?|guarant(?:y|ee|eed)|pay(?:ment)?\s+(?:of\s+)?dividends?|make\s+(?:an\s+)?Investments?|dispose|disposition|repurchase|redeem|prepay|refinanc(?:e|ing))\b/gi },
];

/** A generic capitalized-multi-word-phrase heuristic for defined-metric mentions (e.g. "Consolidated EBITDA", "Total Net Leverage Ratio") - deliberately loose (any 2-4 capitalized words in a row), since precision here matters less than recall: false positives are filtered out downstream by reconciliation (they simply won't match anything in the IR, which is a correct, harmless NOT_ACCOUNTED_FOR-then-ignored outcome for a non-metric proper noun), while a missed real metric mention would silently weaken the inventory. */
const METRIC_MENTION_RE = /\b(?:[A-Z][a-zA-Z]*\s){1,3}[A-Z][a-zA-Z]*\b/g;

function collectPatternMatches(text: string, kind: SourceInventoryItemKind, re: RegExp, parseValue: PatternDef["parseValue"]): { rawText: string; numericValue: number | null; charStart: number; charEnd: number }[] {
  const out: { rawText: string; numericValue: number | null; charStart: number; charEnd: number }[] = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    out.push({ rawText: m[0], numericValue: parseValue ? parseValue(m) : null, charStart: m.index, charEnd: m.index + m[0].length });
    if (m.index === g.lastIndex) g.lastIndex++;
  }
  return out;
}

/**
 * Phase 3F.1.5 Workstream B (P1-11/Q8 fix) - `structuralNodeId` and
 * `supersessionIndex` are new, OPTIONAL, trailing parameters (every
 * existing call site - production and test - keeps compiling unchanged).
 * When the caller supplies both a real physical nodeId and a
 * supersessionIndex actually covering `sourceDocumentId`, the returned
 * inventory's own `supersessionStatus`/`supersessionReason` honestly
 * reflect amendment/operative-state.ts's verdict for that node. Omitting
 * either argument resolves UNKNOWN_SUPERSESSION_STATUS (see
 * getNodeSupersessionStatus) - never CURRENT_OPERATIVE by silent default -
 * so a reconciliation built from this inventory can never mistake "nobody
 * checked" for "confirmed current." This never changes which items are
 * detected/extracted from `operativeSourceText` itself (that text's own
 * currentness is the CALLER's responsibility per this module's own
 * "operativeSourceText - already resolved against Phase 2G's amendment
 * chain" doc comment on SemanticCompilerInput); this only makes that
 * caller-side assumption checkable rather than implicit.
 */
export function buildSourceInventory(candidateRef: string, operativeSourceText: string, sourceDocumentId: string, sourceCitation: string, structuralNodeKey: string | null, structuralNodeId: string | null = null, supersessionIndex: NodeSupersessionIndex = EMPTY_SUPERSESSION_INDEX): SourceInventory {
  const items: SourceInventoryItem[] = [];

  for (const pattern of PATTERNS) {
    for (const hit of collectPatternMatches(operativeSourceText, pattern.kind, pattern.re, pattern.parseValue)) {
      items.push({
        itemId: hashParts([candidateRef, pattern.kind, String(hit.charStart), String(hit.charEnd), SOURCE_INVENTORY_ALGORITHM_VERSION]),
        kind: pattern.kind,
        rawText: hit.rawText,
        numericValue: hit.numericValue,
        sourceDocumentId,
        sourceCitation,
        structuralNodeKey,
        charStart: hit.charStart,
        charEnd: hit.charEnd,
      });
    }
  }

  for (const hit of collectPatternMatches(operativeSourceText, "METRIC_MENTION", METRIC_MENTION_RE, undefined)) {
    items.push({
      itemId: hashParts([candidateRef, "METRIC_MENTION", String(hit.charStart), String(hit.charEnd), SOURCE_INVENTORY_ALGORITHM_VERSION]),
      kind: "METRIC_MENTION",
      rawText: hit.rawText,
      numericValue: null,
      sourceDocumentId,
      sourceCitation,
      structuralNodeKey,
      charStart: hit.charStart,
      charEnd: hit.charEnd,
    });
  }

  const genuineMarkers = countInlineEnumerationMarkers(operativeSourceText);
  for (const marker of genuineMarkers) {
    items.push({
      itemId: hashParts([candidateRef, "INDEPENDENT_LIST_ITEM", marker, SOURCE_INVENTORY_ALGORITHM_VERSION]),
      kind: "INDEPENDENT_LIST_ITEM",
      rawText: marker,
      numericValue: null,
      sourceDocumentId,
      sourceCitation,
      structuralNodeKey,
      charStart: -1,
      charEnd: -1,
    });
  }

  const supersession = getNodeSupersessionStatus(supersessionIndex, sourceDocumentId, structuralNodeId);

  return {
    candidateRef,
    items,
    apparentIndependentUnitCount: genuineMarkers.length,
    apparentIndependentUnitEvidence: genuineMarkers,
    inventoryAlgorithmVersion: SOURCE_INVENTORY_ALGORITHM_VERSION,
    supersessionStatus: supersession.status,
    supersessionReason: supersession.reason,
  };
}
