/**
 * F-7B.2 §28 - derives the mission's evidence artifacts from the two offline re-stitch runs (00 before / 03 after).
 * Deterministic and zero-cost: it reads the frozen inputs and the two replay outputs, and writes JSON only.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { freezeAndPlan, writeJson } from "./f7b-lib";

const repo = process.argv[2] ?? process.cwd();
const dir = `${repo}/docs/phase-3-remediation-f7b2`;
const read = (f: string) => JSON.parse(readFileSync(`${dir}/${f}`, "utf-8")) as Record<string, any>;
const before = read("00-unsafe-fallback-reproduction.json");
const after = read("03-offline-restitch-after.json");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const frozen = freezeAndPlan() as any;
const plan = frozen.plan;
const EVIDENCE = process.env.F7B_EVIDENCE_DIR ?? "tests/fixtures/unseen-packages/f7b1-chewy-101-canary-rerun";
const files = readdirSync(`${repo}/${EVIDENCE}`).filter((f) => f.endsWith(".json")).sort();

// ---- 01: what was frozen, and the proof it did not move -------------------------------------------------
writeJson(`${dir}/01-frozen-inputs.json`, {
  artifact: "F-7B.2 §1/§22 - the real F-7B.1 inputs this mission re-stitches, and the frozen-plan invariant",
  at: new Date().toISOString(),
  planHash: plan.planHash,
  shardCount: plan.shards.length,
  unitCount: plan.units.length,
  definitionUnits: plan.units.filter((u: any) => u.kind === "DEFINITION").length,
  ownershipProof: plan.ownershipProof,
  frozenInventoryHash: frozen.callerInput.frozenInventory.frozenContentHash,
  sourceContextState: frozen.callerInput.sourceContext.state,
  stage1: files.map((f) => {
    const r = JSON.parse(readFileSync(`${repo}/${EVIDENCE}/${f}`, "utf-8")) as any;
    return { file: f, shardId: r.result.shardId, shardHash: r.result.shardHash, status: r.result.status, definitions: r.result.composition?.definitions?.length ?? 0, rules: r.result.composition?.rules?.length ?? 0, fileSha256: sha256(readFileSync(`${repo}/${EVIDENCE}/${f}`, "utf-8")) };
  }),
  planUnchanged: { planHashBefore: before.planHash, planHashAfter: after.planHash, equal: before.planHash === after.planHash, shardIdsEqual: JSON.stringify(before.shardIds) === JSON.stringify(after.shardIds), shardHashesEqual: JSON.stringify(before.shardHashes) === JSON.stringify(after.shardHashes) },
  paidCalls: 0,
  costUsd: 0,
});

// ---- 02: every previously source-unverifiable definition, classified A-F --------------------------------
const CLASSES = {
  A: "PRIMARY_NESTED_DEFINITION_ANCHORED - the term is declared in the emitting shard's own primary source and is now anchored to the enclosing owned unit",
  B: "OWNED_LINEAGE_ATTRIBUTED - no declaration located, but the definition carries lineage to inventory items this shard owns",
  C: "PLANNER_UNIT_TERM - the term is a planner DEFINITION unit this shard owns (it was never in the unverifiable population)",
  D: "AMBIGUOUS_MULTIPLE_DECLARATIONS - declared more than once in owned source; sent to explicit review, never first-match",
  E: "CONTEXTUAL_UNOWNED_DEFINITION - only reachable through read-only context or retrieved text; dropped and recorded",
  F: "UNATTRIBUTED_DROPPED - the term appears in owned source only as a mention, with no definitional grammar; dropped and recorded",
};
const unverifiableBefore = new Set<string>((before.sourceUnverifiableList as any[]).map((d) => d.definitionId));
const afterByTerm = new Map<string, any>((after.perDefinition as any[]).map((d) => [d.definitionId, d]));
const classify = (d: any): keyof typeof CLASSES => {
  if (d.plannerDefinitionUnitMatch) return "C";
  if (d.attributionMethod === "PRIMARY_SOURCE_DECLARATION") return "A";
  if (d.attributionMethod === "LINEAGE_MAJORITY") return "B";
  if (d.attributionMethod === "AMBIGUOUS_PRIMARY_SOURCE") return "D";
  if (d.attributionMethod === "UNATTRIBUTED") return d.termOccursInOwnedPrimarySource ? "F" : "E";
  return "E";
};
const cases = [...unverifiableBefore].map((id) => {
  const d = afterByTerm.get(id)!;
  const cls = classify(d);
  return {
    definitionId: id, termName: d.termName, emittingShard: d.emittingShard, classification: cls, classificationMeaning: CLASSES[cls],
    plannerDefinitionUnitMatch: d.plannerDefinitionUnitMatch, lineageIds: d.lineageIds,
    termOccursInOwnedPrimarySource: d.termOccursInOwnedPrimarySource, termOccursOnlyInReadOnlyContext: d.termOccursOnlyInReadOnlyContext, termOccursElsewhereInDocument: d.termOccursElsewhereInDocument,
    attributionMethod: d.attributionMethod, attributedUnit: d.attributedUnit, survivesStitching: d.survivesStitching,
    anchor: d.anchor ? { unitKey: d.anchor.unitKey, regionId: d.anchor.regionId, charStart: d.anchor.charStart, charEnd: d.anchor.charEnd, absCharStart: d.anchor.absCharStart, declarationExcerpt: d.anchor.declarationExcerpt, declarationTextHash: d.anchor.declarationTextHash, method: d.anchor.method } : null,
  };
}).sort((a, b) => a.termName.localeCompare(b.termName));
writeJson(`${dir}/02-source-location-audit.json`, {
  artifact: "F-7B.2 §15/§3 - every definition that was source-unverifiable at the starting SHA, classified against the new invariant",
  at: new Date().toISOString(),
  population: cases.length,
  classes: CLASSES,
  countsByClass: Object.fromEntries(Object.keys(CLASSES).map((k) => [k, cases.filter((c) => c.classification === k).length])),
  rootCauseClassification: {
    A_UNSAFE_SHARD_FIRST_UNIT_FALLBACK: true,
    B_NESTED_DEFINITION_NOT_MODELED_AS_SOURCE_ANCHOR: true,
    C_RETRIEVED_CONTEXT_EMISSION_NOT_DISTINGUISHED: true,
    D_DEFINITION_PROVENANCE_DROPPED: true,
    E_OTHER: false,
    note: "All four causes are real and independent. (A) the stitcher granted ownership from shard position alone; (B) a term declared inside an enclosing unit had no representable anchor, so no proof class could accept it; (C) an emission reachable only through read-only context was indistinguishable from an owned one; (D) nothing in the plan, inventory or stitched IR recorded WHERE a retained definition came from, so the failure was invisible after the fact.",
  },
  cases,
});

// ---- 04: before/after disposition of every emitted definition -------------------------------------------
const beforeById = new Map<string, any>((before.perDefinition as any[]).map((d) => [d.definitionId, d]));
writeJson(`${dir}/04-definition-disposition.json`, {
  artifact: "F-7B.2 §17/§18 - what happened to every model-emitted definition, before vs after",
  at: new Date().toISOString(),
  emitted: (after.perDefinition as any[]).length,
  retainedBefore: before.retainedDefinitions, retainedAfter: after.retainedDefinitions,
  proofClassCountsBefore: before.proofClassCounts, proofClassCountsAfter: after.proofClassCounts,
  sourceUnverifiableBefore: before.sourceUnverifiableAuthoritativeDefinitions, sourceUnverifiableAfter: after.sourceUnverifiableAuthoritativeDefinitions,
  rows: (after.perDefinition as any[]).map((d) => ({
    definitionId: d.definitionId, termName: d.termName, emittingShard: d.emittingShard,
    beforeRetained: beforeById.get(d.definitionId)?.survivesStitching ?? null, beforeAttribution: "SHARD_FIRST_UNIT_OR_TERM_OR_LINEAGE (starting SHA had no attribution audit)",
    afterRetained: d.survivesStitching, afterMethod: d.attributionMethod, afterUnit: d.attributedUnit, anchored: Boolean(d.anchor),
    changed: (beforeById.get(d.definitionId)?.survivesStitching ?? null) !== d.survivesStitching,
  })).sort((a, b) => a.termName.localeCompare(b.termName)),
});

// ---- 05: accountability before vs after -----------------------------------------------------------------
writeJson(`${dir}/05-accountability-before-after.json`, {
  artifact: "F-7B.2 §17 - owned-material accountability must not move",
  at: new Date().toISOString(),
  before: before.accountability, after: after.accountability,
  identical: JSON.stringify(before.accountability) === JSON.stringify(after.accountability),
  stage1Baseline: { total: 28, represented: 23, dispositioned: 3, missing: 2, accountedPercent: 92.9 },
  stage1Now: { total: after.accountability.stage1OwnedMaterialTotal, represented: after.accountability.stage1Represented, dispositioned: after.accountability.stage1Dispositioned, missing: after.accountability.stage1Missing },
});

// ---- 06: values / lineage / dependency / dangling ------------------------------------------------------
const cb = before.census, ca = after.census;
const lost = (cb.values as string[]).filter((v, i) => (ca.values as string[])[i] !== v);
writeJson(`${dir}/06-values-lineage-dependency-audit.json`, {
  artifact: "F-7B.2 §18 - zero owned values or lineage lost, zero new dangling references",
  at: new Date().toISOString(),
  values: { before: cb.values.length, after: ca.values.length, identical: JSON.stringify(cb.values) === JSON.stringify(ca.values), distinctIdentical: JSON.stringify(cb.distinctValues) === JSON.stringify(ca.distinctValues), mismatches: lost },
  lineage: { refsBefore: cb.lineageRefs, refsAfter: ca.lineageRefs, identical: cb.lineageRefs === ca.lineageRefs, distinctItemsIdentical: JSON.stringify(cb.distinctLineageItems) === JSON.stringify(ca.distinctLineageItems) },
  dependencies: { edgesBefore: cb.dependencyEdges, edgesAfter: ca.dependencyEdges, unresolvedBefore: cb.unresolvedDependencies, unresolvedAfter: ca.unresolvedDependencies, identical: cb.dependencyEdges === ca.dependencyEdges && cb.unresolvedDependencies === ca.unresolvedDependencies },
  danglingLineageReferences: { before: before.accountability.passC.danglingLineageReferences, after: after.accountability.passC.danglingLineageReferences },
  ruleReferences: { before: cb.ruleReferences, after: ca.ruleReferences, identical: JSON.stringify(cb.ruleReferences) === JSON.stringify(ca.ruleReferences) },
  definedTermReferences: { before: cb.definedTermReferences, after: ca.definedTermReferences, identical: JSON.stringify(cb.definedTermReferences) === JSON.stringify(ca.definedTermReferences), note: "DEFINED_TERM_REFERENCE resolves by term NAME, never by definition id, so dropping a definition can never create a dangling id reference." },
  irShape: { rulesBefore: cb.rules, rulesAfter: ca.rules, exprNodesBefore: cb.exprNodes, exprNodesAfter: ca.exprNodes, unsupportedBefore: cb.unsupportedNodes, unsupportedAfter: ca.unsupportedNodes },
  collisionsBefore: before.collisions, collisionsAfter: after.collisions,
});
console.log("artifacts written");
