/**
 * Phase 3C Layer 1c - deterministic reconciliation (task §11). Compares the
 * source-side inventory against the IR-side inventory and classifies each
 * item ACCOUNTED_FOR / POSSIBLY_ACCOUNTED_FOR / NOT_ACCOUNTED_FOR / IR_ONLY
 * / AMBIGUOUS. This module NEVER itself declares a semantic error (task
 * §11's own "do not automatically declare semantic error from
 * NOT_ACCOUNTED_FOR") - it only classifies; verify.ts (Layer 3/4) decides
 * what a classification becomes (a finding, a Layer 2 referral, or nothing).
 *
 * No company/package/section-specific logic anywhere in this file
 * (Architecture Invariants #29) - every comparison is a generic numeric-
 * value/text-containment/count comparison that would behave identically on
 * a package this module has never seen.
 */
import type { IrInventory, IrInventoryItem, ReconciliationItem, ReconciliationResult, RetrievedEvidenceInventory, RetrievedEvidenceInventoryEntry, SourceInventory, SourceInventoryItem } from "./types";
import { citationNamesDefinition, citationNamesSection, normalizeTermScopeKey } from "./retrieved-evidence";

const NUMERIC_TOLERANCE_RELATIVE = 1e-6;

function numbersMatch(a: number, b: number): boolean {
  if (a === 0 || b === 0) return Math.abs(a - b) < 1e-9;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) < NUMERIC_TOLERANCE_RELATIVE;
}

const NUMERIC_KIND_MAP: Record<string, IrInventoryItem["kind"]> = { AMOUNT: "AMOUNT", PERCENT: "PERCENT", RATIO: "RATIO" };

/**
 * F-3: a source AMOUNT and an IR AMOUNT compare in CANONICAL magnitude (scale already resolved by amount-parser.ts),
 * and only when their currencies are compatible: two stated, different currencies never match ("$720 million" vs
 * "€720 million" is not the same figure; no FX conversion exists here). A side with no stated currency (an IR NUMBER
 * node, a pre-F-3 inventory) stays comparable on magnitude alone - the pre-existing contract, preserved.
 */
function currenciesCompatible(source: SourceInventoryItem, ir: IrInventoryItem): boolean {
  const a = source.currency ?? null, b = ir.currency ?? null;
  return a === null || b === null || a === b;
}

/**
 * Numeric reconciliation - the core, reliable deterministic mechanism (task
 * §6's "cheapest reliable mechanism should detect each error class first").
 * A source-stated dollar/percent/ratio figure absent from every compiled
 * rule's IR is exactly the generalized shape of a missing basket (task §8's
 * own "capable of raising suspicion on the generalized shape of the LSB
 * §6.13 omission without knowing §6.13 exists") - this function has no
 * knowledge of any specific package, section, or dollar figure; it only
 * ever compares "does this number appear anywhere in the other inventory."
 */
