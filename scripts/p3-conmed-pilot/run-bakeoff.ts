/**
 * §4/§5 — the sequential cheap-model bakeoff.
 *
 * Runs the fixed 12-candidate probe set through the UNCHANGED production compiler at
 * concurrency 1, cheapest model first, stopping at the first model that clears the §5
 * technical gate. Every dispatch passes through `assertNotPremium`, which throws before
 * the request is sent.
 *
 * Reliability is judged on execution, never on whether the answers are favourable: §5
 * says so explicitly, and the gate below contains no reference to CREDIT.
 */
import fs from "node:fs";
import path from "node:path";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import { INSTRUMENT_KEY, operativeTextFor, sha256 } from "./pipeline";
import { PER_CANDIDATE_TIMEOUT_MS, buildInput, callerFor, maxTokensFor, prepare, record, withTimeout, type CandidateRecord } from "./compile-run";
import { discoverModels, buildProbeSet, type BakeoffCandidateModel } from "./bakeoff";
import { assertNotPremium, classifyFailureCategory } from "./premium-lock";
import type { GatewayModel } from "./probe-models";

const OUT = "/tmp/claude-0/pilot/bakeoff";
const SPEND_CEILING_USD = 5;
const SPEND_STOP_AT_USD = 4.5;

function save(name: string, body: unknown) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(body, null, 2));
}

export interface ModelBakeoffResult {
  model: string;
  provider: string;
  inputPerMtok: number;
  outputPerMtok: number;
  attempted: number;
  completed: number;
  completionRate: number;
  schemaFailures: number;
  schemaFailureRate: number;
  toolFailures: number;
  zeroTokenStalls: number;
  timeouts: number;
  providerFailures: number;
  medianWallClockMs: number;
  p90WallClockMs: number;
  inputTokens: number;
  outputTokens: number;
  spendUsd: number;
  costPerCompletedCandidateUsd: number;
  toolUseWorks: boolean;
  structuredOutputsParse: boolean;
  passesGate: boolean;
  gateReasons: string[];
  perCandidate: CandidateRecord[];
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Number((n / d).toFixed(4)));
function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

/** §5 — the technical gate. Deliberately contains no reference to any benchmark outcome. */
export function evaluateGate(r: Omit<ModelBakeoffResult, "passesGate" | "gateReasons">): { passesGate: boolean; gateReasons: string[] } {
  const reasons: string[] = [];
  if (r.completionRate < 0.8) reasons.push(`completion rate ${(r.completionRate * 100).toFixed(1)}% below the 80% floor`);
  if (r.schemaFailureRate > 0.1) reasons.push(`schema/malformed rate ${(r.schemaFailureRate * 100).toFixed(1)}% above the 10% ceiling`);
  if (!r.toolUseWorks) reasons.push("tool-use workflow never engaged on any candidate");
  if (!r.structuredOutputsParse) reasons.push("no structured output parsed into IR rules or definitions");
  if (r.providerFailures > r.attempted / 2) reasons.push(`systemic provider failure: ${r.providerFailures}/${r.attempted} refused`);
  return { passesGate: reasons.length === 0, gateReasons: reasons };
}

