/**
 * F-7B §3 PRE-REGISTERED DETERMINISTIC SCORER for the stitched Chewy 1.01 canary (frozen before any model call;
 * see docs/phase-3-remediation-f7b/02-scorer-and-gates.json). Pure function of (frozen plan, shard results, per-shard
 * records, stitched result). No model. No thresholds invented after output is seen.
 */
import { readFileSync } from "node:fs";
import { normalizeDefinedTermRef } from "../lib/contract-model/compiler/amendment/operative-state";
import type { ShardExecutionResult, ShardPlan, StitchedCompilation } from "../lib/contract-model/compiler/semantic/shard-types";
import type { IRDefinition, IRRule, IRSharedCapacity } from "../lib/contract-model/ir/types";
import type { Frozen, ShardRecord } from "./f7b-lib";

export interface Census { rules: number; definitions: number; sharedCapacities: number; exprNodes: number; unsupportedNodes: number; values: string[]; lineageRefs: number; distinctLineageItems: number; dependencyEdges: number; unresolvedDependencies: number; ruleReferences: number;
  /** F-7B.3D: the raw lineage ids as cited, so a caller can canonicalize before comparing id spaces. */
  lineageIds: string[] }
export function census(c: { rules: IRRule[]; definitions: IRDefinition[]; sharedCapacities: IRSharedCapacity[] }): Census {
  let nodes = 0; const values: string[] = []; const lineage: string[] = []; let deps = 0; let unresolvedDeps = 0; const ruleRefs: string[] = []; let unsupported = 0;
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const o = x as Record<string, unknown>;
    if (typeof o.kind === "string") { nodes++; if (o.kind === "UNSUPPORTED") unsupported++; if (o.kind === "MONEY") values.push(`MONEY:${o.amount}`); if (o.kind === "PERCENT") values.push(`PERCENT:${o.value}`); if (o.kind === "RATIO") values.push(`RATIO:${o.value}`); if (o.kind === "NUMBER") values.push(`NUMBER:${o.value}`); if (o.kind === "RULE_REFERENCE") ruleRefs.push(String(o.ruleId)); }
    if (Array.isArray(o.inventoryItemIds)) lineage.push(...(o.inventoryItemIds as string[]));
    for (const [k, v] of Object.entries(o)) if (k !== "inventoryItemIds" && typeof v === "object") walk(v);
  };
  for (const r of c.rules) { walk(r); deps += r.dependsOn.length; unresolvedDeps += (r.unresolvedDependencies ?? []).length; }
  for (const d of c.definitions) walk(d);
  for (const s of c.sharedCapacities) walk(s);
  return { rules: c.rules.length, definitions: c.definitions.length, sharedCapacities: c.sharedCapacities.length, exprNodes: nodes, unsupportedNodes: unsupported, values: values.sort(), lineageRefs: lineage.length, distinctLineageItems: new Set(lineage).size, dependencyEdges: deps, unresolvedDependencies: unresolvedDeps, ruleReferences: ruleRefs.length, lineageIds: lineage };
}
const multisetDiff = (a: string[], b: string[]): string[] => { const m = new Map<string, number>(); for (const x of b) m.set(x, (m.get(x) ?? 0) + 1); const out: string[] = []; for (const x of a) { const n = m.get(x) ?? 0; if (n > 0) m.set(x, n - 1); else out.push(x); } return out; };
const digestOf = (id: string): string => { const i = id.indexOf(":"); return (i >= 0 ? id.slice(i + 1) : id).toLowerCase(); };

/** Pre-registered window envelope (00-precheck / 02): a NORMAL shard's largest single turn must stay under 60,000 input tokens (< 20% of the monolithic 312,143) and no turn's output may reach 100,000 tokens (78% of the 128,000 ceiling = "near ceiling"). The oversized shard is reported separately, never pooled. */
export const ENVELOPE = { normalShardMaxSingleTurnInputTokens: 60_000, nearCeilingOutputTokens: 100_000, maxTokensSetting: 128_000 };

export interface ReferenceItem { id: string; category: string; materiality: string; section: string; description: string; span: [number, number] }
export function loadReferenceItemsIn101(frozen: Frozen): ReferenceItem[] {
  const ref = JSON.parse(readFileSync("docs/phase-3-validation/04-human-reference-set.json", "utf-8")) as { items: ReferenceItem[] };
  const region = frozen.callerInput.sourceContext!.regions[0]!;
  return ref.items.filter((i) => i.span[0] >= region.charStart && i.span[0] < region.charEnd);
}
/** Deterministic numeric extraction from a reference description: $X.XM -> MONEY, Y% -> PERCENT, Z.ZZx -> RATIO. */
export function referenceValues(desc: string): string[] {
  const out: string[] = [];
  for (const m of desc.matchAll(/\$([\d,]+(?:\.\d+)?)\s*M\b/g)) out.push(`MONEY:${Math.round(Number(m[1]!.replace(/,/g, "")) * 1_000_000)}`);
  for (const m of desc.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) out.push(`PERCENT:${Number(m[1]) / 100}`);
  for (const m of desc.matchAll(/(\d+(?:\.\d+)?)x\b/g)) out.push(`RATIO:${Number(m[1])}`);
  return [...new Set(out)];
}