function reconcileNumericItems(sourceItems: SourceInventoryItem[], irItems: IrInventoryItem[]): { items: ReconciliationItem[]; claimedIrItemIds: Set<string> } {
  const items: ReconciliationItem[] = [];
  const claimedIrItemIds = new Set<string>();

  for (const sourceItem of sourceItems) {
    const irKind = NUMERIC_KIND_MAP[sourceItem.kind];
    if (!irKind) continue;
    if (sourceItem.numericValue === null) {
      // F-3: an AMOUNT whose scale token could not be resolved safely ("$720 mn", "$720 million billion") is never a
      // confident number - it is surfaced for review as AMBIGUOUS, never silently skipped and never compared.
      if (sourceItem.kind === "AMOUNT" && sourceItem.scaleStatus === "UNRESOLVED") items.push({ classification: "AMBIGUOUS", sourceItem, irItems: [], reason: `source AMOUNT "${sourceItem.rawText}" carries a scale token this grammar does not resolve (${sourceItem.scaleToken ?? "?"}) - magnitude withheld, review required` });
      continue;
    }
    const magnitudeMatches = irItems.filter((ir) => ir.kind === irKind && ir.numericValue !== null && numbersMatch(ir.numericValue, sourceItem.numericValue!));
    const matches = irKind === "AMOUNT" ? magnitudeMatches.filter((ir) => currenciesCompatible(sourceItem, ir)) : magnitudeMatches;
    const provenance = sourceItem.kind === "AMOUNT" ? ` (canonical ${sourceItem.numericValue}${sourceItem.currency ? ` ${sourceItem.currency}` : ""}${sourceItem.scaleStatus === "RESOLVED" ? ` = ${sourceItem.parsedAmount} x ${sourceItem.scaleMultiplier} "${sourceItem.scaleToken}"` : ""})` : "";
    if (matches.length > 0) {
      for (const m of matches) claimedIrItemIds.add(m.itemId);
      items.push({ classification: "ACCOUNTED_FOR", sourceItem, irItems: matches, reason: `source ${sourceItem.kind} ${sourceItem.numericValue}${provenance} matches ${matches.length} compiled IR ${irKind} node(s)` });
    } else if (magnitudeMatches.length > 0) {
      items.push({ classification: "NOT_ACCOUNTED_FOR", sourceItem, irItems: [], reason: `source ${sourceItem.kind} ${sourceItem.numericValue} ${sourceItem.currency ?? ""} (from "${sourceItem.rawText}")${provenance} matches the magnitude of ${magnitudeMatches.length} compiled IR ${irKind} node(s) but in a different currency (${[...new Set(magnitudeMatches.map((m) => m.currency ?? "(none)"))].join(", ")}) - not the same figure` });
    } else {
      items.push({ classification: "NOT_ACCOUNTED_FOR", sourceItem, irItems: [], reason: `source ${sourceItem.kind} ${sourceItem.numericValue} (from "${sourceItem.rawText}")${provenance} does not appear as a ${irKind} value anywhere in the compiled IR` });
    }
  }

  return { items, claimedIrItemIds };
}

/**
 * F-4 - cross-source collision safety (mission §11): an authenticated retrieved figure may support an IR value ONLY
 * when that value is explicitly scoped to the evidence - the IR item belongs to the IRDefinition of that very term
 * (ownerTermName), or its own provenance citation names that definition ("Definition of X"), or, for a retrieved
 * section, its citation is that section or one of its sub-clauses. Nothing else: a same-magnitude figure in an
 * unrelated retrieved definition never "accounts for" an IR value (no global numeric pooling), and no term or
 * section is special-cased.
 */
function irItemScopedToEvidence(ir: IrInventoryItem, ev: RetrievedEvidenceInventoryEntry): boolean {
  if (ev.requestKind === "DEFINITION") {
    if (ir.ownerTermName && normalizeTermScopeKey(ir.ownerTermName) === ev.scopeKey) return true;
    if (ir.sourceCitation && citationNamesDefinition(ir.sourceCitation, ev.scopeKey)) return true;
    return false;
  }
  return ir.sourceCitation !== null && citationNamesSection(ir.sourceCitation, ev.scopeKey);
}

function evidenceRef(ev: RetrievedEvidenceInventoryEntry): NonNullable<ReconciliationItem["evidence"]> {
  return { provenanceClass: "AUTHENTICATED_RETRIEVED", evidenceId: ev.evidenceId, requestKind: ev.requestKind, requestKey: ev.requestKey, documentId: ev.documentId, sourceNodeId: ev.sourceNodeId, charStart: ev.charStart, charEnd: ev.charEnd, contentHash: ev.contentHash };
}

function describeEvidence(ev: RetrievedEvidenceInventoryEntry): string {
  const where = ev.charStart !== null && ev.charEnd !== null ? `span [${ev.charStart}, ${ev.charEnd})` : "amendment-recorded current text";
  return `${ev.requestKind === "DEFINITION" ? `definition of "${ev.requestKey}"` : `section ${ev.requestKey}`} - authenticated retrieved source (document ${ev.documentId}, node ${ev.sourceNodeId ?? "(none)"}, ${where}, sha256 ${ev.contentHash.slice(0, 12)}...)`;
}

/**
 * F-4 - reconciliation against AUTHENTICATED retrieved evidence, after the local window has had first claim.
 * Forward: a retrieved figure that matches an IR value scoped to it ACCOUNTS FOR that value (the IR_ONLY
 * false-discrepancy this fix closes). Reverse (REPRESENTED_DEFINITION with an expression only, and only for text
 * outside the local window): a figure in the authentic definition text with no matching value anywhere in that
 * definition's own IR is NOT_ACCOUNTED_FOR - the verifier compares the IR against the raw source in both
 * directions, never trusting the compiler's excerpt of it. REFERENCED_ONLY evidence supports; it never accuses.
 */
