/**
 * F-7A §18 - ZERO-COST HISTORICAL SIMULATION of shard ownership + stitching over RECORDED compiler outputs.
 * No model output is fabricated: every IR object is a recorded (or, for the synthetic corpus, a deterministic
 * scripted) object mapped back to the shard that owns it, then re-stitched; the stitched IR is compared with the
 * original for preservation of nodes, lineage, values, dependency edges, duplicates, dangling refs and ownership.
 *   npx tsx scripts/f7a-historical-simulation.ts <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { planCompilationShards } from "../lib/contract-model/compiler/semantic/shard-planner";
import { stitchShardResults } from "../lib/contract-model/compiler/semantic/shard-stitcher";
import type { CompilationShard, ShardExecutionResult, ShardPlan } from "../lib/contract-model/compiler/semantic/shard-types";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { FrozenSemanticInventory, SourceContextResult } from "../lib/contract-model/compiler/semantic-accountability/types";
import type { IRDefinition, IRRule, IRSharedCapacity } from "../lib/contract-model/ir/types";
import { buildTestIndex } from "../tests/contract-model/context-retrieval-test-utils";
import { buildDefinitionsCorpus, emitDefinitionsForShard, CO, INST } from "../tests/contract-model/f7a-synthetic-corpus";
import { buildChewy, buildChewyCallerInput, CHWY_RUN, COMPANY, INSTRUMENT } from "./f7a-lib";

const out = process.argv[2] ?? "docs/phase-3-remediation-f7a";
mkdirSync(out, { recursive: true });

interface Composition { rules: IRRule[]; definitions: IRDefinition[]; sharedCapacities: IRSharedCapacity[] }

/** Deep census of an IR composition: node count, numeric values, lineage refs, dependency edges, references. */
function census(c: Composition) {
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
  return { rules: c.rules.length, definitions: c.definitions.length, sharedCapacities: c.sharedCapacities.length, exprNodes: nodes, unsupportedNodes: unsupported, values: values.sort(), lineageRefs: lineage.length, distinctLineageItems: new Set(lineage).size, dependencyEdges: deps, unresolvedDependencies: unresolvedDeps, ruleReferences: ruleRefs.length };
}