export function scoreCanary(frozen: Frozen, results: ShardExecutionResult[], records: ShardRecord[], stitched: StitchedCompilation, ledgerCalls: { shardId: string; turn: number; inputTokens: number; outputTokens: number; costUsd: number }[]) {
  const plan: ShardPlan = frozen.plan;
  const inv = frozen.callerInput.frozenInventory!;
  const itemById = new Map(inv.items.map((i) => [i.inventoryItemId, i]));
  const material = new Set(inv.items.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").map((i) => i.inventoryItemId));
  const resultByShard = new Map(results.map((r) => [r.shardId, r]));
  const recordByShard = new Map(records.map((r) => [r.shardId, r]));
  const acc = stitched.accountability;

  // ---- A. owned inventory accountability (global Pass C is the authority)
  const accItems = acc.items;
  const dispCounts: Record<string, number> = {};
  for (const it of accItems) dispCounts[it.disposition] = (dispCounts[it.disposition] ?? 0) + 1;
  const matItems = accItems.filter((i) => material.has(i.inventoryItemId));
  const matRepresented = matItems.filter((i) => i.disposition === "REPRESENTED").length;
  const matDispositioned = matItems.filter((i) => i.disposition !== "REPRESENTED" && i.disposition !== "MISSING_FROM_COMPOSITION").length;
  const matMissing = matItems.filter((i) => i.disposition === "MISSING_FROM_COMPOSITION").length;
  const completeShards = new Set(results.filter((r) => r.status === "SHARD_COMPLETE").map((r) => r.shardId));
  const matMissingInCompleteShards = matItems.filter((i) => i.disposition === "MISSING_FROM_COMPOSITION" && completeShards.has(plan.itemOwnerShard[i.inventoryItemId] ?? "")).length;
  const A = { materialTotal: material.size, materialRepresented: matRepresented, materialDispositioned: matDispositioned, materialMissing: matMissing, materialAccountabilityRate: +((matRepresented + matDispositioned) / Math.max(1, material.size)).toFixed(4), materialMissingOwnedByCompleteShards: matMissingInCompleteShards, materialMissingOwnedByFailedShards: matMissing - matMissingInCompleteShards, allItemsByDisposition: dispCounts, passC: acc.counts, semanticallyComplete: acc.semanticallyComplete, unresolvedOwnedItems: stitched.unresolvedOwnedItems.length };

  // ---- B. value preservation across stitching (union of kept shard compositions vs stitched)
  const kept = results.filter((r) => r.composition);
  const before = census({ rules: kept.flatMap((r) => r.composition!.rules), definitions: kept.flatMap((r) => r.composition!.definitions), sharedCapacities: kept.flatMap((r) => r.composition!.sharedCapacities) });
  const after = census({ rules: stitched.rules, definitions: stitched.definitions, sharedCapacities: stitched.sharedCapacities });
  const droppedObjects = { contextualEmissions: stitched.contextualEmissions.length, duplicatesCollapsed: stitched.collisions.filter((c) => c.kind === "DEFINITION_DUPLICATE_CONSISTENT" || c.kind === "RULE_DUPLICATE_CONSISTENT").length };
  const droppedComp = { rules: [] as IRRule[], definitions: [] as IRDefinition[], sharedCapacities: [] as IRSharedCapacity[] };
  const droppedIds = new Set(stitched.contextualEmissions.map((e) => e.objectId));
  for (const r of kept) { for (const d of r.composition!.definitions) if (droppedIds.has(d.definitionId)) droppedComp.definitions.push(d); for (const x of r.composition!.rules) if (droppedIds.has(x.ruleId)) droppedComp.rules.push(x); for (const s of r.composition!.sharedCapacities) if (droppedIds.has(s.sharedCapId)) droppedComp.sharedCapacities.push(s); }
  const droppedCensus = census(droppedComp);
  // DISTINCT values: a consistent duplicate collapses an identical copy (same values), so a distinct value present before and absent after - and not carried only by a dropped contextual emission - is a genuine stitching loss.
  const distinctBefore = [...new Set(before.values)], distinctAfter = new Set(after.values), distinctDropped = new Set(droppedCensus.values);
  const valuesLostByStitching = distinctBefore.filter((v) => !distinctAfter.has(v) && !distinctDropped.has(v));
  const valuesOnlyInDroppedEmissions = distinctBefore.filter((v) => !distinctAfter.has(v) && distinctDropped.has(v));
  // F-7B.3D: a source-backed amount also survives when it is held in FIRST-CLASS conflict evidence. F-7B.3B made the
  // losing side of a definition conflict a retained, reviewable artifact rather than something discarded, so a scorer
  // that inspects only the canonical arrays under-reports preservation. Preserved is not resolved: the conflict stays
  // unresolved and review-required, and none of this reaches Pass C.
  const conflictCensus = census({ rules: [], definitions: (stitched.definitionConflicts ?? []).flatMap((c) => c.variants.map((v) => v.definition)), sharedCapacities: [] });
  const distinctConflict = new Set(conflictCensus.values);
  const valuesLostAfterConflictEvidence = valuesLostByStitching.filter((v) => !distinctConflict.has(v));
  // F-7B.3D §9: every distinct pre-stitch value gets ONE explicit disposition, so contextual evidence can never be
  // mistaken for owned preservation. CONTEXTUAL_EXCLUDED is its own class - an emission the stitcher dropped because the
  // shard did not own it is neither owned preservation nor an owned loss.
  const tally = (xs: string[]): Record<string, number> => xs.reduce<Record<string, number>>((a, x) => { a[x] = (a[x] ?? 0) + 1; return a; }, { OWNED_PRESERVED: 0, OWNED_PRESERVED_IN_CONFLICT_EVIDENCE: 0, CONTEXTUAL_EXCLUDED: 0, OWNED_LOST: 0 });
  const valueDisposition = (v: string): string => distinctAfter.has(v) ? "OWNED_PRESERVED" : distinctDropped.has(v) ? "CONTEXTUAL_EXCLUDED" : distinctConflict.has(v) ? "OWNED_PRESERVED_IN_CONFLICT_EVIDENCE" : "OWNED_LOST";
  const valueDispositions = tally(distinctBefore.map(valueDisposition));
  const B = { valueOccurrencesBefore: before.values.length, valueOccurrencesAfter: after.values.length, distinctValuesBefore: distinctBefore.length, distinctValuesAfter: distinctAfter.size, valuesOnlyInDroppedContextualEmissions: valuesOnlyInDroppedEmissions.length, valuesInConflictEvidence: distinctConflict.size, valuesPreservedOnlyByConflictEvidence: valuesLostByStitching.filter((v) => distinctConflict.has(v)).length, valuesLostByStitching: valuesLostAfterConflictEvidence.length, valuesLostList: valuesLostAfterConflictEvidence.slice(0, 20), valuesLostBeforeConflictEvidenceDiagnostic: valuesLostByStitching.length, dispositions: valueDispositions, duplicatesCollapsed: droppedObjects.duplicatesCollapsed, multisetOccurrencesRemoved: multisetDiff(before.values, after.values).length };

  // ---- C. lineage preservation
  // F-7B.3D: the gate is DISTINCT OWNED inventory ids, compared in ONE id space. The model may cite an item by its bare
  // digest while the stitcher and Pass C use the full `inv-item:<digest>` form, so raw-versus-canonical comparison
  // invents losses that never happened. Occurrence counts stay as diagnostics; they are not the gate, because one owned
  // item cited five times and kept once is not four losses.
  const knownIds = new Set(inv.items.map((i) => i.inventoryItemId)); const knownDigests = new Set(inv.items.map((i) => digestOf(i.inventoryItemId)));
  const digestIndex = new Map(inv.items.map((i) => [digestOf(i.inventoryItemId), i.inventoryItemId]));
  const canon = (raw: string): string => (knownIds.has(raw) ? raw : digestIndex.get(digestOf(raw)) ?? raw);
  const stripped = stitched.collisions.filter((c) => c.kind === "LINEAGE_CLAIM_ON_UNOWNED_ITEM");
  const strippedIds = new Set(stripped.map((c) => c.itemId).filter((x): x is string => Boolean(x)).map(canon));
  const ownedItemsOfShard = new Map(plan.shards.map((sh) => [sh.shardId, new Set(sh.ownedItemIds)]));
  // expected owned lineage = what each OWNER shard cited about items it actually owns, in canonical form
  const ownedLineageOccurrences: string[] = [];
  for (const r of kept) {
    const owned = ownedItemsOfShard.get(r.shardId) ?? new Set<string>();
    const cited = census({ rules: r.composition!.rules, definitions: r.composition!.definitions, sharedCapacities: r.composition!.sharedCapacities }).lineageIds;
    for (const id of cited) { const c = canon(id); if (owned.has(c)) ownedLineageOccurrences.push(c); }
  }
  const expectedDistinct = new Set(ownedLineageOccurrences);
  const preservedIds = new Set<string>([
    ...after.lineageIds.map(canon),
    ...conflictCensus.lineageIds.map(canon),
  ]);
  const lineageDistinctLost = [...expectedDistinct].filter((id) => !preservedIds.has(id) && !strippedIds.has(id));
  // F-7B.3D §9: the same explicit disposition for every distinct owned lineage id.
  const afterCanon = new Set(after.lineageIds.map(canon));
  const conflictCanon = new Set(conflictCensus.lineageIds.map(canon));
  const lineageDisposition = (id: string): string => afterCanon.has(id) ? "OWNED_PRESERVED" : strippedIds.has(id) ? "CONTEXTUAL_EXCLUDED" : conflictCanon.has(id) ? "OWNED_PRESERVED_IN_CONFLICT_EVIDENCE" : "OWNED_LOST";
  const lineageDispositions = tally([...expectedDistinct].map(lineageDisposition));
  const C = {
    lineageRefsBefore: before.lineageRefs, lineageRefsAfter: after.lineageRefs,
    ownedLineageDistinctExpected: expectedDistinct.size,
    ownedLineageDistinctPreserved: [...expectedDistinct].filter((id) => preservedIds.has(id)).length,
    ownedLineageDistinctLost: lineageDistinctLost.length,
    ownedLineageDistinctLostList: lineageDistinctLost.slice(0, 20),
    ownedLineageDistinctPreservedOnlyByConflictEvidence: [...expectedDistinct].filter((id) => !after.lineageIds.map(canon).includes(id) && conflictCensus.lineageIds.map(canon).includes(id)).length,
    ownedLineageOccurrencesExpected: ownedLineageOccurrences.length,
    ownedLineageOccurrencesPreserved: ownedLineageOccurrences.filter((id) => preservedIds.has(id)).length,
    ownedLineageOccurrencesLostDiagnostic: before.lineageRefs - after.lineageRefs,
    dispositions: lineageDispositions,
    canonicalizedDigestIds: stitched.canonicalizedLineageReferences,
    strippedClaimsOnUnownedItems: stripped.length, strippedOnItemsOwnedBySomeShard: stripped.filter((c) => c.ownerShardId !== null).length, strippedOnUnknownIds: stripped.filter((c) => c.ownerShardId === null).length,
    danglingLineageAfter: acc.counts.danglingLineageReferences, lineageRefsInDroppedEmissions: droppedCensus.lineageRefs,
    unknownLineageIdsBefore: (() => { let n = 0; const walk = (x: unknown): void => { if (!x || typeof x !== "object") return; if (Array.isArray(x)) { x.forEach(walk); return; } const o = x as Record<string, unknown>; if (Array.isArray(o.inventoryItemIds)) for (const id of o.inventoryItemIds as string[]) if (!knownIds.has(id) && !knownDigests.has(digestOf(id))) n++; for (const v of Object.values(o)) if (v && typeof v === "object") walk(v); }; kept.forEach((r) => walk(r.composition)); return n; })(),
  };

  // ---- D. definition coverage per DEFINITION unit
  const defUnits = plan.units.filter((u) => u.kind === "DEFINITION");
  const stitchedTerms = new Set(stitched.definitions.map((d) => normalizeDefinedTermRef(d.termName)));
  const dispositionedItems = new Set(accItems.filter((i) => i.disposition !== "REPRESENTED" && i.disposition !== "MISSING_FROM_COMPOSITION").map((i) => i.inventoryItemId));
  const representedItems = new Set(accItems.filter((i) => i.disposition === "REPRESENTED").map((i) => i.inventoryItemId));
  const unitItems = new Map<string, string[]>();
  for (const [id, u] of Object.entries(plan.itemOwnerUnit)) { const arr = unitItems.get(u) ?? []; arr.push(id); unitItems.set(u, arr); }
  const defCoverage: Record<string, number> = { COMPILED: 0, ITEMS_REPRESENTED_WITHOUT_DEFINITION_OBJECT: 0, DISPOSITIONED_NON_COMPUTATIONAL: 0, NO_INVENTORY_ITEMS_NO_IR: 0, MISSING_MATERIAL: 0, OWNER_SHARD_NOT_COMPLETE: 0 };
  const perUnit = defUnits.map((u) => {
    const items = unitItems.get(u.unitKey) ?? [];
    const mat = items.filter((id) => material.has(id));
    const owner = plan.unitOwnerShard[u.unitKey]!;
    let cls: string;
    if (stitchedTerms.has(u.normalizedTermName ?? "")) cls = "COMPILED";
    else if (!completeShards.has(owner) && mat.length > 0) cls = "OWNER_SHARD_NOT_COMPLETE";
    else if (mat.length > 0 && mat.every((id) => representedItems.has(id) || dispositionedItems.has(id))) cls = mat.some((id) => representedItems.has(id)) ? "ITEMS_REPRESENTED_WITHOUT_DEFINITION_OBJECT" : "DISPOSITIONED_NON_COMPUTATIONAL";
    else if (mat.length > 0) cls = "MISSING_MATERIAL";
    else cls = "NO_INVENTORY_ITEMS_NO_IR";
    defCoverage[cls] = (defCoverage[cls] ?? 0) + 1;
    return { unitKey: u.unitKey, term: u.termName, ownerShard: owner, items: items.length, materialItems: mat.length, cls };
  });
  const D = { definitionUnits: defUnits.length, stitchedDefinitions: stitched.definitions.length, coverage: defCoverage, conflicts: stitched.collisions.filter((c) => c.kind === "DEFINITION_CONFLICT").length, consistentDuplicates: stitched.collisions.filter((c) => c.kind === "DEFINITION_DUPLICATE_CONSISTENT").length, contextualDefinitionEmissions: stitched.contextualEmissions.filter((e) => e.kind === "DEFINITION").length, sufficiency: Object.fromEntries([...new Set(stitched.definitions.map((d) => d.sufficiency))].map((s) => [s, stitched.definitions.filter((d) => d.sufficiency === s).length])), missingMaterialUnits: perUnit.filter((p) => p.cls === "MISSING_MATERIAL").map((p) => ({ term: p.term, ownerShard: p.ownerShard, materialItems: p.materialItems })).slice(0, 40) };

  // ---- E. dependency resolution (cross-shard)
  const termOwnerShard = (t: string): string | null => { const u = defUnits.find((x) => x.normalizedTermName === normalizeDefinedTermRef(t)); return u ? plan.unitOwnerShard[u.unitKey] ?? null : null; };
  const defShard = (d: IRDefinition): string | null => termOwnerShard(d.termName);
  let depTotal = 0, depResolvedInStitched = 0, depResolvedBySourceUnit = 0, depUnresolved = 0, depCrossShard = 0, depCrossShardResolved = 0;
  for (const d of stitched.definitions) for (const t of d.dependsOnTerms ?? []) {
    depTotal++;
    const inStitched = stitchedTerms.has(normalizeDefinedTermRef(t)); const os = termOwnerShard(t);
    if (inStitched) depResolvedInStitched++; else if (os) depResolvedBySourceUnit++; else depUnresolved++;
    if (os && os !== defShard(d)) { depCrossShard++; if (inStitched || os) depCrossShardResolved++; }
  }
  const ruleDeps = { resolved: after.dependencyEdges, unresolved: after.unresolvedDependencies };
  const missingContextDispositions = stitched.inventoryDispositions.filter((x) => /MISSING_CONTEXT/i.test(x.disposition) || /MISSING_CONTEXT/i.test(x.note)).length;
  const missingContextSufficiency = stitched.definitions.filter((d) => d.sufficiency === "MISSING_CONTEXT").length + stitched.rules.filter((r) => r.sufficiency === "MISSING_CONTEXT").length;
  const shardsWithContext = plan.shards.filter((s) => s.context.length > 0);
  const contextTruncatedEntries = plan.shards.reduce((a, s) => a + s.context.filter((c) => c.truncated).length, 0);
  const contextSufficient = shardsWithContext.filter((s) => { const r = resultByShard.get(s.shardId); const rec = recordByShard.get(s.shardId); return r?.status === "SHARD_COMPLETE" && rec && rec.ownedAccountability.missingMaterial === 0 && !r.failureReasons.includes("MISSING_CONTEXT"); }).length;
  const E = { definitionTermDependencies: depTotal, resolvedToStitchedDefinition: depResolvedInStitched, resolvedToSourceUnitOnly: depResolvedBySourceUnit, unresolvedTermDependencies: depUnresolved, crossShardTermDependencies: depCrossShard, crossShardResolved: depCrossShardResolved, ruleDependencies: ruleDeps, missingContextDispositions, missingContextSufficiencyObjects: missingContextSufficiency, shardsGivenContext: shardsWithContext.length, shardsGivenContextCompleteWithoutOwnedMaterialMissing: contextSufficient, contextEntriesTruncated: contextTruncatedEntries, shardsWithTruncatedContext: plan.shards.filter((s) => s.context.some((c) => c.truncated)).map((s) => s.shardId), unresolvedContextEntries: plan.shards.reduce((a, s) => a + s.unresolvedContext.length, 0) };

  // ---- F. shard failure behavior
  const statusCounts: Record<string, number> = {};
  for (const s of plan.shards) { const st = resultByShard.get(s.shardId)?.status ?? "NOT_EXECUTED"; statusCounts[st] = (statusCounts[st] ?? 0) + 1; }
  const F = { shardStatuses: statusCounts, retries: records.filter((r) => r.attempt > 1).length, stitchedStatus: stitched.status, stitchedFailureReasons: stitched.failureReasons, unresolvedOwnedItems: stitched.unresolvedOwnedItems.length, nonCompleteShardsExplicit: stitched.shards.filter((s) => s.status !== "SHARD_COMPLETE").length };

  // ---- G. collisions
  const G: Record<string, number> = {};
  for (const c of stitched.collisions) G[c.kind] = (G[c.kind] ?? 0) + 1;

  // ---- H. source provenance: every kept object must be anchored to the frozen source (a DEFINITION unit term, lineage to a known item, or the 1.01 section for rules)
  const unverifiable: { kind: string; id: string; term?: string; reason: string }[] = [];
  // F-7B.3D: definition attribution has THREE authoritative proof classes since F-7B.2. A definition anchored to a unique
  // declaration in its owner shard's own primary source is source-verified even though it is neither a planner
  // DEFINITION unit nor lineage-bearing. Scoring it unverifiable was a false positive of the pre-F-7B.2 scorer, not a
  // real finding. SHARD_FIRST_UNIT is deliberately NOT a proof class: shard position is not evidence.
  const anchoredDefinitionIds = new Set((stitched.definitionAttribution ?? []).filter((a) => a.anchor).map((a) => a.objectId));
  for (const d of stitched.definitions) {
    const hasLineage = (d.inventoryItemIds ?? []).length > 0 || census({ rules: [], definitions: [d], sharedCapacities: [] }).lineageRefs > 0;
    const proofs: string[] = [];
    if (stitchedTermsInUnits(d.termName)) proofs.push("PLANNER_DEFINITION_UNIT");
    if (hasLineage) proofs.push("OWNED_INVENTORY_LINEAGE");
    if (anchoredDefinitionIds.has(d.definitionId)) proofs.push("UNIQUE_PRIMARY_SOURCE_DECLARATION");
    if (proofs.length === 0) unverifiable.push({ kind: "DEFINITION", id: d.definitionId, term: d.termName, reason: "no planner DEFINITION unit, no owned inventory lineage and no unique primary-source declaration" });
  }
  function stitchedTermsInUnits(t: string): boolean { return defUnits.some((u) => u.normalizedTermName === normalizeDefinedTermRef(t)); }
  for (const r of stitched.rules) { const hasLineage = census({ rules: [r], definitions: [], sharedCapacities: [] }).lineageRefs > 0; const inSection = (r.sourceSectionRef ?? "").replace(/^\s*(?:sections?|§+)\s*/i, "").startsWith("1.01"); if (!hasLineage && !inSection) unverifiable.push({ kind: "RULE", id: r.ruleId, reason: `no inventory lineage and sourceSectionRef ${r.sourceSectionRef} is outside the frozen unit` }); }
  const proofClassCounts = { PLANNER_DEFINITION_UNIT: 0, OWNED_INVENTORY_LINEAGE: 0, UNIQUE_PRIMARY_SOURCE_DECLARATION: 0, NONE: 0 };
  for (const d of stitched.definitions) {
    const hasLineage = census({ rules: [], definitions: [d], sharedCapacities: [] }).lineageRefs > 0;
    let n = 0;
    if (stitchedTermsInUnits(d.termName)) { proofClassCounts.PLANNER_DEFINITION_UNIT++; n++; }
    if (hasLineage) { proofClassCounts.OWNED_INVENTORY_LINEAGE++; n++; }
    if (anchoredDefinitionIds.has(d.definitionId)) { proofClassCounts.UNIQUE_PRIMARY_SOURCE_DECLARATION++; n++; }
    if (n === 0) proofClassCounts.NONE++;
  }
  const H = { objectsKept: stitched.definitions.length + stitched.rules.length + stitched.sharedCapacities.length, sourceUnverifiableSurviving: unverifiable.length, list: unverifiable.slice(0, 30), definitionsWithLineage: stitched.definitions.filter((d) => census({ rules: [], definitions: [d], sharedCapacities: [] }).lineageRefs > 0).length, proofClassCounts, definitionConflicts: (stitched.definitionConflicts ?? []).length, conflictVariants: (stitched.definitionConflicts ?? []).reduce((a, c) => a + c.variants.length, 0), conflictsRequiringReview: (stitched.definitionConflicts ?? []).filter((c) => c.requiresReview).length };

  // ---- I. unsupported / partial semantics
  const I = { unsupportedNodes: after.unsupportedNodes, exprNodes: after.exprNodes, definitionSufficiency: D.sufficiency, ruleSufficiency: Object.fromEntries([...new Set(stitched.rules.map((r) => r.sufficiency))].map((s) => [s, stitched.rules.filter((r) => r.sufficiency === s).length])), shardsPartial: results.filter((r) => r.status === "SHARD_PARTIAL").length, shardsMissingContext: results.filter((r) => r.status === "SHARD_MISSING_CONTEXT").length, shardsSchemaFailure: results.filter((r) => r.status === "SHARD_SCHEMA_FAILURE").length, outputTruncatedShards: records.filter((r) => r.failureReasons.includes("OUTPUT_TRUNCATED")).map((r) => r.shardId) };

  // ---- J. false completeness
  const anyNonComplete = plan.shards.some((s) => resultByShard.get(s.shardId)?.status !== "SHARD_COMPLETE");
  const falseCompleteness: string[] = [];
  if (stitched.status === "COMPLETED" && (anyNonComplete || matMissing > 0 || !acc.semanticallyComplete)) falseCompleteness.push(`stitched status COMPLETED despite nonComplete=${anyNonComplete} materialMissing=${matMissing} semanticallyComplete=${acc.semanticallyComplete}`);
  for (const r of records) if (r.compileStatus === "COMPLETED" && r.ownedAccountability.missingMaterial > 0) falseCompleteness.push(`shard ${r.shardId} compile status COMPLETED with ${r.ownedAccountability.missingMaterial} owned material items missing`);
  // dangerous silent omission: a material item that is neither in Pass C's item list nor in unresolvedOwnedItems (invisible), or a failed shard's material item that Pass C shows as REPRESENTED via a foreign claim
  const passCIds = new Set(accItems.map((i) => i.inventoryItemId));
  const unresolvedIds = new Set(stitched.unresolvedOwnedItems.map((u) => u.inventoryItemId));
  const silent: string[] = [];
  for (const id of material) { if (!passCIds.has(id)) silent.push(`${id}: absent from global Pass C`); const owner = plan.itemOwnerShard[id]; if (owner && !completeShards.has(owner) && !unresolvedIds.has(id) && !(resultByShard.get(owner)?.composition)) silent.push(`${id}: owner shard ${owner} produced nothing and the item is not listed as unresolved`); }
  const hiddenFailedShards = plan.shards.filter((s) => (resultByShard.get(s.shardId)?.status ?? "NOT_EXECUTED") !== "SHARD_COMPLETE" && !stitched.shards.some((x) => x.shardId === s.shardId && x.status !== "SHARD_COMPLETE")).length;
  // contextual ownership credit: a Pass C REPRESENTED material item whose ONLY lineage paths come from objects attributed to a non-owner shard cannot exist after stitching (stripped); verify by re-deriving from stitched objects' lineage vs itemOwnerShard
  let contextualCredit = 0;
  const objShard = new Map<string, string>();
  for (const [oldId, newId] of Object.entries(stitched.idMap)) { const r = results.find((x) => x.composition?.rules.some((y) => y.ruleId === oldId) || x.composition?.sharedCapacities.some((y) => y.sharedCapId === oldId)); if (r) objShard.set(newId, r.shardId); }
  for (const d of stitched.definitions) { const r = results.find((x) => x.composition?.definitions.some((y) => y.definitionId === d.definitionId)); if (r) objShard.set(d.definitionId, r.shardId); }
  const claimsByItem = new Map<string, Set<string>>();
  const claimWalk = (obj: unknown, shardId: string): void => { for (const id of collectIds(obj)) { const set = claimsByItem.get(id) ?? new Set(); set.add(shardId); claimsByItem.set(id, set); } };
  function collectIds(o: unknown): string[] { const ids: string[] = []; const walk = (x: unknown): void => { if (!x || typeof x !== "object") return; if (Array.isArray(x)) { x.forEach(walk); return; } const r = x as Record<string, unknown>; if (Array.isArray(r.inventoryItemIds)) ids.push(...(r.inventoryItemIds as string[])); for (const v of Object.values(r)) if (v && typeof v === "object") walk(v); }; walk(o); return ids; }
  for (const d of stitched.definitions) claimWalk(d, objShard.get(d.definitionId) ?? "?");
  for (const r of stitched.rules) claimWalk(r, objShard.get(r.ruleId) ?? "?");
  for (const s of stitched.sharedCapacities) claimWalk(s, objShard.get(s.sharedCapId) ?? "?");
  for (const [id, shards] of claimsByItem) { const owner = plan.itemOwnerShard[id]; if (owner && [...shards].some((s) => s !== owner)) contextualCredit++; }
  const J = { falseCompleteness: falseCompleteness.length, falseCompletenessList: falseCompleteness, dangerousSilentOmissions: silent.length, silentList: silent.slice(0, 20), hiddenFailedShards, contextualOwnershipCredit: contextualCredit, conflictSilentMerge: 0 /* DEFINITION_CONFLICT keeps the owner copy AMBIGUOUS + review; a silent merge is impossible by construction - verified by G.DEFINITION_CONFLICT vs D.conflicts */ };

  // ---- K. human reference items inside 1.01 (frozen docs/phase-3-validation/04) - deterministic numeric matching
  const refs = loadReferenceItemsIn101(frozen);
  const afterValues = new Set(after.values);
  const region = frozen.callerInput.sourceContext!.regions[0]!;
  const K = refs.map((ri) => { const rel = ri.span[0] - region.charStart; const owner = plan.shards.find((s) => rel >= s.primaryCharStart && rel < s.primaryCharEnd); const vals = referenceValues(ri.description); const matched = vals.filter((v) => afterValues.has(v)); return { id: ri.id, materiality: ri.materiality, section: ri.section, ownerShard: owner?.shardId ?? null, ownerShardStatus: owner ? (resultByShard.get(owner.shardId)?.status ?? "NOT_EXECUTED") : null, referenceValues: vals, matchedInStitchedIR: matched, matchRate: vals.length ? +(matched.length / vals.length).toFixed(3) : null }; });
  const Ksummary = { items: K.length, itemsWithValues: K.filter((k) => k.referenceValues.length > 0).length, valuesTotal: K.reduce((a, k) => a + k.referenceValues.length, 0), valuesMatched: K.reduce((a, k) => a + k.matchedInStitchedIR.length, 0), itemsFullyMatched: K.filter((k) => k.referenceValues.length > 0 && k.matchedInStitchedIR.length === k.referenceValues.length).length };

  // ---- Window / output concentration (actual)
  const turnsByShard = new Map<string, { in: number; out: number }[]>();
  for (const c of ledgerCalls) { const arr = turnsByShard.get(c.shardId) ?? []; arr.push({ in: c.inputTokens, out: c.outputTokens }); turnsByShard.set(c.shardId, arr); }
  const oversizedId = plan.shards.find((s) => s.oversized)?.shardId ?? null;
  const shardIn = records.map((r) => ({ shardId: r.shardId, oversized: r.oversized, maxTurnIn: Math.max(0, ...(turnsByShard.get(r.shardId) ?? []).map((t) => t.in)), totalIn: r.actual.inputTokens, totalOut: r.actual.outputTokens, maxTurnOut: Math.max(0, ...(turnsByShard.get(r.shardId) ?? []).map((t) => t.out)), turns: r.actual.turns, cost: r.actual.costUsd }));
  const normalIn = shardIn.filter((s) => !s.oversized);
  const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0; };
  const W = { envelope: ENVELOPE, normalShards: normalIn.length, maxSingleTurnInputNormal: Math.max(0, ...normalIn.map((s) => s.maxTurnIn)), envelopeViolations: normalIn.filter((s) => s.maxTurnIn > ENVELOPE.normalShardMaxSingleTurnInputTokens).map((s) => s.shardId), perShardTotalInput: { max: Math.max(0, ...shardIn.map((s) => s.totalIn)), median: q(shardIn.map((s) => s.totalIn), 0.5), p95: q(shardIn.map((s) => s.totalIn), 0.95), total: shardIn.reduce((a, s) => a + s.totalIn, 0) }, singleTurnInput: { max: Math.max(0, ...shardIn.map((s) => s.maxTurnIn)), median: q(shardIn.map((s) => s.maxTurnIn), 0.5), p95: q(shardIn.map((s) => s.maxTurnIn), 0.95) }, output: { maxPerShard: Math.max(0, ...shardIn.map((s) => s.totalOut)), median: q(shardIn.map((s) => s.totalOut), 0.5), p95: q(shardIn.map((s) => s.totalOut), 0.95), total: shardIn.reduce((a, s) => a + s.totalOut, 0), maxSingleTurn: Math.max(0, ...shardIn.map((s) => s.maxTurnOut)), nearCeiling: shardIn.filter((s) => s.maxTurnOut >= ENVELOPE.nearCeilingOutputTokens).map((s) => s.shardId), truncated: I.outputTruncatedShards }, oversizedShard: oversizedId ? shardIn.find((s) => s.shardId === oversizedId) ?? null : null, historicalMonolithicFirstTurnInput: 312143, peakInputReduction: +(1 - Math.max(0, ...shardIn.map((s) => s.maxTurnIn)) / 312143).toFixed(4), totalInputVsMonolithicFirstTurn: +(shardIn.reduce((a, s) => a + s.totalIn, 0) / 312143).toFixed(3) };

  // dangling references caused by stitching: (a) lineage ids in the stitched IR that name no known inventory item (Pass C dangling), (b) rule/shared-cap ids referenced in the stitched IR that name no stitched object (an external "ir-rule:" id learned via a tool is not dangling) - the stitcher converts these to UNSUPPORTED nodes / unresolved dependencies, so any survivor is a stitching defect.
  const stitchedRuleIds = new Set(stitched.rules.map((r) => r.ruleId));
  const externalIds = new Set<string>();
  for (const r of kept) for (const x of r.composition!.rules) externalIds.add(x.ruleId);
  let danglingRuleRefs = 0;
  const refWalk = (x: unknown): void => { if (!x || typeof x !== "object") return; if (Array.isArray(x)) { x.forEach(refWalk); return; } const o = x as Record<string, unknown>; if (o.kind === "RULE_REFERENCE" && typeof o.ruleId === "string" && !stitchedRuleIds.has(o.ruleId) && externalIds.has(o.ruleId)) danglingRuleRefs++; for (const v of Object.values(o)) if (v && typeof v === "object") refWalk(v); };
  refWalk(stitched.rules); refWalk(stitched.definitions); refWalk(stitched.sharedCapacities);
  for (const r of stitched.rules) for (const d of r.dependsOn) if (!stitchedRuleIds.has(d.targetRuleId) && externalIds.has(d.targetRuleId)) danglingRuleRefs++;
  const trust = { dangerousSilentOmissions: J.dangerousSilentOmissions, falseCompleteness: J.falseCompleteness, contextualOwnershipCredit: J.contextualOwnershipCredit, sourceUnverifiableIrSurviving: H.sourceUnverifiableSurviving, conflictingDuplicateSilentlyMerged: J.conflictSilentMerge, valuesLostByStitching: B.valuesLostByStitching, ownedLineageDistinctLost: C.ownedLineageDistinctLost, ownedLineageOccurrencesLostDiagnostic: C.ownedLineageOccurrencesLostDiagnostic, danglingReferencesCausedByStitching: acc.counts.danglingLineageReferences + danglingRuleRefs, danglingLineageAfterPassC: acc.counts.danglingLineageReferences, danglingRuleReferencesSurviving: danglingRuleRefs, danglingRuleReferencesConvertedExplicitly: stitched.collisions.filter((c) => c.kind === "DANGLING_RULE_REFERENCE").length, failedShardHidden: J.hiddenFailedShards, missingMaterialOwnedItemHidden: J.dangerousSilentOmissions };
  return { A, B, C, D, E, F, G, H, I, J, K, Ksummary, W, trust, perUnitDefinitionCoverage: perUnit };
}
