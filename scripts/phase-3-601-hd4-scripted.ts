/**
 * HD-4 certification collaborators: a scripted (never networked) Pass-A provider over the synthetic I35 scenario,
 * shaped like Section 6.01 (6 ordinary batches + 1 gap call per pass at batchChars 600). Shared by the SIGKILL
 * crash child, its parent certification, and the vitest matrix so every proof drives the same fake provider.
 */
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { AnalyzerCallTelemetry } from "../lib/contract-model/analyzer/telemetry";
import { CORPUS } from "../tests/contract-model/semantic-accountability/corpus";
import { buildScenario, scriptedWireItems, DOC_ID, type BuiltScenario } from "../tests/contract-model/semantic-accountability/harness";

export const HD4_SCENARIO_ID = "I35";
export const HD4_BATCH_CHARS = 600;
export const HD4_DOC_ID = DOC_ID;
export const scenario = CORPUS.find((s) => s.id === HD4_SCENARIO_ID)!;
/** Omitted on ordinary batches so the deterministic coverage check opens a gap and the production gap call fires. */
export const OMIT_ON_FIRST_PASS = new Set([scenario.items[5]!.ref, scenario.items[12]!.ref]);

export function buildHd4Scenario(): Promise<BuiltScenario> { return buildScenario(scenario); }

export interface ScriptedPassAOptions { delayMs?: number; model?: string; onCall?: (stage: string) => void }
/** Content-aware scripted provider: returns exactly the ground-truth items whose excerpts appear in the batch it was shown. */
export function scriptedPassACaller(opts: ScriptedPassAOptions = {}): StageCaller & { calls: number } {
  const all = scriptedWireItems(scenario.items);
  const norm = (t: string) => t.replace(/\s+/g, " ");
  let last: AnalyzerCallTelemetry | null = null;
  const model = opts.model ?? "scripted-inventory";
  const self = { calls: 0, providerName: "scripted", model, isSynthetic: false,
    async call<T>(_s: unknown, stage: string, _sys: string, user: string): Promise<T> {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      self.calls++; opts.onCall?.(stage);
      const items = all.filter((i) => norm(user).includes(norm(i.excerpt)) && (stage === "semantic_inventory_gap" || !OMIT_ON_FIRST_PASS.has(i.localRef)));
      last = { provider: "scripted", model, promptVersion: "p", schemaVersion: "s", stage, timestamp: new Date().toISOString(), inputTokens: user.length, outputTokens: items.length * 40, cachedInputTokens: 0, cacheCreationInputTokens: 0, attemptCount: 1, retryCount: 0, rateLimitFailures: 0, latencyMs: opts.delayMs ?? 0, providerCost: undefined, calculatedCostUsd: 0.001 * ((user.length % 100) + 1) };
      return { items, overallNotes: [] } as unknown as T;
    }, lastTelemetry: () => last };
  return self;
}

// `calls` (P3-E14 per-call execution records) is execution telemetry, not frozen content - stripped like frozenAt.
export const stripVolatile = (v: unknown): unknown => Array.isArray(v) ? v.map(stripVolatile) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !["frozenAt", "verifiedAt", "at", "timestamp", "createdAt", "compiledAt", "calls"].includes(k)).map(([k, x]) => [k, stripVolatile(x)])) : v;
