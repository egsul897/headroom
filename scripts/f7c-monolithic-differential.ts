/**
 * F-7C §24 - ORDINARY BOUNDED-UNIT DIFFERENTIAL. Runs a fixed matrix of provider-free, scripted-caller compilations
 * through compileCovenantToIR and prints a normalized JSON projection of every semantic field. Run once in a worktree at
 * the starting SHA and once on the activated code; the projections must be identical. Only modules present at BOTH
 * SHAs are imported. Zero model calls.
 */
import { compileCovenantToIR } from "../lib/contract-model/compiler/semantic/compile";
import { InMemorySemanticCompilationCache } from "../lib/contract-model/compiler/semantic/cache";
import type { SemanticCaller, SemanticCallerResult } from "../lib/contract-model/compiler/semantic/caller";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import { testCompilerInput, emptyContextBundle } from "../tests/contract-model/semantic-compiler/test-helpers";
import { buildDefinitionsCorpus, DOC, CO, INST } from "../tests/contract-model/f7a-synthetic-corpus";

const rule = (localRef: string, amount: number, extra: Record<string, unknown> = {}) => ({ localRef, sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], capacityExpression: { kind: "MONEY", amount }, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: null, excerpt: null, ...extra });
const def = (localRef: string, termName: string, amount: number, extra: Record<string, unknown> = {}) => ({ localRef, termName, covenantFamily: "DEFINITIONS_CALCULATION_RULES", sufficiency: "COMPLETE", sufficiencyReasons: [], calculationExpression: { kind: "MONEY", amount }, ...extra });
const submission = (rules: unknown[], definitions: unknown[] = [], notes: string[] = []) => ({ submission: { rules, definitions, sharedCapacities: [], irExtensionCandidates: [], overallNotes: notes }, rawSubmission: { rules, definitions }, toolCallLog: [], telemetry: null, failureReason: null, failureDetail: null }) as unknown as SemanticCallerResult;
const caller = (fn: () => Promise<SemanticCallerResult>): SemanticCaller => ({ providerName: "scripted", model: "scripted-model", isSynthetic: false, compile: fn });
const synthetic: StageCaller = { providerName: "synthetic", model: "synthetic-v1", isSynthetic: true, call: async (schema) => schema.parse({}), lastTelemetry: () => null };

const corpus = buildDefinitionsCorpus({ count: 6 });
const corpusText = corpus.sourceContext.regions[0]!.text;

const scenarios: { name: string; input: ReturnType<typeof testCompilerInput>; options: Parameters<typeof compileCovenantToIR>[1] }[] = [
  { name: "A success one rule, accountability off", input: testCompilerInput(), options: { caller: caller(async () => submission([rule("r1", 1_000_000)])), accountability: false } },
  { name: "B no submission -> MODEL_SCHEMA_FAILURE", input: testCompilerInput(), options: { caller: caller(async () => ({ submission: null, rawSubmission: null, toolCallLog: [], telemetry: null, failureReason: "MODEL_SCHEMA_FAILURE", failureDetail: "scripted schema failure" })), accountability: false } },
  { name: "C caller throws -> TRANSPORT_OR_INTERNAL_ERROR (never cached)", input: testCompilerInput(), options: { caller: caller(async () => { throw new Error("ECONNRESET scripted"); }), accountability: false } },
  { name: "D MISSING_CONTEXT definition -> REVIEW_REQUIRED", input: testCompilerInput(), options: { caller: caller(async () => submission([rule("r1", 5)], [def("d1", "Threshold Amount", 7, { sufficiency: "MISSING_CONTEXT", sufficiencyReasons: ["scripted"], calculationExpression: null })])), accountability: false } },
  { name: "E unresolved operative evidence in the bundle -> OPERATIVE_STATE_UNRESOLVED", input: testCompilerInput({ contextBundle: emptyContextBundle({ hasUnresolvedOperativeEvidence: true, unresolvedEvidenceItemIds: ["ctx-1"] }) }), options: { caller: caller(async () => submission([rule("r1", 9)])), accountability: false } },
  { name: "F accountability on, synthetic Pass A (INVENTORY_SKIPPED_NO_PROVIDER), stub index", input: testCompilerInput(), options: { caller: caller(async () => submission([rule("r1", 11)], [], ["note"])), inventoryCaller: synthetic, inventoryMode: "SINGLE_PASS" } },
  { name: "G accountability on over a real small structural corpus, synthetic Pass A", input: testCompilerInput({ companyId: CO, instrumentKey: INST, sourceDocumentId: DOC, candidateRef: "cand:1.01", sourceSectionRef: "1.01", operativeSourceText: corpusText, operativeCharStart: corpus.sourceContext.regions[0]!.charStart, contextBundle: emptyContextBundle(), toolAccess: { structuralIndex: corpus.index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: emptyContextBundle() } }), options: { caller: caller(async () => submission([], [def("d1", "Alpha Term", 1_000_000)])), inventoryCaller: synthetic, inventoryMode: "SINGLE_PASS" } },
  { name: "H two rules with a dangling dependsOn -> validation issues surfaced", input: testCompilerInput(), options: { caller: caller(async () => submission([rule("r1", 1), rule("r2", 2, { dependsOn: ["r-missing"] })])), accountability: false } },
];

(async () => {
  const out: Record<string, unknown> = {};
  for (const s of scenarios) {
    const r = await compileCovenantToIR(s.input, { ...s.options, cache: new InMemorySemanticCompilationCache() });
    out[s.name] = {
      status: r.status, failureReasons: r.failureReasons, errorDetail: r.errorDetail ? { ...r.errorDetail, sanitizedMessage: r.errorDetail.sanitizedMessage } : null,
      rules: r.rules, definitions: r.definitions, sharedCapacities: r.sharedCapacities, irExtensionCandidates: r.irExtensionCandidates,
      unresolvedIssues: r.unresolvedIssues, toolCallLog: r.toolCallLog, inputHasUnresolvedOperativeEvidence: r.inputHasUnresolvedOperativeEvidence, unresolvedEvidenceItemIds: r.unresolvedEvidenceItemIds,
      definitionCompletenessCheck: r.definitionCompletenessCheck ?? null, sourceContextState: r.sourceContext?.state ?? null, frozenInventoryStatus: r.frozenInventory?.inventoryStatus ?? null,
      accountability: r.accountability ? { counts: r.accountability.counts, semanticallyComplete: r.accountability.semanticallyComplete, items: r.accountability.items } : null,
      inventoryMode: r.inventoryMode ?? null, rawModelOutput: r.rawModelOutput, provider: r.provider, model: r.model,
    };
  }
  process.stdout.write(JSON.stringify(out, null, 1));
})();
