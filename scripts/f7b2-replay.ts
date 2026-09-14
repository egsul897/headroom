/**
 * F-7B.2 deterministic re-stitch of the five ALREADY-PAID accepted F-7B.1 compositions. ZERO model calls.
 *
 * Runs in two modes against the SAME frozen inputs, so "before" and "after" are the same code path over the same data:
 *   --mode before   executed inside a git worktree checked out at the F-7B.2 starting SHA (starting-SHA stitcher)
 *   --mode after    executed in the working tree (source-anchored attribution)
 * Writes one JSON audit to the path given by --out.
 */
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { stitchShardResults } from "../lib/contract-model/compiler/semantic/shard-stitcher";
import { normalizeDefinedTermRef } from "../lib/contract-model/compiler/amendment/chain";
import type { ShardExecutionResult } from "../lib/contract-model/compiler/semantic/shard-types";
import type { IRDefinition, IRRule, IRSharedCapacity } from "../lib/contract-model/ir/types";
import { freezeAndPlan, writeJson } from "./f7b-lib";

const EVIDENCE = "tests/fixtures/unseen-packages/f7b1-chewy-101-canary-rerun";
const arg = (n: string, d: string) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d; };
const mode = arg("--mode", "after");
const out = arg("--out", `docs/phase-3-remediation-f7b2/${mode === "before" ? "00-unsafe-fallback-reproduction" : "03-offline-restitch-after"}.json`);
const repoRoot = arg("--repo", process.cwd());

/** Census of an IR composition: values, lineage, dependency edges, references, unsupported nodes. */
function census(c: { rules: IRRule[]; definitions: IRDefinition[]; sharedCapacities: IRSharedCapacity[] }) {
  const values: string[] = []; const lineage: string[] = []; const ruleRefs: string[] = []; const termRefs: string[] = [];
  let nodes = 0, unsupported = 0, deps = 0, unresolvedDeps = 0;
  const walk = (x: unknown): void => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    const o = x as Record<string, unknown>;
    if (typeof o.kind === "string") {
      nodes++;
      if (o.kind === "UNSUPPORTED") unsupported++;
      if (o.kind === "MONEY") values.push(`MONEY:${o.amount}`);
      if (o.kind === "PERCENT") values.push(`PERCENT:${o.value}`);
      if (o.kind === "RATIO") values.push(`RATIO:${o.value}`);
      if (o.kind === "NUMBER") values.push(`NUMBER:${o.value}`);
      if (o.kind === "RULE_REFERENCE") ruleRefs.push(String(o.ruleId));
      if (o.kind === "DEFINED_TERM_REFERENCE") termRefs.push(normalizeDefinedTermRef(String(o.termName ?? "")));
    }
    if (Array.isArray(o.inventoryItemIds)) lineage.push(...(o.inventoryItemIds as string[]));
    for (const [k, v] of Object.entries(o)) if (k !== "inventoryItemIds" && v && typeof v === "object") walk(v);
  };
  for (const r of c.rules) { walk(r); deps += r.dependsOn.length; unresolvedDeps += (r.unresolvedDependencies ?? []).length; }
  for (const d of c.definitions) walk(d);
  for (const s of c.sharedCapacities) walk(s);
  return { rules: c.rules.length, definitions: c.definitions.length, sharedCapacities: c.sharedCapacities.length, exprNodes: nodes, unsupportedNodes: unsupported, values: values.sort(), distinctValues: [...new Set(values)].sort(), lineageRefs: lineage.length, distinctLineageItems: [...new Set(lineage)].sort(), dependencyEdges: deps, unresolvedDependencies: unresolvedDeps, ruleReferences: ruleRefs, definedTermReferences: termRefs };
}

const frozen = freezeAndPlan();
const { plan } = frozen;
const region = frozen.callerInput.sourceContext!.regions[0]!;
const files = readdirSync(`${repoRoot}/${EVIDENCE}`).filter((f) => f.endsWith(".json")).sort();
const results: ShardExecutionResult[] = files.map((f) => (JSON.parse(readFileSync(`${repoRoot}/${EVIDENCE}/${f}`, "utf-8")) as { result: ShardExecutionResult }).result);
const byShard = new Map(results.map((r) => [r.shardId, r]));
const ordered = plan.shards.flatMap((s) => (byShard.has(s.shardId) ? [byShard.get(s.shardId)!] : []));

// "after" passes the resolved region text so the primary-source proof class is available; "before" has no such parameter.
const stitchInput = { plan, results: ordered, frozenInventory: frozen.callerInput.frozenInventory!, sourceContextState: frozen.callerInput.sourceContext!.state, companyId: frozen.callerInput.companyId, instrumentKey: frozen.callerInput.instrumentKey, candidateRef: frozen.callerInput.candidateRef, ...(mode === "after" ? { sourceRegions: frozen.callerInput.sourceContext!.regions.map((r) => ({ regionId: r.regionId, text: r.text })) } : {}) };
const stitched = stitchShardResults(stitchInput as Parameters<typeof stitchShardResults>[0]);

