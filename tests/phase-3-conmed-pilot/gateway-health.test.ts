/**
 * Guards on the quarantine rule. Its whole job is to stop a credit-exhausted gateway from
 * being written up as a model-capability finding, which has already happened more than once.
 */
import { describe, expect, it } from "vitest";
import { isCreditExhaustion, quarantineRows } from "../../scripts/p3-conmed-pilot/gateway-health";
import { evaluateGate, type ModelBakeoffResult } from "../../scripts/p3-conmed-pilot/run-bakeoff";
import type { CandidateRecord } from "../../scripts/p3-conmed-pilot/compile-run";

function rec(over: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    discoveryId: "d1", documentId: "doc", sourceSectionRef: "7.2(a)", role: "COVENANT", sourceTextHash: "h",
    sourceTextChars: 100, model: "m", tier: 1, escalated: false, escalationReason: null, status: "SUCCESS",
    failureReasons: [], rules: 1, definitions: 0, sufficiencySummary: {}, toolCalls: 1, inputTokens: 29408,
    outputTokens: 2296, attemptCount: 1, actualCostUsd: 0.001, outputHash: "o", wallClockMs: 60_000, ...over,
  };
}
function row(model: string, perCandidate: CandidateRecord[]): ModelBakeoffResult {
  const completed = perCandidate.filter((r) => r.status !== "FAILED").length;
  const base = {
    model, provider: "vercel-ai-gateway", inputPerMtok: 0.03, outputPerMtok: 0.13,
    attempted: perCandidate.length, completed, completionRate: completed / perCandidate.length,
    schemaFailures: 0, schemaFailureRate: 0, toolFailures: 0, zeroTokenStalls: 0, timeouts: 0,
    providerFailures: 0, medianWallClockMs: 0, p90WallClockMs: 0, inputTokens: 0, outputTokens: 0,
    spendUsd: 0, costPerCompletedCandidateUsd: 0, toolUseWorks: false, structuredOutputsParse: false, perCandidate,
  };
  return { ...base, ...evaluateGate(base) } as ModelBakeoffResult;
}

const refused = (i: number) => rec({ discoveryId: `d${i}`, status: "FAILED", failureReasons: ["PROVIDER_FAILURE"], inputTokens: 0, outputTokens: 0, rules: 0, toolCalls: 0, actualCostUsd: 0, wallClockMs: 1000 });
const served = (i: number) => rec({ discoveryId: `d${i}` });

describe("credit-exhaustion detection", () => {
  it("recognises a 402 by status", () => {
    expect(isCreditExhaustion(402, "anything")).toBe(true);
  });

  it("recognises the gateway's credit message even when the status is missing", () => {
    expect(isCreditExhaustion(null, "A positive credit balance is required for all requests, including BYOK")).toBe(true);
  });

  it("does not mistake an ordinary model error for a billing problem", () => {
    expect(isCreditExhaustion(400, "context length exceeded")).toBe(false);
    expect(isCreditExhaustion(500, "internal server error")).toBe(false);
  });
});

describe("row quarantine", () => {
  it("quarantines a row where the gateway served nothing at all", () => {
    const { admissible, quarantined } = quarantineRows([row("cheap/refused", Array.from({ length: 12 }, (_, i) => refused(i)))]);
    expect(admissible).toEqual([]);
    expect(quarantined[0]!.reason).toContain("measures the account and not the model");
  });

  it("quarantines a row dominated by sub-5s zero-token failures even if one candidate got through", () => {
    const cands = [served(0), ...Array.from({ length: 11 }, (_, i) => refused(i + 1))];
    const { admissible, quarantined } = quarantineRows([row("cheap/mostly-refused", cands)]);
    expect(admissible).toEqual([]);
    expect(quarantined[0]!.reason).toContain("dominated by refusals");
  });

  it("ADMITS a row of genuine model failures, because those bill tokens", () => {
    const cands = Array.from({ length: 12 }, (_, i) => rec({ discoveryId: `d${i}`, status: "FAILED", failureReasons: ["MODEL_SCHEMA_FAILURE"], rules: 0 }));
    const { admissible, quarantined } = quarantineRows([row("cheap/bad-at-schema", cands)]);
    expect(quarantined).toEqual([]);
    expect(admissible).toHaveLength(1);
  });

  it("ADMITS a row of wall-clock timeouts mixed with real completions", () => {
    const cands = [
      ...Array.from({ length: 6 }, (_, i) => served(i)),
      ...Array.from({ length: 6 }, (_, i) => rec({ discoveryId: `t${i}`, status: "FAILED", failureReasons: ["WALL_CLOCK_TIMEOUT"], inputTokens: null, outputTokens: null, rules: 0, wallClockMs: 900_000 })),
    ];
    expect(quarantineRows([row("cheap/times-out", cands)]).admissible).toHaveLength(1);
  });

  it("separates admissible from quarantined across a mixed set of rows", () => {
    const good = row("good/model", Array.from({ length: 12 }, (_, i) => served(i)));
    const bad = row("starved/model", Array.from({ length: 12 }, (_, i) => refused(i)));
    const { admissible, quarantined } = quarantineRows([good, bad]);
    expect(admissible.map((r) => r.model)).toEqual(["good/model"]);
    expect(quarantined.map((q) => q.model)).toEqual(["starved/model"]);
  });
});
