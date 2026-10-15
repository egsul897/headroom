/**
 * Hard guard: the standalone flywheel is fully deterministic.
 * No OpenAI / Anthropic / xAI / Vercel AI SDK / any paid model endpoint.
 * AI-assisted work stays with the owner's Grok Bot and Cursor agents — never
 * inside Vercel cron or GitHub scheduled slices.
 */

/** Packages that must never be imported by flywheel/cron/sweep/ingest modules. */
export const FLYWHEEL_BANNED_AI_PACKAGES = [
  "@anthropic-ai/sdk",
  "openai",
  "ai",
  "@ai-sdk/openai",
  "@ai-sdk/anthropic",
  "@ai-sdk/amazon-bedrock",
  "@ai-sdk/google",
  "@ai-sdk/xai",
  "@ai-sdk/mistral",
  "@ai-sdk/azure",
  "langchain",
  "@langchain/core",
  "@langchain/openai",
  "llamaindex",
] as const;

/** Import path substrings banned in flywheel-scoped source. */
export const FLYWHEEL_BANNED_AI_IMPORT_FRAGMENTS = [
  "@anthropic-ai/sdk",
  "openai",
  "@ai-sdk/",
  "from \"ai\"",
  "from 'ai'",
  "langchain",
  "llamaindex",
  "llm-caller",
  "semantic/caller",
  "RealSemanticCaller",
  "getSemanticCaller",
  "getStageCaller",
  "AI_GATEWAY",
  "ANALYZER_MODEL",
  "VERCEL_AI_GATEWAY",
] as const;

/** Host substrings that must not appear as fetch/model targets in flywheel-scoped source. */
export const FLYWHEEL_BANNED_MODEL_HOST_FRAGMENTS = [
  "api.openai.com",
  "api.anthropic.com",
  "api.x.ai",
  "api.groq.com",
  "generativelanguage.googleapis.com",
  "openai.azure.com",
  "api.mistral.ai",
  "api.together.xyz",
  "api.fireworks.ai",
  "bedrock-runtime",
  "ai-gateway.vercel.sh",
  "gateway.vercel.ai",
] as const;

/** Env var names the flywheel must never require (and must not read for model calls). */
export const FLYWHEEL_BANNED_AI_ENV_VARS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "AI_GATEWAY_API_KEY",
  "AI_GATEWAY_BASE_URL",
  "ANALYZER_MODEL",
  "XAI_API_KEY",
  "GROK_API_KEY",
  "VERCEL_AI_API_KEY",
] as const;

export const FLYWHEEL_PAID_INFERENCE = false as const;

/**
 * Runtime assert for cron/slice entrypoints: refuse if an operator mistakenly
 * sets FLYWHEEL_ALLOW_AI (there is no supported AI path).
 */
export function assertFlywheelDeterministic(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): void {
  if (env.FLYWHEEL_ALLOW_AI === "1" || env.FLYWHEEL_ALLOW_AI === "true") {
    throw new Error(
      "Flywheel refuse: FLYWHEEL_ALLOW_AI is set, but the scheduled flywheel has ZERO AI/LLM usage. Unset it.",
    );
  }
}
