/**
 * Targeted cheap TOOL-model qualification.
 *
 * The broad cheapest-first bakeoff established that raw token price is a poor selection
 * criterion for this workflow: the two cheapest models in the catalogue both completed
 * exactly 6/12, and the cheaper of the two never invoked an evidence tool at all. This
 * stage asks the right question instead — which of a short, tool-capable shortlist can
 * actually execute the compiler's protocol — and it answers it in three probes rather
 * than twelve, at 240s rather than 480s, with hard early exit.
 *
 * Harness/evaluation control only. Nothing in production imports it.
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { AI_GATEWAY_BASE_URL } from "../../lib/contract-model/analyzer/anthropic-analyzer";
import { RealSemanticCaller } from "../../lib/contract-model/compiler/semantic/caller";
import { compileCovenantToIR } from "../../lib/contract-model/compiler/semantic/compile";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { getStageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import { INSTRUMENT_KEY, sha256 } from "./pipeline";
import { buildInput, maxTokensFor, prepare, record, withTimeout, type CandidateRecord } from "./compile-run";
import { assertNotPremium } from "./premium-lock";
import { assertAllowedTimeout, QUALIFICATION_TIMEOUT_MS } from "./timeout-policy";
import type { GatewayModel } from "./probe-models";

const OUT = "/tmp/claude-0/pilot/qualify";

/** §1 — the approved shortlist, in the authorized order. Nothing else may be dispatched. */
export const SHORTLIST = [
  "inception/mercury-2.5",
  "openai/gpt-5-nano",
  "zai/glm-4.7-flash",
  "xiaomi/mimo-v2.5",
  "deepseek/deepseek-v4-flash",
] as const;

/** §1 — already failed the real-workload gate; must not be re-tested. */
export const EXCLUDED_MODELS = ["alibaba/qwen3.7-flash"] as const;

/** §3 — frozen before the first model ran. Identical for every model, never changed. */
export const FROZEN_PROBES = [
  { slot: "A_SHORT_CONTROL", discoveryId: "discovery-candidate:ad1fed61ba3ae3f2f1d64728", sourceSectionRef: "7.8(b)", chars: 37, purpose: "baseline protocol and structured-output compatibility", toolUseRequired: false },
  { slot: "B_EVIDENCE_TOOL_REQUIRED", discoveryId: "discovery-candidate:1084b12277d101d1e3928d59", sourceSectionRef: "7.2(f)", chars: 149, purpose: "prove the model invokes the compiler's evidence tools", toolUseRequired: true },
  { slot: "C_HARD_LONG", discoveryId: "discovery-candidate:c9999a82a8a6c1c3a9648e22", sourceSectionRef: "7.2(k)", chars: 9621, purpose: "realistic hard input without burning the full timeout", toolUseRequired: false },
] as const;

export const PER_MODEL_CEILING_USD = 0.1;
export const TOTAL_SELECTION_CEILING_USD = 0.5;

export interface GatewayCallCost {
  provider: string | null;
  gatewayCostUsd: number;
  sortOptionApplied: string | null;
  generationId: string | null;
}

/**
 * §2 — prefer the cheapest provider, and record what the gateway actually did.
 *
 * The routing preference is verified rather than assumed: the gateway echoes the applied
 * sort back in provider_metadata, and an unknown field would be silently ignored, so the
 * echo is the only proof the preference took effect.
 */
export function extractGatewayCost(raw: unknown): GatewayCallCost {
  const meta = (raw as { provider_metadata?: { gateway?: Record<string, unknown> } })?.provider_metadata?.gateway;
  if (!meta) return { provider: null, gatewayCostUsd: 0, sortOptionApplied: null, generationId: null };
  const routing = meta.routing as { finalProvider?: string; sort?: { option?: string } } | undefined;
  return {
    provider: routing?.finalProvider ?? null,
    gatewayCostUsd: Number(meta.cost ?? 0),
    sortOptionApplied: routing?.sort?.option ?? null,
    generationId: (meta.generationId as string) ?? null,
  };
}

/**
 * Wraps the gateway client so every call carries the cost-routing preference and every
 * response's real billed cost is captured. The compiler is untouched; it receives an
 * ordinary client.
 */
function routedClient(sink: GatewayCallCost[]) {
  const inner = new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL, maxRetries: 2 });
  return {
    messages: {
      create: async (body: Record<string, unknown>) => {
        const res = await (inner as unknown as { messages: { create: (b: unknown) => Promise<unknown> } }).messages.create({
          ...body,
          providerOptions: { gateway: { sort: "cost" } },
        });
        sink.push(extractGatewayCost(res));
        return res;
      },
    },
  } as unknown as ConstructorParameters<typeof RealSemanticCaller>[2];
}

export type ProbeOutcome = "PASS" | "TIMEOUT_240" | "SCHEMA_FAIL" | "TOOL_FAIL" | "EXECUTION_FAIL";

export interface ProbeResult {
  slot: string;
  sourceSectionRef: string;
  outcome: ProbeOutcome;
  status: string;
  failureReasons: string[];
  rules: number;
  definitions: number;
  toolCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  elapsedMs: number;
  gatewayCostUsd: number;
  provider: string | null;
  sortOptionApplied: string | null;
}