/** Maps every recorded object to the shard whose unit it belongs to (lineage majority / definition term / section ref), exactly as the stitcher attributes - then hands each shard "its" recorded objects as if that shard had emitted them. */
function distributeRecorded(plan: ShardPlan, comp: Composition): { results: ShardExecutionResult[]; attribution: Record<string, number>; unattributed: string[] } {
  const digestOf = (id: string): string => { const i = id.indexOf(":"); return (i >= 0 ? id.slice(i + 1) : id).toLowerCase(); };
  const digestIndex = new Map(Object.keys(plan.itemOwnerUnit).map((id) => [digestOf(id), id]));
  const canon = (raw: string): string => plan.itemOwnerUnit[raw] ? raw : (digestIndex.get(digestOf(raw)) ?? raw);
  const ownerUnitOf = (ids: string[], fallbackSection: string | null, term: string | null): string | null => {
    if (term) { const u = plan.units.find((x) => x.kind === "DEFINITION" && x.normalizedTermName === term.replace(/\s+/g, " ").trim().toLowerCase()); if (u) return u.unitKey; }
    const counts = new Map<string, number>();
    for (const id of ids) { const u = plan.itemOwnerUnit[canon(id)]; if (u) counts.set(u, (counts.get(u) ?? 0) + 1); }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (best) return best[0];
    if (fallbackSection) { const norm = fallbackSection.replace(/^\s*(?:sections?|§+)\s*/i, "").replace(/\s+/g, "").toLowerCase(); const u = plan.units.find((x) => x.sectionRef && x.sectionRef.replace(/\s+/g, "").toLowerCase() === norm && x.kind !== "LEAD_IN"); if (u) return u.unitKey; }
    return null;
  };
  const lineageOf = (o: unknown): string[] => { const ids: string[] = []; const walk = (x: unknown): void => { if (!x || typeof x !== "object") return; if (Array.isArray(x)) { x.forEach(walk); return; } const r = x as Record<string, unknown>; if (Array.isArray(r.inventoryItemIds)) ids.push(...(r.inventoryItemIds as string[])); for (const v of Object.values(r)) if (typeof v === "object") walk(v); }; walk(o); return ids; };
  const byShard = new Map<string, Composition>(plan.shards.map((s) => [s.shardId, { rules: [], definitions: [], sharedCapacities: [] }]));
  const attribution: Record<string, number> = { LINEAGE_OR_TERM: 0, SECTION_REF: 0, UNATTRIBUTED: 0 };
  const unattributed: string[] = [];
  const place = (kind: "rules" | "definitions" | "sharedCapacities", obj: IRRule | IRDefinition | IRSharedCapacity, id: string, section: string | null, term: string | null) => {
    const ids = lineageOf(obj);
    let unit = ownerUnitOf(ids, null, term);
    if (unit) attribution.LINEAGE_OR_TERM!++;
    else { unit = ownerUnitOf([], section, null); if (unit) attribution.SECTION_REF!++; }
    if (!unit) { attribution.UNATTRIBUTED!++; unattributed.push(id); unit = plan.units[0]!.unitKey; }
    const shardId = plan.unitOwnerShard[unit]!;
    (byShard.get(shardId)![kind] as unknown[]).push(obj);
  };
  for (const r of comp.rules) place("rules", r, r.ruleId, r.sourceSectionRef, null);
  for (const d of comp.definitions) place("definitions", d, d.definitionId, null, d.termName);
  for (const s of comp.sharedCapacities) place("sharedCapacities", s, s.sharedCapId, null, null);
  const results: ShardExecutionResult[] = plan.shards.map((s) => ({ shardId: s.shardId, shardHash: s.shardHash, status: "SHARD_COMPLETE", composition: { ...byShard.get(s.shardId)!, inventoryDispositions: [] }, failureReasons: [], unresolvedIssues: [], reusedFromHash: false, attempts: 1, telemetry: null }));
  return { results, attribution, unattributed };
}

function compare(label: string, original: Composition, plan: ShardPlan, stitched: ReturnType<typeof stitchShardResults>, inventory: FrozenSemanticInventory, state: SourceContextResult["state"], attribution: unknown) {
  const before = census(original);
  const after = census({ rules: stitched.rules, definitions: stitched.definitions, sharedCapacities: stitched.sharedCapacities });
  const accBefore = reconcileInventoryWithComposition({ inventory, composition: original, dispositions: [], sourceContextState: state });
  const accAfter = stitched.accountability;
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return {
    label,
    shards: plan.shards.length, units: plan.units.length, derivation: plan.derivation, ownership: plan.ownershipProof, mustLinkGroups: plan.mustLinkGroups.length, attribution,
    before, after,
    preserved: { irNodes: before.exprNodes === after.exprNodes, rules: before.rules === after.rules, definitions: before.definitions === after.definitions, sharedCapacities: before.sharedCapacities === after.sharedCapacities, values: same(before.values, after.values), lineageRefs: before.lineageRefs === after.lineageRefs, dependencyEdges: before.dependencyEdges + before.unresolvedDependencies === after.dependencyEdges + after.unresolvedDependencies, dependencyEdgesResolvedBefore: before.dependencyEdges, dependencyEdgesResolvedAfter: after.dependencyEdges, unresolvedDependenciesAfter: after.unresolvedDependencies, unsupportedNodesAdded: after.unsupportedNodes - before.unsupportedNodes },
    valuesLost: before.values.filter((v, i) => after.values[i] !== v).length === 0 ? 0 : before.values.length - after.values.length,
    lineageLost: before.lineageRefs - after.lineageRefs,
    collisions: Object.fromEntries([...new Set(stitched.collisions.map((c) => c.kind))].map((k) => [k, stitched.collisions.filter((c) => c.kind === k).length])),
    danglingReferences: stitched.collisions.filter((c) => c.kind === "DANGLING_RULE_REFERENCE").length,
    contextualEmissions: stitched.contextualEmissions.length,
    ambiguousOwnership: (attribution as { UNATTRIBUTED: number }).UNATTRIBUTED,
    accountability: { before: { represented: accBefore.counts.represented, materialMissing: accBefore.counts.materialMissingFromComposition, valuesMissing: accBefore.counts.materialQuantitativeValuesMissing, dangling: accBefore.counts.danglingLineageReferences, semanticallyComplete: accBefore.semanticallyComplete }, after: { represented: accAfter.counts.represented, materialMissing: accAfter.counts.materialMissingFromComposition, valuesMissing: accAfter.counts.materialQuantitativeValuesMissing, dangling: accAfter.counts.danglingLineageReferences, semanticallyComplete: accAfter.semanticallyComplete }, identicalDispositions: accBefore.items.every((i) => accAfter.items.find((j) => j.inventoryItemId === i.inventoryItemId)?.disposition === i.disposition) },
    stitchedStatus: stitched.status, stitchedFailureReasons: stitched.failureReasons,
    idsRemapped: Object.keys(stitched.idMap).length,
  };
}