function reconcileRetrievedEvidence(retrieved: RetrievedEvidenceInventory, irItems: IrInventoryItem[], claimedIrItemIds: Set<string>): ReconciliationItem[] {
  const out: ReconciliationItem[] = [];
  for (const ev of retrieved.entries) {
    const scopedIr = irItems.filter((ir) => irItemScopedToEvidence(ir, ev));
    for (const sourceItem of ev.items) {
      const irKind = NUMERIC_KIND_MAP[sourceItem.kind];
      if (!irKind) continue;
      if (sourceItem.numericValue === null) {
        if (sourceItem.kind === "AMOUNT" && sourceItem.scaleStatus === "UNRESOLVED" && ev.reverseComparable) out.push({ classification: "AMBIGUOUS", sourceItem, irItems: [], reason: `source AMOUNT "${sourceItem.rawText}" in the ${describeEvidence(ev)} carries a scale token this grammar does not resolve (${sourceItem.scaleToken ?? "?"}) - magnitude withheld, review required`, evidence: evidenceRef(ev) });
        continue;
      }
      const matches = scopedIr.filter((ir) => ir.kind === irKind && ir.numericValue !== null && numbersMatch(ir.numericValue, sourceItem.numericValue!) && (irKind !== "AMOUNT" || currenciesCompatible(sourceItem, ir)));
      const provenance = sourceItem.kind === "AMOUNT" ? ` (canonical ${sourceItem.numericValue}${sourceItem.currency ? ` ${sourceItem.currency}` : ""}${sourceItem.scaleStatus === "RESOLVED" ? ` = ${sourceItem.parsedAmount} x ${sourceItem.scaleMultiplier} "${sourceItem.scaleToken}"` : ""})` : "";
      if (matches.length > 0) {
        for (const m of matches) claimedIrItemIds.add(m.itemId);
        out.push({ classification: "ACCOUNTED_FOR", sourceItem, irItems: matches, reason: `source ${sourceItem.kind} ${sourceItem.numericValue}${provenance} from "${sourceItem.rawText}" in the ${describeEvidence(ev)} matches ${matches.length} compiled IR ${irKind} node(s) scoped to it`, evidence: evidenceRef(ev) });
      } else if (ev.reverseComparable) {
        out.push({ classification: "NOT_ACCOUNTED_FOR", sourceItem, irItems: [], reason: `source ${sourceItem.kind} ${sourceItem.numericValue} (from "${sourceItem.rawText}")${provenance} in the ${describeEvidence(ev)} does not appear as a ${irKind} value anywhere in the compiled IR definition(s) ${ev.representedDefinitionIds.join(", ")} that represent this term`, evidence: evidenceRef(ev) });
      }
    }
  }
  for (const claim of retrieved.rejectedCompilerClaims) {
    out.push({ classification: "AMBIGUOUS", sourceItem: null, irItems: [], reason: `compiler-claimed retrieved source (${claim.requestKind.toLowerCase()} "${claim.requestKey}") could not be authenticated - ${claim.reason} - unauthenticated retrieved text is never admitted as evidence; every IR value that depends on it remains unsupported and requires review` });
  }
  return out;
}

/** Every IR numeric item never claimed by a source match above is a candidate unsupported addition (task §3's own "unsupported additions" attack class) - reported as IR_ONLY, never auto-declared fabricated (a legitimately-derived intermediate value, e.g. a computed sub-total, can legitimately have no single matching source figure). */
function findIrOnlyNumericItems(irItems: IrInventoryItem[], claimedIrItemIds: Set<string>): ReconciliationItem[] {
  return irItems
    .filter((ir) => (ir.kind === "AMOUNT" || ir.kind === "PERCENT" || ir.kind === "RATIO") && !claimedIrItemIds.has(ir.itemId))
    .map((ir) => ({ classification: "IR_ONLY" as const, sourceItem: null, irItems: [ir], reason: `compiled IR ${ir.kind} value ${ir.numericValue} at ${ir.irPath} has no matching source-side figure` }));
}