/**
 * §6 — execution compatibility only. REVIEW_REQUIRED / PARTIAL / HONEST_UNRESOLVED are
 * all valid semantic outcomes and must not be read as qualification failures.
 */
export function gradeProbe(rec: CandidateRecord, toolUseRequired: boolean, timedOut: boolean): ProbeOutcome {
  if (timedOut) return "TIMEOUT_240";
  if (rec.failureReasons.some((r) => r === "MODEL_SCHEMA_FAILURE" || r === "REPEATED_INVALID_STRUCTURED_OUTPUT" || r === "MALFORMED_TOOL_CALL")) return "SCHEMA_FAIL";
  const producedStructuredOutput = rec.rules + rec.definitions > 0;
  if (!producedStructuredOutput) return "EXECUTION_FAIL";
  if (toolUseRequired && rec.toolCalls === 0) return "TOOL_FAIL";
  return "PASS";
}

/** §5 — eliminate as soon as elimination is certain; do not run decorative probes. */
export function shouldEliminate(results: ProbeResult[]): { eliminate: boolean; reason: string | null } {
  const toolFail = results.find((r) => r.outcome === "TOOL_FAIL");
  if (toolFail) return { eliminate: true, reason: `A: evidence-required probe ${toolFail.sourceSectionRef} completed WITHOUT using the evidence tools` };
  const failures = results.filter((r) => r.outcome !== "PASS");
  if (failures.length >= 2) return { eliminate: true, reason: `B: two qualification failures (${failures.map((f) => `${f.slot}=${f.outcome}`).join(", ")})` };
  return { eliminate: false, reason: null };
}

export type ModelVerdict = "QUALIFIED" | "ELIMINATED" | "QUALIFICATION_COST_LIMIT" | "NOT_TESTED";

export interface ModelQualification {
  model: string;
  verdict: ModelVerdict;
  eliminationReason: string | null;
  probes: ProbeResult[];
  totalGatewayCostUsd: number;
  toolUseDemonstrated: boolean;
  hardProbeElapsedMs: number | null;
  providersSeen: string[];
}

function save(name: string, body: unknown) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(body, null, 2));
}

