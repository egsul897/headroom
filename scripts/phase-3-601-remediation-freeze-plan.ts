/**
 * PHASE 3 / 6.01 trust-failure remediation §10 - freezes the EXACT pre-fix production plan (planner algorithm
 * semantic-compilation-shards.v1) reconstructed from the frozen paid inventory, so the red-baseline regression
 * can replay the paid shard outcomes through the real stitcher forever, independent of later planner changes.
 * Zero model calls. Refuses to write unless the reconstructed planHash equals the paid run's planHash.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSection601 } from "./phase-3-601-preflight";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { validateFrozenInventoryResume } from "../lib/contract-model/compiler/semantic/frozen-inventory-resume";
import { planCompilationShards } from "../lib/contract-model/compiler/semantic/shard-planner";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic/types";
import type { FrozenSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/types";

const RAW = "tests/fixtures/unseen-packages/phase-3-final-601-final-paid";
const OUT = "tests/fixtures/phase-3-601-remediation/frozen-pre-fix-plan.json";
const PAID_PLAN_HASH = "eab77c1aad1d941440f0d412e20578902c6744a5e100a0306153ea02e1720552";
const built = buildSection601();
const idx = built.chewy.index;
const inv = JSON.parse(readFileSync(`${RAW}/frozen-inventory.json`, "utf8")) as FrozenSemanticInventory;
const ctx = resolveSourceContext({ index: idx, documentId: "doc-a", operativeSourceText: built.input.operativeSourceText, anchorNodeId: built.input.contextBundle.originatingStructuralNodeIds?.[0] ?? null, operativeCharStart: built.input.operativeCharStart ?? null, documentText: idx.getDocumentText("doc-a") ?? null });
const dec = validateFrozenInventoryResume({ candidateRef: built.candidateRef, sourceDocumentId: "doc-a", frozenInventory: inv, sourceContext: ctx, structuralIndex: idx });
if (!dec.ok) throw new Error("resume failed: " + JSON.stringify(dec.failures));
const plan = planCompilationShards({ candidateRef: built.candidateRef, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, documentId: "doc-a", sourceContext: ctx, frozenInventory: dec.inventory, structuralIndex: idx, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
if (plan.planHash !== PAID_PLAN_HASH) throw new Error(`reconstructed planHash ${plan.planHash} != paid ${PAID_PLAN_HASH} - refusing to freeze a non-identical plan`);
writeFileSync(OUT, JSON.stringify({ artifact: "frozen pre-fix production plan (paid run phase-3-final-601-final-paid)", paidPlanHash: PAID_PLAN_HASH, sourceContext: { state: ctx.state, regions: ctx.regions.map((r) => ({ regionId: r.regionId, kind: r.kind, sectionRef: r.sectionRef, charStart: r.charStart, charEnd: r.charEnd, text: r.text })) }, companyId: built.input.companyId, instrumentKey: built.input.instrumentKey, candidateRef: built.candidateRef, plan }, null, 1));
console.log(`frozen ${OUT} planHash=${plan.planHash} shards=${plan.shards.length} units=${plan.units.length}`);
