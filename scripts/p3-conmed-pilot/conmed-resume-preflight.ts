/**
 * CONMED resume - the two planned paid health probes, and nothing else.
 *
 * Tier A (tiny) and Tier B (workload-shaped, tool-bearing) against the locked, unsuffixed model.
 * Both must return 200 with exact provider usage. The result (never the key) is written into the
 * run's scratch output directory so it is preserved alongside the population evidence and its
 * spend is reconciled against the same ceiling. A failure of either probe stops the mission before
 * the population starts; no other model is tried.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import fs from "node:fs";
import path from "node:path";
import { probe } from "./gateway-health";
import { loadModel, realCost } from "./compile-run";
import { assertNotPremium } from "./premium-lock";
import { LOCKED_MODEL, OUT } from "./run-population-verified";

function keyFromEnvLocal(): string {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY;
  const line = fs.readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith("AI_GATEWAY_API_KEY="));
  if (!line) throw new Error("no gateway credential in the environment or .env.local");
  return line.slice("AI_GATEWAY_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  if (process.env.CONMED_RESUME_AUTHORIZED !== "1") throw new Error("not authorized: set CONMED_RESUME_AUTHORIZED=1");
  if (LOCKED_MODEL.endsWith("-0731")) throw new Error("forbidden suffix");
  const raw = loadModel(LOCKED_MODEL);
  assertNotPremium(raw.id, raw.pricing);
  const key = keyFromEnvLocal();
  const a = await probe(LOCKED_MODEL, "A_TINY", key);
  const b = a.ok ? await probe(LOCKED_MODEL, "B_WORKLOAD", key) : null;
  const rows = [a, ...(b ? [b] : [])].map((r) => ({ ...r, costUsd: r.ok ? realCost(raw, r.inputTokens, r.outputTokens) : 0 }));
  const out = { model: LOCKED_MODEL, at: new Date().toISOString(), probes: rows, ok: rows.length === 2 && rows.every((r) => r.ok && r.status === 200), spendUsd: rows.reduce((s, r) => s + r.costUsd, 0), creditExhaustion: rows.some((r) => r.isCreditExhaustion) };
  fs.mkdirSync(OUT, { recursive: true });
  const body = JSON.stringify(out, null, 2);
  if (/vck_[\w-]{8,}/.test(body)) throw new Error("refusing to write: credential-shaped text in probe output");
  fs.writeFileSync(path.join(OUT, "preflight-health.json"), body);
  console.log(body);
  if (!out.ok) { console.log("PRE-FLIGHT FAILED - STOP"); process.exitCode = 2; }
}

void main();
