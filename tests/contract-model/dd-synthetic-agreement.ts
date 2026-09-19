/**
 * A parameterized SYNTHETIC agreement for required-dependency precision tests and the zero-cost cross-corpus sanity
 * run. Every name, section number and amount is an input; nothing here is a real agreement, term or instrument.
 *
 * The document has a definitions section, two operative sections (one referenced by number from a definition, one
 * that is the compilation unit), an optional forwarding-target section and an optional DUPLICATED section number so
 * a reference can be made genuinely ambiguous. The inventory is deterministic: one item per operative clause, with
 * the referencedTerms the caller declares - so a FALSE Pass-A edge is simply a term the caller cites that the text
 * never defines (or never even contains).
 */
import { buildTestIndex } from "./context-retrieval-test-utils";
import { planCompilationShards, DEFAULT_SHARD_BUDGET } from "../../lib/contract-model/compiler/semantic/shard-planner";
import type { ShardPlan, ShardBudget } from "../../lib/contract-model/compiler/semantic/shard-types";
import type { RequiredDependencyBudget } from "../../lib/contract-model/compiler/semantic/required-dependencies";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../../lib/contract-model/compiler/semantic-accountability/types";

export const SYN_CO = "syn-co";
export const SYN_INST = "syn-instrument";
export const SYN_DOC = "syn-doc";

export interface SyntheticAgreementShape {
  /** Defined in the definitions section as a plain amount definition. */
  capTerm: string;
  /** Components the cap term's body is composed of (compositional chain, depth 2). */
  components: string[];
  /** Reached only through a limit-bearing position inside the second component (depth 3). */
  deepTerm: string;
  /** Written as a cross-reference inside the first component's definition. */
  crossRefSection: string;
  /** A forwarding definition and the section it forwards to. */
  forwardingTerm: string;
  forwardingSection: string;
  /** A term defined in the SINGULAR only (the operative text and edges may cite the plural). */
  singularOnlyTerm: string;
  /** A term defined in the PLURAL only (the operative text and edges may cite the singular). */
  pluralOnlyTerm: string;
  /** A capitalised phrase that occurs in prose but is never defined. */
  undefinedCapitalisedPhrase: string;
  /** A defined term mentioned only incidentally in substantive prose of an UNRELATED definition (must not be pulled in). */
  incidentalTerm: string;
  /** The compilation unit. */
  operativeSection: string;
  /** When set, a second, unrelated section carries the SAME number as crossRefSection's parent, making the reference ambiguous. */
  duplicateCrossRefParent?: boolean;
  /** Extra referencedTerms the inventory item cites (Pass-A edges), including deliberately false ones. */
  extraEdges?: string[];
  /** A term whose text says it is defined in another agreement ("(as defined in the X)"). */
  externalTerm?: { term: string; agreement: string };
  /**
   * An amount defined as an ARITHMETIC combination of other defined terms, padded with enough prose that the
   * compositional-coverage proxy scores it low at every threshold. Its operands must be required regardless.
   */
  arithmeticTerm?: { term: string; operands: string[] };
  amounts: [number, number, number];
}

