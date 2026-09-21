/**
 * Two-tier gateway health check, and the quarantine rule that depends on it.
 *
 * This exists because a credit-exhausted gateway is indistinguishable, in the per-candidate
 * record, from a model that cannot do the work: both produce status FAILED with zero tokens
 * billed. Reading the second as the first has now happened more than once in this project,
 * so the check is a required precondition rather than a diagnostic of last resort.
 *
 * Tier A is a 32-token call. Tier B is a workload-shaped call with a tool. Tier A alone is
 * NOT sufficient: a tiny probe can succeed against a gateway that refuses real traffic.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ModelBakeoffResult } from "./run-bakeoff";

export const GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";

export interface HealthResult {
  model: string;
  tier: "A_TINY" | "B_WORKLOAD";
  ok: boolean;
  status: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  message: string | null;
  /** A 402 is an account condition. It says nothing whatsoever about the model. */
  isCreditExhaustion: boolean;
}

export function isCreditExhaustion(status: number | null, message: string): boolean {
  if (status === 402) return true;
  return /positive credit balance|insufficient.{0,20}(funds|credit)|add credits/i.test(message);
}

export async function probe(model: string, tier: "A_TINY" | "B_WORKLOAD", apiKey: string): Promise<HealthResult> {
  const client = new Anthropic({ apiKey, baseURL: GATEWAY_BASE_URL });
  try {
    const req =
      tier === "A_TINY"
        ? { model, max_tokens: 32, messages: [{ role: "user" as const, content: "Reply with the single word OK." }] }
        : {
            model,
            max_tokens: 1024,
            tools: [
              {
                name: "emit_rules",
                description: "Emit structured covenant rules.",
                input_schema: { type: "object" as const, properties: { rules: { type: "array", items: { type: "object" } } }, required: ["rules"] },
              },
            ],
            messages: [{ role: "user" as const, content: `Call emit_rules once for this provision.\n\n${"Section 7.2 — The Borrower shall not incur Indebtedness exceeding $50,000,000. ".repeat(220)}` }],
          };
    const r = await client.messages.create(req);
    return { model, tier, ok: true, status: 200, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens, message: null, isCreditExhaustion: false };
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const message = String(err?.message ?? e);
    return { model, tier, ok: false, status: err?.status ?? null, inputTokens: null, outputTokens: null, message: message.slice(0, 300), isCreditExhaustion: isCreditExhaustion(err?.status ?? null, message) };
  }
}

/**
 * A row is admissible as evidence about a MODEL only if the gateway was serving while it ran.
 *
 * The decisive signal is that the row billed no tokens at all: a model that is genuinely
 * failing still gets served and still bills. A row of instant zero-token failures is a
 * measurement of the account, and reporting it as a model result would be a false finding.
 */
export function quarantineRows(results: ModelBakeoffResult[]): { admissible: ModelBakeoffResult[]; quarantined: { model: string; reason: string }[] } {
  const admissible: ModelBakeoffResult[] = [];
  const quarantined: { model: string; reason: string }[] = [];
  for (const r of results) {
    const billed = r.perCandidate.filter((c) => (c.inputTokens ?? 0) + (c.outputTokens ?? 0) > 0).length;
    // Sub-5s failures cannot be model behaviour on a 29k-token prompt; nothing was served.
    const instantFailures = r.perCandidate.filter((c) => c.status === "FAILED" && (c.inputTokens ?? 0) === 0 && (c.wallClockMs ?? 0) < 5000).length;
    if (billed === 0) {
      quarantined.push({ model: r.model, reason: `no candidate billed a single token across ${r.attempted} attempts; the gateway served nothing, so this row measures the account and not the model` });
    } else if (instantFailures > r.attempted / 2) {
      quarantined.push({ model: r.model, reason: `${instantFailures}/${r.attempted} candidates failed in under 5s with zero tokens billed; the row is dominated by refusals, not by model behaviour` });
    } else {
      admissible.push(r);
    }
  }
  return { admissible, quarantined };
}
