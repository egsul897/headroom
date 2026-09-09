/**
 * F-5.3B deterministic checks over the NEW paid pair (run-C / run-D) and its ensemble E2 - zero model calls:
 *  - rebuilds E2 from the preserved passes in BOTH orders under STRICT compatibility and compares with the orchestrator's
 *    frozen E2 (order independence + reproducibility of the production construction);
 *  - propagates E2 through Pass C reconciliation (empty composition and a full-lineage composition are not available
 *    without a compiler call, so the empty composition is used: every item MISSING) and the agreement rollup, proving
 *    supportReviewRequired reaches REVIEW_REQUIRED and semanticallyComplete is refused;
 *  - re-verifies every E2 item excerpt/value against the frozen source (no source-unverifiable item survives).
 *   npx tsx scripts/f5-3b-e2-checks.ts <outJson>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { partitionSourceSlots } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { buildEnsembleInventory, canonicalEnsembleJson } from "../lib/contract-model/compiler/semantic-accountability/ensemble";
import { verifyInventoryAgainstSource } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { rollupAgreementSemanticStatus } from "../lib/contract-model/compiler/semantic-accountability/rollup";
import type { FrozenSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/types";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const DIR = "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-f5-3b";
const out = process.argv[2] ?? "docs/phase-3-remediation-f5-3b/09-e2-deterministic-checks.json";

const text = readFileSync(SRC, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), detectStructuralDefinitions("doc-a", text, nodes), detectStructuralReferences("doc-a", text, nodes));
const section = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === "6.08").sort((a, b) => b.charEnd - b.charStart - (a.charEnd - a.charStart))[0]!;
const sourceContext = resolveSourceContext({ index, documentId: "doc-a", operativeSourceText: text.slice(section.charStart, section.charEnd), anchorNodeId: section.nodeId, operativeCharStart: section.charStart, documentText: text });
const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
const runC = JSON.parse(readFileSync(`${DIR}/run-C.json`, "utf-8")) as FrozenSemanticInventory;
const runD = JSON.parse(readFileSync(`${DIR}/run-D.json`, "utf-8")) as FrozenSemanticInventory;
const E2 = JSON.parse(readFileSync(`${DIR}/e2.json`, "utf-8")) as FrozenSemanticInventory & { ensemble: NonNullable<FrozenSemanticInventory["ensemble"]> };
const ids = E2.ensemble.passIds;
const build = (passes: { passId: string; inventory: FrozenSemanticInventory }[]) => buildEnsembleInventory({ candidateRef: runC.candidateRef, sourceContext, structuralIndex: index, partition, passes, compatibility: { mode: "STRICT" } });
const CD = build([{ passId: ids[0]!, inventory: runC }, { passId: ids[1]!, inventory: runD }]);
const DC = build([{ passId: ids[1]!, inventory: runD }, { passId: ids[0]!, inventory: runC }]);
const strip = (e: FrozenSemanticInventory) => canonicalEnsembleJson(e as never);
const orderIndependent = strip(CD) === strip(DC) && CD.frozenContentHash === DC.frozenContentHash;
const reproducesOrchestratorE2 = CD.frozenContentHash === E2.frozenContentHash && canonicalEnsembleJson({ ...CD, partition: E2.partition, gapReinventory: E2.gapReinventory } as never) === strip(E2);

// Source verification of every E2 item (anti-hallucination: nothing unverifiable survives the ensemble).
const failures = verifyInventoryAgainstSource(E2, sourceContext, partition);
const materialUnverifiable = E2.items.filter((i) => (i.materiality === "CRITICAL" || i.materiality === "MATERIAL") && failures.some((f) => f.detail.startsWith(i.inventoryItemId)));

// Pass C + rollup propagation (empty composition: every item MISSING; the support field is independent of that).
const acc = reconcileInventoryWithComposition({ inventory: E2, composition: { rules: [], definitions: [], sharedCapacities: [] }, dispositions: [], sourceContextState: sourceContext.state });
const roll = rollupAgreementSemanticStatus([{ candidateRef: E2.candidateRef, compileStatus: "COMPLETED", verifyStatus: "VERIFIED_NO_MATERIAL_GAP_FOUND", accountability: acc, operativeStateUncertain: false, unresolvedCrossReferences: 0 }]);
// And the counterfactual that matters: if every item WERE represented and coverage WERE complete, support alone must still refuse completeness.
const hypothetical: FrozenSemanticInventory = { ...E2, unaccountedSource: [], uninventoriedValues: [], inventoryStatus: "INVENTORY_OK" };
const accH = reconcileInventoryWithComposition({ inventory: hypothetical, composition: { rules: [], definitions: [], sharedCapacities: [] }, dispositions: E2.items.map((i) => ({ inventoryItemId: i.inventoryItemId, disposition: "INTENTIONALLY_NON_COMPUTATIONAL", note: "counterfactual: every item accounted" })), sourceContextState: sourceContext.state });

// Lineage / values through the ensemble.
const valueSet = (items: FrozenSemanticInventory["items"]) => new Set(items.flatMap((i) => i.quantitativeValues.map((v) => `${i.sourceSpan.regionId}:${v.kind}:${v.normalizedValue ?? v.rawText}`)));
const vIn = new Set([...valueSet(runC.items), ...valueSet(runD.items)]), vOut = valueSet(E2.items);
const valuesLost = [...vIn].filter((v) => !vOut.has(v));
const parentLinks = E2.items.filter((i) => i.parentItemId).length;
const dangling = E2.items.filter((i) => i.parentItemId && !E2.items.some((j) => j.inventoryItemId === i.parentItemId)).length;
const deontic = new Set(["PERMISSION", "PROHIBITION", "REQUIREMENT"]);
const effectOf = (inv: FrozenSemanticInventory, id: string) => inv.items.find((i) => i.inventoryItemId === id)?.semanticFunctions?.effect ?? "NONE";
const contradictoryMerges = E2.items.filter((i) => { const s = i.support!; const eff = new Set([...(s.memberItemIds[ids[0]!] ?? []).map((id) => effectOf(runC, id)), ...(s.memberItemIds[ids[1]!] ?? []).map((id) => effectOf(runD, id))].filter((e) => deontic.has(e))); return eff.size > 1; }).length;
const ov = (a: { charStart: number; charEnd: number }, b: { charStart: number; charEnd: number }) => Math.max(0, Math.min(a.charEnd, b.charEnd) - Math.max(a.charStart, b.charStart));
const bothGaps = runC.unaccountedSource.filter((u) => runD.unaccountedSource.some((v) => ov(u, v) > 0));
const bothGapsStillDisclosed = bothGaps.filter((u) => E2.unaccountedSource.some((x) => ov(x, u) > 0)).length;

const result = {
  artifact: "F-5.3B deterministic checks over E2 (0 model calls)",
  passIds: ids,
  compatibility: { mode: E2.ensemble.compatibility?.mode ?? null, allChecksPass: (E2.ensemble.compatibility?.checks ?? []).every((c) => c.pass), sourceIdentity: { [ids[0]!]: runC.sourceIdentity ?? null, [ids[1]!]: runD.sourceIdentity ?? null } },
  orderIndependence: { unionCD_equals_unionDC: orderIndependent, hashCD: CD.frozenContentHash, hashDC: DC.frozenContentHash, reproducesOrchestratorE2, orchestratorHash: E2.frozenContentHash },
  sourceVerification: { failures: failures.length, materialUnverifiableSurviving: materialUnverifiable.length, rejectedUnverifiableAtEnsemble: E2.rejectedUnverifiableItems, rejectedUnverifiableInPasses: [runC.rejectedUnverifiableItems, runD.rejectedUnverifiableItems] },
  supportPropagation: { ensembleSupportReviewRequired: E2.ensemble.supportReviewRequired, reconciliationSupportReviewRequired: acc.supportReviewRequired, reconciliationSemanticallyComplete: acc.semanticallyComplete, reconciliationSupport: acc.support ?? null, rollupStatus: roll.status, rollupSupportReviewRequiredUnits: roll.counts.supportReviewRequired, counterfactualRawCompleteAllAccounted: { inventoryStatus: hypothetical.inventoryStatus, materialMissing: accH.counts.materialMissingFromComposition, supportReviewRequired: accH.supportReviewRequired, semanticallyComplete: accH.semanticallyComplete, rollup: rollupAgreementSemanticStatus([{ candidateRef: E2.candidateRef, compileStatus: "COMPLETED", verifyStatus: "VERIFIED_NO_MATERIAL_GAP_FOUND", accountability: accH, operativeStateUncertain: false, unresolvedCrossReferences: 0 }]).status } },
  preservation: { valuesLost: valuesLost.length, valuesLostList: valuesLost, parentLinks, danglingParents: dangling, contradictoryEffectMerges: contradictoryMerges, passItemsAccountedFor: { [ids[0]!]: runC.items.filter((i) => E2.items.some((u) => (u.support?.memberItemIds[ids[0]!] ?? []).includes(i.inventoryItemId))).length, [ids[1]!]: runD.items.filter((i) => E2.items.some((u) => (u.support?.memberItemIds[ids[1]!] ?? []).includes(i.inventoryItemId))).length }, passItems: [runC.items.length, runD.items.length] },
  rawGaps: { [ids[0]!]: runC.unaccountedSource.length, [ids[1]!]: runD.unaccountedSource.length, union: E2.unaccountedSource.length, gapsInBothPasses: bothGaps.length, gapsInBothPassesStillDisclosed: bothGapsStillDisclosed, unionStatus: E2.inventoryStatus, falseCompleteness: E2.inventoryStatus === "INVENTORY_OK" && E2.unaccountedSource.length === 0 && !E2.ensemble.supportReviewRequired && E2.ensemble.counts.singleRun + E2.ensemble.counts.conflicted > 0 },
};
writeFileSync(out, JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
