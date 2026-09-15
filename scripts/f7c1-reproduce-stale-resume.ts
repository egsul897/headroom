/**
 * F-7C.1 §1 - provider-free reproduction of the stale-resume gap at the starting SHA. Case A: same candidate, same
 * source -> resume accepted (expected). Case B: same candidate, CHANGED source -> does the current code still skip
 * Pass A and accept the frozen inventory? Zero model calls: the Pass A caller throws if reached.
 */
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import type { SemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import { testCompilerInput, emptyContextBundle } from "../tests/contract-model/semantic-compiler/test-helpers";
import { buildDefinitionsCorpus, emitDefinitionsForShard, termName, CO, INST, DOC, type SyntheticCorpus } from "../tests/contract-model/f7a-synthetic-corpus";
import { planCompilationShards } from "../lib/contract-model/compiler/semantic/shard-planner";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic/types";
import { gitSha, writeJson } from "./f7b-lib";

const SMALL = { targetPrimaryChars: 1_200, maxPrimaryChars: 2_400, maxContextChars: 4_000, maxContextEntryChars: 600, maxUnitsPerShard: 16 };
const inputFor = (c: SyntheticCorpus) => { const r = c.sourceContext.regions[0]!; const cb = emptyContextBundle(); return testCompilerInput({ companyId: CO, instrumentKey: INST, sourceDocumentId: DOC, candidateRef: c.frozenInventory.candidateRef, sourceSectionRef: "1.01", operativeSourceText: r.text, operativeCharStart: r.charStart, contextBundle: cb, toolAccess: { structuralIndex: c.index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: cb } }); };
const caller: SemanticCaller = { providerName: "scripted", model: "scripted", isSynthetic: false, compile: async () => { throw new Error("monolithic caller must not be invoked"); } };
let passA = 0;
const inventory: StageCaller = { providerName: "scripted", model: "scripted", isSynthetic: false, call: async () => { passA++; throw new Error("PASS_A_INVOKED"); }, lastTelemetry: () => null };

(async () => {
  const original = buildDefinitionsCorpus({ count: 40 });
  const frozen = original.frozenInventory; // built against the ORIGINAL source
  // the CHANGED source: one byte inside a span the frozen inventory represents (term 2's amount), same candidateRef/document
  const changed = buildDefinitionsCorpus({ count: 40, overrideText: new Map([[2, `“${termName(2)}” means the greater of (a) $2,000,001 and (b) 3% of Consolidated EBITDA.`]]) });
  const run = async (corpus: SyntheticCorpus) => {
    const plan = planCompilationShards({ candidateRef: frozen.candidateRef, companyId: CO, instrumentKey: INST, documentId: DOC, sourceContext: corpus.sourceContext, frozenInventory: frozen, structuralIndex: corpus.index, budget: SMALL, generation: { algorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, promptVersion: SEMANTIC_COMPILER_PROMPT_VERSION } });
    passA = 0;
    try {
      const r = await compileCovenantToIR(inputFor(corpus), { caller, inventoryCaller: inventory, inventoryMode: "SINGLE_PASS", frozenInventory: frozen, shardBudget: SMALL, cache: new InMemorySemanticCompilationCache(), shardExecutor: async (shard) => ({ status: "SHARD_COMPLETE", composition: emitDefinitionsForShard(original, plan, shard), failureReasons: [], unresolvedIssues: [], telemetry: null }) });
      return { outcome: "COMPILED", status: r.status, failureReasons: r.failureReasons, mode: r.execution?.mode ?? null, passACalls: passA, resumedFrozenHash: r.frozenInventory?.frozenContentHash ?? null, frozenInventoryAccepted: r.frozenInventory?.frozenContentHash === frozen.frozenContentHash };
    } catch (e) {
      return { outcome: "THREW", error: (e as Error).message, passACalls: passA, frozenInventoryAccepted: false };
    }
  };
  const A = await run(original);
  const B = await run(changed);
  const defectReproduced = B.frozenInventoryAccepted === true && B.passACalls === 0;
  writeJson(process.env.F7C1_OUT ?? "docs/phase-3-remediation-f7c1/00-stale-resume-reproduction.json", { artifact: "F-7C.1 §1 - same-candidate stale-source resume, reproduced provider-free BEFORE any change", at: new Date().toISOString(), gitSha: gitSha(), candidateRef: frozen.candidateRef, frozenContentHash: frozen.frozenContentHash, frozenInventoryCarriesSourceContextHash: Boolean(frozen.sourceContextHash), caseA_sameSource: A, caseB_changedSource: B, defectReproduced, verdictIfNotReproduced: "F7C_1_BASELINE_INVALID" });
  console.log(JSON.stringify({ A, B, defectReproduced }, null, 1));
})();
