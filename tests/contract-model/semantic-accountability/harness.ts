/**
 * SEMANTIC ACCOUNTABILITY synthetic harness - runs a corpus scenario
 * through the REAL production layers with a scripted (not real) model:
 *
 *   text -> Phase 2A parse/index -> resolveSourceContext (real)
 *        -> normalizeInventorySubmission (real Pass A post-processing over
 *           the scenario's ground-truth excerpts as the scripted model output)
 *        -> compose (scenario wire) -> normalizeSubmission (real Pass B
 *           normalization into real IR)
 *        -> reconcileInventoryWithComposition (real Pass C).
 *
 * Also provides the generic injection operators (I41-I44) that MUTATE a
 * complete scenario's normalized IR, so injected-omission detection is
 * measured on every scenario in the corpus, not on four hand-picked cases.
 */
import type { StageCaller } from "../../../lib/contract-model/compiler/llm-caller";
import { normalizeSubmission, type NormalizedCompilation } from "../../../lib/contract-model/compiler/semantic/normalize";
import { normalizeInventorySubmission, runSemanticInventory } from "../../../lib/contract-model/compiler/semantic-accountability/inventory";
import { scanQuantitativeValues } from "../../../lib/contract-model/compiler/semantic-accountability/quantitative";
import { reconcileInventoryWithComposition } from "../../../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { resolveSourceContext } from "../../../lib/contract-model/compiler/semantic-accountability/source-context";
import type { FrozenSemanticInventory, SemanticAccountabilityResult, SemanticInventoryItem, SourceContextResult } from "../../../lib/contract-model/compiler/semantic-accountability/types";
import type { WireInventoryItem } from "../../../lib/contract-model/compiler/semantic-accountability/wire-schema";
import type { StructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import type { StructuralNode } from "../../../lib/contract-model/compiler/types";
import { buildTestIndex } from "../context-retrieval-test-utils";
import { testCompilerInput } from "../semantic-compiler/test-helpers";
import type { Scenario, ScenarioItem } from "./corpus";

export const DOC_ID = "synthetic-doc";

export interface BuiltScenario {
  scenario: Scenario;
  index: StructuralIndex;
  anchor: StructuralNode;
  operativeText: string;
  sourceContext: SourceContextResult;
  wireItems: WireInventoryItem[];
  inventory: FrozenSemanticInventory;
  /** ground-truth ref -> accepted inventoryItemId (undefined when the item was lost). */
  idByRef: Map<string, string>;
  idOf: (ref: string) => string;
}

export function scriptedWireItems(items: ScenarioItem[]): WireInventoryItem[] {
  return items.map((i) => ({
    localRef: i.ref,
    semanticRole: i.role,
    proposition: `${i.role.toLowerCase()}: ${i.excerpt.slice(0, 60)}`,
    excerpt: i.excerpt,
    regionId: i.regionId ?? null,
    quantitativeValues: [], // deliberately empty - the deterministic scanner must complete every value
    referencedTerms: i.referencedTerms ?? [],
    referencedSections: i.referencedSections ?? [],
    parentRef: i.parentRef ?? null,
    relatedRefs: [],
    materiality: i.materiality,
    ambiguity: "NONE",
    ambiguityReason: null,
    operative: i.operative ?? "OPERATIVE",
  }));
}

/** A scripted StageCaller that returns the given wire items (or throws) - never a network call. */
export function scriptedInventoryCaller(items: WireInventoryItem[] | (() => WireInventoryItem[]), opts: { fail?: boolean } = {}): StageCaller {
  return {
    providerName: "scripted",
    model: "scripted-inventory",
    isSynthetic: false,
    async call<T>(): Promise<T> {
      if (opts.fail) throw new Error("scripted inventory failure");
      return { items: typeof items === "function" ? items() : items, overallNotes: [] } as unknown as T;
    },
    lastTelemetry: () => null,
  };
}

export function buildIndexFor(scenario: Scenario): { index: StructuralIndex; anchor: StructuralNode } {
  const index = buildTestIndex([{ documentId: DOC_ID, label: "Synthetic Credit Agreement", text: scenario.text }]);
  const matches = index.findNodesByRef(DOC_ID, scenario.anchorRef);
  if (matches.length === 0) throw new Error(`${scenario.id}: anchor ${scenario.anchorRef} not found in the synthetic index`);
  // A scenario may deliberately duplicate a label elsewhere (I40); the anchor is always the FIRST substantive occurrence.
  const anchor = matches[0]!;
  return { index, anchor };
}

export async function buildScenario(scenario: Scenario): Promise<BuiltScenario> {
  const { index, anchor } = buildIndexFor(scenario);
  const fullUnit = index.getNodeText(anchor.nodeId, "DESCENDANTS");
  const operativeText = scenario.operativeWindow ? scenario.operativeWindow(fullUnit) : fullUnit;
  const sourceContext = resolveSourceContext({ index, documentId: DOC_ID, operativeSourceText: operativeText, anchorNodeId: anchor.nodeId, operativeCharStart: anchor.charStart, documentText: index.getDocumentText(DOC_ID) ?? null, ...(scenario.sourceContextOptions ?? {}) });
  const wireItems = scriptedWireItems(scenario.items);
  const inventory = await runSemanticInventory({ candidateRef: scenario.id, documentId: DOC_ID, sourceContext, caller: scriptedInventoryCaller(wireItems) });
  const idByRef = mapRefsToIds(scenario.items, inventory.items, sourceContext);
  const idOf = (ref: string) => {
    const id = idByRef.get(ref);
    if (!id) throw new Error(`${scenario.id}: ground-truth item "${ref}" was not accepted into the inventory`);
    return id;
  };
  return { scenario, index, anchor, operativeText, sourceContext, wireItems, inventory, idByRef, idOf };
}

/** Maps ground-truth refs to accepted item ids by verified excerpt + role (the same evidence the real inventory keys on). */
export function mapRefsToIds(items: ScenarioItem[], accepted: SemanticInventoryItem[], sourceContext: SourceContextResult): Map<string, string> {
  const out = new Map<string, string>();
  for (const gt of items) {
    const hit = accepted.find((a) => a.semanticRole === gt.role && a.sourceSpan.excerpt.replace(/\s+/g, " ") === gt.excerpt.trim().replace(/\s+/g, " ") && (!gt.regionId || a.sourceSpan.regionId === gt.regionId));
    if (hit) out.set(gt.ref, hit.inventoryItemId);
  }
  void sourceContext;
  return out;
}

export function normalizeScenarioComposition(built: BuiltScenario, submissionOverride?: ReturnType<Scenario["compose"]>): NormalizedCompilation {
  const submission = submissionOverride ?? built.scenario.compose(built.idOf);
  return normalizeSubmission(submission, testCompilerInput({ candidateRef: built.scenario.id, sourceSectionRef: built.scenario.anchorRef, operativeSourceText: built.operativeText }));
}

export function reconcileScenario(built: BuiltScenario, normalized: NormalizedCompilation): SemanticAccountabilityResult {
  return reconcileInventoryWithComposition({
    inventory: built.inventory,
    composition: { rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities },
    dispositions: normalized.inventoryDispositions,
    sourceContextState: built.sourceContext.state,
  });
}

// ---------------------------------------------------------------------------
// Pass A recall accounting (mission §17)
// ---------------------------------------------------------------------------
export interface RecallAccounting {
  criticalExpected: number;
  criticalRecalled: number;
  materialExpected: number;
  materialRecalled: number;
  valuesExpected: number;
  valuesRecalled: number;
  missingRefs: string[];
  missingValues: string[];
}

export function accountRecall(built: BuiltScenario): RecallAccounting {
  const acc: RecallAccounting = { criticalExpected: 0, criticalRecalled: 0, materialExpected: 0, materialRecalled: 0, valuesExpected: 0, valuesRecalled: 0, missingRefs: [], missingValues: [] };
  const byId = new Map(built.inventory.items.map((i) => [i.inventoryItemId, i]));
  for (const gt of built.scenario.items) {
    const id = built.idByRef.get(gt.ref);
    const material = gt.materiality === "CRITICAL" || gt.materiality === "MATERIAL";
    if (gt.materiality === "CRITICAL") acc.criticalExpected++;
    if (material) acc.materialExpected++;
    if (id) {
      if (gt.materiality === "CRITICAL") acc.criticalRecalled++;
      if (material) acc.materialRecalled++;
    } else acc.missingRefs.push(`${built.scenario.id}:${gt.ref}`);
    for (const v of gt.values ?? []) {
      if (!material) continue;
      acc.valuesExpected++;
      const item = id ? byId.get(id) : undefined;
      const found = item?.quantitativeValues.some((q) => q.kind === v.kind && (v.normalized === null ? q.rawText.replace(/\s+/g, " ").toLowerCase() === v.rawText.toLowerCase() : q.normalizedValue !== null && Math.abs(q.normalizedValue - v.normalized) < 1e-9));
      if (found) acc.valuesRecalled++;
      else acc.missingValues.push(`${built.scenario.id}:${gt.ref}:${v.rawText}`);
    }
  }
  return acc;
}

/** Every scanner value in every region is either covered by an accepted item's span or surfaced as uninventoried - never silently absent (mission §6/§17). */
export function silentAbsences(built: BuiltScenario): string[] {
  const out: string[] = [];
  for (const region of built.sourceContext.regions) {
    for (const v of scanQuantitativeValues(region.text)) {
      const covered = built.inventory.items.some((i) => i.sourceSpan.regionId === region.regionId && i.sourceSpan.charStart <= v.charStart && v.charEnd <= i.sourceSpan.charEnd);
      const surfaced = built.inventory.uninventoriedValues.some((u) => u.regionId === region.regionId && u.charStart === v.charStart && u.charEnd === v.charEnd);
      if (!covered && !surfaced) out.push(`${built.scenario.id}:${region.regionId}:${v.rawText}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Injection operators (I41-I44), applied to the normalized IR as plain JSON.
// ---------------------------------------------------------------------------
type Json = Record<string, unknown>;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function carries(node: unknown, id: string): boolean {
  return !!node && typeof node === "object" && Array.isArray((node as Json).inventoryItemIds) && ((node as Json).inventoryItemIds as string[]).includes(id);
}

/** Removes every IR node whose OWN lineage names `id` (array elements are dropped; object-valued expression slots become null). Returns how many nodes were removed. */
export function stripLineageNodes(ir: NormalizedCompilation, id: string): { ir: NormalizedCompilation; removed: number } {
  const copy = clone(ir);
  let removed = 0;
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      const kept = value.filter((el) => {
        if (carries(el, id)) {
          removed++;
          return false;
        }
        return true;
      });
      return kept.map(walk);
    }
    if (value && typeof value === "object") {
      const obj = value as Json;
      for (const key of Object.keys(obj)) {
        const child = obj[key];
        if (child && typeof child === "object" && !Array.isArray(child) && carries(child, id)) {
          removed++;
          obj[key] = null;
        } else obj[key] = walk(child);
      }
      return obj;
    }
    return value;
  };
  walk(copy as unknown as Json);
  return { ir: copy, removed };
}

/** Rewrites every MONEY/PERCENT literal in the IR whose value equals `target` to a value that appears nowhere in the source. */
export function perturbLiteral(ir: NormalizedCompilation, kind: "MONEY" | "PERCENT" | "RATIO", target: number): { ir: NormalizedCompilation; rewritten: number } {
  const copy = clone(ir);
  let rewritten = 0;
  const field = kind === "MONEY" ? "amount" : "value";
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === "object") {
      const obj = value as Json;
      if (obj.kind === kind && typeof obj[field] === "number" && Math.abs((obj[field] as number) - target) < 1e-9) {
        obj[field] = kind === "PERCENT" ? (target * 7 + 0.013) % 1 : target * 7 + 13;
        rewritten++;
      }
      for (const key of Object.keys(obj)) walk(obj[key]);
    }
  };
  walk(copy as unknown as Json);
  return { ir: copy, rewritten };
}

/** Independent (reconciler-free) check: does any numeric literal / text in the IR still carry this value? Used to decide which injections MUST be detected. */
export function valueStillPresent(ir: NormalizedCompilation, kind: string, normalized: number | null, rawText: string): boolean {
  let present = false;
  const raw = rawText.replace(/\s+/g, " ").trim().toLowerCase();
  const walk = (value: unknown): void => {
    if (present) return;
    if (Array.isArray(value)) return value.forEach(walk);
    if (value && typeof value === "object") {
      const obj = value as Json;
      if (normalized !== null) {
        if ((kind === "MONEY" && obj.kind === "MONEY" && obj.amount === normalized) || ((kind === "PERCENT" || kind === "RATIO" || kind === "MULTIPLIER" || kind === "NUMBER") && (obj.kind === "PERCENT" || obj.kind === "RATIO" || obj.kind === "NUMBER") && obj.value === normalized)) present = true;
      }
      for (const key of Object.keys(obj)) {
        const child = obj[key];
        if (typeof child === "string" && child.toLowerCase().includes(raw)) present = true;
        else walk(child);
      }
    }
  };
  walk(ir as unknown as Json);
  return present;
}
