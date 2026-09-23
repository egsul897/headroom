/**
 * §19 - the tiny paid validation Fix B will need. DESIGNED, NOT EXECUTED.
 *
 * This mission is explicitly zero-cost, so this runner refuses to start unless a future mission
 * sets NUMERIC_GROUNDING_VALIDATION_AUTHORIZED=1 AND a credential is present. That guard is the
 * point: a paid runner that exists in the tree but cannot be started by accident.
 *
 * What it will prove, on two candidates and nothing else:
 *   1. 7.2(f) - the real case. Either the model again asserts a numeric nothing supports, and Fix B
 *      now says so with the exact field path, or it does not, and the run says that instead. A
 *      re-run that produces a clean compilation is NOT a failure of this validation; it is an
 *      honest observation about a non-deterministic model, and is recorded as one.
 *   2. A supported-context control - a candidate whose economics really do come from a retrieved
 *      definition. Fix B must leave it grounded. This is the false-positive half, and it is the
 *      half that decides whether the fix is safe to keep.
 *
 * Every execution writes COMPLETE evidence (evidence.ts): raw model output, tool call log, full
 * parsed IR, the verifier result and its numeric-grounding verdicts. The 7.2(f) forensic mission
 * could not name the stage that emitted "100%" because the run that produced it kept none of that.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller, type StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { INSTRUMENT_KEY } from "./pipeline";
import { PER_CANDIDATE_TIMEOUT_MS, buildInput, callerFor, loadModel, maxTokensFor, prepare, realCost, record, withTimeout } from "./compile-run";
import { assertNotPremium, OBSERVED_INPUT_TOKENS_PER_CANDIDATE } from "./premium-lock";
import { BudgetLedger, OBSERVED_OUTPUT_TOKENS_PER_SECOND, accountForRequest } from "./timeout-policy";
import { buildCandidateEvidence, writeCandidateEvidence } from "./evidence";
import { LOCKED_MODEL } from "./run-population";

/** The two candidates, and nothing else. Both are already in the sealed population. */
export const VALIDATION_MANIFEST = {
  model: LOCKED_MODEL,
  concurrency: 1,
  perCandidateTimeoutMs: PER_CANDIDATE_TIMEOUT_MS,
  incrementalCeilingUsd: 0.05,
  stopAtUsd: 0.04,
  retries: 0,
  candidates: [
    { role: "THE_CASE", normalizedSourceRef: "7.2(f)", why: "the forensic case itself - a qualitative permission whose compiled IR once asserted an unsupported 100%", expectation: "either an UNSUPPORTED_NUMERIC_ASSERTION finding naming the exact field path, or a clean compilation that asserts no ungrounded figure; both are real outcomes and neither is retried" },
    { role: "SUPPORTED_CONTEXT_CONTROL", normalizedSourceRef: "7.1(d)", why: "economics that legitimately come from an authenticated definition rather than the anchor", expectation: "every asserted figure GROUNDED_CONTEXT or GROUNDED_OPERATIVE; a single UNGROUNDED here is a false positive and blocks the fix" },
  ],
  prohibitions: ["no retry on any outcome", "no model substitution", "no timeout change", "no second candidate added mid-run", "no premium model, ever"],
} as const;

const OUT = "/tmp/claude-0/pilot/numeric-grounding-validation";