const report: Record<string, unknown> = { artifact: "F-7A §18 zero-cost historical simulation of shard ownership + stitching over recorded compiler outputs", gitSha: execSync("git rev-parse HEAD").toString().trim(), at: new Date().toISOString(), note: "no model output fabricated: recorded IR objects are attributed to the shard owning their lineage/term/section and re-stitched; the synthetic corpus uses a deterministic scripted emitter" };

// --- 1. Chewy 6.08 recorded compilation (38 rules, 6 definitions, 267 lineage refs, frozen v3 inventory of 288 items)
{
  const chewy = buildChewy();
  const { unit, callerInput } = buildChewyCallerInput("6.08", chewy);
  const plan = planCompilationShards({ candidateRef: callerInput.candidateRef, companyId: COMPANY, instrumentKey: INSTRUMENT, documentId: "doc-a", sourceContext: callerInput.sourceContext!, frozenInventory: callerInput.frozenInventory!, structuralIndex: chewy.index, generation: { algorithmVersion: callerInput.compilerAlgorithmVersion, promptVersion: callerInput.compilerPromptVersion } });
  const original: Composition = { rules: unit.compile.rules, definitions: unit.compile.definitions, sharedCapacities: unit.compile.sharedCapacities ?? [] };
  const { results, attribution, unattributed } = distributeRecorded(plan, original);
  const stitched = stitchShardResults({ plan, results, frozenInventory: callerInput.frozenInventory!, sourceContextState: callerInput.sourceContext!.state, companyId: COMPANY, instrumentKey: INSTRUMENT, candidateRef: callerInput.candidateRef });
  report.chewy608 = { ...compare("Chewy 6.08 recorded compilation (PARTIAL, 38 rules / 6 definitions)", original, plan, stitched, callerInput.frozenInventory!, callerInput.sourceContext!.state, attribution), unattributed,
    canonicalizedLineageReferences: stitched.canonicalizedLineageReferences,
    strippedLineageNote: "the recorded MONOLITHIC run credited these items via minority lineage on an object whose majority lineage lives in another shard; under the ownership contract (§9) the owner shard compiles them itself, so a distribution simulation necessarily loses this credit - it is recorded as a collision and surfaces in global Pass C as missing, never as false completeness",
    strippedLineage: stitched.collisions.filter((c) => c.kind === "LINEAGE_CLAIM_ON_UNOWNED_ITEM").map((c) => ({ claimingShard: c.shardId, ownerShard: c.ownerShardId, objectId: c.objectId, itemId: c.itemId, itemOwnedBySomeShard: c.ownerShardId !== null })),
    otherCollisions: stitched.collisions.filter((c) => c.kind !== "LINEAGE_CLAIM_ON_UNOWNED_ITEM").map((c) => ({ kind: c.kind, shardId: c.shardId, ownerShardId: c.ownerShardId, objectId: c.objectId, detail: c.detail })),
    stitchedMissingMaterialItems: stitched.accountability.items.filter((i) => i.disposition === "MISSING_FROM_COMPOSITION").map((i) => i.inventoryItemId).slice(0, 40), perShard: plan.shards.map((s) => ({ shardId: s.shardId, units: s.ownedUnitKeys.length, sections: [...new Set(s.ownedUnitKeys.map((k) => plan.units.find((u) => u.unitKey === k)!.sectionRef))].slice(0, 8), ownedItems: s.ownedItemIds.length, recordedRules: results.find((r) => r.shardId === s.shardId)!.composition!.rules.length, recordedDefinitions: results.find((r) => r.shardId === s.shardId)!.composition!.definitions.length })), crossShardLineageStripped: stitched.collisions.filter((c) => c.kind === "LINEAGE_CLAIM_ON_UNOWNED_ITEM").map((c) => ({ object: c.objectId, item: c.itemId, ownerShard: c.ownerShardId })) };
  console.log("6.08", JSON.stringify({ shards: plan.shards.length, attribution, preserved: (report.chewy608 as { preserved: unknown }).preserved, collisions: (report.chewy608 as { collisions: unknown }).collisions, acc: (report.chewy608 as { accountability: unknown }).accountability, status: stitched.status }, null, 1));
}

