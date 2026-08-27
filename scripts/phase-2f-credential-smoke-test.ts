/**
 * Phase 2F - minimal, cheap smoke test of the real LLM credential before
 * committing to the full ~123-call discovery run. One tiny structured call,
 * trivial schema, trivial prompt.
 */
import { z } from "zod";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";

async function main() {
  const caller = getStageCaller();
  console.error(`provider=${caller.providerName} model=${caller.model} isSynthetic=${caller.isSynthetic}`);
  if (caller.isSynthetic) {
    console.error("NO REAL CREDENTIAL DETECTED - falling back to synthetic caller.");
    process.exit(1);
  }
  const schema = z.object({ ok: z.boolean(), note: z.string() });
  const result = await caller.call(schema, "smoke-test", "Respond only with the requested JSON.", 'Return {"ok": true, "note": "phase-2f-credential-smoke-test"}');
  console.error("result:", JSON.stringify(result));
  const telemetry = caller.lastTelemetry();
  console.error("telemetry:", JSON.stringify(telemetry));
}

main().catch((err) => {
  console.error("FAILED:", err?.message ?? err);
  process.exit(1);
});
