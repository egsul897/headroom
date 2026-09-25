/** Runnable two-tier gateway health check. Tier A is ~32 tokens; tier B is workload-shaped. */
import { probe } from "./gateway-health";
async function main() {
  const key = process.env.AI_GATEWAY_API_KEY ?? "";
  if (!key) { console.log("no credential present"); return; }
  const a = await probe("alibaba/qwen3.7-flash", "A_TINY", key);
  console.log("TIER A", a.ok ? `OK in/out ${a.inputTokens}/${a.outputTokens}` : `FAIL status=${a.status} creditExhaustion=${a.isCreditExhaustion} ${a.message?.slice(0, 160)}`);
  if (!a.ok) { console.log("GATEWAY_READY = NO"); return; }
  const b = await probe("alibaba/qwen3.7-flash", "B_WORKLOAD", key);
  console.log("TIER B", b.ok ? `OK in/out ${b.inputTokens}/${b.outputTokens}` : `FAIL status=${b.status} creditExhaustion=${b.isCreditExhaustion} ${b.message?.slice(0, 160)}`);
  console.log("GATEWAY_READY =", a.ok && b.ok ? "YES" : "NO");
}
void main();
