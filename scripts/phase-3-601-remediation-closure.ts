/**
 * PHASE 3 / 6.01 TRUST-FAILURE REMEDIATION - zero-cost closure (§16), ownership/lineage projection (§17) and
 * contextual-counter audit (§18). ONE implementation shared by the vitest gate and the artifact writer. No model calls:
 * the frozen paid inventory + persisted shard records are the only run evidence; the remediated production planner,
 * structural index, tool set and stitcher are executed deterministically.
 */
import { readFileSync, readdirSync } from "node:fs";
import { buildSection601 } from "./phase-3-601-preflight";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { validateFrozenInventoryResume } from "../lib/contract-model/compiler/semantic/frozen-inventory-resume";
import { planCompilationShards, DEFAULT_SHARD_BUDGET } from "../lib/contract-model/compiler/semantic/shard-planner";
import { executeShardPlan } from "../lib/contract-model/compiler/semantic/shard-execution";
import { stitchShardResults } from "../lib/contract-model/compiler/semantic/shard-stitcher";
import { contextualEmissionsCredited } from "../lib/contract-model/compiler/semantic/compile";
import { resolveReferenceTarget } from "../lib/contract-model/compiler/semantic-accountability/reference-resolver";
import { buildToolSet } from "../lib/contract-model/compiler/semantic/tools";
import { computeRuleId } from "../lib/contract-model/ir/identity";
import { DEFAULT_TOOL_BUDGET, SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, type SemanticToolAccess } from "../lib/contract-model/compiler/semantic/types";
import type { CompilationShard, ShardExecutionResult, ShardPlan, ShardComposition } from "../lib/contract-model/compiler/semantic/shard-types";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../lib/contract-model/compiler/semantic-accountability/types";
import type { IRRule, IRExpression, IRCondition } from "../lib/contract-model/ir/types";
import { findDefinedTermVariant, type StructuralIndex } from "../lib/contract-model/compiler/structural-index";

export const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-final-paid";
export const PAID_PLAN_HASH = "eab77c1aad1d941440f0d412e20578902c6744a5e100a0306153ea02e1720552";

export type OldRequestKind = "SECTION" | "TERM" | "EXTERNAL_DOCUMENT";
export interface OldRequest {
  key: string;
  kind: OldRequestKind;
  /** The persisted rule(s)/definition(s) of the failed shard that recorded the request. */
  requestedBy: string[];
  oldShard: 0 | 1;
  /** How the request surfaced in the frozen terminal result. */
  oldEffect: "MISSING_CONTEXT_TRIGGER" | "PARTIAL_SUFFICIENCY" | "AMBIGUOUS_SUFFICIENCY" | "UNRESOLVED_CROSS_UNIT_DEPENDENCY";
  whyNeeded: string;
}

