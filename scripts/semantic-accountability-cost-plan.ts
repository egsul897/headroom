/**
 * SEMANTIC ACCOUNTABILITY - provider health + cost plan (mission §29).
 * ZERO paid calls by default: resolves the real source context of every
 * frozen validation region (deterministic - the exact units Pass A/Pass B
 * would consume), sizes them, and projects the cost of two executions of
 * both validations from Mission-4's observed per-region costs scaled by
 * the unit growth, plus the new Pass A call. `--ping` performs ONE minimal
 * structured provider call (cost disclosed) to confirm provider health.
 *
 *   npx tsx scripts/semantic-accountability-cost-plan.ts [--ping] [--out docs/semantic-accountability/11-provider-cost-plan.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
if (!process.env.AI_GATEWAY_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  try {
    const envLocal = readFileSync(".env.local", "utf-8");
    const match = envLocal.match(/AI_GATEWAY_API_KEY=(.+)/);
    if (match) process.env.AI_GATEWAY_API_KEY = match[1]!.trim();
  } catch {}
}
import { z } from "zod";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { buildInventorySystemPrompt, buildInventoryUserContent } from "../lib/contract-model/compiler/semantic-accountability/prompt";
import { getSemanticCaller } from "../lib/contract-model/compiler/semantic/caller";
import { getStageCaller } from "../lib/contract-model/compiler/llm-caller";
import { findAnchor, HOLDOUT_SPEC, loadPackage, WHOLE_AGREEMENT_SPEC, type ValidationSpec } from "./lib/semantic-accountability-regions";
import { readFreezeRecord } from "./semantic-accountability-freeze";

function arg(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

// Sonnet-class list pricing (USD per token) used ONLY for the Pass A projection; compile/verify are projected from observed Mission-4 costs.
const IN_PER_TOKEN = 3 / 1_000_000;
const OUT_PER_TOKEN = 15 / 1_000_000;
const CHARS_PER_TOKEN = 3.6;

function planFor(spec: ValidationSpec) {
  const pkg = loadPackage(spec);
  const rows: Record<string, unknown>[] = [];
  let compileProjected = 0;
  let passAProjected = 0;
  for (const region of spec.regions) {
    const text = pkg.textByDoc.get(region.documentId)!;
    const { start, end } = region.locate(text);
    const window = text.slice(start, end);
    const anchor = findAnchor(pkg.allNodes, region.documentId, start);
    const sc = resolveSourceContext({ index: pkg.index, documentId: region.documentId, operativeSourceText: window, anchorNodeId: anchor?.nodeId ?? null, operativeCharStart: start, documentText: text });
    const unit = sc.regions[0]!;
    const passAInputTokens = Math.ceil((buildInventorySystemPrompt().length + buildInventoryUserContent(sc).length) / CHARS_PER_TOKEN);
    const passAOutputTokens = Math.ceil(Math.min(12_000, Math.max(1_500, sc.totalChars / 6))); // ~1 item per 60-100 chars of dense source, JSON overhead included
    const passACost = passAInputTokens * IN_PER_TOKEN + passAOutputTokens * OUT_PER_TOKEN;
    const prior = spec.priorCompileCostUsd[region.id] ?? 0.4;
    const growth = Math.max(1, unit.text.length / Math.max(1, window.length));
    // The compiler's cost is dominated by its tool-use loop, not linearly by input size: scale sublinearly, plus 15% for the accountability turn content (inventory lines + dispositions output).
    const compileProjectedRegion = prior * Math.pow(growth, 0.5) * 1.15;
    compileProjected += compileProjectedRegion;
    passAProjected += passACost;
    rows.push({
      id: region.id,
      family: region.family,
      claimIds: region.claimIds,
      window: { charStart: start, charEnd: end, chars: window.length },
      anchor: anchor ? { nodeId: anchor.nodeId, sectionRef: anchor.sectionRef, charStart: anchor.charStart, charEnd: anchor.charEnd } : null,
      sourceContext: { state: sc.state, unitChars: unit.text.length, unitExtension: unit.unitExtension ? { boundary: unit.unitExtension.unitBoundary, from: [unit.unitExtension.originalCharStart, unit.unitExtension.originalCharEnd], to: [unit.charStart, unit.charEnd] } : null, expansions: sc.regions.slice(1).map((r) => ({ sectionRef: r.sectionRef, chars: r.text.length, for: r.expandedFor?.referenceText, resolution: r.expandedFor?.resolution, truncatedAtBudget: r.truncatedAtBudget })), unresolvedReferences: sc.unresolvedReferences.map((u) => `${u.referenceText}:${u.status}`), totalChars: sc.totalChars, reasons: sc.reasons },
      projection: { passAInputTokens, passAOutputTokens, passACostUsd: Number(passACost.toFixed(3)), priorCompileCostUsd: prior, unitGrowth: Number(growth.toFixed(2)), compileCostUsd: Number(compileProjectedRegion.toFixed(3)) },
    });
  }
  const priorVerify = spec.priorTotalCostUsd - Object.values(spec.priorCompileCostUsd).reduce((a, b) => a + b, 0);
  const verifyProjected = priorVerify * 1.1;
  const perRun = compileProjected + passAProjected + verifyProjected;
  return { mode: spec.mode, regions: rows, perRun: { passA: Number(passAProjected.toFixed(2)), compile: Number(compileProjected.toFixed(2)), verify: Number(verifyProjected.toFixed(2)), total: Number(perRun.toFixed(2)) }, priorRunObservedUsd: spec.priorTotalCostUsd, twoRuns: Number((perRun * 2).toFixed(2)) };
}

async function main() {
  const freeze = readFreezeRecord();
  const compileCaller = getSemanticCaller();
  const stageCaller = getStageCaller();
  const credential = process.env.AI_GATEWAY_API_KEY ? "AI_GATEWAY_API_KEY" : process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : null;
  const health: Record<string, unknown> = { credentialPresent: credential !== null, credentialSource: credential, compiler: { provider: compileCaller.providerName, model: compileCaller.model, synthetic: compileCaller.isSynthetic }, inventoryAndVerifier: { provider: stageCaller.providerName, model: stageCaller.model, synthetic: stageCaller.isSynthetic }, ping: null as unknown };
  if (process.argv.includes("--ping")) {
    if (stageCaller.isSynthetic) health.ping = { performed: false, reason: "no real credential" };
    else {
      const started = Date.now();
      try {
        const r = await stageCaller.call(z.object({ ok: z.boolean(), echo: z.string() }), "semantic_accountability_health_ping", "You are a health check. Respond via the structured tool only.", "Return ok=true and echo the word HEALTHY.");
        const t = stageCaller.lastTelemetry();
        health.ping = { performed: true, ok: r.ok, echo: r.echo, latencyMs: Date.now() - started, costUsd: t?.calculatedCostUsd ?? null, inputTokens: t?.inputTokens ?? null, outputTokens: t?.outputTokens ?? null, model: t?.model ?? stageCaller.model };
      } catch (err) {
        health.ping = { performed: true, ok: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - started };
      }
    }
  }

  const holdout = planFor(HOLDOUT_SPEC);
  const whole = planFor(WHOLE_AGREEMENT_SPEC);
  const total = Number((holdout.twoRuns + whole.twoRuns).toFixed(2));
  const plan = {
    schemaVersion: 1,
    artifactId: "11-provider-cost-plan",
    generatedAt: new Date().toISOString(),
    productionFreeze: freeze ? { sha: freeze.SEMANTIC_ACCOUNTABILITY_PRODUCTION_SHA, treeHash: freeze.tree.treeHash } : null,
    providerHealth: health,
    method: "Zero-cost deterministic dry run: each frozen region's real source context (anchor, compilation-unit extension, cross-reference expansions) is resolved exactly as compile.ts will resolve it, so unit sizes are the true Pass A/Pass B inputs. Pass A cost = list pricing on the real prompt size; compile cost = Mission-4 observed per-region cost x sqrt(unit growth) x 1.15; verify = Mission-4 observed x 1.1.",
    plan: {
      executions: ["holdout run-1", "holdout run-2", "whole-agreement run-1", "whole-agreement run-2"],
      holdout,
      wholeAgreement: whole,
      projectedTotalUsd: total,
      recommendedCeilings: { holdoutPerRun: Number(Math.ceil(holdout.perRun.total * 1.4).toFixed(0)), wholeAgreementPerRun: Number(Math.ceil(whole.perRun.total * 1.4).toFixed(0)) },
      authorizationRequiredAbove: 12,
      authorizationRequired: total > 12,
      stopRule: "Mission section 29: no paid call is made until the user authorizes the projected total; each run stops at its ceiling and preserves what it has; a partial run is reported as partial, never rewritten.",
    },
  };
  const out = arg("--out");
  if (out) writeFileSync(out, JSON.stringify(plan, null, 2) + "\n");
  console.log(JSON.stringify({ providerHealth: health, holdout: { perRun: holdout.perRun, regions: holdout.regions.map((r) => ({ id: r.id, ...(r.sourceContext as Record<string, unknown>) })) }, wholeAgreement: { perRun: whole.perRun, regions: whole.regions.map((r) => ({ id: r.id, state: (r.sourceContext as { state: string }).state, unitChars: (r.sourceContext as { unitChars: number }).unitChars, expansions: (r.sourceContext as { expansions: unknown[] }).expansions.length })) }, projectedTotalUsd: total }, null, 2));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