// ---- per-emitted-definition audit (the same questions in both modes)
const inv = frozen.callerInput.frozenInventory!;
const material = new Set(inv.items.filter((i) => i.materiality === "CRITICAL" || i.materiality === "MATERIAL").map((i) => i.inventoryItemId));
const defUnits = plan.units.filter((u) => u.kind === "DEFINITION");
const lineageOf = (o: unknown): string[] => { const ids: string[] = []; const walk = (x: unknown): void => { if (!x || typeof x !== "object") return; if (Array.isArray(x)) { x.forEach(walk); return; } const r = x as Record<string, unknown>; if (Array.isArray(r.inventoryItemIds)) ids.push(...(r.inventoryItemIds as string[])); for (const v of Object.values(r)) if (v && typeof v === "object") walk(v); }; walk(o); return ids; };
const retainedIds = new Set(stitched.definitions.map((d) => d.definitionId));
const attributionByObject = new Map(((stitched as { definitionAttribution?: { objectId: string; method: string; unitKey: string | null; anchor: unknown }[] }).definitionAttribution ?? []).map((a) => [a.objectId, a]));

const perDefinition = ordered.flatMap((r) => (r.composition?.definitions ?? []).map((def) => {
  const shard = plan.shards.find((s) => s.shardId === r.shardId)!;
  const key = normalizeDefinedTermRef(def.termName);
  const termUnit = defUnits.find((u) => u.normalizedTermName === key) ?? null;
  const ids = lineageOf(def);
  const lineageUnits = [...new Set(ids.map((id) => plan.itemOwnerUnit[id]).filter(Boolean))] as string[];
  const ownedText = shard.ownedUnitKeys.map((k) => { const u = plan.units.find((x) => x.unitKey === k)!; return region.text.slice(u.charStart, u.charEnd); }).join("\n");
  const ctxText = shard.context.map((c) => c.text).join("\n");
  const audit = attributionByObject.get(def.definitionId);
  return {
    termName: def.termName, normalizedTerm: key, definitionId: def.definitionId, emittingShard: r.shardId,
    plannerDefinitionUnitMatch: Boolean(termUnit), plannerUnitKey: termUnit?.unitKey ?? null, plannerUnitOwnerShard: termUnit ? plan.unitOwnerShard[termUnit.unitKey] ?? null : null,
    lineageIds: ids.length, lineageOwnerUnits: lineageUnits,
    attributionMethod: audit?.method ?? (mode === "before" ? "(pre-F-7B.2 stitcher: no audit field)" : "UNKNOWN"),
    attributedUnit: audit?.unitKey ?? null,
    attributedUnitDeclaresTerm: audit?.unitKey ? (() => { const u = plan.units.find((x) => x.unitKey === audit.unitKey)!; return new RegExp(`[“"]\\s*${def.termName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*[”"]\\s*(?:means|shall mean|shall have the meaning|:)`, "i").test(region.text.slice(u.charStart, u.charEnd)); })() : false,
    termOccursInOwnedPrimarySource: ownedText.includes(def.termName),
    declaredInOwnedPrimarySource: new RegExp(`[“"]\\s*${def.termName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*[”"]\\s*(?:means|shall mean|shall have the meaning|:)`, "i").test(ownedText),
    termOccursOnlyInReadOnlyContext: !ownedText.includes(def.termName) && ctxText.includes(def.termName),
    termOccursElsewhereInDocument: !ownedText.includes(def.termName) && frozen.chewy.text.includes(def.termName),
    survivesStitching: retainedIds.has(def.definitionId),
    anchor: audit?.anchor ?? null,
  };
}));

// ---- the pre-registered F-7B trust metric (scorer H), recomputed identically in both modes.
// The F-7B scorer recognised two proof classes (planner DEFINITION unit / owned inventory lineage) because those were
// the only two that existed. F-7B.2 §4 declares a third - a unique declaration located in the emitting shard's own
// PRIMARY owned source, carried as a DefinitionSourceAnchor - so the metric asks the invariant's question: does this
// retained authoritative definition carry ANY of the three affirmative proofs? The formula is identical in both modes;
// in "before" the anchor set is empty by construction (the starting-SHA stitcher emits none), so the reproduction count
// is unaffected and the two modes remain directly comparable.
// DefinitionSourceAnchor is provenance metadata, not IR; the definition -> anchor join lives in the attribution audit.
const anchoredObjectIds = new Set(((stitched as { definitionAttribution?: { objectId: string; anchor: unknown }[] }).definitionAttribution ?? []).filter((a) => a.anchor).map((a) => a.objectId));
const proofClasses = (d: { definitionId: string; termName: string }): string[] => {
  const proofs: string[] = [];
  if (defUnits.some((u) => u.normalizedTermName === normalizeDefinedTermRef(d.termName))) proofs.push("PLANNER_DEFINITION_UNIT");
  if (lineageOf(d).length > 0) proofs.push("OWNED_INVENTORY_LINEAGE");
  if (anchoredObjectIds.has(d.definitionId)) proofs.push("UNIQUE_PRIMARY_SOURCE_DECLARATION");
  return proofs;
};
const definitionProofs = stitched.definitions.map((d) => ({ definitionId: d.definitionId, termName: d.termName, proofClasses: proofClasses(d) }));
const sourceUnverifiable = definitionProofs.filter((d) => d.proofClasses.length === 0).map((d) => ({ definitionId: d.definitionId, termName: d.termName }));
const proofClassCounts = { PLANNER_DEFINITION_UNIT: 0, OWNED_INVENTORY_LINEAGE: 0, UNIQUE_PRIMARY_SOURCE_DECLARATION: 0, NONE: 0 };
for (const d of definitionProofs) { if (d.proofClasses.length === 0) proofClassCounts.NONE++; for (const c of d.proofClasses) proofClassCounts[c as keyof typeof proofClassCounts]++; }