async function main() {
  assertAllowedTimeout(QUALIFICATION_TIMEOUT_MS, { tier: "QUALIFICATION" });

  const catalogue = JSON.parse(fs.readFileSync("/tmp/claude-0/pilot/models-bakeoff.json", "utf8")).data as GatewayModel[];
  const byId = new Map(catalogue.map((m) => [m.id, m]));
  const { stages, bundles, rehydrated } = await prepare();
  const candidateById = new Map(rehydrated.map((c) => [c.discoveryId, c]));

  const stageCaller = getStageCaller();
  const amendment = await runAmendmentPipeline(stageCaller, { documents: stages.documents, packageGraph: stages.packageGraph, index: stages.index });
  const operativeState = computeOperativeContractState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: "conmed-doc-a-eighth-ar-credit-agreement", asOfDate: new Date().toISOString().slice(0, 10), index: stages.index, allEffects: amendment.effects });

  console.log(`probes frozen: ${FROZEN_PROBES.map((p) => `${p.slot}=${p.sourceSectionRef}`).join(", ")}`);
  console.log(`shortlist: ${SHORTLIST.join(", ")}\n`);

  const qualifications: ModelQualification[] = [];
  let totalSpend = 0;

  for (const modelId of SHORTLIST) {
    if (totalSpend >= TOTAL_SELECTION_CEILING_USD) {
      qualifications.push({ model: modelId, verdict: "NOT_TESTED", eliminationReason: `total selection ceiling $${TOTAL_SELECTION_CEILING_USD} reached`, probes: [], totalGatewayCostUsd: 0, toolUseDemonstrated: false, hardProbeElapsedMs: null, providersSeen: [] });
      continue;
    }
    const raw = byId.get(modelId);
    if (!raw) { console.log(`${modelId}: NOT IN CATALOGUE — skipped`); continue; }
    assertNotPremium(modelId, raw.pricing);

    console.log(`=== ${modelId} ===`);
    process.env.SEMANTIC_COMPILER_MAX_TOKENS = String(maxTokensFor(raw));

    const probes: ProbeResult[] = [];
    let modelSpend = 0;
    let verdict: ModelVerdict = "QUALIFIED";
    let eliminationReason: string | null = null;

    for (const probe of FROZEN_PROBES) {
      if (modelSpend >= PER_MODEL_CEILING_USD) {
        verdict = "QUALIFICATION_COST_LIMIT";
        eliminationReason = `consumed $${modelSpend.toFixed(4)} before qualifying (ceiling $${PER_MODEL_CEILING_USD})`;
        console.log(`  -> QUALIFICATION_COST_LIMIT at $${modelSpend.toFixed(4)}`);
        break;
      }
      const candidate = candidateById.get(probe.discoveryId)!;
      const input = buildInput(candidate, bundles.get(candidate.discoveryId), stages, operativeState, amendment.effects);
      const costSink: GatewayCallCost[] = [];
      const caller = new RealSemanticCaller("vercel-ai-gateway", modelId, routedClient(costSink));
      const t0 = Date.now();
      let rec: CandidateRecord;
      let timedOut = false;
      try {
        const result = await withTimeout(compileCovenantToIR(input, { caller }), QUALIFICATION_TIMEOUT_MS);
        rec = record(candidate, input, result, raw, 1, null);
      } catch (err) {
        timedOut = err instanceof Error && err.name === "CandidateTimeoutError";
        rec = record(candidate, input, { status: "FAILED", failureReasons: [timedOut ? "WALL_CLOCK_TIMEOUT" : "TRANSPORT_OR_INTERNAL_ERROR"], rules: [], definitions: [], toolCallLog: [], telemetry: null } as unknown as SemanticCompilationResult, raw, 1, null);
      }
      const elapsedMs = Date.now() - t0;
      const gatewayCostUsd = costSink.reduce((s, c) => s + c.gatewayCostUsd, 0);
      modelSpend += gatewayCostUsd;
      totalSpend += gatewayCostUsd;

      const outcome = gradeProbe(rec, probe.toolUseRequired, timedOut);
      const pr: ProbeResult = {
        slot: probe.slot, sourceSectionRef: probe.sourceSectionRef, outcome, status: rec.status,
        failureReasons: rec.failureReasons, rules: rec.rules, definitions: rec.definitions, toolCalls: rec.toolCalls,
        inputTokens: rec.inputTokens, outputTokens: rec.outputTokens, elapsedMs,
        gatewayCostUsd: Number(gatewayCostUsd.toFixed(8)),
        provider: costSink.find((c) => c.provider)?.provider ?? null,
        sortOptionApplied: costSink.find((c) => c.sortOptionApplied)?.sortOptionApplied ?? null,
      };
      probes.push(pr);
      console.log(`  ${probe.slot.padEnd(26)} ${probe.sourceSectionRef.padEnd(9)} ${outcome.padEnd(14)} status=${rec.status.padEnd(16)} tools=${rec.toolCalls} rules=${rec.rules} tok=${rec.inputTokens}/${rec.outputTokens} ${Math.round(elapsedMs / 1000)}s $${gatewayCostUsd.toFixed(6)} provider=${pr.provider} sort=${pr.sortOptionApplied}`);

      const elim = shouldEliminate(probes);
      if (elim.eliminate) {
        verdict = "ELIMINATED";
        eliminationReason = elim.reason;
        console.log(`  -> ELIMINATED (${elim.reason}); remaining probes skipped per §5`);
        break;
      }
    }

    if (verdict === "QUALIFIED" && probes.length < FROZEN_PROBES.length) {
      verdict = "ELIMINATED";
      eliminationReason = eliminationReason ?? "did not complete all three probes";
    }
    if (verdict === "QUALIFIED" && !probes.every((p) => p.outcome === "PASS")) {
      verdict = "ELIMINATED";
      eliminationReason = `not all probes passed: ${probes.map((p) => `${p.slot}=${p.outcome}`).join(", ")}`;
    }

    const q: ModelQualification = {
      model: modelId, verdict, eliminationReason, probes,
      totalGatewayCostUsd: Number(modelSpend.toFixed(8)),
      toolUseDemonstrated: probes.some((p) => p.toolCalls > 0),
      hardProbeElapsedMs: probes.find((p) => p.slot === "C_HARD_LONG")?.elapsedMs ?? null,
      providersSeen: [...new Set(probes.map((p) => p.provider).filter((x): x is string => !!x))],
    };
    qualifications.push(q);
    save("01-qualifications", qualifications);
    console.log(`  => ${verdict}${eliminationReason ? ` — ${eliminationReason}` : ""} ($${modelSpend.toFixed(6)}, total $${totalSpend.toFixed(6)})\n`);

    if (verdict === "QUALIFIED") {
      console.log(`QUALIFIED: ${modelId} — testing stops here per §7 ordering.`);
      break;
    }
  }

  save("02-summary", {
    frozenProbes: FROZEN_PROBES,
    shortlist: SHORTLIST,
    excluded: EXCLUDED_MODELS,
    qualificationTimeoutMs: QUALIFICATION_TIMEOUT_MS,
    perModelCeilingUsd: PER_MODEL_CEILING_USD,
    totalCeilingUsd: TOTAL_SELECTION_CEILING_USD,
    totalSpendUsd: Number(totalSpend.toFixed(8)),
    qualified: qualifications.filter((q) => q.verdict === "QUALIFIED").map((q) => q.model),
    probeSetHash: sha256(JSON.stringify(FROZEN_PROBES)),
  });
  console.log(`\nselection spend $${totalSpend.toFixed(6)} of $${TOTAL_SELECTION_CEILING_USD}; qualified: ${qualifications.filter((q) => q.verdict === "QUALIFIED").map((q) => q.model).join(", ") || "(none)"}`);
}

if (process.argv[1]?.endsWith("qualify.ts")) void main();
