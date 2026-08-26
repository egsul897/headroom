/**
 * Real ContractAnalyzerProvider implementation for Phase C0 (task's own
 * Task 4: "reuse the existing Anthropic/Gateway transport and the existing
 * Candidate* schemas - do not build a parallel extraction system"). Mirrors
 * lib/extraction/anthropic-provider.ts's own AnthropicMessagesProvider
 * pattern exactly: one shared base class doing the real
 * `client.messages.parse()` + `output_config.format` structured-output call,
 * two thin subclasses differing only in how `client` is constructed (direct
 * Anthropic API vs. Vercel AI Gateway).
 *
 * This is intentionally a SEPARATE class hierarchy from
 * AnthropicMessagesProvider in lib/extraction/anthropic-provider.ts, not a
 * reuse of it - that class implements the OLD Permission/PermissionRelationship-
 * shaped ContractExtractionProvider interface (six stages, PermissionProposal
 * etc.), which is a different, already-shipped and already-tested contract
 * this spike must not touch. The Phase-B/Phase-C0 analyzer targets the NEW
 * CandidateContractRule/CandidateDefinedTerm/CandidateContractReference/
 * CandidateRuleRelationship shapes from lib/contract-model/types.ts instead.
 * What IS reused, verbatim, is the transport convention: same SDK, same
 * `messages.parse()` + `zodOutputFormat()` call shape, same
 * direct-vs-Gateway base-URL/auth split, same env vars.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ContractAnalysisResultSchema, type ContractAnalysisResult, type ContractAnalyzerInput } from "./schema";
import type { ContractAnalyzerProvider } from "./provider";

export const DEFAULT_ANALYZER_MODEL = "claude-opus-5";
export const DEFAULT_GATEWAY_ANALYZER_MODEL = "anthropic/claude-opus-5";
export const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";
export const ANALYZER_PROMPT_VERSION = "phase-c0.1";
export const ANALYZER_SCHEMA_VERSION = "phase-c0.1";

const SYSTEM_PROMPT = [
  "You are a precise legal-document analyzer for a covenant-capacity analytics platform.",
  "You are given the Negative Covenants article of a real credit agreement and an excerpt of the Definitions article it depends on.",
  "Extract every material provision as a structured ContractRule candidate: the covenant family, rule type, evaluation class, action, entity scope, threshold value/unit, formula kind, conditions, exceptions, exact source section reference, and the defined terms it relies on.",
  "Extract every defined term you rely on or that the document text defines as a DefinedTerm candidate, with its exact section reference.",
  "Extract cross-references between rules/sections/terms as ContractReference candidates, and any relationship BETWEEN two rules you found (e.g. one basket's capacity reduces another's, or one basket feeds another) as a RuleRelationship candidate.",
  "Be exact about numbers: if a basket is 'the greater of a fixed dollar amount and a percentage of a defined metric,' both numbers and the metric name must appear - never collapse it to a single number.",
  "Be exact about conditions: if a permission is unconditional, say so; if it is gated by a ratio test, a no-default condition, an entity-type restriction, or a time period, include that condition explicitly rather than omitting it.",
  "Never invent a source section reference. If you are not confident a provision maps cleanly onto the ontology, still extract it as best you can and use evaluationClass JUDGMENT_REQUIRED or action OTHER rather than silently dropping it - a flagged, honest guess is required; a confident, wrong, unflagged extraction is the one outcome this system must never produce.",
].join(" ");

export abstract class AnthropicMessagesAnalyzer implements ContractAnalyzerProvider {
  constructor(
    protected readonly client: Anthropic,
    readonly model: string
  ) {}

  async analyze(input: ContractAnalyzerInput): Promise<ContractAnalysisResult> {
    const message = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Defined terms excerpt:\n${input.definitionsText}\n\nNegative covenants article:\n${input.documentText}`,
        },
      ],
      output_config: { format: zodOutputFormat(ContractAnalysisResultSchema) },
    });

    if (!message.parsed_output) {
      throw new Error(`${this.constructor.name}: model response did not parse against ContractAnalysisResultSchema (stop_reason=${message.stop_reason})`);
    }
    return message.parsed_output;
  }
}

export class AnthropicContractAnalyzer extends AnthropicMessagesAnalyzer {
  constructor(options?: { apiKey?: string; model?: string }) {
    const client = new Anthropic(options?.apiKey ? { apiKey: options.apiKey } : {});
    const model = options?.model ?? process.env.ANALYZER_MODEL ?? DEFAULT_ANALYZER_MODEL;
    super(client, model);
  }
}

export class VercelAIGatewayContractAnalyzer extends AnthropicMessagesAnalyzer {
  constructor(options?: { apiKey?: string; model?: string; baseURL?: string }) {
    const apiKey = options?.apiKey ?? process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      throw new Error("VercelAIGatewayContractAnalyzer requires AI_GATEWAY_API_KEY (or an explicit apiKey option) - none was provided.");
    }
    const client = new Anthropic({ apiKey, baseURL: options?.baseURL ?? AI_GATEWAY_BASE_URL });
    const model = options?.model ?? process.env.ANALYZER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
    super(client, model);
  }
}
