/**
 * §14 - harness evidence preservation, and the secret-leak assertion that guards it.
 *
 * The 7.2(f) forensic mission could not name the stage that first emitted an unsupported "100%"
 * because the run's artifact kept a summary row and discarded `rawModelOutput` and `toolCallLog` -
 * fields the compiler result already carried. These tests assert the fields are now preserved, and
 * that preserving MORE never becomes a channel for leaking a credential.
 */
import { describe, expect, it } from "vitest";
import { assertNoSecrets, buildCandidateEvidence, scanForSecrets, SECRET_PATTERNS } from "../../scripts/p3-conmed-pilot/evidence";
import { caseA_unsupportedProsePercentage } from "../contract-model/numeric-grounding-fixtures";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { ZodType } from "zod";

const stub = (response: unknown): StageCaller => ({ providerName: "t", model: "t", isSynthetic: false, async call<T>(schema: ZodType<T>): Promise<T> { return schema.parse(response); }, lastTelemetry: () => null });
const run = { model: "test-model", tier: 1, wallClockMs: 1000, inputTokens: 10, outputTokens: 5, costUsd: 0, costStatus: "EXACT", timedOut: false, notes: [] };

/** Built from parts so this test file does not itself contain a literal credential-shaped string. */
const fakeGatewayKey = ["vck", "_", "AbCdEfGhIjKlMnOpQrSt"].join("");
const fakeProviderKey = ["sk", "-ant-", "AbCdEfGhIjKlMnOpQrSt"].join("");

describe("§14 - evidence preservation", () => {
  it("preserves raw model output, the tool call log, the full parsed IR, the definitions and the compiler input", () => {
    const { compilerInput, compilationResult } = caseA_unsupportedProsePercentage();
    const withOutput = { ...compilationResult, rawModelOutput: { content: [{ type: "text", text: "the model's verbatim answer" }] }, toolCallLog: [{ toolName: "getDefinition", input: { term: "X" }, outputSummary: "ok", charsReturned: 10, timestamp: "2026-01-01T00:00:00.000Z", evidenceUnresolved: false, evidenceTruncated: false }] };
    const evidence = buildCandidateEvidence(compilerInput, withOutput, null, run);

    expect(evidence.compilation.rawModelOutput).toEqual({ content: [{ type: "text", text: "the model's verbatim answer" }] });
    expect(evidence.compilation.toolCallLog).toHaveLength(1);
    expect(evidence.compilation.rules).toHaveLength(1);
    expect((evidence.compilation.rules as { conditions: { description: string }[] }[])[0]!.conditions[0]!.description).toContain("100%");
    expect(evidence.compilerInput.operativeSourceText.length).toBeGreaterThan(0);
    expect(evidence.compilerInput.operativeSourceTextSha256).toHaveLength(64);
    expect(evidence.contextBundle).not.toBeNull();
    expect(evidence.verification).toBeNull();
  });

  it("preserves the verifier result, including the numeric-grounding findings", async () => {
    const input = caseA_unsupportedProsePercentage();
    const verification = await verifyCompiledCandidate(input, { reviewCaller: stub({ findings: [], overallNotes: [] }), conditionSuspicionCaller: stub({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] }) });
    const evidence = buildCandidateEvidence(input.compilerInput, input.compilationResult, verification, run);

    expect(evidence.verification?.status).toBe(verification.status);
    expect(evidence.verification?.numericAssertions).not.toBeNull();
    expect(JSON.stringify(evidence.verification?.findings)).toContain("UNSUPPORTED_NUMERIC_ASSERTION");
    expect(JSON.stringify(evidence.verification?.reconciliation)).toContain("UNGROUNDED");
  });

  it("never serializes the live tool-access handles (a StructuralIndex is a capability, not evidence)", () => {
    const { compilerInput, compilationResult } = caseA_unsupportedProsePercentage();
    const body = JSON.stringify(buildCandidateEvidence(compilerInput, compilationResult, null, run));
    expect(body).not.toContain("toolAccess");
    expect(body).not.toContain("structuralIndex");
    expect(body.length).toBeLessThan(2_000_000);
  });

  it("detects every credential shape it guards against", () => {
    expect(SECRET_PATTERNS.length).toBeGreaterThanOrEqual(6);
    for (const body of [fakeGatewayKey, fakeProviderKey, '{"authorization":"Bearer x"}', '{"x-api-key":"x"}', "AI_GATEWAY_API_KEY=abcdefghijkl"]) {
      expect(scanForSecrets(body).length, body.slice(0, 20)).toBeGreaterThan(0);
    }
    expect(scanForSecrets(JSON.stringify({ note: "no credentials here", amount: 150000000 }))).toHaveLength(0);
  });

  it("REFUSES to write rather than redacting - a key that was written and then cleaned is still leaked", () => {
    expect(() => assertNoSecrets(JSON.stringify({ env: { AI_GATEWAY_API_KEY: fakeGatewayKey } }), "artifact.json")).toThrow(/refusing to write/);
    expect(() => assertNoSecrets(JSON.stringify({ rules: [] }), "artifact.json")).not.toThrow();
  });

  it("a real evidence record, built with a credential present in the environment, carries no credential", () => {
    const previous = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = fakeGatewayKey;
    try {
      const { compilerInput, compilationResult } = caseA_unsupportedProsePercentage();
      const body = JSON.stringify(buildCandidateEvidence(compilerInput, compilationResult, null, run));
      expect(scanForSecrets(body)).toHaveLength(0);
    } finally {
      if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = previous;
    }
  });
});