export const BASE_SHAPE: SyntheticAgreementShape = {
  capTerm: "Aggregate Basket Cap",
  components: ["Scheduled Basket Amount", "Reinvested Basket Amount", "Elective Basket Amount"],
  deepTerm: "Qualifying Disposition Proceeds",
  crossRefSection: "3.07(b)",
  forwardingTerm: "Designated Reference Amount",
  forwardingSection: "9.11(a)",
  singularOnlyTerm: "Approved Counterparty",
  pluralOnlyTerm: "Permitted Holders",
  undefinedCapitalisedPhrase: "Senior Priority Basis",
  incidentalTerm: "Ancillary Fee Schedule",
  operativeSection: "8.02",
  amounts: [75_000_000, 40_000_000, 25_000_000],
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const parentOf = (ref: string) => ref.replace(/\(.*$/, "");

export function buildSyntheticAgreement(shape: SyntheticAgreementShape) {
  const [c1, c2, c3] = shape.components;
  const lines = [
    "SECTION 1.01. Defined Terms . As used in this Agreement, the following terms have the meanings specified below.",
    `“${shape.capTerm}” means, at any time, the sum of the ${c1}, the ${c2} and the ${c3}.`,
    `“${c1}” means ${money(shape.amounts[0])}, subject to Section ${shape.crossRefSection}.`,
    `“${c2}” means an amount equal to the ${shape.deepTerm} incurred within the twelve-month period then ended.`,
    `“${c3}” means ${money(shape.amounts[1])}.`,
    `“${shape.deepTerm}” means the net cash proceeds of any disposition permitted hereunder, up to ${money(shape.amounts[2])}.`,
    `“${shape.forwardingTerm}” has the meaning assigned to such term in Section ${shape.forwardingSection}.`,
    `“${shape.singularOnlyTerm}” means any counterparty approved in writing by the Required Lenders.`,
    `“${shape.pluralOnlyTerm}” means the holders listed on Schedule 1.01(a) and their controlled affiliates.`,
    `“${shape.incidentalTerm}” means the schedule of ancillary fees delivered on the Closing Date.`,
    `“Ordinary Course Adjustment” means any adjustment made in the ordinary course of business consistent with past practice, as reflected in the ${shape.incidentalTerm} from time to time.`,
    ...(shape.externalTerm ? [`“Reference Facility Amount” means the amount so designated for purposes of the ${shape.externalTerm.term} (as defined in the ${shape.externalTerm.agreement}) as of the date of determination.`] : []),
    ...(shape.arithmeticTerm ? [
      `“${shape.arithmeticTerm.term}” means, as of any date of determination and without duplication, in each case as determined in good faith by the chief financial officer of the Borrower in accordance with the accounting principles applied in the most recently delivered financial statements and certified in reasonable detail: ${shape.arithmeticTerm.operands.map((o, i) => `(${String.fromCharCode(97 + i)}) the ${o}`).join("; plus ")}.`,
      ...shape.arithmeticTerm.operands.map((o, i) => `“${o}” means ${money(1_000_000 * (i + 1))}, as adjusted from time to time in accordance with the terms hereof.`),
    ] : []),
    `SECTION ${parentOf(shape.crossRefSection)}. Basket Reinstatement . Amounts applied under this Section reinstate the corresponding basket.`,
    `(b) Reinstatement occurs only on the date the applicable amount is irrevocably applied.`,
    ...(shape.duplicateCrossRefParent ? [`SECTION ${parentOf(shape.crossRefSection)}. Basket Reinstatement . Reinstatement under this duplicated Section applies to the alternative basket regime.`, `(b) The alternative regime reinstates on the last day of the fiscal quarter.`] : []),
    `SECTION ${parentOf(shape.forwardingSection)}. Reference Amounts . Reference amounts are determined as provided below.`,
    `(a) The reference amount for any period is the amount certified by a Responsible Officer for such period.`,
    `SECTION ${shape.operativeSection}. Limitation on Incurrence . The Borrower shall not incur any obligation, except:`,
    `(a) obligations owed to any ${shape.singularOnlyTerm}s or ${shape.pluralOnlyTerm.replace(/s$/, "")} in an aggregate principal amount not to exceed the ${shape.capTerm} at the time of incurrence, determined by reference to the ${shape.forwardingTerm} on a ${shape.undefinedCapitalisedPhrase}${shape.arithmeticTerm ? ` and, in the aggregate, not to exceed the ${shape.arithmeticTerm.term}` : ""};`,
  ];
  const text = lines.join("\n");
  const index = buildTestIndex([{ documentId: SYN_DOC, label: "SA", text }]);
  const op = index.resolveUniqueNodeByRef(SYN_DOC, shape.operativeSection);
  if (op.status !== "UNIQUE") throw new Error(`synthetic agreement: section ${shape.operativeSection} not unique`);
  const regionText = index.getNodeText(op.node.nodeId, "DESCENDANTS");
  const sourceContext: SourceContextResult = {
    state: "COMPLETE_LOCAL_SOURCE",
    regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: SYN_DOC, sourceNodeId: op.node.nodeId, sectionRef: shape.operativeSection, charStart: op.node.charStart, charEnd: op.node.charStart + regionText.length, text: regionText, expandedFor: null, truncatedAtBudget: false, unitExtension: null }],
    unresolvedReferences: [], reasons: [], totalChars: regionText.length, budgetChars: 24_000,
  };
  const at = regionText.indexOf("(a) obligations");
  const item: SemanticInventoryItem = {
    inventoryItemId: "inv-item:op-a", sourceSpan: { regionId: "operative", documentId: SYN_DOC, sourceNodeId: op.node.nodeId, sectionRef: `${shape.operativeSection}(a)`, charStart: at, charEnd: regionText.length, sourceCitation: `§${shape.operativeSection}(a)`, excerpt: regionText.slice(at) },
    semanticRole: "PERMISSION", proposition: `clause (a) permits obligations up to the ${shape.capTerm}`, quantitativeValues: [],
    referencedTerms: [shape.capTerm, shape.forwardingTerm, ...(shape.arithmeticTerm ? [shape.arithmeticTerm.term] : []), `${shape.singularOnlyTerm}s`, shape.pluralOnlyTerm.replace(/s$/, ""), shape.undefinedCapitalisedPhrase, ...(shape.extraEdges ?? []), ...(shape.externalTerm ? [shape.externalTerm.term] : [])],
    referencedSections: [], parentItemId: null, relatedItemIds: [], materiality: "CRITICAL", ambiguity: "NONE", ambiguityReason: null, operative: "OPERATIVE", detectionMethod: "MODEL",
  };
  const frozenInventory: FrozenSemanticInventory = {
    candidateRef: `cand:${shape.operativeSection}`, items: [item], uninventoriedValues: [], unaccountedSource: [],
    sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] },
    gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "synthetic", rejectedUnverifiableItems: 0, rejectedDuplicateItems: 0,
    sourceContextState: "COMPLETE_LOCAL_SOURCE", frozenContentHash: `frozen:${shape.operativeSection}`, frozenAt: "2026-01-01T00:00:00.000Z",
    algorithmVersion: "semantic-accountability.v5", promptVersion: "semantic-inventory-prompt.v5", provider: "synthetic", model: "synthetic", telemetryCostUsd: null,
  };
  return { text, index, sourceContext, frozenInventory, regionText };
}

