/**
 * FINAL LIGHTWEIGHT UNSEEN CONFIRMATION - mission Section 8 provider
 * precondition probe. One tiny real-provider call (not the substantive
 * validation pipeline) to confirm live model access before any real
 * semantic-compilation spend. Loads AI_GATEWAY_API_KEY from .env.local
 * (not exported into the ambient shell env by default).
 */
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const envLocal = readFileSync(".env.local", "utf-8");
const match = envLocal.match(/AI_GATEWAY_API_KEY=(.+)/);
if (!match) {
  console.log(JSON.stringify({ success: false, reason: "NO_KEY_FOUND_IN_ENV_LOCAL" }));
  process.exit(1);
}
const key = match[1]!.trim();

const client = new Anthropic({ apiKey: key, baseURL: "https://ai-gateway.vercel.sh" });

async function main() {
  const start = Date.now();
  try {
    const resp = await client.messages.create({
      model: "anthropic/claude-sonnet-5",
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with exactly one word: OK" }],
    });
    const elapsedMs = Date.now() - start;
    console.log(JSON.stringify({ success: true, model: resp.model, stop_reason: resp.stop_reason, content: resp.content, usage: resp.usage, elapsedMs }, null, 2));
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    console.log(JSON.stringify({ success: false, error: String(err), errorStatus: e?.status, errorMessage: e?.message }, null, 2));
    process.exit(1);
  }
}

main();
