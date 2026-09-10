/**
 * F-7A - DETERMINISTIC IR STITCHING of independently compiled shards.
 *
 * Combines existing General Covenant IR objects without inventing semantics:
 *   - every emitted rule/definition/shared capacity is attributed to the semantic source unit that owns it (definition
 *     term -> definition unit; lineage majority -> unit; section ref -> unit); an emission whose owner unit belongs to
 *     ANOTHER shard is a contextual emission - kept out of the stitched IR, never credited, always listed;
 *   - lineage (inventoryItemIds) and explicit dispositions may only name items the emitting shard OWNS; claims on
 *     other shards' items are stripped and recorded (no duplicate accountability credit for read-only context);
 *   - rule / shared-capacity ids are re-derived from ownership (candidate + owner unit + source-order ordinal) so
 *     shard-local model ordering and the packing of unrelated siblings never change a final id; definition ids are
 *     already global (term-derived); every internal reference is remapped, and a reference to a dropped object
 *     becomes an explicit unresolved dependency / UNSUPPORTED node - never a dangling id;
 *   - the same definition from two shards: identical content -> one copy (owner's); different content -> the owner's
 *     copy kept with sufficiency AMBIGUOUS plus an explicit conflict - never a silent choice;
 *   - the GLOBAL Pass C reconciliation (semantic-accountability/reconciliation.ts, unchanged) runs over the FULL frozen
 *     inventory and the stitched IR: a failed shard's owned material items surface as MISSING_FROM_COMPOSITION, so a
 *     successful sibling can never hide an uncompiled item and the candidate can never be COMPLETED.
 */
import { computeContentIdentity, computeRuleId, computeSharedCapId } from "../../ir/identity";
import type { IRCapacityExpression, IRDefinition, IRExpression, IRRule, IRSharedCapacity } from "../../ir/types";
import { normalizeDefinedTermRef } from "../amendment/operative-state";
import { reconcileInventoryWithComposition } from "../semantic-accountability/reconciliation";
import type { FrozenSemanticInventory, SourceContextState } from "../semantic-accountability/types";
import type { CompilationShard, ShardCollision, ShardComposition, ShardExecutionResult, ShardPlan, ShardStatus, StitchedCandidateStatus, StitchedCompilation } from "./shard-types";
import type { SemanticCompilerFailureReason } from "./types";

export interface StitchInput {
  plan: ShardPlan;
  results: ShardExecutionResult[];
  frozenInventory: FrozenSemanticInventory;
  sourceContextState: SourceContextState;
  companyId: string;
  instrumentKey: string;
  candidateRef: string;
}

// ---------------------------------------------------------------------------
// Expression walking (generic over the IR's own child keys - no new semantics)
// ---------------------------------------------------------------------------

const CHILD_KEYS = ["operands", "left", "right", "operand", "condition", "then", "else", "numerator", "denominator", "defaultValue", "triggerCondition", "value", "gatedBy", "attemptedStructure"] as const;

function walkExpr(expr: unknown, visit: (node: Record<string, unknown>, path: string) => void, path: string): void {
  if (!expr || typeof expr !== "object") return;
  const node = expr as Record<string, unknown>;
  if (typeof node.kind === "string") visit(node, path);
  for (const k of CHILD_KEYS) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c, i) => walkExpr(c, visit, `${path}.${k}[${i}]`));
    else if (v && typeof v === "object") walkExpr(v, visit, `${path}.${k}`);
  }
  const cases = node.cases;
  if (Array.isArray(cases)) cases.forEach((c, i) => walkExpr((c as { value?: unknown }).value, visit, `${path}.cases[${i}].value`));
}

function lineageIdsOfRule(rule: IRRule): string[] {
  const ids: string[] = [...(rule.inventoryItemIds ?? [])];
  const collect = (node: Record<string, unknown>) => { const l = node.inventoryItemIds; if (Array.isArray(l)) ids.push(...(l as string[])); };
  walkExpr(rule.capacityExpression, collect, "cap");
  for (const c of rule.conditions) { ids.push(...(c.inventoryItemIds ?? [])); walkExpr(c.expression, collect, "cond"); }
  for (const e of rule.exceptions) { ids.push(...(e.inventoryItemIds ?? [])); for (const c of e.conditions) { ids.push(...(c.inventoryItemIds ?? [])); walkExpr(c.expression, collect, "exc"); } }
  for (const d of rule.dependsOn) ids.push(...(d.inventoryItemIds ?? []));
  for (const d of rule.unresolvedDependencies ?? []) ids.push(...(d.inventoryItemIds ?? []));
  return ids;
}