// --- 2. Recorded definition-heavy holdout fixtures (no frozen inventory: units from the region's own definitions, attribution by term)
{
  const rows = [];
  for (const name of ["holdout-applicable-liquidity-rate", "holdout-cash-sweep-cure", "holdout-new-definitions", "holdout-interest-expense", "holdout-secured-net-leverage", "holdout-first-lien-debt"]) {
    const d = JSON.parse(readFileSync(`tests/fixtures/unseen-packages/final-phase3-closure-holdout-run/${name}.json`, "utf-8"));
    const text: string = d.operativeSourceText;
    const docText = `SECTION 9.99. Holdout Terms .\n${text}`; // a heading no fixture text mentions (holdout-new-definitions itself says "Section 1.01 ... is hereby amended")
    const index = buildTestIndex([{ documentId: "doc-a", label: "H", text: docText }]);
    const sec = index.resolveUniqueNodeByRef("doc-a", "9.99");
    if (sec.status !== "UNIQUE") { rows.push({ name, skipped: `section resolution ${sec.status}` }); continue; }
    const regionText = index.getNodeText(sec.node.nodeId, "DESCENDANTS");
    const sourceContext: SourceContextResult = { state: "COMPLETE_LOCAL_SOURCE", regions: [{ regionId: "operative", kind: "OPERATIVE", documentId: "doc-a", sourceNodeId: sec.node.nodeId, sectionRef: "9.99", charStart: sec.node.charStart, charEnd: sec.node.charStart + regionText.length, text: regionText, expandedFor: null, truncatedAtBudget: false, unitExtension: null }], unresolvedReferences: [], reasons: [], totalChars: regionText.length, budgetChars: 24000 };
    const inventory: FrozenSemanticInventory = { candidateRef: name, items: [], uninventoriedValues: [], unaccountedSource: [], sourceCoverage: { regionsConsidered: ["operative"], countsByDisposition: {}, charsByDisposition: {}, accountedCharFraction: 0, externallyAccountedRegions: [] }, gapReinventory: null, inventoryStatus: "INVENTORY_SKIPPED_NO_PROVIDER", inventoryStatusReason: "historical fixture without a frozen inventory", rejectedUnverifiableItems: 0, rejectedDuplicateItems: 0, sourceContextState: "COMPLETE_LOCAL_SOURCE", frozenContentHash: `none:${name}`, frozenAt: "", algorithmVersion: "n/a", promptVersion: "n/a", provider: "n/a", model: "n/a", telemetryCostUsd: null };
    const comp = d.compile as { rules: IRRule[]; definitions: IRDefinition[]; sharedCapacities?: IRSharedCapacity[] };
    const plan = planCompilationShards({ candidateRef: name, companyId: comp.definitions[0]?.companyId ?? comp.rules[0]?.companyId ?? "co", instrumentKey: comp.definitions[0]?.instrumentKey ?? comp.rules[0]?.instrumentKey ?? "inst", documentId: "doc-a", sourceContext, frozenInventory: inventory, structuralIndex: index, budget: { targetPrimaryChars: 1500, maxPrimaryChars: 3000 } });
    const original: Composition = { rules: comp.rules, definitions: comp.definitions, sharedCapacities: comp.sharedCapacities ?? [] };
    const { results, attribution } = distributeRecorded(plan, original);
    const stitched = stitchShardResults({ plan, results, frozenInventory: inventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: original.definitions[0]?.companyId ?? original.rules[0]?.companyId ?? "co", instrumentKey: original.definitions[0]?.instrumentKey ?? original.rules[0]?.instrumentKey ?? "inst", candidateRef: name });
    const c = compare(name, original, plan, stitched, inventory, "COMPLETE_LOCAL_SOURCE", attribution);
    rows.push({ name, derivation: plan.derivation, units: plan.units.length, shards: plan.shards.length, definitionsRecorded: original.definitions.length, rulesRecorded: original.rules.length, preserved: c.preserved, collisions: c.collisions, contextualEmissions: c.contextualEmissions, attribution, definitionsWhoseTermIsNotADetectedUnit: original.definitions.filter((x) => !plan.units.some((u) => u.kind === "DEFINITION" && u.normalizedTermName === x.termName.replace(/\s+/g, " ").trim().toLowerCase())).map((x) => x.termName) });
  }
  report.holdoutFixtures = rows;
  console.log("holdouts", JSON.stringify(rows.map((r) => [r.name, r.derivation, r.units, r.shards, r.definitionsRecorded, r.preserved, r.collisions, r.definitionsWhoseTermIsNotADetectedUnit]), null, 1));
}

