/**
 * F-5.3A ZERO-COST evaluation of the dual-pass ensemble over the FROZEN F-5.1 paid pair (certification-v5 run-A/run-B).
 * No model call. Measures the three union policies, F/B/H/A/D/G recovery, false additions, review burden, union source
 * coverage (recomputed), order independence, freeze hashing, and historical same-source controls.
 *   npx tsx scripts/f5-3a-ensemble-evaluation.ts <outDir>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { partitionSourceSlots } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { buildEnsembleInventory, canonicalEnsembleJson, selectByPolicy, type EnsembleInventory } from "../lib/contract-model/compiler/semantic-accountability/ensemble";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../lib/contract-model/compiler/semantic-accountability/types";
import type { StructuralIndex } from "../lib/contract-model/compiler/structural-index";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
const DIR = "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-v5";
const DECOMP = "docs/phase-3-remediation-f5-1/09-paid-pair-v5-legacy-decomposition.json";
const out = process.argv[2]!;
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const MATERIAL = new Set(["CRITICAL", "MATERIAL"]);

// ---- frozen source + slots (deterministic) ----
const text = readFileSync(SRC, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), detectStructuralDefinitions("doc-a", text, nodes), detectStructuralReferences("doc-a", text, nodes));
const section = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === "6.08").sort((a, b) => b.charEnd - b.charStart - (a.charEnd - a.charStart))[0]!;
const sourceContext = resolveSourceContext({ index, documentId: "doc-a", operativeSourceText: text.slice(section.charStart, section.charEnd), anchorNodeId: section.nodeId, operativeCharStart: section.charStart, documentText: text });
const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
const runA = JSON.parse(readFileSync(`${DIR}/run-A.json`, "utf-8")) as FrozenSemanticInventory;
const runB = JSON.parse(readFileSync(`${DIR}/run-B.json`, "utf-8")) as FrozenSemanticInventory;
const unit = JSON.parse(readFileSync(UNIT, "utf-8"));
if (unit.compile.sourceContext.regions[0].text !== sourceContext.regions[0]!.text) throw new Error("region drift");
const decomp = JSON.parse(readFileSync(DECOMP, "utf-8")) as { rows: { run: string; inventoryItemId: string; role: string; materiality: string; span: [number, number]; class: string; detail: string; excerpt: string }[] };

// ---- build the ensemble both ways ----
const build = (passes: { passId: string; inventory: FrozenSemanticInventory }[]) => buildEnsembleInventory({ candidateRef: runA.candidateRef, sourceContext, structuralIndex: index, partition, passes });
const AB = build([{ passId: "pass-1", inventory: runA }, { passId: "pass-2", inventory: runB }]);
const BA = build([{ passId: "pass-2", inventory: runB }, { passId: "pass-1", inventory: runA }]);
const orderIndependent = canonicalEnsembleJson(AB) === canonicalEnsembleJson(BA) && AB.frozenContentHash === BA.frozenContentHash;
const E = AB;
const P1 = "pass-1", P2 = "pass-2";
const memberOf = (passId: string, id: string) => E.items.find((i) => (i.support?.memberItemIds[passId] ?? []).includes(id));

// ---- policies ----
const rawUnionIds = new Set([...runA.items.map((i) => i.inventoryItemId), ...runB.items.map((i) => i.inventoryItemId)]);
const rawUnionItems: SemanticInventoryItem[] = [...runA.items, ...runB.items.filter((i) => !runA.items.some((a) => a.inventoryItemId === i.inventoryItemId))];
const intersection = selectByPolicy(E, "INTERSECTION_ONLY");
const canonical = selectByPolicy(E, "SUPPORT_AWARE_CANONICAL_UNION");
const c = E.ensemble.counts;

// ---- recovery of the frozen scorer's cases ----
function recovery(row: (typeof decomp.rows)[number]) {
  const passId = row.run === "run1" ? P1 : P2;
  const u = memberOf(passId, row.inventoryItemId);
  const src = (row.run === "run1" ? runA : runB).items.find((i) => i.inventoryItemId === row.inventoryItemId)!;
  return { class: row.class, presentPass: passId, id: row.inventoryItemId, materiality: row.materiality, span: row.span, excerpt: row.excerpt.slice(0, 80),
    inCanonicalUnion: !!u, canonicalId: u?.inventoryItemId ?? null, collapsedWithCounterpart: !!u && (u.support?.supportingPasses.length ?? 0) > 1, supportStatus: u?.support?.supportStatus ?? null,
    inIntersectionOnly: !!u && u.support?.supportStatus === "CORROBORATED", inRawUnion: rawUnionIds.has(row.inventoryItemId), sourceVerified: !!u,
    valuesPreserved: !!u && src.quantitativeValues.every((v) => u.quantitativeValues.some((w) => w.kind === v.kind && (w.normalizedValue ?? w.rawText) === (v.normalizedValue ?? v.rawText))),
    laterReviewRequired: !!u && MATERIAL.has(u.materiality) && u.support?.supportStatus !== "CORROBORATED" };
}
const byClass = (cls: string) => decomp.rows.filter((r) => r.class === cls).map(recovery);
const rec = { F: byClass("F_TRUE_SEMANTIC_OMISSION"), B: byClass("B_GRANULARITY_INSTABILITY"), H: byClass("H_DEPENDENCY_FRAGMENTATION"), A: byClass("A_IDENTITY_INSTABILITY"), D: byClass("D_ROLE_INSTABILITY"), G: byClass("G_TRUE_SEMANTIC_ADDITION") };
const rate = (xs: { [k: string]: unknown }[], k: string) => (xs.length ? Number((xs.filter((x) => x[k] === true).length / xs.length).toFixed(4)) : null);
const recoverySummary = Object.fromEntries(Object.entries(rec).map(([k, xs]) => [k, { total: xs.length, intersectionOnly: rate(xs, "inIntersectionOnly"), rawUnion: rate(xs, "inRawUnion"), canonicalUnion: rate(xs, "inCanonicalUnion"), collapsedWithCounterpart: xs.filter((x) => x.collapsedWithCounterpart).length, singleRun: xs.filter((x) => x.supportStatus === "SINGLE_RUN").length, corroborated: xs.filter((x) => x.supportStatus === "CORROBORATED").length, conflicted: xs.filter((x) => x.supportStatus === "CONFLICTED").length, valuesPreserved: xs.filter((x) => x.valuesPreserved).length, laterReviewRequired: xs.filter((x) => x.laterReviewRequired).length }]));

// ---- false-addition analysis: union items beyond the intersection ----
const additions = E.items.filter((i) => i.support?.supportStatus !== "CORROBORATED");
const classifyAddition = (i: SemanticInventoryItem) => {
  if (!MATERIAL.has(i.materiality) && i.materiality === "INFORMATIONAL") return "C_INFORMATIONAL_SOURCE_VERIFIED";
  if (i.materiality === "REVIEW_UNCERTAIN" || i.ambiguity !== "NONE") return "C_SOURCE_VERIFIED_UNCERTAIN";
  return "A_GENUINE_SOURCE_SEMANTICS_OMITTED_BY_OTHER_PASS";
};
const additionsByClass: Record<string, number> = {};
for (const i of additions) { const k = classifyAddition(i); additionsByClass[k] = (additionsByClass[k] ?? 0) + 1; }
// B (granularity equivalents that should canonicalize) are, by construction, the items the normalizer DID merge: measured as pass items absorbed into a corroborated canonical item
const absorbed = { [P1]: 0, [P2]: 0 } as Record<string, number>;
for (const i of E.items) if (i.support?.supportStatus === "CORROBORATED") for (const p of [P1, P2]) absorbed[p] = (absorbed[p] ?? 0) + (i.support.memberItemIds[p]?.length ?? 0);
const unsupportedAdditions = { material: E.items.filter((i) => MATERIAL.has(i.materiality) && !i.support).length, informational: E.items.filter((i) => !MATERIAL.has(i.materiality) && !i.support).length, rejectedUnverifiable: E.rejectedUnverifiableItems };

// ---- union source coverage (recomputed inside the ensemble) + rescue analysis ----
const ov = (a: { charStart: number; charEnd: number }, b: { charStart: number; charEnd: number }) => Math.max(0, Math.min(a.charEnd, b.charEnd) - Math.max(a.charStart, b.charStart));
const unaccA = runA.unaccountedSource, unaccB = runB.unaccountedSource, unaccU = E.unaccountedSource;
const stillGap = (u: { charStart: number; charEnd: number }) => unaccU.some((x) => ov(x, u) > 0);
const rescuedBy = (u: { charStart: number; charEnd: number }, passId: string) => !stillGap(u) && E.items.some((i) => i.support?.supportStatus === "SINGLE_RUN" && i.support.supportingPasses[0] === passId && MATERIAL.has(i.materiality) && ov(i.sourceSpan, u) > 0);
const coverage = { A: { unaccountedSegments: unaccA.length, accountedCharFraction: runA.sourceCoverage.accountedCharFraction, uninventoriedValues: runA.uninventoriedValues.length }, B: { unaccountedSegments: unaccB.length, accountedCharFraction: runB.sourceCoverage.accountedCharFraction, uninventoriedValues: runB.uninventoriedValues.length }, union: { unaccountedSegments: unaccU.length, accountedCharFraction: E.sourceCoverage.accountedCharFraction, uninventoriedValues: E.uninventoriedValues.length, status: E.inventoryStatus, countsByDisposition: E.sourceCoverage.countsByDisposition },
  gapsInBothRunsStillGap: unaccA.filter((u) => unaccB.some((v) => ov(u, v) > 0) && stillGap(u)).length, gapsInBothRunsResolvedByUnion: unaccA.filter((u) => unaccB.some((v) => ov(u, v) > 0) && !stillGap(u)).length,
  aGapsRescuedByBOnlySemantics: unaccA.filter((u) => rescuedBy(u, P2)).length, bGapsRescuedByAOnlySemantics: unaccB.filter((u) => rescuedBy(u, P1)).length, aGapsStillGap: unaccA.filter(stillGap).length, bGapsStillGap: unaccB.filter(stillGap).length, unionGapNotInEitherRun: unaccU.filter((u) => !unaccA.some((x) => ov(x, u) > 0) && !unaccB.some((x) => ov(x, u) > 0)).length };

// ---- values / lineage preservation ----
const valueSet = (items: SemanticInventoryItem[]) => new Set(items.flatMap((i) => i.quantitativeValues.map((v) => `${i.sourceSpan.regionId}:${v.kind}:${v.normalizedValue ?? v.rawText}`)));
const vAB = new Set([...valueSet(runA.items), ...valueSet(runB.items)]), vU = valueSet(E.items);
const valuesLost = [...vAB].filter((v) => !vU.has(v));
const parentLinks = (items: SemanticInventoryItem[]) => items.filter((i) => i.parentItemId).length;
const parentResolved = E.items.filter((i) => i.parentItemId && E.items.some((j) => j.inventoryItemId === i.parentItemId)).length;
const lineage = { parentLinksA: parentLinks(runA.items), parentLinksB: parentLinks(runB.items), parentLinksUnion: parentLinks(E.items), unionParentLinksResolvingToUnionItems: parentResolved, danglingUnionParents: parentLinks(E.items) - parentResolved, memberIdsPreserved: E.items.every((i) => Object.values(i.support!.memberItemIds).flat().length > 0), passItemsAccountedFor: { [P1]: runA.items.filter((i) => memberOf(P1, i.inventoryItemId)).length, [P2]: runB.items.filter((i) => memberOf(P2, i.inventoryItemId)).length } };
// contradictory-effect merges: any canonical item whose members had contradictory deontic effects
const effectOf = (inv: FrozenSemanticInventory, id: string) => inv.items.find((i) => i.inventoryItemId === id)?.semanticFunctions?.effect ?? "NONE";
const deontic = new Set(["PERMISSION", "PROHIBITION", "REQUIREMENT"]);
const contradictoryMerges = E.items.filter((i) => { const eff = new Set([...(i.support!.memberItemIds[P1] ?? []).map((id) => effectOf(runA, id)), ...(i.support!.memberItemIds[P2] ?? []).map((id) => effectOf(runB, id))].filter((e) => deontic.has(e))); return eff.size > 1; }).length;

// ---- per-policy inventories for the frozen reference scorer ----
const asInventory = (items: SemanticInventoryItem[], label: string): FrozenSemanticInventory => ({ ...E, items, inventoryStatus: E.inventoryStatus, inventoryStatusReason: label });
writeFileSync(`${out}/policy-intersection-only.json`, JSON.stringify(asInventory(intersection, "INTERSECTION_ONLY"), null, 1));
writeFileSync(`${out}/policy-raw-union.json`, JSON.stringify(asInventory(rawUnionItems, "RAW_UNION"), null, 1));
writeFileSync(`${out}/policy-canonical-union.json`, JSON.stringify(E, null, 1));

// ---- historical controls: same-source pairs already committed ----
function control(label: string, sc: SourceContextResult, a: FrozenSemanticInventory, b: FrozenSemanticInventory, idx: StructuralIndex | null) {
  const part = idx ? partitionSourceSlots({ sourceContext: sc, structuralIndex: idx }) : partitionSourceSlots({ sourceContext: sc, structuralIndex: null });
  const cref = a.candidateRef;
  const e1 = buildEnsembleInventory({ candidateRef: cref, sourceContext: sc, structuralIndex: idx, partition: part, passes: [{ passId: "pass-1", inventory: { ...a, candidateRef: cref } }, { passId: "pass-2", inventory: { ...b, candidateRef: cref } }] });
  const e2 = buildEnsembleInventory({ candidateRef: cref, sourceContext: sc, structuralIndex: idx, partition: part, passes: [{ passId: "pass-2", inventory: { ...b, candidateRef: cref } }, { passId: "pass-1", inventory: { ...a, candidateRef: cref } }] });
  const vs = new Set([...valueSet(a.items), ...valueSet(b.items)]), vu = valueSet(e1.items);
  const eff = (inv: FrozenSemanticInventory, id: string) => { const it = inv.items.find((i) => i.inventoryItemId === id); return it ? (it.semanticFunctions?.effect ?? (["PERMISSION", "PROHIBITION", "REQUIREMENT"].includes(it.semanticRole) ? it.semanticRole : "NONE")) : "NONE"; };
  const contra = e1.items.filter((i) => { const s = new Set([...(i.support!.memberItemIds["pass-1"] ?? []).map((id) => eff(a, id)), ...(i.support!.memberItemIds["pass-2"] ?? []).map((id) => eff(b, id))].filter((e) => deontic.has(e))); return s.size > 1; }).length;
  // false-merge candidates: corroborated items whose members' propositions share few tokens AND spans differ
  const words = (p: string) => new Set(p.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2));
  const jacc = (x: Set<string>, y: Set<string>) => { const u = new Set([...x, ...y]); return u.size ? [...x].filter((z) => y.has(z)).length / u.size : 1; };
  let falseMerge = 0;
  const falseMergeRows: unknown[] = [];
  for (const i of e1.items) {
    if (i.support!.supportStatus !== "CORROBORATED") continue;
    const ma = (i.support!.memberItemIds["pass-1"] ?? []).map((id) => a.items.find((x) => x.inventoryItemId === id)!), mb = (i.support!.memberItemIds["pass-2"] ?? []).map((id) => b.items.find((x) => x.inventoryItemId === id)!);
    let flagged = false;
    for (const x of ma) for (const y of mb) if (!flagged && jacc(words(x.proposition), words(y.proposition)) < 0.2 && (x.sourceSpan.charStart !== y.sourceSpan.charStart || x.sourceSpan.charEnd !== y.sourceSpan.charEnd)) { flagged = true; falseMergeRows.push({ canonical: i.inventoryItemId, a: { span: [x.sourceSpan.charStart, x.sourceSpan.charEnd], role: x.semanticRole, prop: x.proposition.slice(0, 110), excerpt: x.sourceSpan.excerpt.slice(0, 80) }, b: { span: [y.sourceSpan.charStart, y.sourceSpan.charEnd], role: y.semanticRole, prop: y.proposition.slice(0, 110), excerpt: y.sourceSpan.excerpt.slice(0, 80) } }); }
    if (flagged) falseMerge++;
  }
  return { label, algorithm: [a.algorithmVersion, b.algorithmVersion], itemsA: a.items.length, itemsB: b.items.length, canonical: e1.items.length, counts: e1.ensemble.counts, supportReviewFraction: e1.ensemble.supportReviewFraction, conflicts: e1.ensemble.conflicts.length, contradictoryEffectMerges: contra, falseMergeCandidates: falseMerge, falseMergeRows, conflictRows: e1.ensemble.conflicts.map((cf) => ({ ...cf, items: cf.itemIds.map((id) => { const it = e1.items.find((x) => x.inventoryItemId === id)!; return { span: [it.sourceSpan.charStart, it.sourceSpan.charEnd], values: it.quantitativeValues.map((v) => v.rawText), support: it.support?.supportingPasses, excerpt: it.sourceSpan.excerpt.slice(0, 80) }; }) })), valuesLost: [...vs].filter((v) => !vu.has(v)).length, parentLinks: [parentLinks(a.items), parentLinks(b.items), parentLinks(e1.items)], unaccounted: [(a.unaccountedSource ?? []).length, (b.unaccountedSource ?? []).length, e1.unaccountedSource.length], orderIndependent: canonicalEnsembleJson(e1) === canonicalEnsembleJson(e2) && e1.frozenContentHash === e2.frozenContentHash, rejectedUnverifiable: e1.rejectedUnverifiableItems };
}
const controls: unknown[] = [];
// (1) v4 certification pair migrated through v5 (same source, previous algorithm generation)
const mig = JSON.parse(readFileSync("docs/phase-3-remediation-f5-1/03-certification-pair-migrated-v5.json", "utf-8")) as { run1: FrozenSemanticInventory; run2: FrozenSemanticInventory };
controls.push(control("chewy-6.08 v4 certification pair (migrated to v5 identity)", sourceContext, mig.run1, mig.run2, index));
// (2) v3 frozen Phase 3 pair (older generation; sensitivity)
{
  const sc: SourceContextResult = JSON.parse(JSON.stringify(unit.compile.sourceContext));
  sc.regions[0]!.sourceNodeId = section.nodeId;
  controls.push(control("chewy-6.08 v3 frozen pair (older algorithm; sensitivity)", sc, unit.compile.frozenInventory, unit.inventoryRun2, index));
}
// (3) holdout v1 regions: run-1 vs run-2 (older generation; sensitivity; segment-fallback slots)
for (const name of ["region-applicable-liquidity-rate", "region-ebitda", "region-first-lien-debt", "region-interest-expense", "region-net-income", "region-secured-net-leverage"]) {
  const find = (o: unknown): { frozenInventory: FrozenSemanticInventory; sourceContext: SourceContextResult } | null => { if (!o || typeof o !== "object") return null; const r = o as Record<string, unknown>; if (r.frozenInventory && r.sourceContext) return r as never; for (const v of Object.values(r)) { const f = find(v); if (f) return f; } return null; };
  const a = find(JSON.parse(readFileSync(`tests/fixtures/semantic-accountability-validation/holdout/run-1/${name}.json`, "utf-8")));
  const b = find(JSON.parse(readFileSync(`tests/fixtures/semantic-accountability-validation/holdout/run-2/${name}.json`, "utf-8")));
  if (!a || !b) continue;
  try { controls.push(control(`holdout ${name} (v1; sensitivity)`, a.sourceContext, a.frozenInventory, b.frozenInventory, null)); } catch (e) { controls.push({ label: name, error: String(e) }); }
}

// ---- cost model from existing telemetry ----
const ledger = JSON.parse(readFileSync(`${DIR}/ledger.json`, "utf-8")) as { calls: { stage: string; costUsd: number }[] };
const per = (t: string) => ledger.calls.filter((k) => k.stage.startsWith(t)).reduce((n, k) => n + k.costUsd, 0);
const p3 = JSON.parse(readFileSync("tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/cost-ledger.json", "utf-8")) as { calls: { stage: string; costUsd: number }[] };
const p3stage = (pfx: string) => p3.calls.filter((k) => k.stage.startsWith(pfx)).reduce((n, k) => n + k.costUsd, 0);
const p3total = p3.calls.reduce((n, k) => n + k.costUsd, 0);
const p3passA1 = p3stage("passA-run1"), p3passA2 = p3stage("passA-run2");
const cost = { unit: "Chewy 6.08 (38.5k chars, 335 slots, 7 batches + 1 gap call per run)", onePassUsd: { v5RunA: Number(per("passA-A").toFixed(4)), v5RunB: Number(per("passA-B").toFixed(4)), mean: Number(((per("passA-A") + per("passA-B")) / 2).toFixed(4)) }, dualPassUsd: Number((per("passA-A") + per("passA-B")).toFixed(4)), incrementalUsd: Number(Math.min(per("passA-A"), per("passA-B")).toFixed(4)), phase3ChewyPaidRun: { totalUsd: Number(p3total.toFixed(4)), passARun1Usd: Number(p3passA1.toFixed(4)), passARun2Usd: Number(p3passA2.toFixed(4)), discoveryUsd: Number(p3stage("stage:").toFixed(4)), compileUsd: Number(p3stage("compile:").toFixed(4)), verifyUsd: Number(p3stage("verify:").toFixed(4)), passAShareOfTotalOnePass: Number((p3passA1 / (p3total - p3passA2)).toFixed(4)), secondPassAShareOfDualPassTotal: Number((p3passA1 / (p3total - p3passA2 + p3passA1)).toFixed(4)), note: "the Phase 3 paid run already contained a second Pass A (stability run 2) for 3 units; the one-pass total excludes it and the dual-pass total adds one more Pass A of the run-1 size" } };

const result = {
  artifact: "F-5.3A dual-pass ensemble evaluation over the frozen F-5.1 paid pair (0 model calls)",
  hashes: { runA: sha(`${DIR}/run-A.json`), runB: sha(`${DIR}/run-B.json`), pair: sha(`${DIR}/pair.json`), decomposition: sha(DECOMP), canonicalScorer: sha("scripts/f5-1-canonical-score.py"), legacyScorer: sha("scripts/f5-align-runs.py"), referenceScorer: sha("scripts/f5-reference-recall.py"), humanReference: sha("docs/phase-3-validation/04-human-reference-set.json"), source: sha(SRC), unit: sha(UNIT), semanticFunctions: sha("lib/contract-model/compiler/semantic-accountability/semantic-functions.ts"), inventory: sha("lib/contract-model/compiler/semantic-accountability/inventory.ts"), slots: sha("lib/contract-model/compiler/semantic-accountability/slots.ts"), sourceCoverage: sha("lib/contract-model/compiler/semantic-accountability/source-coverage.ts"), f52aFinalSummary: sha("docs/phase-3-remediation-f5-2/09-final-summary.json"), f52aGate: sha("docs/phase-3-remediation-f5-2/08-architecture-gate.json") },
  policies: { INTERSECTION_ONLY: { items: intersection.length, material: intersection.filter((i) => MATERIAL.has(i.materiality)).length }, RAW_UNION: { items: rawUnionItems.length, material: rawUnionItems.filter((i) => MATERIAL.has(i.materiality)).length, note: "exact-id union of both passes without canonicalization: overlapping descriptions of one proposition are kept twice" }, SUPPORT_AWARE_CANONICAL_UNION: { items: canonical.length, material: canonical.filter((i) => MATERIAL.has(i.materiality)).length } },
  ensemble: { counts: c, supportReviewRequired: E.ensemble.supportReviewRequired, supportReviewFraction: E.ensemble.supportReviewFraction, conflicts: E.ensemble.conflicts, inventoryStatus: E.inventoryStatus, inventoryStatusReason: E.inventoryStatusReason, frozenContentHash: E.frozenContentHash, algorithmVersion: E.algorithmVersion, rejectedDuplicateItems: E.rejectedDuplicateItems, passHashes: E.ensemble.passHashes, itemsA: runA.items.length, itemsB: runB.items.length },
  reviewBurden: { totalCanonical: E.items.length, corroborated: c.corroborated, singletonA: c.singleRunByPass[P1], singletonB: c.singleRunByPass[P2], conflicted: c.conflicted, materialSingleton: c.materialSingleRun, informationalSingleton: c.informationalSingleRun, materialConflicted: c.materialConflicted, percentRequiringSupportReview: Number((100 * E.ensemble.supportReviewFraction).toFixed(2)) },
  recovery: recoverySummary,
  falseAdditions: { unionItemsBeyondIntersection: additions.length, byClass: additionsByClass, granularityEquivalentsCanonicalized: { passItemsAbsorbedIntoCorroboratedItems: absorbed, corroboratedCanonicalItems: c.corroborated }, unsupportedAdditions, materialUnsupportedAdditions: unsupportedAdditions.material + unsupportedAdditions.rejectedUnverifiable },
  coverage,
  preservation: { valuesLost, valuesLostCount: valuesLost.length, lineage, contradictoryEffectMerges: contradictoryMerges },
  orderIndependence: { unionAB_equals_unionBA: orderIndependent, hashAB: AB.frozenContentHash, hashBA: BA.frozenContentHash },
  cost,
  historicalControls: controls,
  recoveryRows: rec,
};
writeFileSync(`${out}/02-ensemble-evaluation.json`, JSON.stringify(result, null, 1));
console.log(JSON.stringify({ policies: result.policies, counts: c, reviewBurden: result.reviewBurden, recovery: recoverySummary, falseAdditions: { beyondIntersection: additions.length, byClass: additionsByClass, unsupported: unsupportedAdditions }, coverage, preservation: { valuesLostCount: valuesLost.length, lineage, contradictoryMerges }, orderIndependent, conflicts: E.ensemble.conflicts.length, status: E.inventoryStatus, cost, controls: controls.map((x) => { const y = x as Record<string, unknown>; return { label: y.label, itemsA: y.itemsA, itemsB: y.itemsB, canonical: y.canonical, review: y.supportReviewFraction, conflicts: y.conflicts, contra: y.contradictoryEffectMerges, falseMerge: y.falseMergeCandidates, valuesLost: y.valuesLost, unacc: y.unaccounted, orderIndependent: y.orderIndependent, rejected: y.rejectedUnverifiable, error: y.error }; }) }, null, 1));