function lineageIdsOfDefinition(def: IRDefinition): string[] {
  const ids: string[] = [...(def.inventoryItemIds ?? [])];
  walkExpr(def.calculationExpression, (node) => { const l = node.inventoryItemIds; if (Array.isArray(l)) ids.push(...(l as string[])); }, "calc");
  return ids;
}

/**
 * Digest-form id canonicalization (mirrors Pass C reconciliation.ts): a model - or a recorded paid run - may cite an
 * inventory item by its bare 24-hex digest instead of the full `inv-item:<digest>` id. The digest IS the identity, so
 * such a claim is mapped to the known id before ownership scoping; an id matching no known digest is left as given.
 */
function digestOf(id: string): string {
  const idx = id.indexOf(":");
  return (idx >= 0 ? id.slice(idx + 1) : id).toLowerCase();
}

/** Canonicalizes every `inventoryItemIds` array and disposition id in a shard composition (deep, on a clone). */
function canonicalizeCompositionIds(comp: ShardComposition, knownIds: Set<string>, digestIndex: Map<string, string>): { comp: ShardComposition; canonicalized: number } {
  let canonicalized = 0;
  const canon = (raw: string): string => {
    if (knownIds.has(raw)) return raw;
    const mapped = digestIndex.get(digestOf(raw));
    if (mapped) { canonicalized++; return mapped; }
    return raw;
  };
  const clone = JSON.parse(JSON.stringify(comp)) as ShardComposition;
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const r = x as Record<string, unknown>;
    if (Array.isArray(r.inventoryItemIds)) r.inventoryItemIds = (r.inventoryItemIds as string[]).map(canon);
    for (const v of Object.values(r)) if (v && typeof v === "object") walk(v);
  };
  walk(clone.rules); walk(clone.definitions); walk(clone.sharedCapacities);
  clone.inventoryDispositions = clone.inventoryDispositions.map((d) => ({ ...d, inventoryItemId: canon(d.inventoryItemId) }));
  return { comp: clone, canonicalized };
}

/** Strips lineage claims naming items the shard does not own, everywhere in the object (deep, in place on a clone). */
function scopeLineage<T extends object>(obj: T, owned: Set<string>, onStrip: (irPath: string, itemId: string) => void, basePath: string): T {
  const clone = JSON.parse(JSON.stringify(obj)) as T;
  const visit = (node: Record<string, unknown>, path: string) => {
    const l = node.inventoryItemIds;
    if (!Array.isArray(l)) return;
    const kept = (l as string[]).filter((id) => { const ok = owned.has(id); if (!ok) onStrip(path, id); return ok; });
    if (kept.length > 0) node.inventoryItemIds = kept;
    else delete node.inventoryItemIds;
  };
  visit(clone as unknown as Record<string, unknown>, basePath);
  const r = clone as unknown as Record<string, unknown>;
  walkExpr(r.capacityExpression, visit, `${basePath}.capacityExpression`);
  walkExpr(r.calculationExpression, visit, `${basePath}.calculationExpression`);
  walkExpr(r.capExpression, visit, `${basePath}.capExpression`);
  const conditions = (r.conditions as Record<string, unknown>[] | undefined) ?? [];
  conditions.forEach((c, i) => { visit(c, `${basePath}.conditions[${i}]`); walkExpr(c.expression, visit, `${basePath}.conditions[${i}].expression`); });
  const exceptions = (r.exceptions as Record<string, unknown>[] | undefined) ?? [];
  exceptions.forEach((e, i) => { visit(e, `${basePath}.exceptions[${i}]`); ((e.conditions as Record<string, unknown>[] | undefined) ?? []).forEach((c, j) => { visit(c, `${basePath}.exceptions[${i}].conditions[${j}]`); walkExpr(c.expression, visit, `${basePath}.exceptions[${i}].conditions[${j}].expression`); }); });
  ((r.dependsOn as Record<string, unknown>[] | undefined) ?? []).forEach((d, i) => visit(d, `${basePath}.dependsOn[${i}]`));
  ((r.unresolvedDependencies as Record<string, unknown>[] | undefined) ?? []).forEach((d, i) => visit(d, `${basePath}.unresolvedDependencies[${i}]`));
  return clone;
}