// --- 3. Synthetic large definition corpus (400 definitions, cross references every 7th, three shared-capacity constructs)
{
  const references = new Map<number, number>();
  for (let i = 8; i <= 400; i += 7) references.set(i, i - 7);
  const corpus = buildDefinitionsCorpus({ count: 400, references, sharedCapGroup: [50, 51, 52, 53], padWords: 30 });
  const plan = planCompilationShards({ candidateRef: "cand:1.01", companyId: CO, instrumentKey: INST, documentId: "doc-a", sourceContext: corpus.sourceContext, frozenInventory: corpus.frozenInventory, structuralIndex: corpus.index });
  const results: ShardExecutionResult[] = plan.shards.map((s: CompilationShard) => ({ shardId: s.shardId, shardHash: s.shardHash, status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(corpus, plan, s, references), failureReasons: [], unresolvedIssues: [], reusedFromHash: false, attempts: 1, telemetry: null }));
  const stitched = stitchShardResults({ plan, results, frozenInventory: corpus.frozenInventory, sourceContextState: "COMPLETE_LOCAL_SOURCE", companyId: CO, instrumentKey: INST, candidateRef: "cand:1.01" });
  const original: Composition = { rules: [], definitions: results.flatMap((r) => r.composition!.definitions), sharedCapacities: [] };
  const c = compare("synthetic 400-definition corpus", original, plan, stitched, corpus.frozenInventory, "COMPLETE_LOCAL_SOURCE", { LINEAGE_OR_TERM: 400, SECTION_REF: 0, UNATTRIBUTED: 0 });
  report.syntheticCorpus = { ...c, totals: plan.totals, contextEntriesPerShard: plan.shards.map((s) => s.context.length), crossShardReferencesResolvedAsContext: plan.shards.reduce((a, s) => a + s.context.filter((x) => x.kind === "REFERENCED_TERM" && x.ownerShardId && x.ownerShardId !== s.shardId).length, 0) };
  console.log("synthetic", JSON.stringify({ shards: plan.shards.length, totals: plan.totals, preserved: c.preserved, acc: c.accountability.after, status: stitched.status, mustLink: plan.mustLinkGroups.length }, null, 1));
}

writeFileSync(`${out}/03-historical-simulation.json`, JSON.stringify(report, null, 1));