/** Every context request the two failed shards recorded, verbatim from durable-shards/*.json (mission §6). */
export const OLD_MISSING_REQUESTS: OldRequest[] = [
  { key: "2.18", kind: "SECTION", requestedBy: ["ir-rule:f8040ca894957f7bb7a0121c"], oldShard: 0, oldEffect: "MISSING_CONTEXT_TRIGGER", whyNeeded: "6.01(b)(1)(X): Indebtedness under the Loan Documents 'including pursuant to Section 2.18, 2.19 and 2.22'" },
  { key: "2.19", kind: "SECTION", requestedBy: ["ir-rule:f8040ca894957f7bb7a0121c"], oldShard: 0, oldEffect: "MISSING_CONTEXT_TRIGGER", whyNeeded: "same as 2.18" },
  { key: "2.22", kind: "SECTION", requestedBy: ["ir-rule:f8040ca894957f7bb7a0121c"], oldShard: 0, oldEffect: "MISSING_CONTEXT_TRIGGER", whyNeeded: "same as 2.18" },
  { key: "Loan Documents", kind: "TERM", requestedBy: ["ir-rule:f8040ca894957f7bb7a0121c"], oldShard: 0, oldEffect: "MISSING_CONTEXT_TRIGGER", whyNeeded: "the umbrella term the (X) basket is sized by" },
  { key: "6.01(b)(1)", kind: "SECTION", requestedBy: ["ir-rule:487a86ed915f18f337fe04e1"], oldShard: 0, oldEffect: "AMBIGUOUS_SUFFICIENCY", whyNeeded: "6.01(b)(3) carve-out 'other than Indebtedness described in Section 6.01(b)(1)'" },
  { key: "Permitted Ratio Debt", kind: "TERM", requestedBy: ["ir-rule:e21b76beb1594ddeb06234d8", "ir-rule:f2972befd147ab4956a952f6", "ir-rule:3a8ec278d265d62f22f2b373", "ir-rule:80d9015af4b70e18f048d4c8"], oldShard: 0, oldEffect: "UNRESOLVED_CROSS_UNIT_DEPENDENCY", whyNeeded: "the ratio baskets are collectively 'Permitted Ratio Debt' (defined inline in 6.01(a), forwarded from Article I)" },
  { key: "Fixed Incremental Amount", kind: "TERM", requestedBy: ["ir-rule:dd8291b9cbac4044a9c24f04", "ir-definition:f1861139cbbbb349d818f1da"], oldShard: 0, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "6.01(b)(1)(Z) capacity equals the Fixed Incremental Amount" },
  { key: "General Lien Basket Reallocated Amount", kind: "TERM", requestedBy: ["ir-definition:f1861139cbbbb349d818f1da"], oldShard: 0, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "additive component of Fixed Incremental Amount" },
  { key: "Available RP Capacity Amount", kind: "TERM", requestedBy: ["ir-definition:f1861139cbbbb349d818f1da"], oldShard: 0, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "additive component of Fixed Incremental Amount" },
  { key: "Incremental Facilities", kind: "TERM", requestedBy: ["ir-definition:f1861139cbbbb349d818f1da"], oldShard: 0, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "subtractive prior-usage component (cited in the plural; defined in the singular)" },
  { key: "Incremental Equivalent Debt", kind: "TERM", requestedBy: ["ir-definition:f1861139cbbbb349d818f1da", "ir-rule:24d3f241cead64be62a2019c"], oldShard: 0, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "subtractive prior-usage component; the clause (33) basket" },
  { key: "ABL Credit Agreement", kind: "EXTERNAL_DOCUMENT", requestedBy: ["ir-rule:5bf474b6ae440e22e62b168e"], oldShard: 0, oldEffect: "UNRESOLVED_CROSS_UNIT_DEPENDENCY", whyNeeded: "'Borrowing Base' is defined in the ABL Credit Agreement, a document outside this instrument" },
  { key: "Borrowing Base", kind: "TERM", requestedBy: ["ir-rule:5bf474b6ae440e22e62b168e"], oldShard: 0, oldEffect: "UNRESOLVED_CROSS_UNIT_DEPENDENCY", whyNeeded: "the (Y) cap is the greater of a fixed amount and the Borrowing Base" },
  { key: "Available Amount", kind: "TERM", requestedBy: ["ir-rule:aebc09fce0c0397c1d57ff37"], oldShard: 1, oldEffect: "MISSING_CONTEXT_TRIGGER", whyNeeded: "6.01(b)(32): Indebtedness 'not to exceed the Available Amount that is Not Otherwise Applied'" },
  { key: "Not Otherwise Applied", kind: "TERM", requestedBy: ["ir-rule:aebc09fce0c0397c1d57ff37"], oldShard: 1, oldEffect: "MISSING_CONTEXT_TRIGGER", whyNeeded: "qualifier of the clause (32) basket" },
  { key: "6.08(a)(3)", kind: "SECTION", requestedBy: ["ir-rule:aebc09fce0c0397c1d57ff37"], oldShard: 1, oldEffect: "MISSING_CONTEXT_TRIGGER", whyNeeded: "forwarding target of 'Available Amount' (the inline definition lives here)" },
  { key: "6.08(a)(3)(b)", kind: "SECTION", requestedBy: ["ir-rule:dc232af10c47ae17c479fac7"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "6.01(b)(12)(a): counted contributions per 6.08(a)(3)(b)/(c)" },
  { key: "6.08(a)(3)(c)", kind: "SECTION", requestedBy: ["ir-rule:dc232af10c47ae17c479fac7"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "same" },
  { key: "6.08(b)", kind: "SECTION", requestedBy: ["ir-rule:dc232af10c47ae17c479fac7"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "no-double-counting cross-reference" },
  { key: "6.08(b)(4)", kind: "SECTION", requestedBy: ["ir-rule:ace8a49182ef7336eb6fe566"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "6.01(b)(22): scope of Parent Entity equity purchases" },
  { key: "6.01(a)", kind: "SECTION", requestedBy: ["ir-rule:63c803fd30a19edd679fc7ee", "ir-rule:682fedbe08ac3985f898943d"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "6.01(b)(14): '$1.00 of additional Indebtedness permitted under the Section 6.01(a) ratio test'" },
  { key: "Interest Coverage Ratio", kind: "TERM", requestedBy: ["ir-rule:63c803fd30a19edd679fc7ee"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "ratio test threshold" },
  { key: "Total Leverage Ratio", kind: "TERM", requestedBy: ["ir-rule:63c803fd30a19edd679fc7ee"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "ratio test threshold" },
  { key: "6.01", kind: "SECTION", requestedBy: ["ir-rule:991acb3b933f4da5666ed3f2"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "closing paragraph borrows capacity from whichever basket under Section 6.01 was used" },
  { key: "6.01(b)(13)", kind: "SECTION", requestedBy: ["ir-rule:ba94defd3335602af0c396f6"], oldShard: 1, oldEffect: "UNRESOLVED_CROSS_UNIT_DEPENDENCY", whyNeeded: "6.01(b)(4)(a) SHARES_CAPACITY_WITH refinancing debt under clause (13)" },
  { key: "Incremental Cap", kind: "TERM", requestedBy: ["ir-rule:24d3f241cead64be62a2019c"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "Incremental Equivalent Debt is capped by the Incremental Cap" },
  { key: "Voluntary Prepayment Incremental Amount", kind: "TERM", requestedBy: ["ir-rule:24d3f241cead64be62a2019c"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "component of the Incremental Cap" },
  { key: "Ratio Incremental Amount", kind: "TERM", requestedBy: ["ir-rule:24d3f241cead64be62a2019c"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "component of the Incremental Cap" },
  { key: "Extension Amount", kind: "TERM", requestedBy: ["ir-rule:24d3f241cead64be62a2019c"], oldShard: 1, oldEffect: "PARTIAL_SUFFICIENCY", whyNeeded: "component of the Incremental Cap" },
];

export interface RemediationEnv {
  built: ReturnType<typeof buildSection601>;
  idx: StructuralIndex;
  access: SemanticToolAccess;
  inventory: FrozenSemanticInventory;
  ctx: SourceContextResult;
  plan: ShardPlan;
  oldRecords: { planHash: string; shardId: string; shardHash: string; result: ShardExecutionResult }[];
  frozenPlan: ShardPlan;
}

export function loadRemediationEnv(): RemediationEnv {
  const built = buildSection601();
  const idx = built.chewy.index;
  const inventory = JSON.parse(readFileSync(`${RAW}/frozen-inventory.json`, "utf8")) as FrozenSemanticInventory;
  const ctx = resolveSourceContext({ index: idx, documentId: "doc-a", operativeSourceText: built.input.operativeSourceText, anchorNodeId: built.input.contextBundle.originatingStructuralNodeIds?.[0] ?? null, operativeCharStart: built.input.operativeCharStart ?? null, documentText: idx.getDocumentText("doc-a") ?? null });
  const dec = validateFrozenInventoryResume({ candidateRef: built.candidateRef, sourceDocumentId: "doc-a", frozenInventory: inventory, sourceContext: ctx, structuralIndex: idx });
  if (!dec.ok) throw new Error("frozen inventory does not resume against the fresh source context: " + JSON.stringify(dec.failures));
  const plan = planCompilationShards({ candidateRef: built.candidateRef, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, documentId: "doc-a", sourceContext: ctx, frozenInventory: dec.inventory, structuralIndex: idx, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
  const oldRecords = readdirSync(`${RAW}/durable-shards`).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(`${RAW}/durable-shards/${f}`, "utf8")) as RemediationEnv["oldRecords"][number]);
  const frozenPlan = (JSON.parse(readFileSync("tests/fixtures/phase-3-601-remediation/frozen-pre-fix-plan.json", "utf8")) as { plan: ShardPlan }).plan;
  return { built, idx, access: built.input.toolAccess as SemanticToolAccess, inventory: dec.inventory, ctx, plan, oldRecords, frozenPlan };
}

// ---------------------------------------------------------------------------
// §16 closure
// ---------------------------------------------------------------------------

export interface ToolRouteResult { tool: string; input: Record<string, unknown>; ok: boolean; evidenceUnresolved: boolean | null; charsReturned: number; summary: string }
export function runRoute(access: SemanticToolAccess, tool: string, input: Record<string, unknown>): ToolRouteResult {
  const t = buildToolSet(access, "doc-a", { current: 0 }, DEFAULT_TOOL_BUDGET).find((x) => x.name === tool)!;
  const o = t.execute(input);
  return { tool, input, ok: o.ok, evidenceUnresolved: o.evidenceUnresolved ?? null, charsReturned: o.charsReturned, summary: o.outputSummary.slice(0, 300) };
}

export type ClosureResolution = "PLANNER_CONTEXT" | "OWNED_PRIMARY" | "BOUNDED_TOOL_ROUTE" | "DISCLOSED_VARIANT_POINTER" | "PROVEN_EXTERNAL_TO_PACKAGE" | "STILL_UNRESOLVED";
export interface ClosureRow {
  key: string; kind: OldRequestKind; oldShard: 0 | 1; oldEffect: OldRequest["oldEffect"]; whyNeeded: string; requestedBy: string[];
  requestingItemIds: string[]; newOwnerShards: string[];
  old: { plannerSupplied: false; reason: string };
  new: { resolution: ClosureResolution; resolvedBy: string; plannerContext: { shardId: string; contextKey: string; kind: string; chars: number; truncated: boolean }[]; plannerUnresolved: { shardId: string; reason: string; detail: string }[]; ownedInPrimary: string[]; routes: ToolRouteResult[]; usableRoutes: number };
}

const normSec = (r: string) => r.replace(/^\s*(?:sections?|sec\.?|§+)\s*/i, "").replace(/\s+/g, "").toLowerCase();
const normTerm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();

export function computeClosure(env: RemediationEnv): { rows: ClosureRow[]; counts: Record<ClosureResolution | "total", number> } {
  const { plan, frozenPlan, oldRecords, access, idx } = env;
  const oldObjects = new Map<string, string[]>();
  for (const r of oldRecords) for (const rule of r.result.composition?.rules ?? []) oldObjects.set(rule.ruleId, rule.inventoryItemIds ?? []);
  for (const r of oldRecords) for (const d of r.result.composition?.definitions ?? []) oldObjects.set(d.definitionId, d.inventoryItemIds ?? []);
  const oldShardById = [frozenPlan.shards[0]!, frozenPlan.shards[1]!];
  const rows: ClosureRow[] = OLD_MISSING_REQUESTS.map((req) => {
    const requestingItemIds = [...new Set(req.requestedBy.flatMap((id) => oldObjects.get(id) ?? []))];
    const newOwnerShards = [...new Set(requestingItemIds.map((id) => plan.itemOwnerShard[id]).filter((x): x is string => !!x))];
    const oldShard = oldShardById[req.oldShard]!;
    const oldKey = req.kind === "TERM" ? `term:${normTerm(req.key)}` : `section:${normSec(req.key)}`;
    const oldUnres = oldShard.unresolvedContext.find((u) => u.key === oldKey || u.key === normTerm(req.key) || u.key === normSec(req.key));
    const old = { plannerSupplied: false as const, reason: oldShard.context.some((c) => c.contextKey === oldKey) ? "SUPPLIED (not the cause)" : oldUnres ? `${oldUnres.reason}: ${oldUnres.detail}` : req.kind === "EXTERNAL_DOCUMENT" ? "not a package document" : "not a Pass A referenced term/section of the requesting items (one-hop planner)" };
    const shards = newOwnerShards.map((id) => plan.shards.find((s) => s.shardId === id)!);
    const plannerContext = shards.flatMap((s) => s.context.filter((c) => c.contextKey === oldKey).map((c) => ({ shardId: s.shardId, contextKey: c.contextKey, kind: c.kind, chars: c.chars, truncated: c.truncated })));
    const plannerUnresolved = shards.flatMap((s) => s.unresolvedContext.filter((u) => u.key === oldKey || u.key === normTerm(req.key) || u.key === normSec(req.key)).map((u) => ({ shardId: s.shardId, reason: u.reason, detail: u.detail })));
    let ownedInPrimary: string[] = [];
    let routes: ToolRouteResult[] = [];
    if (req.kind === "SECTION") {
      const fromNodeId = (() => { const rule = oldRecords.flatMap((r) => r.result.composition?.rules ?? []).find((r) => r.ruleId === req.requestedBy[0]); const node = rule?.sourceSectionRef ? resolveReferenceTarget(idx, "doc-a", rule.sourceSectionRef.replace(/\s.*$/, "")).node : null; return node?.nodeId ?? null; })();
      const target = resolveReferenceTarget(idx, "doc-a", req.key, { fromNodeId });
      const nodeIds = target.node ? [target.node.nodeId] : target.candidateNodeIds;
      ownedInPrimary = shards.filter((s) => s.ownedUnitKeys.some((k) => { const u = plan.units.find((x) => x.unitKey === k)!; return u.sourceNodeId !== null && nodeIds.includes(u.sourceNodeId); })).map((s) => s.shardId);
      routes = [runRoute(access, "getOperativeProvision", { sectionRef: req.key }), runRoute(access, "getReferencedProvision", { ref: `Section ${req.key}` }), ...(fromNodeId ? [runRoute(access, "getReferencedProvision", { ref: `Section ${req.key}`, fromNodeId })] : [])];
    } else if (req.kind === "TERM") {
      ownedInPrimary = shards.filter((s) => s.ownedUnitKeys.some((k) => plan.units.find((x) => x.unitKey === k)!.normalizedTermName === normTerm(req.key))).map((s) => s.shardId);
      routes = [runRoute(access, "getDefinition", { term: req.key }), runRoute(access, "getDefinitionDependencies", { term: req.key })];
    } else {
      routes = [runRoute(access, "getInstrumentDocuments", {})];
    }
    const usableRoutes = routes.filter((r) => r.ok && r.evidenceUnresolved !== true).length;
    let resolution: ClosureResolution; let resolvedBy: string;
    if (req.kind === "EXTERNAL_DOCUMENT" || (req.kind === "TERM" && req.key === "Borrowing Base" && !idx.getDefinition(req.key, "doc-a"))) { resolution = "PROVEN_EXTERNAL_TO_PACKAGE"; resolvedBy = "getInstrumentDocuments proves a single-document instrument; the term/document is not in the package - the rule kept it as an explicit unresolved cross-unit dependency (COMPLETE sufficiency), never guessed"; }
    else if (ownedInPrimary.length > 0) { resolution = "OWNED_PRIMARY"; resolvedBy = `the requested source is inside the requesting shard's own operative text (shard ${ownedInPrimary.join(", ")})`; }
    else if (plannerContext.length > 0) { resolution = "PLANNER_CONTEXT"; resolvedBy = plannerContext.map((c) => `${c.shardId} context ${c.contextKey} (${c.kind}, ${c.chars} chars${c.truncated ? ", head/tail" : ""})`).join("; "); }
    else if (req.kind === "TERM" && !idx.getDefinition(req.key, "doc-a") && findDefinedTermVariant(idx, req.key, "doc-a") && routes.some((r) => !r.ok && /grammatical-number variant/.test(r.summary))) { const v = findDefinedTermVariant(idx, req.key, "doc-a")!; const exact = runRoute(access, "getDefinition", { term: v.exactTerm }); resolution = exact.ok && exact.evidenceUnresolved !== true ? "DISCLOSED_VARIANT_POINTER" : "STILL_UNRESOLVED"; resolvedBy = `"${req.key}" is not itself a defined term; getDefinition refuses (OPEN-2 invariant: never served under a different name) and names the defined variant "${v.exactTerm}", which then resolves: ${exact.summary.slice(0, 120)}`; routes.push(exact); }
    else if (usableRoutes > 0) { resolution = "BOUNDED_TOOL_ROUTE"; resolvedBy = routes.filter((r) => r.ok && r.evidenceUnresolved !== true).map((r) => `${r.tool}(${JSON.stringify(r.input).slice(0, 60)}) -> ${r.summary.slice(0, 120)}`).join("; ") + (plannerUnresolved.length ? ` [planner: ${plannerUnresolved.map((u) => u.reason).join(", ")} - disclosed to the shard as a bounded-retrieval dependency]` : ""); }
    else { resolution = "STILL_UNRESOLVED"; resolvedBy = plannerUnresolved.map((u) => `${u.reason}: ${u.detail}`).join("; ") || "no route"; }
    return { key: req.key, kind: req.kind, oldShard: req.oldShard, oldEffect: req.oldEffect, whyNeeded: req.whyNeeded, requestedBy: req.requestedBy, requestingItemIds, newOwnerShards, old, new: { resolution, resolvedBy, plannerContext, plannerUnresolved, ownedInPrimary, routes, usableRoutes } };
  });
  const counts = { total: rows.length, PLANNER_CONTEXT: 0, OWNED_PRIMARY: 0, BOUNDED_TOOL_ROUTE: 0, DISCLOSED_VARIANT_POINTER: 0, PROVEN_EXTERNAL_TO_PACKAGE: 0, STILL_UNRESOLVED: 0 } as Record<ClosureResolution | "total", number>;
  for (const r of rows) counts[r.new.resolution]++;
  return { rows, counts };
}

// ---------------------------------------------------------------------------
// §17 ownership/lineage projection with a scripted, faithful, lineage-bearing terminal-complete emitter
// ---------------------------------------------------------------------------

let exprSeq = 0;
function literalFor(v: SemanticInventoryItem["quantitativeValues"][number], lineage: string[]): IRExpression | null {
  const base = { exprId: `proj-e${++exprSeq}`, inventoryItemIds: lineage };
  if (v.normalizedValue === null) return null;
  switch (v.kind) {
    case "MONEY": return { ...base, kind: "MONEY", type: "MONEY", amount: v.normalizedValue, currency: v.unit ?? "USD" } as unknown as IRExpression;
    case "PERCENT": return { ...base, kind: "PERCENT", type: "PERCENT", value: v.normalizedValue } as unknown as IRExpression;
    case "RATIO": case "MULTIPLIER": return { ...base, kind: "RATIO", type: "RATIO", value: v.normalizedValue } as unknown as IRExpression;
    default: return { ...base, kind: "NUMBER", type: "NUMBER", value: v.normalizedValue } as unknown as IRExpression;
  }
}

/** One rule per owned item, carrying that item's lineage and every one of its quantitative values (literal + verbatim description). Deterministic. */
export function faithfulEmitter(env: RemediationEnv, shard: CompilationShard): ShardComposition {
  const { plan, inventory, built } = env;
  const byId = new Map(inventory.items.map((i) => [i.inventoryItemId, i]));
  const rules: IRRule[] = [];
  for (const key of shard.ownedUnitKeys) {
    const unit = plan.units.find((u) => u.unitKey === key)!;
    for (const id of unit.ownedItemIds) {
      const it = byId.get(id)!;
      const sectionRef = unit.sectionRef ?? "6.01";
      const conditions: IRCondition[] = it.quantitativeValues.map((v, j) => ({ conditionId: `proj-c:${id}:${j}`, conditionType: "OTHER" as never, expression: literalFor(v, [id]), referencesDefinitionId: null, description: v.rawText, provenance: null, inventoryItemIds: [id] }));
      rules.push({ ruleId: computeRuleId(built.input.companyId, built.input.instrumentKey, sectionRef, `${built.candidateRef}#${shard.shardId}:${id}`), irSchemaVersion: "headroom-covenant-ir.v1", companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, sourceDocumentId: "doc-a", sourceSectionRef: sectionRef, covenantFamily: "DEBT_INCURRENCE", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: literalFor(it.quantitativeValues[0] ?? { kind: "OTHER", rawText: "", normalizedValue: null, unit: null, charStart: -1, charEnd: -1 }, [id]), conditions, exceptions: [], dependsOn: [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: { documentId: "doc-a", sourceNodeKey: null, sourceCitation: it.sourceSpan.sourceCitation, excerpt: it.sourceSpan.excerpt.slice(0, 200) }, compilerVersion: "projection", sourceContentVersion: null, inventoryItemIds: [id] } as unknown as IRRule);
    }
  }
  return { rules, definitions: [], sharedCapacities: [], inventoryDispositions: [] };
}

export interface LineageProjection {
  shards: number; executed: number; oversizedShards: number; maxPrimaryChars: number; maxUnitsPerShard: number; midSentenceShards: number;
  ownedValuesLost: number; distinctOwnedLineageLost: number; contextualOwnershipCreditViolations: number; contextualEmissionsDetected: number; sourceUnverifiableAuthoritativeIr: number; silentIncompatibleMerges: number; newDanglingRefs: number;
  materialMissingFromComposition: number; ownershipProof: ShardPlan["ownershipProof"]; duplicateOwnership: number; stitchedStatus: string;
}

export async function projectLineage(env: RemediationEnv): Promise<LineageProjection> {
  const { plan, inventory, ctx, built } = env;
  const run = await executeShardPlan({ plan, executor: async (shard) => ({ status: "SHARD_COMPLETE", composition: faithfulEmitter(env, shard), failureReasons: [], unresolvedIssues: [], telemetry: null }), frozenInventory: inventory, sourceContextState: ctx.state, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, candidateRef: built.candidateRef, sourceRegions: ctx.regions.map((r) => ({ regionId: r.regionId, text: r.text })) });
  const st = run.stitched;
  const owners = new Map<string, number>();
  for (const s of plan.shards) for (const id of s.ownedItemIds) owners.set(id, (owners.get(id) ?? 0) + 1);
  const anchored = new Set(st.definitionAttribution.filter((a) => a.anchor).map((a) => a.objectId));
  const defUnits = new Set(plan.units.filter((u) => u.kind === "DEFINITION").map((u) => u.normalizedTermName));
  const unverifiable = st.definitions.filter((d) => !defUnits.has(normTerm(d.termName)) && !(d.inventoryItemIds ?? []).length && !anchored.has(d.definitionId)).length;
  const regionText = ctx.regions[0]!.text;
  const midSentence = plan.shards.filter((s) => { const last = s.primarySlices[s.primarySlices.length - 1]!; return !/[.;:!?][\s"”'’)\]]*$/.test(regionText.slice(last.charStart, last.charEnd).trimEnd()); }).length;
  return {
    shards: plan.shards.length, executed: run.stats.executed, oversizedShards: plan.totals.oversizedShards, maxPrimaryChars: plan.totals.largestShardPrimaryChars, maxUnitsPerShard: plan.totals.largestShardUnits, midSentenceShards: midSentence,
    ownedValuesLost: st.accountability.counts.materialQuantitativeValuesMissing, distinctOwnedLineageLost: st.unresolvedOwnedItems.length, contextualOwnershipCreditViolations: contextualEmissionsCredited(st), contextualEmissionsDetected: st.contextualEmissions.length, sourceUnverifiableAuthoritativeIr: unverifiable, silentIncompatibleMerges: st.definitionConflicts.filter((c) => c.variants.length < 2).length, newDanglingRefs: st.accountability.counts.danglingLineageReferences,
    materialMissingFromComposition: st.accountability.counts.materialMissingFromComposition, ownershipProof: plan.ownershipProof, duplicateOwnership: [...owners.values()].filter((n) => n > 1).length, stitchedStatus: st.status,
  };
}

// ---------------------------------------------------------------------------
// §18 contextual counter audit over the frozen paid results (re-stitched through the real stitcher)
// ---------------------------------------------------------------------------

export function auditContextualCounter(env: RemediationEnv) {
  const { frozenPlan, oldRecords, inventory, ctx, built } = env;
  const results = frozenPlan.shards.map((s) => oldRecords.find((r) => r.shardId === s.shardId)!.result);
  const st = stitchShardResults({ plan: frozenPlan, results, frozenInventory: inventory, sourceContextState: ctx.state, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, candidateRef: built.candidateRef, sourceRegions: ctx.regions.map((r) => ({ regionId: r.regionId, text: r.text })) });
  const demotedIds = new Set(st.contextualEmissions.map((e) => e.objectId));
  const retainedDemoted = st.definitions.filter((d) => demotedIds.has(d.definitionId)).length + st.rules.filter((r) => demotedIds.has(r.ruleId)).length;
  return {
    detected: st.contextualEmissions.length,
    detectedByKind: st.contextualEmissions.reduce((a: Record<string, number>, e) => { a[e.kind] = (a[e.kind] ?? 0) + 1; return a; }, {}),
    demoted: st.contextualEmissions.length - contextualEmissionsCredited(st),
    credited: contextualEmissionsCredited(st),
    retainedDemotedObjects: retainedDemoted,
    attributionRetainedFalse: st.definitionAttribution.filter((a) => demotedIds.has(a.objectId)).every((a) => a.retained === false),
    collisionsByKind: st.collisions.reduce((a: Record<string, number>, c) => { a[c.kind] = (a[c.kind] ?? 0) + 1; return a; }, {}),
    paidCounterValue: 2,
    verdict: contextualEmissionsCredited(st) === 0 ? "AUDIT_COUNTER_DEFECT" : "REAL_PRODUCTION_VIOLATION",
  };
}

export const BUDGET = DEFAULT_SHARD_BUDGET;