export function planSynthetic(shape: SyntheticAgreementShape, budget: Partial<ShardBudget> = {}, requiredBudget: Partial<RequiredDependencyBudget> = {}): ShardPlan {
  const built = buildSyntheticAgreement(shape);
  return planCompilationShards({ candidateRef: built.frozenInventory.candidateRef, companyId: SYN_CO, instrumentKey: SYN_INST, documentId: SYN_DOC, sourceContext: built.sourceContext, frozenInventory: built.frozenInventory, structuralIndex: built.index, budget: { ...DEFAULT_SHARD_BUDGET, ...budget }, requiredBudget, generation: { algorithmVersion: "alg.v1", promptVersion: "prompt.v1" } });
}

export const termKey = (t: string) => `term:${t.toLowerCase()}`;
export const sectionKey = (r: string) => `section:${r.toLowerCase()}`;

/** Every required dependency of a plan, flattened. */
export function depsOf(plan: ShardPlan) { return plan.shards.flatMap((s) => s.requiredDependencies); }
/** Keys DELIVERED in the required tier. */
export function deliveredKeys(plan: ShardPlan) { return new Set(plan.shards.flatMap((s) => s.context.filter((e) => e.tier === "REQUIRED").map((e) => e.contextKey))); }

/**
 * The §12 expectation set, evaluated on one plan of the BASE_SHAPE (with a false edge and an ambiguous duplicate when
 * the shape asks for them). Returned as named booleans so a sensitivity sweep can report them per threshold.
 */
export function antiOverfitExpectations(shape: SyntheticAgreementShape, plan: ShardPlan): Record<string, boolean> {
  const deps = depsOf(plan);
  const delivered = deliveredKeys(plan);
  const find = (key: string) => deps.find((d) => d.key === key);
  const [c1, c2] = shape.components as [string, string, string];
  return {
    A_realDefinedDependencyDelivered: delivered.has(termKey(shape.capTerm)),
    B_undefinedCapitalisedPhraseIsLimitationNotDelivery: find(termKey(shape.undefinedCapitalisedPhrase))?.disposition === "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED" && !delivered.has(termKey(shape.undefinedCapitalisedPhrase)),
    C_pluralCitedAgainstSingularDefinition: delivered.has(termKey(shape.singularOnlyTerm)) && (find(termKey(shape.singularOnlyTerm))?.citedAs.includes(`${shape.singularOnlyTerm}s`) ?? false),
    D_singularCitedAgainstPluralDefinition: delivered.has(termKey(shape.pluralOnlyTerm)) && (find(termKey(shape.pluralOnlyTerm))?.citedAs.includes(shape.pluralOnlyTerm.replace(/s$/, "")) ?? false),
    E_falseEdgeExcludedNotRequired: (shape.extraEdges ?? []).every((t) => find(termKey(t))?.disposition === "NON_REQUIRED_EDGE" && !delivered.has(termKey(t))),
    F_forwardingTargetDelivered: delivered.has(termKey(shape.forwardingTerm)) && delivered.has(sectionKey(shape.forwardingSection)),
    G_crossReferenceInsideRequiredDefinition: shape.duplicateCrossRefParent ? true : delivered.has(sectionKey(shape.crossRefSection)),
    H_deepCompositionalChain: delivered.has(termKey(c1)) && delivered.has(termKey(c2)) && delivered.has(termKey(shape.deepTerm)),
    I_incidentalTermNotPulledIn: !find(termKey(shape.incidentalTerm)) && !find(termKey("Ordinary Course Adjustment")),
    J_ambiguousSectionIsExplicit: shape.duplicateCrossRefParent ? find(sectionKey(shape.crossRefSection))?.disposition === "AMBIGUOUS_REQUIRED_DEPENDENCY" && (find(sectionKey(shape.crossRefSection))?.candidates?.length ?? 0) >= 2 : true,
    L_arithmeticOperandsRequiredWhateverTheCoverage: shape.arithmeticTerm ? shape.arithmeticTerm.operands.every((o) => delivered.has(termKey(o)) && find(termKey(o))?.evidence.includes("TRANSITIVE_DEFINITION_CLOSURE")) : true,
    K_externalProvenFromSource: shape.externalTerm ? find(termKey(shape.externalTerm.term))?.disposition === "EXTERNAL_REQUIRED_DEPENDENCY" : true,
    Z_noPlanningFailure: plan.dependencyCertification.deliverableNotDelivered === 0,
  };
}