// ---------------------------------------------------------------------------
// Ownership attribution of emitted objects
// ---------------------------------------------------------------------------

function normalizeSectionRef(ref: string): string {
  return ref.replace(/^\s*(?:sections?|sec\.?|§+)\s*/i, "").replace(/\s+/g, "").toLowerCase();
}

interface Attribution { unitKey: string | null; method: "DEFINITION_TERM" | "LINEAGE_MAJORITY" | "SECTION_REF" | "SHARD_FIRST_UNIT" | "UNATTRIBUTED"; }

function attributeByLineage(plan: ShardPlan, ids: string[]): string | null {
  const counts = new Map<string, number>();
  for (const id of ids) { const u = plan.itemOwnerUnit[id]; if (u) counts.set(u, (counts.get(u) ?? 0) + 1); }
  let best: string | null = null;
  let bestN = 0;
  for (const [u, n] of [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) if (n > bestN) { best = u; bestN = n; }
  return best;
}

function attributeRule(plan: ShardPlan, shard: CompilationShard, rule: IRRule): Attribution {
  const byLineage = attributeByLineage(plan, lineageIdsOfRule(rule));
  if (byLineage) return { unitKey: byLineage, method: "LINEAGE_MAJORITY" };
  if (rule.sourceSectionRef) {
    const ref = normalizeSectionRef(rule.sourceSectionRef);
    const inShard = shard.ownedUnitKeys.map((k) => plan.units.find((u) => u.unitKey === k)!).find((u) => u.sectionRef && normalizeSectionRef(u.sectionRef) === ref);
    if (inShard) return { unitKey: inShard.unitKey, method: "SECTION_REF" };
    const elsewhere = plan.units.find((u) => u.sectionRef && normalizeSectionRef(u.sectionRef) === ref && u.kind !== "LEAD_IN");
    if (elsewhere) return { unitKey: elsewhere.unitKey, method: "SECTION_REF" };
  }
  return shard.ownedUnitKeys.length > 0 ? { unitKey: shard.ownedUnitKeys[0]!, method: "SHARD_FIRST_UNIT" } : { unitKey: null, method: "UNATTRIBUTED" };
}

function attributeDefinition(plan: ShardPlan, shard: CompilationShard, def: IRDefinition): Attribution {
  const key = normalizeDefinedTermRef(def.termName);
  const termUnit = plan.units.find((u) => u.kind === "DEFINITION" && u.normalizedTermName === key);
  if (termUnit) return { unitKey: termUnit.unitKey, method: "DEFINITION_TERM" };
  const byLineage = attributeByLineage(plan, lineageIdsOfDefinition(def));
  if (byLineage) return { unitKey: byLineage, method: "LINEAGE_MAJORITY" };
  return shard.ownedUnitKeys.length > 0 ? { unitKey: shard.ownedUnitKeys[0]!, method: "SHARD_FIRST_UNIT" } : { unitKey: null, method: "UNATTRIBUTED" };
}

function contentIdentityIgnoringIds(obj: IRRule | IRDefinition | IRSharedCapacity): string {
  const clone = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  delete clone.ruleId; delete clone.definitionId; delete clone.sharedCapId; delete clone.inventoryItemIds; delete clone.sufficiencyReasons;
  return computeContentIdentity(clone as unknown as IRRule);
}

// ---------------------------------------------------------------------------
// Stitching
// ---------------------------------------------------------------------------

export function stitchShardResults(input: StitchInput): StitchedCompilation {
  const { plan, frozenInventory, companyId, instrumentKey, candidateRef } = input;
  const byId = new Map(frozenInventory.items.map((i) => [i.inventoryItemId, i]));
  const knownIds = new Set(frozenInventory.items.map((i) => i.inventoryItemId));
  const digestIndex = new Map(frozenInventory.items.map((i) => [digestOf(i.inventoryItemId), i.inventoryItemId]));
  let canonicalizedLineageReferences = 0;
  const resultByShard = new Map(input.results.map((r) => {
    if (!r.composition) return [r.shardId, r] as const;
    const c = canonicalizeCompositionIds(r.composition, knownIds, digestIndex);
    canonicalizedLineageReferences += c.canonicalized;
    return [r.shardId, { ...r, composition: c.comp }] as const;
  }));
  const collisions: ShardCollision[] = [];
  const contextualEmissions: StitchedCompilation["contextualEmissions"] = [];
  const idMap: Record<string, string> = {};
  const unresolvedIssues: string[] = [];

  interface Owned<T> { obj: T; shard: CompilationShard; unitKey: string; oldId: string; sourceOffset: number; emissionIndex: number }
  const ownedRules: Owned<IRRule>[] = [];
  const ownedCaps: Owned<IRSharedCapacity>[] = [];
  const ownedDefs = new Map<string, Owned<IRDefinition>>();
  const dispositions: StitchedCompilation["inventoryDispositions"] = [];

  const minOffset = (ids: string[]): number => ids.reduce((m, id) => { const it = byId.get(id); return it ? Math.min(m, it.sourceSpan.charStart) : m; }, Number.POSITIVE_INFINITY);

  const emittedOldIds = new Set<string>();
  for (const r of input.results) for (const x of r.composition?.rules ?? []) emittedOldIds.add(x.ruleId);
  for (const r of input.results) for (const x of r.composition?.sharedCapacities ?? []) emittedOldIds.add(x.sharedCapId);
  /** An "ir-rule:" id that no shard emitted is an already-existing external rule (learned via a tool) - left untouched; one that a shard emitted but the stitcher did not keep is a dropped object and must never dangle. */
  const isExternalId = (id: string) => id.startsWith("ir-rule:") && !emittedOldIds.has(id);

  for (const shard of plan.shards) {
    const result = resultByShard.get(shard.shardId);
    if (!result?.composition) continue;
    const ownedSet = new Set(shard.ownedItemIds);
    const strip = (kind: "RULE" | "DEFINITION" | "SHARED_CAP", objectId: string) => (irPath: string, itemId: string) => {
      collisions.push({ kind: "LINEAGE_CLAIM_ON_UNOWNED_ITEM", shardId: shard.shardId, ownerShardId: plan.itemOwnerShard[itemId] ?? null, objectId, irPath, itemId, requiresReview: false, detail: `${kind} ${objectId} claimed lineage on ${itemId}, which is owned by ${plan.itemOwnerShard[itemId] ? `shard ${plan.itemOwnerShard[itemId]}` : "no shard (unknown item)"} - stripped; read-only context earns no accountability credit` });
    };
    const shardUnits = new Set(shard.ownedUnitKeys);

    result.composition.rules.forEach((rule, i) => {
      const scoped = scopeLineage(rule, ownedSet, strip("RULE", rule.ruleId), `shard[${shard.shardId}].rules[${i}]`);
      const att = attributeRule(plan, shard, rule);
      if (!att.unitKey || !shardUnits.has(att.unitKey)) {
        contextualEmissions.push({ shardId: shard.shardId, kind: "RULE", objectId: rule.ruleId, ownerShardId: att.unitKey ? plan.unitOwnerShard[att.unitKey] ?? null : null });
        collisions.push({ kind: "RULE_EMITTED_OUT_OF_SCOPE", shardId: shard.shardId, ownerShardId: att.unitKey ? plan.unitOwnerShard[att.unitKey] ?? null : null, objectId: rule.ruleId, irPath: `shard[${shard.shardId}].rules[${i}]`, itemId: null, requiresReview: true, detail: `rule attributed (${att.method}) to unit ${att.unitKey ?? "(none)"} which this shard does not own - kept out of the stitched IR, never credited` });
        return;
      }
      ownedRules.push({ obj: scoped, shard, unitKey: att.unitKey, oldId: rule.ruleId, sourceOffset: minOffset(lineageIdsOfRule(rule)), emissionIndex: i });
    });

    result.composition.definitions.forEach((def, i) => {
      const scoped = scopeLineage(def, ownedSet, strip("DEFINITION", def.definitionId), `shard[${shard.shardId}].definitions[${i}]`);
      const att = attributeDefinition(plan, shard, def);
      if (!att.unitKey || !shardUnits.has(att.unitKey)) {
        contextualEmissions.push({ shardId: shard.shardId, kind: "DEFINITION", objectId: def.definitionId, ownerShardId: att.unitKey ? plan.unitOwnerShard[att.unitKey] ?? null : null });
        collisions.push({ kind: "DEFINITION_EMITTED_BY_NON_OWNER", shardId: shard.shardId, ownerShardId: att.unitKey ? plan.unitOwnerShard[att.unitKey] ?? null : null, objectId: def.definitionId, irPath: `shard[${shard.shardId}].definitions[${i}]`, itemId: null, requiresReview: true, detail: `definition "${def.termName}" is owned by unit ${att.unitKey ?? "(none)"} (${att.method}) in another shard - this copy is contextual, kept out of the stitched IR and never credited` });
        return;
      }
      const existing = ownedDefs.get(def.definitionId);
      if (existing) {
        const same = contentIdentityIgnoringIds(existing.obj) === contentIdentityIgnoringIds(scoped);
        if (same) collisions.push({ kind: "DEFINITION_DUPLICATE_CONSISTENT", shardId: shard.shardId, ownerShardId: existing.shard.shardId, objectId: def.definitionId, irPath: `shard[${shard.shardId}].definitions[${i}]`, itemId: null, requiresReview: false, detail: `definition "${def.termName}" emitted twice with identical content - one copy kept` });
        else {
          collisions.push({ kind: "DEFINITION_CONFLICT", shardId: shard.shardId, ownerShardId: existing.shard.shardId, objectId: def.definitionId, irPath: `shard[${shard.shardId}].definitions[${i}]`, itemId: null, requiresReview: true, detail: `definition "${def.termName}" emitted with DIFFERENT content by two shards that both own it - the first owner copy is kept with sufficiency AMBIGUOUS; not silently reconciled` });
          existing.obj = { ...existing.obj, sufficiency: "AMBIGUOUS", sufficiencyReasons: [...existing.obj.sufficiencyReasons, `F-7A stitcher: a second shard (${shard.shardId}) emitted an incompatible representation of this definition - conflict requires review`] };
        }
        return;
      }
      ownedDefs.set(def.definitionId, { obj: scoped, shard, unitKey: att.unitKey, oldId: def.definitionId, sourceOffset: 0, emissionIndex: i });
    });

    result.composition.sharedCapacities.forEach((cap, i) => {
      const scoped = scopeLineage(cap, ownedSet, strip("SHARED_CAP", cap.sharedCapId), `shard[${shard.shardId}].sharedCapacities[${i}]`);
      const unit = attributeByLineage(plan, [...(cap.inventoryItemIds ?? [])]) ?? shard.ownedUnitKeys[0] ?? null;
      if (!unit || !shardUnits.has(unit)) {
        contextualEmissions.push({ shardId: shard.shardId, kind: "SHARED_CAP", objectId: cap.sharedCapId, ownerShardId: unit ? plan.unitOwnerShard[unit] ?? null : null });
        collisions.push({ kind: "SHARED_CAP_EMITTED_OUT_OF_SCOPE", shardId: shard.shardId, ownerShardId: unit ? plan.unitOwnerShard[unit] ?? null : null, objectId: cap.sharedCapId, irPath: `shard[${shard.shardId}].sharedCapacities[${i}]`, itemId: null, requiresReview: true, detail: "shared capacity attributed to a unit this shard does not own - kept out of the stitched IR" });
        return;
      }
      ownedCaps.push({ obj: scoped, shard, unitKey: unit, oldId: cap.sharedCapId, sourceOffset: minOffset(cap.inventoryItemIds ?? []), emissionIndex: i });
    });

    for (const d of result.composition.inventoryDispositions) {
      if (ownedSet.has(d.inventoryItemId)) dispositions.push(d);
      else collisions.push({ kind: "DISPOSITION_ON_UNOWNED_ITEM", shardId: shard.shardId, ownerShardId: plan.itemOwnerShard[d.inventoryItemId] ?? null, objectId: d.inventoryItemId, irPath: null, itemId: d.inventoryItemId, requiresReview: false, detail: `disposition "${d.disposition}" on ${d.inventoryItemId}, owned elsewhere - dropped` });
    }
  }

  // --- Global ids from ownership: candidate + owner unit + source-order ordinal (never the shard-local localRef order).
  const orderKey = (a: Owned<unknown>, b: Owned<unknown>) => a.sourceOffset - b.sourceOffset || a.emissionIndex - b.emissionIndex;
  const rulesByUnit = new Map<string, Owned<IRRule>[]>();
  for (const r of ownedRules) rulesByUnit.set(r.unitKey, [...(rulesByUnit.get(r.unitKey) ?? []), r]);
  const stitchedRules: IRRule[] = [];
  const seenRuleContent = new Map<string, string>();
  for (const [unitKey, list] of [...rulesByUnit.entries()].sort((a, b) => plan.units.find((u) => u.unitKey === a[0])!.ordinal - plan.units.find((u) => u.unitKey === b[0])!.ordinal)) {
    list.sort(orderKey);
    let ordinal = 0;
    for (const r of list) {
      const content = contentIdentityIgnoringIds(r.obj);
      const dupKey = `${unitKey}|${content}`;
      if (seenRuleContent.has(dupKey)) {
        idMap[r.oldId] = seenRuleContent.get(dupKey)!;
        collisions.push({ kind: "RULE_DUPLICATE_CONSISTENT", shardId: r.shard.shardId, ownerShardId: r.shard.shardId, objectId: r.oldId, irPath: null, itemId: null, requiresReview: false, detail: `rule emitted twice with identical content for unit ${unitKey} - one copy kept` });
        continue;
      }
      const newId = computeRuleId(companyId, instrumentKey, r.obj.sourceSectionRef, `${candidateRef}:${unitKey}:${ordinal}`);
      ordinal++;
      seenRuleContent.set(dupKey, newId);
      idMap[r.oldId] = newId;
      stitchedRules.push({ ...r.obj, ruleId: newId });
    }
  }
  // Same-unit rules that differ in content but look alike (same section ref + posture + action) are flagged for review, never merged.
  const alike = new Map<string, string[]>();
  for (const r of stitchedRules) { const k = `${r.sourceSectionRef ?? ""}|${r.posture}|${r.action ?? ""}|${r.capacityExpression?.kind ?? "none"}`; alike.set(k, [...(alike.get(k) ?? []), r.ruleId]); }
  for (const [k, ids] of alike) if (ids.length > 1) collisions.push({ kind: "RULE_POSSIBLE_DUPLICATE", shardId: "(stitched)", ownerShardId: null, objectId: ids.join(","), irPath: null, itemId: null, requiresReview: true, detail: `${ids.length} rules share section/posture/action/capacity shape (${k}) but differ in content - possible accidental duplicate, review required; not merged` });

  const capsSorted = [...ownedCaps].sort((a, b) => plan.units.find((u) => u.unitKey === a.unitKey)!.ordinal - plan.units.find((u) => u.unitKey === b.unitKey)!.ordinal || orderKey(a, b));
  const capOrdinals = new Map<string, number>();
  const stitchedCaps: IRSharedCapacity[] = capsSorted.map((c) => {
    const n = capOrdinals.get(c.unitKey) ?? 0;
    capOrdinals.set(c.unitKey, n + 1);
    const newId = computeSharedCapId(companyId, instrumentKey, `${candidateRef}:${c.unitKey}:${n}`);
    idMap[c.oldId] = newId;
    return { ...c.obj, sharedCapId: newId };
  });
  const stitchedDefs: IRDefinition[] = [...ownedDefs.values()].sort((a, b) => plan.units.find((u) => u.unitKey === a.unitKey)!.ordinal - plan.units.find((u) => u.unitKey === b.unitKey)!.ordinal || a.emissionIndex - b.emissionIndex).map((d) => d.obj);

  // --- Reference remapping. A reference to an object that was dropped (contextual emission) is never left dangling.
  const knownRuleIds = new Set(stitchedRules.map((r) => r.ruleId));
  const knownCapIds = new Set(stitchedCaps.map((c) => c.sharedCapId));
  const remapExpr = (expr: IRExpression | IRCapacityExpression | null | undefined, path: string, shardId: string): void => {
    walkExpr(expr, (node, p) => {
      if (node.kind === "RULE_REFERENCE" && typeof node.ruleId === "string") {
        const mapped = idMap[node.ruleId] ?? (knownRuleIds.has(node.ruleId) ? node.ruleId : null);
        if (mapped) node.ruleId = mapped;
        else {
          if (isExternalId(node.ruleId)) return; // an external, already-existing rule id learned via a tool - untouched
          collisions.push({ kind: "DANGLING_RULE_REFERENCE", shardId, ownerShardId: null, objectId: String(node.ruleId), irPath: p, itemId: null, requiresReview: true, detail: "RULE_REFERENCE to a rule that is not part of the stitched IR - replaced by an UNSUPPORTED node" });
          const sourceEvidence = typeof node.sourceEvidence === "string" ? node.sourceEvidence : "";
          for (const k of Object.keys(node)) if (k !== "exprId" && k !== "provenance" && k !== "inventoryItemIds") delete node[k];
          Object.assign(node, { kind: "UNSUPPORTED", type: null, sourceEvidence, semanticDescription: "reference to a rule compiled in another shard (or dropped as out of scope)", reason: "F-7A stitcher: cross-shard rule reference cannot be resolved deterministically - review required", requiredReview: true });
        }
      }
      if (node.kind === "LEDGER_USAGE_REFERENCE") {
        if (typeof node.ruleId === "string" && idMap[node.ruleId]) node.ruleId = idMap[node.ruleId];
        if (typeof node.sharedCapId === "string" && idMap[node.sharedCapId]) node.sharedCapId = idMap[node.sharedCapId];
      }
    }, path);
  };
  for (const r of stitchedRules) {
    const shardId = ownedRules.find((o) => idMap[o.oldId] === r.ruleId)?.shard.shardId ?? "(stitched)";
    remapExpr(r.capacityExpression, `rules.${r.ruleId}.capacityExpression`, shardId);
    r.conditions.forEach((c, i) => remapExpr(c.expression, `rules.${r.ruleId}.conditions[${i}]`, shardId));
    r.exceptions = r.exceptions.map((e) => {
      e.conditions.forEach((c, i) => remapExpr(c.expression, `rules.${r.ruleId}.exceptions.conditions[${i}]`, shardId));
      return { ...e, appliesToRuleId: r.ruleId, permissionRuleId: e.permissionRuleId ? (idMap[e.permissionRuleId] ?? (knownRuleIds.has(e.permissionRuleId) ? e.permissionRuleId : null)) : null };
    });
    const keptDeps = [];
    const unresolved = [...(r.unresolvedDependencies ?? [])];
    for (const d of r.dependsOn) {
      const mapped = idMap[d.targetRuleId] ?? (knownRuleIds.has(d.targetRuleId) ? d.targetRuleId : null);
      if (mapped) keptDeps.push({ ...d, targetRuleId: mapped });
      else if (isExternalId(d.targetRuleId)) keptDeps.push(d);
      else unresolved.push({ relationshipType: d.relationshipType, targetRef: d.targetRuleId, description: d.description, reason: "F-7A stitcher: dependency target is not part of the stitched IR (compiled in another shard or dropped as out of scope) - carried as unresolved, never guessed", ...(d.inventoryItemIds ? { inventoryItemIds: d.inventoryItemIds } : {}) });
    }
    r.dependsOn = keptDeps;
    if (unresolved.length > 0) r.unresolvedDependencies = unresolved;
  }
  for (const c of stitchedCaps) {
    remapExpr(c.capExpression, `sharedCapacities.${c.sharedCapId}.capExpression`, "(stitched)");
    c.memberRuleIds = c.memberRuleIds.map((id) => idMap[id] ?? id).filter((id) => knownRuleIds.has(id) || isExternalId(id));
  }
  for (const d of stitchedDefs) remapExpr(d.calculationExpression, `definitions.${d.definitionId}.calculationExpression`, "(stitched)");
  void knownCapIds;

  // --- Shard status roll-up and unresolved owned items.
  const shardSummaries = plan.shards.map((s) => {
    const r = resultByShard.get(s.shardId);
    const status: ShardStatus = r?.status ?? "SHARD_PROVIDER_FAILURE";
    return { shardId: s.shardId, shardHash: s.shardHash, status, ownedMaterialItems: s.ownedMaterialItemIds.length, rules: r?.composition?.rules.length ?? 0, definitions: r?.composition?.definitions.length ?? 0, sharedCapacities: r?.composition?.sharedCapacities.length ?? 0, failureReasons: r?.failureReasons ?? ["PROVIDER_FAILURE" as SemanticCompilerFailureReason] };
  });
  const unresolvedOwnedItems = plan.shards.flatMap((s) => {
    const status = shardSummaries.find((x) => x.shardId === s.shardId)!.status;
    return status === "SHARD_COMPLETE" ? [] : s.ownedMaterialItemIds.map((inventoryItemId) => ({ inventoryItemId, shardId: s.shardId, shardStatus: status }));
  });

  // --- GLOBAL accountability: the full frozen inventory against the stitched IR - the only authority on completeness.
  const accountability = reconcileInventoryWithComposition({ inventory: frozenInventory, composition: { rules: stitchedRules, definitions: stitchedDefs, sharedCapacities: stitchedCaps }, dispositions, sourceContextState: input.sourceContextState });

  const failureReasons: SemanticCompilerFailureReason[] = [];
  const push = (r: SemanticCompilerFailureReason) => { if (!failureReasons.includes(r)) failureReasons.push(r); };
  for (const s of shardSummaries) {
    if (s.status === "SHARD_PROVIDER_FAILURE") { push("PROVIDER_FAILURE"); push("SHARD_INCOMPLETE"); }
    else if (s.status === "SHARD_SCHEMA_FAILURE") { push("MODEL_SCHEMA_FAILURE"); push("SHARD_INCOMPLETE"); }
    else if (s.status === "SHARD_MISSING_CONTEXT") { push("MISSING_CONTEXT"); push("SHARD_INCOMPLETE"); }
    else if (s.status === "SHARD_PARTIAL") { push("PARTIAL_COMPILATION"); push("SHARD_INCOMPLETE"); }
    for (const fr of s.failureReasons) if (s.status !== "SHARD_COMPLETE" || fr === "MISSING_CONTEXT" || fr === "UNSUPPORTED_SEMANTICS" || fr === "OPERATIVE_STATE_UNRESOLVED" || fr === "TRUNCATED_EVIDENCE_USED") push(fr);
  }
  if (collisions.some((c) => c.requiresReview)) push("SHARD_CONFLICT");
  if (accountability.counts.materialMissingFromComposition > 0 || accountability.counts.materialQuantitativeValuesMissing > 0) push("INVENTORY_ITEM_MISSING_FROM_COMPOSITION");
  if (!accountability.semanticallyComplete && !failureReasons.includes("INVENTORY_ITEM_MISSING_FROM_COMPOSITION") && frozenInventory.inventoryStatus !== "INVENTORY_SKIPPED_NO_PROVIDER") push("SEMANTIC_ACCOUNTABILITY_INCOMPLETE");
  if (stitchedRules.length + stitchedDefs.length === 0) push("PARTIAL_COMPILATION");
  const hasReviewSufficiency = stitchedRules.some((r) => r.sufficiency !== "COMPLETE") || stitchedDefs.some((d) => d.sufficiency !== "COMPLETE");
  const anyShardFailed = shardSummaries.some((s) => s.status !== "SHARD_COMPLETE");
  const irCount = stitchedRules.length + stitchedDefs.length;
  let status: StitchedCandidateStatus;
  if (irCount === 0 && (anyShardFailed || failureReasons.length > 0)) status = "FAILED";
  else if (anyShardFailed) status = "PARTIAL";
  else if (failureReasons.length > 0 || hasReviewSufficiency || collisions.some((c) => c.requiresReview)) status = "REVIEW_REQUIRED";
  else status = "COMPLETED";
  for (const c of collisions.filter((x) => x.requiresReview)) unresolvedIssues.push(`[shard-stitch] ${c.kind} ${c.objectId}: ${c.detail}`);
  for (const u of unresolvedOwnedItems) unresolvedIssues.push(`[shard-stitch] owned material item ${u.inventoryItemId} unresolved: its shard ${u.shardId} ended ${u.shardStatus}`);
  for (const r of accountability.reasons) unresolvedIssues.push(`[accountability] ${r}`);

  return { candidateRef, planHash: plan.planHash, status, failureReasons, rules: stitchedRules, definitions: stitchedDefs, sharedCapacities: stitchedCaps, inventoryDispositions: dispositions, contextualEmissions, collisions, idMap, shards: shardSummaries, unresolvedOwnedItems, accountability, canonicalizedLineageReferences, unresolvedIssues };
}
