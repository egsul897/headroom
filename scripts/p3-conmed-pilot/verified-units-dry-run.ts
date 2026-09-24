/**
 * CONMED VERIFIED-UNIT DRY RUN - zero model calls.
 *
 * Exercises the exact artifact-writing path the CONMED population resume will use
 * (evidence.ts persistCandidate + VerifiedUnitManifestWriter) with a deterministic compiler result
 * and the REAL verifier driven by stub callers, then reloads what was written, adapts it into the
 * strict Phase-4 boundary and executes. Proves that one candidate now produces: forensic evidence,
 * the complete IR, the verification result, the paired verified-unit package, and the run manifest -
 * and that the persisted output is sufficient for the boundary as-is.
 *
 * No provider is contacted. Nothing under docs/ from earlier runs is touched. Forensic tooling.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { ZodType } from "zod";
import { EMPTY_RESOLVER } from "../../lib/contract-model/runtime/input-resolver";
import { evaluateVerifiedCapacity } from "../../lib/contract-model/verified-execution";
import { parseVerifiedUnitPackage, snapshotUnitsForVerification, toVerifiedExecutionPackage } from "../../lib/contract-model/verified-units";
import { persistCandidate, VerifiedUnitManifestWriter } from "./evidence";
import { ANCHOR_7_2_F, ngDefinition, ngInput, ngRule, percent } from "../../tests/contract-model/numeric-grounding-fixtures";

const stub = (response: unknown): StageCaller => ({ providerName: "stub", model: "stub", isSynthetic: true, async call<T>(schema: ZodType<T>): Promise<T> { return schema.parse(response); }, lastTelemetry: () => null });

export async function dryRun(outDir: string) {
  // one candidate: a rule with a structured PERCENT(1) capacity and a definition it could reference
  const rule = ngRule({ capacityExpression: percent(1) as never });
  const definition = ngDefinition("Subsidiary Guarantor");
  const input = ngInput({ operativeSourceText: ANCHOR_7_2_F, rules: [rule], definitions: [definition] });

  // compile (deterministic fixture) -> snapshot -> verify (real verifier, stub callers) -> persist
  const snapshot = snapshotUnitsForVerification(input.compilationResult);
  const verification = await verifyCompiledCandidate(input, { reviewCaller: stub({ findings: [], overallNotes: [] }), conditionSuspicionCaller: stub({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] }) });
  const runId = "conmed-dry-run";
  const persisted = persistCandidate({ dir: outDir, name: "dry-run-candidate", runId, compilerInput: input.compilerInput, result: input.compilationResult, verification, snapshot, run: { model: "stub", tier: 0, wallClockMs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, costStatus: "ZERO_COST_STUB", timedOut: false, notes: ["dry run; no provider contacted"] } });
  const manifestWriter = new VerifiedUnitManifestWriter(outDir, input.compilerInput.companyId, input.compilerInput.instrumentKey, runId);
  manifestWriter.add(persisted.package, persisted.verifiedUnitsPath);
  const manifestPath = manifestWriter.write();

  // reload from disk and execute through the strict boundary - no hand-built envelope, no patched identity
  const reloaded = parseVerifiedUnitPackage(fs.readFileSync(persisted.verifiedUnitsPath!, "utf8"));
  const executionPackage = toVerifiedExecutionPackage([reloaded]);
  const execution = evaluateVerifiedCapacity({ package: executionPackage, inputs: EMPTY_RESOLVER, asOf: "2026-01-01" });
  const evidence = JSON.parse(fs.readFileSync(persisted.evidencePath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  return {
    paidModelCalls: 0,
    filesWritten: [path.relative(outDir, persisted.evidencePath), path.relative(outDir, persisted.verifiedUnitsPath!), path.relative(outDir, manifestPath)],
    forensicEvidence: { schema: evidence.schema, hasRawModelOutput: "rawModelOutput" in evidence.compilation, hasToolCallLog: Array.isArray(evidence.compilation.toolCallLog), rules: evidence.compilation.rules.length, definitions: evidence.compilation.definitions.length, hasContextBundle: evidence.contextBundle !== null, verificationStatus: evidence.verification?.status ?? null, verifiedUnitsRef: evidence.verifiedUnits },
    verifiedUnitPackage: { schema: reloaded.schema, complete: reloaded.complete, counts: reloaded.counts, units: reloaded.units.map((u) => ({ id: u.ruleOrDefinitionId, kind: u.kind, identity: u.verifiedIdentity, artifactHash: u.artifactHash, findingsInResult: u.verification.findings.length })), problems: reloaded.problems, packageHash: reloaded.packageHash },
    manifest: { schema: manifest.schema, complete: manifest.complete, totals: manifest.totals, verificationStatusCounts: manifest.verificationStatusCounts },
    strictBoundary: execution.outcome === "EXECUTED"
      ? { outcome: execution.outcome, policy: execution.policy, coverage: execution.coverage, capacities: execution.state.capacities.map((c) => ({ ruleId: c.ruleId, status: c.status, limitations: c.limitations.map((l) => l.code) })) }
      : { outcome: execution.outcome, policy: execution.policy, refusals: execution.refusals },
  };
}

if (process.argv[1]?.endsWith("verified-units-dry-run.ts")) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "conmed-verified-units-dry-run-"));
  dryRun(out).then((r) => {
    const dir = "docs/phase-3-verified-units";
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "02-conmed-dry-run.json"), JSON.stringify({ mission: "HEADROOM PHASE-3 - verified unit artifact persistence", section: "§25 CONMED dry run, zero model calls", scratchDir: "(temporary, not preserved)", ...r }, null, 2));
    console.log(JSON.stringify(r, null, 1));
  });
}