/** Fuzzy, low-confidence metric/defined-term-name matching - the source-side METRIC_MENTION detector is deliberately over-inclusive (task's own disclosed "false positives are filtered out downstream" design), so a miss here is POSSIBLY_ACCOUNTED_FOR, never a material NOT_ACCOUNTED_FOR on its own. */
function reconcileMetricMentions(sourceItems: SourceInventoryItem[], irItems: IrInventoryItem[]): ReconciliationItem[] {
  const metricRefs = irItems.filter((ir) => ir.kind === "METRIC_REFERENCE" || ir.kind === "DEFINED_TERM_REFERENCE");
  const out: ReconciliationItem[] = [];
  for (const sourceItem of sourceItems.filter((i) => i.kind === "METRIC_MENTION")) {
    const needle = sourceItem.rawText.toLowerCase();
    const matches = metricRefs.filter((ir) => {
      const hay = (ir.textValue ?? "").toLowerCase();
      return hay.length > 0 && (hay.includes(needle) || needle.includes(hay));
    });
    if (matches.length > 0) out.push({ classification: "ACCOUNTED_FOR", sourceItem, irItems: matches, reason: `source mention "${sourceItem.rawText}" matches a compiled metric/defined-term reference` });
    else out.push({ classification: "POSSIBLY_ACCOUNTED_FOR", sourceItem, irItems: [], reason: `source mention "${sourceItem.rawText}" (a loose capitalized-phrase heuristic) has no obvious matching compiled metric/defined-term reference - low confidence, not counted as material on its own` });
  }
  return out;
}

