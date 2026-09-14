/**
 * F-7A synthetic corpora + scripted IR emitters for the shard planner/stitcher tests and the zero-cost historical
 * simulation. Everything here is generic and synthetic: numbered terms, generated figures, no real agreement text.
 */
import { buildTestIndex } from "./context-retrieval-test-utils";
import type { StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../../lib/contract-model/compiler/semantic-accountability/types";
import { computeDefinitionId, computeRuleId } from "../../lib/contract-model/ir/identity";
import type { IRDefinition, IRExpression, IRRule } from "../../lib/contract-model/ir/types";
import type { CompilationShard, ShardComposition, ShardPlan } from "../../lib/contract-model/compiler/semantic/shard-types";

export const CO = "f7a-co";
export const INST = "f7a-instrument";
export const DOC = "doc-a";

export interface SyntheticCorpus {
  text: string;
  index: StructuralIndex;
  sourceContext: SourceContextResult;
  frozenInventory: FrozenSemanticInventory;
  /** normalized term -> its inventory item id(s) (definition corpora) */
  itemsByTerm: Map<string, string[]>;
  /** section ref -> inventory item ids (structural corpora) */
  itemsBySection: Map<string, string[]>;
  terms: string[];
}

function frozen(candidateRef: string, items: SemanticInventoryItem[], state: SourceContextResult["state"]): FrozenSemanticInventory {
  return { candidateRef, items, uninventoriedValues: [], unaccountedSource: [], sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 1, externallyAccountedRegions: [] }, gapReinventory: null, inventoryStatus: "INVENTORY_OK", inventoryStatusReason: "synthetic", rejectedUnverifiableItems: 0, rejectedDuplicateItems: 0, sourceContextState: state, frozenContentHash: `frozen:${candidateRef}:${items.length}`, frozenAt: "2026-01-01T00:00:00.000Z", algorithmVersion: "semantic-accountability.v5", promptVersion: "semantic-inventory-prompt.v5", provider: "synthetic", model: "synthetic", telemetryCostUsd: null };
}

function item(id: string, regionId: string, charStart: number, charEnd: number, excerpt: string, extra: Partial<SemanticInventoryItem>): SemanticInventoryItem {
  return { inventoryItemId: id, sourceSpan: { regionId, documentId: DOC, sourceNodeId: null, sectionRef: null, charStart, charEnd, sourceCitation: "§synthetic", excerpt }, semanticRole: "THRESHOLD", proposition: `proposition ${id}`, quantitativeValues: [], referencedTerms: [], referencedSections: [], parentItemId: null, relatedItemIds: [], materiality: "MATERIAL", ambiguity: "NONE", ambiguityReason: null, operative: "DEFINITIONAL", detectionMethod: "MODEL", ...extra };
}

export interface DefinitionsCorpusOptions {
  count: number;
  /** term index -> referenced term index (definition A references definition B in its own text) */
  references?: Map<number, number>;
  /** term indexes forming one shared-capacity construct (first one holds the SHARED_CAP item) */
  sharedCapGroup?: number[];
  /** text override for one term index (source-change tests) */
  overrideText?: Map<number, string>;
  candidateRef?: string;
  /** make each definition long (padding words) */
  padWords?: number;
}

export function termName(i: number): string {
  return `Term ${String(i).padStart(3, "0")}`;
}