const acc = stitched.accountability;
const matItems = acc.items.filter((i) => material.has(i.inventoryItemId));
const stage1Units = new Set(ordered.flatMap((r) => plan.shards.find((s) => s.shardId === r.shardId)!.ownedItemIds));
const stage1Material = [...stage1Units].filter((i) => material.has(i));
const stage1Acc = matItems.filter((i) => stage1Units.has(i.inventoryItemId));

writeJson(`${repoRoot}/${out}`, {
  artifact: `F-7B.2 ${mode === "before" ? "§2 reproduction of the unsafe SHARD_FIRST_UNIT fallback (starting-SHA stitcher, replayed in a git worktree)" : "§15 offline re-stitch with source-anchored attribution"} - 0 model calls`,
  mode, gitSha: execSync(`git -C ${repoRoot} rev-parse HEAD`).toString().trim(), at: new Date().toISOString(),
  planHash: plan.planHash, shardIds: ordered.map((r) => r.shardId), shardHashes: ordered.map((r) => r.shardHash),
  emittedDefinitions: perDefinition.length, retainedDefinitions: stitched.definitions.length,
  sourceUnverifiableAuthoritativeDefinitions: sourceUnverifiable.length, sourceUnverifiableList: sourceUnverifiable,
  proofClassCounts, definitionProofs,
  collisions: Object.fromEntries([...new Set(stitched.collisions.map((c) => c.kind))].map((k) => [k, stitched.collisions.filter((c) => c.kind === k).length])),
  collisionDetail: stitched.collisions.map((c) => ({ kind: c.kind, shardId: c.shardId, objectId: c.objectId, requiresReview: c.requiresReview, detail: c.detail.slice(0, 300) })),
  contextualEmissions: stitched.contextualEmissions,
  status: stitched.status, failureReasons: stitched.failureReasons,
  census: census({ rules: stitched.rules, definitions: stitched.definitions, sharedCapacities: stitched.sharedCapacities }),
  inputCensus: census({ rules: ordered.flatMap((r) => r.composition?.rules ?? []), definitions: ordered.flatMap((r) => r.composition?.definitions ?? []), sharedCapacities: ordered.flatMap((r) => r.composition?.sharedCapacities ?? []) }),
  accountability: { passC: acc.counts, semanticallyComplete: acc.semanticallyComplete, materialTotalAll: material.size, materialRepresentedAll: matItems.filter((i) => i.disposition === "REPRESENTED").length, materialDispositionedAll: matItems.filter((i) => i.disposition !== "REPRESENTED" && i.disposition !== "MISSING_FROM_COMPOSITION").length, materialMissingAll: matItems.filter((i) => i.disposition === "MISSING_FROM_COMPOSITION").length, stage1OwnedMaterialTotal: stage1Material.length, stage1Represented: stage1Acc.filter((i) => i.disposition === "REPRESENTED").length, stage1Dispositioned: stage1Acc.filter((i) => i.disposition !== "REPRESENTED" && i.disposition !== "MISSING_FROM_COMPOSITION").length, stage1Missing: stage1Acc.filter((i) => i.disposition === "MISSING_FROM_COMPOSITION").length },
  definitionSourceAnchors: (stitched as { definitionSourceAnchors?: unknown[] }).definitionSourceAnchors ?? [],
  definitionAttribution: (stitched as { definitionAttribution?: unknown[] }).definitionAttribution ?? [],
  perDefinition,
});
console.log(JSON.stringify({ mode, emitted: perDefinition.length, retained: stitched.definitions.length, sourceUnverifiable: sourceUnverifiable.length, proofClassCounts, status: stitched.status, collisions: Object.fromEntries([...new Set(stitched.collisions.map((c) => c.kind))].map((k) => [k, stitched.collisions.filter((c) => c.kind === k).length])) }, null, 1));