async function main() {
  const catalogueModels = discoverModels();
  const rawCatalogue = JSON.parse(fs.readFileSync("/tmp/claude-0/pilot/models-bakeoff.json", "utf8")).data as GatewayModel[];
  const rawById = new Map(rawCatalogue.map((m) => [m.id, m]));

  const explicit = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const eligible = catalogueModels.filter((m) => m.tier === "PREFERRED" || m.tier === "VIABLE");
  const order: BakeoffCandidateModel[] = explicit.length > 0 ? explicit.map((id) => eligible.find((m) => m.id === id)!).filter(Boolean) : eligible;

  const probes = buildProbeSet();
  save("00-probe-set", probes);
  console.log(`probe set: ${probes.length} candidates; models to test (cheapest first): ${order.slice(0, 5).map((m) => m.id).join(", ")}${order.length > 5 ? ` … (+${order.length - 5})` : ""}`);

  const { stages, bundles } = await prepare();
  const byId = new Map((await prepare()).rehydrated.map((c) => [c.discoveryId, c]));
  const stageCaller = getStageCaller();
  const amendment = await runAmendmentPipeline(stageCaller, { documents: stages.documents, packageGraph: stages.packageGraph, index: stages.index });
  const operativeState = computeOperativeContractState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: "conmed-doc-a-eighth-ar-credit-agreement", asOfDate: new Date().toISOString().slice(0, 10), index: stages.index, allEffects: amendment.effects });

  let spend = 0;
  const results: ModelBakeoffResult[] = [];
  const frozen: { model: string; discoveryId: string; result: SemanticCompilationResult }[] = [];

  for (const m of order) {
    const raw = rawById.get(m.id)!;
    // §3: throws before dispatch. Belt and braces — the id was already filtered.
    assertNotPremium(m.id, raw.pricing);

    if (spend >= SPEND_STOP_AT_USD) {
      console.log(`budget guard: $${spend.toFixed(4)} spent, stopping before the $${SPEND_CEILING_USD} ceiling`);
      break;
    }

    process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(raw));
    const caller = callerFor(m.id);
    const recs: CandidateRecord[] = [];
    console.log(`\n=== ${m.id} ($${m.estimatedCostPerCandidateUsd}/cand est) — concurrency 1 ===`);

    for (const p of probes) {
      if (spend >= SPEND_STOP_AT_USD) break;
      const c = byId.get(p.discoveryId)!;
      const input = buildInput(c, bundles.get(c.discoveryId), stages, operativeState, amendment.effects);
      const t0 = Date.now();
      try {
        const result = await withTimeout(compileCovenantToIR(input, { caller }), PER_CANDIDATE_TIMEOUT_MS);
        frozen.push({ model: m.id, discoveryId: c.discoveryId, result });
        const rec = record(c, input, result, raw, 1, null);
        spend += rec.actualCostUsd;
        recs.push(rec);
        console.log(`  ${p.axis.padEnd(36)} ${rec.sourceSectionRef.padEnd(14)} ${rec.status.padEnd(16)} rules=${String(rec.rules).padStart(2)} tools=${String(rec.toolCalls).padStart(2)} tok=${rec.inputTokens}/${rec.outputTokens} ${Math.round((Date.now() - t0) / 1000)}s $${spend.toFixed(4)}`);
      } catch (err) {
        const name = err instanceof Error ? err.name : "UnknownError";
        const synthetic = { status: "FAILED", failureReasons: [name === "CandidateTimeoutError" ? "WALL_CLOCK_TIMEOUT" : "TRANSPORT_OR_INTERNAL_ERROR"], rules: [], definitions: [], toolCallLog: [], telemetry: null } as unknown as SemanticCompilationResult;
        frozen.push({ model: m.id, discoveryId: c.discoveryId, result: synthetic });
        recs.push(record(c, input, synthetic, raw, 1, null));
        console.log(`  ${p.axis.padEnd(36)} ${String(c.normalizedSourceRef).padEnd(14)} THREW ${name} ${Math.round((Date.now() - t0) / 1000)}s`);
      }
    }

    const completed = recs.filter((r) => r.status !== "FAILED");
    const schema = recs.filter((r) => r.failureReasons.includes("MODEL_SCHEMA_FAILURE"));
    const stalls = recs.filter((r) => r.status === "FAILED" && (r.inputTokens ?? 0) === 0 && !r.failureReasons.includes("WALL_CLOCK_TIMEOUT"));
    const timeouts = recs.filter((r) => r.failureReasons.includes("WALL_CLOCK_TIMEOUT"));
    const provider = recs.filter((r) => classifyFailureCategory(r.status, r.failureReasons, (r.inputTokens ?? 0) + (r.outputTokens ?? 0)) === "PROVIDER_OR_HARNESS");
    const wall = recs.map((r) => r.wallClockMs ?? 0).filter((x) => x > 0);
    const modelSpend = recs.reduce((s, r) => s + r.actualCostUsd, 0);

    const base = {
      model: m.id,
      provider: "vercel-ai-gateway",
      inputPerMtok: m.inputPerMtok,
      outputPerMtok: m.outputPerMtok,
      attempted: recs.length,
      completed: completed.length,
      completionRate: pct(completed.length, recs.length),
      schemaFailures: schema.length,
      schemaFailureRate: pct(schema.length, recs.length),
      toolFailures: recs.filter((r) => r.failureReasons.some((x) => x.includes("TOOL"))).length,
      zeroTokenStalls: stalls.length,
      timeouts: timeouts.length,
      providerFailures: provider.length,
      medianWallClockMs: quantile(wall, 0.5),
      p90WallClockMs: quantile(wall, 0.9),
      inputTokens: recs.reduce((s, r) => s + (r.inputTokens ?? 0), 0),
      outputTokens: recs.reduce((s, r) => s + (r.outputTokens ?? 0), 0),
      spendUsd: Number(modelSpend.toFixed(5)),
      costPerCompletedCandidateUsd: completed.length > 0 ? Number((modelSpend / completed.length).toFixed(5)) : 0,
      toolUseWorks: recs.some((r) => r.toolCalls > 0),
      structuredOutputsParse: recs.some((r) => r.rules > 0 || r.definitions > 0),
      perCandidate: recs,
    };
    const gate = evaluateGate(base);
    const full: ModelBakeoffResult = { ...base, ...gate };
    results.push(full);
    save("01-bakeoff-results", results);
    save("02-frozen", frozen.map((f) => ({ ...f, resultHash: sha256(JSON.stringify(f.result)) })));

    console.log(`  -> completion ${(full.completionRate * 100).toFixed(1)}% | schema-fail ${(full.schemaFailureRate * 100).toFixed(1)}% | stalls ${full.zeroTokenStalls} | timeouts ${full.timeouts} | $${full.spendUsd} | GATE ${full.passesGate ? "PASS" : "FAIL: " + full.gateReasons.join("; ")}`);

    if (full.passesGate) {
      console.log(`\nSELECTED: ${m.id} — cheapest model clearing the §5 gate. §5 forbids burning budget on decorative comparisons, so testing stops here.`);
      break;
    }
  }

  save("03-summary", { spendUsd: Number(spend.toFixed(5)), ceilingUsd: SPEND_CEILING_USD, modelsTested: results.length, selected: results.find((r) => r.passesGate)?.model ?? null });
  console.log(`\nbakeoff spend $${spend.toFixed(4)} of $${SPEND_CEILING_USD}; models tested ${results.length}`);
}

if (process.argv[1]?.endsWith("run-bakeoff.ts")) void main();