/** A definitions section: "SECTION 1.01. Defined Terms ." followed by N generated definitions. */
export function buildDefinitionsCorpus(opts: DefinitionsCorpusOptions): SyntheticCorpus {
  const candidateRef = opts.candidateRef ?? "cand:1.01";
  const lines = ["SECTION 1.01. Defined Terms . As used in this Agreement, the following terms have the meanings specified below."];
  const terms: string[] = [];
  for (let i = 1; i <= opts.count; i++) {
    const t = termName(i);
    terms.push(t);
    const amount = `$${(i * 1_000_000).toLocaleString("en-US")}`;
    const ref = opts.references?.get(i);
    const pad = opts.padWords ? ` ${Array.from({ length: opts.padWords }, (_, k) => `filler${k % 7}`).join(" ")}` : "";
    const override = opts.overrideText?.get(i);
    lines.push(override ?? `“${t}” means the greater of (a) ${amount} and (b) ${i % 9 + 1}% of ${ref ? termName(ref) : "Consolidated EBITDA"}${pad}.`);
  }
  const text = lines.join("\n");
  const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
  const section = index.resolveUniqueNodeByRef(DOC, "1.01");
  if (section.status !== "UNIQUE") throw new Error("synthetic corpus: section 1.01 not unique");
  const regionText = index.getNodeText(section.node.nodeId, "DESCENDANTS");
  const sourceContext: SourceContextResult = { state: "COMPLETE_LOCAL_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: DOC, sourceNodeId: section.node.nodeId, sectionRef: "1.01", charStart: section.node.charStart, charEnd: section.node.charStart + regionText.length, text: regionText, expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: regionText.length, budgetChars: 24_000 };
  const items: SemanticInventoryItem[] = [];
  const itemsByTerm = new Map<string, string[]>();
  for (let i = 1; i <= opts.count; i++) {
    const t = termName(i);
    const declaration = `“${t}” means`;
    const at = regionText.indexOf(declaration);
    if (at < 0) throw new Error(`synthetic corpus: declaration of ${t} not found`);
    const amountText = `$${(i * 1_000_000).toLocaleString("en-US")}`;
    const amountAt = regionText.indexOf(amountText, at);
    const ref = opts.references?.get(i);
    const id = `inv-item:${String(i).padStart(3, "0")}`;
    const lineEnd = regionText.indexOf("\n", at);
    items.push(item(id, "operative", at, lineEnd < 0 ? regionText.length : lineEnd, regionText.slice(at, Math.min(regionText.length, at + 80)), { proposition: `${t} is the greater of a fixed amount and a percentage of a metric`, quantitativeValues: amountAt >= 0 ? [{ kind: "MONEY", rawText: amountText, normalizedValue: i * 1_000_000, unit: "USD", charStart: amountAt, charEnd: amountAt + amountText.length }] : [], referencedTerms: [ref ? termName(ref) : "Consolidated EBITDA"] }));
    itemsByTerm.set(t.toLowerCase(), [id]);
  }
  if (opts.sharedCapGroup && opts.sharedCapGroup.length > 1) {
    const [head, ...members] = opts.sharedCapGroup;
    const headItem = items.find((x) => x.inventoryItemId === `inv-item:${String(head).padStart(3, "0")}`)!;
    headItem.semanticRole = "SHARED_CAP";
    headItem.relatedItemIds = members.map((m) => `inv-item:${String(m).padStart(3, "0")}`);
    for (const m of members) items.find((x) => x.inventoryItemId === `inv-item:${String(m).padStart(3, "0")}`)!.parentItemId = headItem.inventoryItemId;
  }
  return { text, index, sourceContext, frozenInventory: frozen(candidateRef, items, "COMPLETE_LOCAL_SOURCE"), itemsByTerm, itemsBySection: new Map(), terms };
}

/** A covenant section with a chapeau and N lettered child clauses (structural corpus). */
export function buildChapeauCorpus(children: number, candidateRef = "cand:6.04"): SyntheticCorpus {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  const lines = [`SECTION 6.04. Investments . The Borrower shall not, and shall not permit any Restricted Subsidiary to, make any Investment, except that so long as no Default has occurred and is continuing the following shall be permitted:`];
  for (let i = 0; i < children; i++) lines.push(`(${letters[i]}) Investments in joint ventures in an aggregate amount not to exceed $${((i + 1) * 500_000).toLocaleString("en-US")};`);
  const text = lines.join("\n");
  const index = buildTestIndex([{ documentId: DOC, label: "CA", text }]);
  const section = index.resolveUniqueNodeByRef(DOC, "6.04");
  if (section.status !== "UNIQUE") throw new Error("synthetic corpus: section 6.04 not unique");
  const regionText = index.getNodeText(section.node.nodeId, "DESCENDANTS");
  const sourceContext: SourceContextResult = { state: "COMPLETE_LOCAL_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: DOC, sourceNodeId: section.node.nodeId, sectionRef: "6.04", charStart: section.node.charStart, charEnd: section.node.charStart + regionText.length, text: regionText, expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: regionText.length, budgetChars: 24_000 };
  const items: SemanticInventoryItem[] = [];
  const itemsBySection = new Map<string, string[]>();
  const chapeauAt = regionText.indexOf("so long as no Default");
  items.push(item("inv-item:chapeau", "operative", chapeauAt, chapeauAt + 40, regionText.slice(chapeauAt, chapeauAt + 40), { semanticRole: "CONDITION", proposition: "no Default condition applies to every permitted Investment below", materiality: "CRITICAL", operative: "OPERATIVE" }));
  itemsBySection.set("6.04", ["inv-item:chapeau"]);
  for (let i = 0; i < children; i++) {
    const amountText = `$${((i + 1) * 500_000).toLocaleString("en-US")}`;
    const at = regionText.indexOf(`(${letters[i]}) Investments`);
    const amountAt = regionText.indexOf(amountText, at);
    const id = `inv-item:child-${letters[i]}`;
    items.push(item(id, "operative", at, amountAt + amountText.length, regionText.slice(at, amountAt + amountText.length), { semanticRole: "PERMISSION", proposition: `clause (${letters[i]}) permits joint-venture Investments up to ${amountText}`, quantitativeValues: [{ kind: "MONEY", rawText: amountText, normalizedValue: (i + 1) * 500_000, unit: "USD", charStart: amountAt, charEnd: amountAt + amountText.length }], parentItemId: "inv-item:chapeau", operative: "OPERATIVE" }));
    itemsBySection.set(`6.04(${letters[i]})`, [id]);
  }
  return { text, index, sourceContext, frozenInventory: frozen(candidateRef, items, "COMPLETE_LOCAL_SOURCE"), itemsByTerm: new Map(), itemsBySection, terms: [] };
}

// ---------------------------------------------------------------------------
// Scripted emitters (stand-ins for a per-shard model call; deterministic, lineage-bearing)
// ---------------------------------------------------------------------------

let exprCounter = 0;
export function money(amount: number, inventoryItemIds: string[] = []): IRExpression {
  return { exprId: `e${++exprCounter}`, kind: "MONEY", type: "MONEY", amount, currency: "USD", ...(inventoryItemIds.length ? { inventoryItemIds } : {}) } as unknown as IRExpression;
}
export function termRef(term: string): IRExpression {
  return { exprId: `e${++exprCounter}`, kind: "DEFINED_TERM_REFERENCE", type: "MONEY", termName: term, companyId: CO, instrumentKey: INST, resolvedDefinitionId: null } as unknown as IRExpression;
}
export function maxOf(...operands: IRExpression[]): IRExpression {
  return { exprId: `e${++exprCounter}`, kind: "MAX", type: "MONEY", operands } as unknown as IRExpression;
}

export function definitionFor(term: string, expression: IRExpression | null, opts: { lineage?: string[]; sufficiency?: string; dependsOnTerms?: string[] } = {}): IRDefinition {
  return { definitionId: computeDefinitionId(CO, INST, term), irSchemaVersion: "headroom-covenant-ir.v1", companyId: CO, instrumentKey: INST, sourceDocumentId: DOC, termName: term, covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: expression, dependsOnTerms: opts.dependsOnTerms ?? [], sufficiency: opts.sufficiency ?? "COMPLETE", sufficiencyReasons: [], provenance: { documentId: DOC, sourceNodeKey: null, sourceCitation: `Definition of "${term}"`, excerpt: null }, compilerVersion: "v1", sourceContentVersion: null, ...(opts.lineage ? { inventoryItemIds: opts.lineage } : {}) } as unknown as IRDefinition;
}

export function ruleFor(localRef: string, candidateRef: string, sectionRef: string, capacity: IRExpression | null, opts: { lineage?: string[]; dependsOnRuleId?: string } = {}): IRRule {
  return { ruleId: computeRuleId(CO, INST, sectionRef, `${candidateRef}:${localRef}`), irSchemaVersion: "headroom-covenant-ir.v1", companyId: CO, instrumentKey: INST, sourceDocumentId: DOC, sourceSectionRef: sectionRef, covenantFamily: "INVESTMENTS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "MAKE_INVESTMENT", entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: capacity, conditions: [], exceptions: [], dependsOn: opts.dependsOnRuleId ? [{ relationshipType: "REQUIRES", targetRuleId: opts.dependsOnRuleId, description: "dep" }] : [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: { documentId: DOC, sourceNodeKey: null, sourceCitation: `§${sectionRef}`, excerpt: null }, compilerVersion: "v1", sourceContentVersion: null, ...(opts.lineage ? { inventoryItemIds: opts.lineage } : {}) } as unknown as IRRule;
}

/** The faithful emitter: for every owned DEFINITION unit, one definition carrying the owned item's value and lineage. */
export function emitDefinitionsForShard(corpus: SyntheticCorpus, plan: ShardPlan, shard: CompilationShard, references?: Map<number, number>): ShardComposition {
  const definitions: IRDefinition[] = [];
  for (const key of shard.ownedUnitKeys) {
    const unit = plan.units.find((u) => u.unitKey === key)!;
    if (unit.kind !== "DEFINITION" || !unit.termName) continue;
    const i = Number(unit.termName.replace(/\D/g, ""));
    const ids = corpus.itemsByTerm.get(unit.termName.toLowerCase()) ?? [];
    const ref = references?.get(i);
    const expr = maxOf(money(i * 1_000_000, ids), ref ? termRef(termName(ref)) : termRef("Consolidated EBITDA"));
    definitions.push(definitionFor(unit.termName, expr, { lineage: ids, dependsOnTerms: ref ? [termName(ref)] : ["Consolidated EBITDA"] }));
  }
  return { rules: [], definitions, sharedCapacities: [], inventoryDispositions: [] };
}

/** The faithful emitter for the chapeau corpus: one rule per owned child clause, lineage to the child item (and to the chapeau item when owned). */
export function emitRulesForShard(corpus: SyntheticCorpus, plan: ShardPlan, shard: CompilationShard, candidateRef: string): ShardComposition {
  const rules: IRRule[] = [];
  let n = 0;
  for (const key of shard.ownedUnitKeys) {
    const unit = plan.units.find((u) => u.unitKey === key)!;
    if (!unit.sectionRef || !unit.sectionRef.includes("(")) continue;
    const ids = corpus.itemsBySection.get(unit.sectionRef) ?? [];
    const amount = corpus.frozenInventory.items.find((it) => it.inventoryItemId === ids[0])?.quantitativeValues[0]?.normalizedValue ?? 0;
    rules.push(ruleFor(`r${++n}`, `${candidateRef}#${shard.shardId}`, unit.sectionRef, money(amount, ids), { lineage: ids }));
  }
  return { rules, definitions: [], sharedCapacities: [], inventoryDispositions: [] };
}
