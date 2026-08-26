/**
 * ContractExtractionProvider transported over Vercel AI Gateway
 * (docs/vercel-ai-gateway-extraction.md) instead of calling Anthropic
 * directly. Every extraction prompt, schema, and validation rule is shared
 * with the direct-API path via `AnthropicMessagesProvider`
 * (./anthropic-provider.ts) - this file's ENTIRE job is constructing an
 * `Anthropic` SDK client pointed at the Gateway instead of Anthropic's own
 * API, per Vercel's own documented integration
 * (docs/ai-gateway/sdks-and-apis/anthropic-messages-api): same
 * `client.messages.parse()` / `output_config.format` request shape against
 * `/v1/messages`, just a different base URL and bearer credential. Nothing
 * about the solver, schemas, or stage logic changes - this is a transport
 * swap only.
 *
 * Auth: AI_GATEWAY_API_KEY, passed as the SDK's own `apiKey` option (sent as
 * the `x-api-key` header, one of the two auth forms the Gateway's Anthropic
 * Messages API explicitly documents accepting).
 *
 * Model: EXTRACTION_MODEL env var, default `anthropic/claude-opus-5` - the
 * Gateway requires a provider-prefixed model id (confirmed against Vercel's
 * own published request examples, never guessed), unlike the direct
 * Anthropic API's bare `claude-opus-5`. A deployment that sets EXTRACTION_MODEL
 * for the Gateway path must include that prefix itself - this file does not
 * silently add or strip one, since a deployment may legitimately want to
 * route to a non-Anthropic model the Gateway also serves.
 */

import Anthropic from "@anthropic-ai/sdk";
import { AnthropicMessagesProvider } from "./anthropic-provider";

/** Vercel AI Gateway's own documented Anthropic-Messages-API-compatible base URL. */
export const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";

export const DEFAULT_GATEWAY_EXTRACTION_MODEL = "anthropic/claude-opus-5";

export class VercelAIGatewayExtractionProvider extends AnthropicMessagesProvider {
  constructor(options?: { apiKey?: string; model?: string; baseURL?: string }) {
    const apiKey = options?.apiKey ?? process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      throw new Error("VercelAIGatewayExtractionProvider requires AI_GATEWAY_API_KEY (or an explicit apiKey option) - none was provided.");
    }
    const client = new Anthropic({ apiKey, baseURL: options?.baseURL ?? AI_GATEWAY_BASE_URL });
    const model = options?.model ?? process.env.EXTRACTION_MODEL ?? DEFAULT_GATEWAY_EXTRACTION_MODEL;
    super(client, model);
  }
}