/** Aggregate presence-vs-absence structural signals (task §11's own "feed material unresolved discrepancies to adversarial semantic review" - these are exactly that: coarse, generic, never section-specific, comparisons that raise suspicion without claiming a legal conclusion. */
function buildAggregateSignals(source: SourceInventory, ir: IrInventory): ReconciliationItem[] {
  const out: ReconciliationItem[] = [];

  // Structural completeness (task §8) - the LSB §6.13-shaped signal, entirely generic.
  if (source.apparentIndependentUnitCount > ir.ruleCount) {
    out.push({
      classification: "AMBIGUOUS",
      sourceItem: null,
      irItems: [],
      reason: `source text contains ${source.apparentIndependentUnitCount} apparent independent enumerated unit(s) (${source.apparentIndependentUnitEvidence.join(", ")}) but only ${ir.ruleCount} rule(s) were compiled - possible missing rule/basket (structural completeness signal, never a hard 1:1 requirement)`,
    });
  }

  // Phase 3F.1.6.R Workstream D (BLOCKER-9 root-cause fix). This threshold
  // used to require >=2 independent conditional/exception/proviso markers
  // before firing at all - see docs/phase-3f1-6-final-foundation-
  // certification/15-independent-verifier-certification.json finding F17-1.
  // That >=2 floor was precisely why a single, otherwise fully
  // dollar-reconciled qualifying condition (e.g. one lone "so long as no
  // Default has occurred and is continuing" on an otherwise clean basket -
  // one of the most common real drafting patterns, not a rare shape) never
  // produced ANY aggregate signal here, which in turn meant
  // shouldInvokeSemanticReview (verify.ts) also skipped Layer 2 for that
  // exact shape (single reconciled unit, no unresolved signal, no
  // alternation) - so neither verification layer ever looked at the
  // dropped condition. Lowering this to >=1 does NOT itself declare a
  // MATERIAL discrepancy (this stays classified AMBIGUOUS, and
  // findings.ts's determineDeterministicSeverity keeps every AMBIGUOUS
  // item at UNCERTAIN, never auto-escalated to MATERIAL by this
  // deterministic layer alone) - its only effect is that
  // materialUnresolvedCount becomes >0, which is what actually drives
  // shouldInvokeSemanticReview's routing decision. That routes the
  // candidate to Layer 2's own independent adversarial reading of the real
  // source text (reviewer.ts/prompt.ts already instruct it to check for a
  // dropped "condition" specifically, and to investigate every
  // deterministic signal "using your own independent reading... do not
  // simply rubber-stamp"), which is the correct place for a real
  // materiality judgment on a single, possibly-boilerplate marker (e.g. a
  // stray "unless the context otherwise requires" in unrelated
  // definitional boilerplate) to be made - never this generic, source-only,
  // no-package-knowledge counting layer (Architecture Invariants #29).
  const sourceConditionalSignalCount = source.items.filter((i) => i.kind === "CONDITIONAL_PHRASE" || i.kind === "EXCEPTION_MARKER" || i.kind === "PROVISO_MARKER").length;
  const irConditionOrExceptionCount = ir.items.filter((i) => i.kind === "CONDITION" || i.kind === "EXCEPTION").length;
  if (sourceConditionalSignalCount >= 1 && irConditionOrExceptionCount === 0) {
    out.push({
      classification: "AMBIGUOUS",
      sourceItem: null,
      irItems: [],
      reason: `source text contains ${sourceConditionalSignalCount} conditional/exception/proviso marker(s) but the compiled IR records zero conditions or exceptions - possible missing condition/exception`,
    });
  }

  const sourceSharedCapSignalCount = source.items.filter((i) => i.kind === "SHARED_CAP_MARKER").length;
  const irSharedCapCount = ir.items.filter((i) => i.kind === "SHARED_CAP_RELATIONSHIP").length;
  if (sourceSharedCapSignalCount > 0 && irSharedCapCount === 0) {
    out.push({
      classification: "AMBIGUOUS",
      sourceItem: null,
      irItems: [],
      reason: `source text contains ${sourceSharedCapSignalCount} shared-capacity marker(s) but the compiled IR records no shared-cap relationship - possible missing shared cap`,
    });
  }

  const distinctSourceEntityTerms = new Set(source.items.filter((i) => i.kind === "ENTITY_SCOPE_TERM").map((i) => i.rawText.toLowerCase()));
  const irEntityScopeCount = ir.items.filter((i) => i.kind === "ENTITY_SCOPE").length;
  if (distinctSourceEntityTerms.size >= 2 && irEntityScopeCount === 0) {
    out.push({
      classification: "AMBIGUOUS",
      sourceItem: null,
      irItems: [],
      reason: `source text distinguishes ${distinctSourceEntityTerms.size} distinct entity-scope term(s) (${[...distinctSourceEntityTerms].join(", ")}) but the compiled IR records no entity-scope restriction - possible missing/wrong entity scope`,
    });
  }

  const sourceReclassificationSignalCount = source.items.filter((i) => i.kind === "RECLASSIFICATION_SIGNAL").length;
  const irReclassificationDependencyCount = ir.items.filter((i) => i.kind === "DEPENDENCY" && (i.textValue?.includes("RECLASSIFIABLE_TO") || i.textValue?.includes("REDESIGNATES_TO"))).length;
  if (sourceReclassificationSignalCount > 0 && irReclassificationDependencyCount === 0) {
    out.push({
      classification: "AMBIGUOUS",
      sourceItem: null,
      irItems: [],
      reason: `source text contains ${sourceReclassificationSignalCount} reclassification/redesignation signal(s) but the compiled IR records no RECLASSIFIABLE_TO/REDESIGNATES_TO dependency - possible missing reclassification right`,
    });
  }

  return out;
}

export function reconcileInventories(source: SourceInventory, ir: IrInventory, retrieved: RetrievedEvidenceInventory | null = null): ReconciliationResult {
  const { items: numericItems, claimedIrItemIds } = reconcileNumericItems(source.items, ir.items);
  // F-4: authenticated retrieved evidence is reconciled AFTER the local window (which always has first claim) and
  // BEFORE the IR_ONLY sweep, so a value the IR correctly took from an authenticated definition is never reported
  // as unsupported. Aggregate structural signals below stay PRIMARY_LOCAL-only.
  const retrievedItems = retrieved ? reconcileRetrievedEvidence(retrieved, ir.items, claimedIrItemIds) : [];
  const irOnlyItems = findIrOnlyNumericItems(ir.items, claimedIrItemIds);
  const metricItems = reconcileMetricMentions(source.items, ir.items);
  const aggregateItems = buildAggregateSignals(source, ir);

  const items = [...numericItems, ...retrievedItems, ...irOnlyItems, ...metricItems, ...aggregateItems];
  const materialUnresolvedCount = items.filter((i) => i.classification === "NOT_ACCOUNTED_FOR" || i.classification === "IR_ONLY" || i.classification === "AMBIGUOUS").length;

  return { candidateRef: source.candidateRef, items, materialUnresolvedCount };
}
