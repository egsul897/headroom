/**
 * F-3 DETERMINISTIC REPLAY of the independent verifier's Layer 1 path over the FROZEN Chewy section 6.08 artifacts
 * (tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json). Zero model calls.
 *
 *   source text (the exact operative region the verifier was given) -> buildSourceInventory (verifier-side parser)
 *   -> buildIrInventory (compiler-side IR values)                    -> reconcileInventories -> buildFindingsFromReconciliation
 *
 * Run BEFORE the fix (starting SHA) and AFTER; the outputs are diffed by scripts/f3-replay-classify.py. Every recorded
 * deterministic finding is reproduced from the current code, never inferred from the old report.
 *   npx tsx scripts/f3-verifier-replay.ts <label> <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { buildSourceInventory } from "../lib/contract-model/compiler/semantic-verification/source-inventory";
import { buildIrInventory } from "../lib/contract-model/compiler/semantic-verification/ir-inventory";
import { reconcileInventories } from "../lib/contract-model/compiler/semantic-verification/reconciliation";
import { buildFindingsFromReconciliation } from "../lib/contract-model/compiler/semantic-verification/findings";
import type { VerificationInput } from "../lib/contract-model/compiler/semantic-verification/types";

const UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
const label = process.argv[2] ?? "before";
const out = process.argv[3] ?? "docs/phase-3-remediation-f3";
mkdirSync(out, { recursive: true });
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

const unit = JSON.parse(readFileSync(UNIT, "utf-8"));
const text: string = unit.compile.sourceContext.regions[0].text;
const recorded = unit.verify;
const candidateRef: string = unit.candidateRef;
const compilerInput = { companyId: "phase-3-validation-chwy", instrumentKey: "chwy-2026-revolving-credit-instrument", candidateRef, sourceDocumentId: "doc-a", sourceSectionRef: "6.08", operativeSourceText: text } as unknown as VerificationInput["compilerInput"];
const compilationResult = { rules: unit.compile.rules, definitions: unit.compile.definitions, sharedCapacities: unit.compile.sharedCapacities ?? [] } as unknown as VerificationInput["compilationResult"];

const sourceInventory = buildSourceInventory(candidateRef, text, "doc-a", "6.08", null);
const irInventory = buildIrInventory(candidateRef, compilationResult.rules, compilationResult.definitions);
const reconciliation = reconcileInventories(sourceInventory, irInventory);
const findings = buildFindingsFromReconciliation({ compilerInput, compilationResult }, reconciliation);

const numericSource = sourceInventory.items.filter((i) => i.kind === "AMOUNT" || i.kind === "PERCENT" || i.kind === "RATIO");
const irNumeric = irInventory.items.filter((i) => i.kind === "AMOUNT" || i.kind === "PERCENT" || i.kind === "RATIO");
const recordedNumeric = (recorded.sourceInventory.items as { kind: string; rawText: string; numericValue: number | null; charStart: number }[]).filter((i) => i.kind === "AMOUNT" || i.kind === "PERCENT" || i.kind === "RATIO");
const recordedDeterministic = (recorded.findings as { findingId: string; verificationMethod: string; severity: string; findingType: string; irPath: string | null; sourceEvidence: string; proposedIrEvidence: string }[]).filter((f) => f.verificationMethod === "DETERMINISTIC_ONLY");

// Trace every scaled/currency source value through the path.
const trace = numericSource.map((i) => {
  const rec = reconciliation.items.find((r) => r.sourceItem?.itemId === i.itemId);
  const ext = i as unknown as Record<string, unknown>;
  return {
    kind: i.kind, rawText: i.rawText, charStart: i.charStart, charEnd: i.charEnd,
    sourceExcerpt: text.slice(Math.max(0, i.charStart - 60), Math.min(text.length, i.charEnd + 40)).replace(/\s+/g, " "),
    parsedAmount: ext.parsedAmount ?? null, scaleToken: ext.scaleToken ?? null, scaleMultiplier: ext.scaleMultiplier ?? null, currency: ext.currency ?? null, scaleStatus: ext.scaleStatus ?? null,
    verifierCanonicalValue: i.numericValue,
    compilerSideValuesCompared: [...new Set(irNumeric.filter((x) => x.kind === i.kind).map((x) => x.numericValue))].sort((a, b) => (a ?? 0) - (b ?? 0)),
    classification: rec?.classification ?? "(none)", reason: rec?.reason ?? null,
    finding: (() => { const f = findings.find((f) => f.sourceEvidence === i.rawText && f.verifierReasoning === rec?.reason); return f ? { findingId: f.findingId, findingType: f.findingType, severity: f.severity } : null; })(),
  };
});
const irOnly = reconciliation.items.filter((r) => r.classification === "IR_ONLY").map((r) => ({ kind: r.irItems[0]!.kind, irPath: r.irItems[0]!.irPath, value: r.irItems[0]!.numericValue, currency: (r.irItems[0] as unknown as Record<string, unknown>).currency ?? null, reason: r.reason, finding: findings.find((f) => f.irPath === r.irItems[0]!.irPath && f.findingType === "UNSUPPORTED_IR_ADDITION")?.findingId ?? null }));

const summary = {
  artifact: `F-3 verifier deterministic replay (${label}) over frozen Chewy 6.08 - 0 model calls`,
  label, gitSha: execSync("git rev-parse HEAD").toString().trim(), at: new Date().toISOString(),
  inputs: { unit: UNIT, unitSha256: sha(UNIT), operativeTextChars: text.length, operativeTextSha256: createHash("sha256").update(text).digest("hex"), rules: compilationResult.rules.length, definitions: compilationResult.definitions.length, verifierOperativeSource: unit.verifierOperativeSource, recordedVerifierAlgorithm: recorded.verifierAlgorithmVersion },
  reproduction: {
    sourceNumericItemsMatchRecorded: JSON.stringify(numericSource.map((i) => [i.kind, i.rawText, i.numericValue, i.charStart])) === JSON.stringify(recordedNumeric.map((i) => [i.kind, i.rawText, i.numericValue, i.charStart])),
    recordedSourceNumeric: recordedNumeric.map((i) => ({ kind: i.kind, rawText: i.rawText, numericValue: i.numericValue, charStart: i.charStart })),
    reconciliationCounts: Object.fromEntries(["ACCOUNTED_FOR", "POSSIBLY_ACCOUNTED_FOR", "NOT_ACCOUNTED_FOR", "IR_ONLY", "AMBIGUOUS"].map((c) => [c, reconciliation.items.filter((r) => r.classification === c).length])),
    recordedReconciliationCounts: Object.fromEntries(["ACCOUNTED_FOR", "POSSIBLY_ACCOUNTED_FOR", "NOT_ACCOUNTED_FOR", "IR_ONLY", "AMBIGUOUS"].map((c) => [c, (recorded.reconciliation.items as { classification: string }[]).filter((r) => r.classification === c).length])),
    materialUnresolvedCount: reconciliation.materialUnresolvedCount, recordedMaterialUnresolvedCount: recorded.reconciliation.materialUnresolvedCount,
    deterministicFindings: findings.length, recordedDeterministicFindings: recordedDeterministic.length,
    deterministicFindingIdsIdenticalToRecorded: JSON.stringify(findings.map((f) => f.findingId).sort()) === JSON.stringify(recordedDeterministic.map((f) => f.findingId).sort()),
    materialDeterministic: findings.filter((f) => f.severity === "MATERIAL").length, recordedMaterialDeterministic: recordedDeterministic.filter((f) => f.severity === "MATERIAL").length,
  },
  irNumericValues: { AMOUNT: [...new Set(irNumeric.filter((x) => x.kind === "AMOUNT").map((x) => x.numericValue))].sort((a, b) => (a ?? 0) - (b ?? 0)), PERCENT: [...new Set(irNumeric.filter((x) => x.kind === "PERCENT").map((x) => x.numericValue))].sort((a, b) => (a ?? 0) - (b ?? 0)), RATIO: [...new Set(irNumeric.filter((x) => x.kind === "RATIO").map((x) => x.numericValue))].sort((a, b) => (a ?? 0) - (b ?? 0)) },
  trace,
  irOnly,
  findings: findings.map((f) => ({ findingId: f.findingId, findingType: f.findingType, severity: f.severity, irPath: f.irPath, sourceEvidence: f.sourceEvidence.slice(0, 80), proposedIrEvidence: f.proposedIrEvidence.slice(0, 80), reasoning: f.verifierReasoning })),
  recordedFindings: (recorded.findings as { findingId: string; verificationMethod: string; severity: string; findingType: string; irPath: string | null; sourceEvidence: string; proposedIrEvidence: string; verifierReasoning: string }[]).map((f) => ({ findingId: f.findingId, method: f.verificationMethod, findingType: f.findingType, severity: f.severity, irPath: f.irPath, sourceEvidence: f.sourceEvidence.slice(0, 80), proposedIrEvidence: (f.proposedIrEvidence ?? "").slice(0, 80), reasoning: (f.verifierReasoning ?? "").slice(0, 200) })),
};
writeFileSync(`${out}/replay-${label}.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ label, reproduction: summary.reproduction, trace: trace.filter((t) => t.kind === "AMOUNT"), irOnly: irOnly.map((x) => [x.kind, x.value, x.irPath]) }, null, 1));
