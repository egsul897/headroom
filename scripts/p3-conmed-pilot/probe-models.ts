/**
 * §1 — capability probe. The mission requires the CHEAPEST model that can actually
 * complete the existing compiler workflow, and the only honest way to establish that is
 * to drive a real call down the same transport production uses: the Anthropic SDK
 * pointed at the Vercel AI Gateway, with Anthropic-shaped tool blocks.
 *
 * A model being listed on the gateway with a "tool-use" tag is NOT evidence it works
 * here — the gateway's Anthropic-compatible /v1/messages endpoint does not necessarily
 * serve every model it lists. So each candidate gets one small, real call.
 *
 * Probe cost is a few hundred tokens each; the whole sweep is fractions of a cent.
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import { AI_GATEWAY_BASE_URL } from "../../lib/contract-model/analyzer/anthropic-analyzer";

export interface GatewayModel {
  id: string;
  context_window: number;
  max_tokens: number;
  type: string;
  tags?: string[];
  pricing: { input: string; output: string };
}

/** Blended $/Mtok at the observed 84.7% input / 15.3% output mix of the frozen run. */
export function blendedPricePerMtok(m: GatewayModel): number {
  return (Number(m.pricing.input) * 0.847 + Number(m.pricing.output) * 0.153) * 1e6;
}

export function loadCatalogue(path: string): GatewayModel[] {
  return JSON.parse(fs.readFileSync(path, "utf8")).data as GatewayModel[];
}

/**
 * The capability floor the EXISTING compiler configuration imposes. Every item is a
 * requirement of the unchanged code path, not a quality preference:
 *  - language model, tool-use capable       (the compiler is a tool-use loop)
 *  - output ceiling >= 64,000 tokens        (observed mean output 14,403/candidate; the
 *                                            default request is 128,000 and a model whose
 *                                            ceiling is below the request is rejected by
 *                                            the API before it ever sees the prompt)
 *  - context window >= 200,000 tokens       (system prompt + few-shots + retrieved
 *                                            evidence + tool results across ~8 turns)
 */
export function capable(m: GatewayModel): boolean {
  return m.type === "language" && (m.tags ?? []).includes("tool-use") && m.max_tokens >= 64000 && m.context_window >= 200000;
}

export interface ProbeResult {
  model: string;
  blendedPricePerMtok: number;
  maxOutputTokens: number;
  reachableViaAnthropicTransport: boolean;
  calledTheTool: boolean;
  producedWellFormedArgs: boolean;
  usable: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  failure: string | null;
}

/**
 * One real call. The tool mirrors the compiler's own terminal-action shape (a single
 * required structured submission) closely enough that a model which cannot do this
 * cannot do submit_compilation either.
 */
export async function probe(client: Anthropic, m: GatewayModel): Promise<ProbeResult> {
  const base = {
    model: m.id,
    blendedPricePerMtok: blendedPricePerMtok(m),
    maxOutputTokens: m.max_tokens,
    reachableViaAnthropicTransport: false,
    calledTheTool: false,
    producedWellFormedArgs: false,
    usable: false,
    inputTokens: null as number | null,
    outputTokens: null as number | null,
    failure: null as string | null,
  };

  try {
    const message = await client.messages.create({
      model: m.id,
      max_tokens: 1024,
      system:
        "You compile contract provisions into structured rules. You must respond by calling the submit_probe tool exactly once. Do not reply with plain text.",
      messages: [
        {
          role: "user",
          content:
            'Provision: "Section 7.2(c). The Borrower shall not incur Indebtedness exceeding $50,000,000 in the aggregate at any time outstanding." Submit one rule for it.',
        },
      ],
      tools: [
        {
          name: "submit_probe",
          description: "Submit the compiled rule. This is the only way to finish.",
          input_schema: {
            type: "object",
            properties: {
              rules: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    sourceSectionRef: { type: "string" },
                    thresholdValue: { type: "number" },
                    sufficiency: { type: "string", enum: ["SUFFICIENT", "UNSUPPORTED", "MISSING_CONTEXT"] },
                  },
                  required: ["sourceSectionRef", "sufficiency"],
                },
              },
            },
            required: ["rules"],
          },
        },
      ],
    });

    base.reachableViaAnthropicTransport = true;
    base.inputTokens = message.usage?.input_tokens ?? null;
    base.outputTokens = message.usage?.output_tokens ?? null;

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse) {
      base.failure = `no tool_use block; stop_reason=${message.stop_reason}`;
      return base;
    }
    base.calledTheTool = true;

    const input = (toolUse as { input: unknown }).input as { rules?: unknown };
    const rules = input?.rules;
    if (!Array.isArray(rules) || rules.length === 0 || typeof (rules[0] as { sourceSectionRef?: unknown })?.sourceSectionRef !== "string") {
      base.failure = `tool args did not match the schema: ${JSON.stringify(input).slice(0, 200)}`;
      return base;
    }
    base.producedWellFormedArgs = true;
    base.usable = true;
    return base;
  } catch (err) {
    const e = err as { status?: number; message?: string };
    base.failure = `${e.status ?? "ERR"}: ${(e.message ?? String(err)).slice(0, 220)}`;
    return base;
  }
}

if (process.argv[1]?.endsWith("probe-models.ts")) {
  void (async () => {
    const cataloguePath = process.argv[2] ?? "/tmp/claude-0/pilot/models.json";
    const limit = Number(process.argv[3] ?? 14);
    const client = new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: AI_GATEWAY_BASE_URL });
    const candidates = loadCatalogue(cataloguePath).filter(capable).sort((a, b) => blendedPricePerMtok(a) - blendedPricePerMtok(b));

    console.log(`capable candidates: ${candidates.length}; probing the cheapest ${limit}`);
    const results: ProbeResult[] = [];
    for (const m of candidates.slice(0, limit)) {
      const r = await probe(client, m);
      results.push(r);
      console.log(`${r.usable ? "OK  " : "FAIL"} ${r.blendedPricePerMtok.toFixed(3).padStart(7)} ${m.id.padEnd(40)} ${r.failure ?? ""}`);
    }
    fs.writeFileSync("/tmp/claude-0/pilot/probe-results.json", JSON.stringify(results, null, 2));
  })();
}