async function main() {
  if (process.env.NUMERIC_GROUNDING_VALIDATION_AUTHORIZED !== "1") throw new Error("this runner is designed but not authorized: set NUMERIC_GROUNDING_VALIDATION_AUTHORIZED=1 in a mission that explicitly authorizes paid calls");
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("no gateway credential present");

  // PREMIUM LOCK, and it is not theoretical. getStageCaller() resolves ANALYZER_MODEL and, when
  // that is unset with a gateway key present, defaults to anthropic/claude-sonnet-5 - a premium
  // model. Three call sites here would reach it: the amendment pipeline, the verifier's
  // condition-suspicion gate, and the verifier's adversarial review. Pinning ANALYZER_MODEL to the
  // locked model before ANY caller is constructed, and asserting it, is what keeps
  // PREMIUM_MODEL_BUDGET_USD = 0 true rather than merely intended.
  process.env.ANALYZER_MODEL = VALIDATION_MANIFEST.model;
  assertNotPremium(process.env.ANALYZER_MODEL);

  // Pre-flight fix (validation mission): this runner originally read the bakeoff catalogue
  // snapshot, which did not survive the container reclaim that destroyed /tmp/claude-0/pilot/*.
  // loadModel reads the gateway catalogue the other runners already use and fails loudly if the
  // locked model is absent - no silent substitution.
  const raw = loadModel(VALIDATION_MANIFEST.model);
  assertNotPremium(raw.id, raw.pricing);
  process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(raw));

  const { stages, bundles, rehydrated } = await prepare();

  // Every non-compiler model call (amendment pipeline, Gate 2, Layer 2) goes through this one
  // caller, and every one of them is recorded. A validation that reports only the compiler's spend
  // is under-reporting its own cost.
  const sideCalls: { stage: string; model: string; inputTokens: number | null; outputTokens: number | null; costUsd: number }[] = [];
  const base = getStageCaller();
  assertNotPremium(base.model);
  const stageCaller: StageCaller = {
    providerName: base.providerName,
    model: base.model,
    isSynthetic: base.isSynthetic,
    async call<T>(schema: Parameters<StageCaller["call"]>[0], stage: string, systemPrompt: string, userContent: string): Promise<T> {
      const out = (await base.call(schema, stage, systemPrompt, userContent)) as T;
      const t = base.lastTelemetry();
      if (t) sideCalls.push({ stage, model: t.model, inputTokens: t.inputTokens, outputTokens: t.outputTokens, costUsd: realCost(raw, t.inputTokens, t.outputTokens) });
      return out;
    },
    lastTelemetry: () => base.lastTelemetry(),
  } as StageCaller;
  const sideSpend = () => sideCalls.reduce((s, c) => s + c.costUsd, 0);

  const amendment = await runAmendmentPipeline(stageCaller, { documents: stages.documents, packageGraph: stages.packageGraph, index: stages.index });
  const operativeState = computeOperativeContractState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: "conmed-doc-a-eighth-ar-credit-agreement", asOfDate: new Date().toISOString().slice(0, 10), index: stages.index, allEffects: amendment.effects });

  const ledger = new BudgetLedger(VALIDATION_MANIFEST.incrementalCeilingUsd, VALIDATION_MANIFEST.stopAtUsd);
  const reservation = BudgetLedger.reservationFor(raw, PER_CANDIDATE_TIMEOUT_MS, OBSERVED_INPUT_TOKENS_PER_CANDIDATE, OBSERVED_OUTPUT_TOKENS_PER_SECOND);
  const results = [];

  for (const spec of VALIDATION_MANIFEST.candidates) {
    const candidate = rehydrated.find((c) => String(c.normalizedSourceRef) === spec.normalizedSourceRef);
    if (!candidate) throw new Error(`candidate ${spec.normalizedSourceRef} is not in the sealed population`);
    if (ledger.mustStop(reservation) || ledger.committedUsd + sideSpend() + reservation > VALIDATION_MANIFEST.stopAtUsd) { console.log(`budget guard: committed $${ledger.committedUsd.toFixed(5)} + side calls $${sideSpend().toFixed(5)} - stopping before the ceiling`); break; }

    const input = buildInput(candidate, bundles.get(candidate.discoveryId), stages, operativeState, amendment.effects);
    ledger.reserve(candidate.discoveryId, reservation);
    const t0 = Date.now();
    const result = await withTimeout(compileCovenantToIR(input, { caller: callerFor(VALIDATION_MANIFEST.model) }), PER_CANDIDATE_TIMEOUT_MS);
    const rec = record(candidate, input, result, raw, 1, null);
    const wallClockMs = rec.wallClockMs ?? Date.now() - t0;
    const cost = accountForRequest({ model: raw, elapsedWallClockMs: wallClockMs, timedOut: false, providerUsage: { inputTokens: rec.inputTokens ?? 0, outputTokens: rec.outputTokens ?? 0 }, streamedOutputTokensObserved: rec.outputTokens, reservationUsd: reservation, providerRefused: false });
    ledger.settle(candidate.discoveryId, cost);

    // The verifier's own two gates run on the SAME locked model and through the same recorded
    // caller - never on getStageCaller()'s premium default.
    const verification = await verifyCompiledCandidate({ compilerInput: input, compilationResult: result }, { reviewCaller: stageCaller, conditionSuspicionCaller: stageCaller });
    writeCandidateEvidence(OUT, `${spec.role}-${candidate.discoveryId}`, buildCandidateEvidence(input, result, verification, { model: VALIDATION_MANIFEST.model, tier: 1, wallClockMs, inputTokens: rec.inputTokens, outputTokens: rec.outputTokens, costUsd: cost.chargedToBudgetUsd, costStatus: cost.costAccountingStatus, timedOut: false, notes: [spec.why, spec.expectation] }));

    const groundings = verification.numericAssertions?.groundings ?? [];
    results.push({ role: spec.role, ref: spec.normalizedSourceRef, status: result.status, verificationStatus: verification.status, assertions: groundings.length, ungrounded: groundings.filter((g) => g.status === "UNGROUNDED").map((g) => `${g.assertion.fieldPath}=${g.assertion.rawText}`), costUsd: cost.chargedToBudgetUsd });
    console.log(`  ${spec.role.padEnd(26)} ${spec.normalizedSourceRef.padEnd(8)} ${result.status.padEnd(18)} verify=${verification.status} assertions=${groundings.length} ungrounded=${groundings.filter((g) => g.status === "UNGROUNDED").length} committed=$${ledger.committedUsd.toFixed(4)}`);
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({ manifest: VALIDATION_MANIFEST, results, budget: ledger.snapshot(), sideCalls, sideSpendUsd: sideSpend(), totalSpendUsd: ledger.committedUsd + sideSpend() }, null, 2));
  console.log(`\nside calls (amendment + verifier gates): ${sideCalls.length}, $${sideSpend().toFixed(6)}`);
  console.log(`TOTAL committed $${(ledger.committedUsd + sideSpend()).toFixed(6)} of ceiling $${VALIDATION_MANIFEST.incrementalCeilingUsd}`);
}

if (process.argv[1]?.endsWith("numeric-grounding-validation.ts")) void main();
