/**
 * F-4 DETERMINISTIC REPLAY of the independent verifier's Layer 1 path over the FROZEN Chewy section 6.08 artifacts,
 * now through the authenticated retrieved-evidence path (retrieved-evidence.ts). Zero model calls.
 *
 *   frozen unit-6.08.json (operative window, IR, tool-call log) + the frozen Chewy document rebuilt into a real
 *   structural index -> collectAdmissibleEvidence (independent re-resolution + authentication A-G)
 *   -> buildRetrievedEvidenceInventory -> reconcileInventories(local, ir, retrieved) -> buildFindingsFromReconciliation
 *
 * Run BEFORE (retrieved = null - the exact post-F3 path) and AFTER (retrieved evidence admitted) from the same
 * code, so the diff isolates the F-4 change; scripts/f4-replay-classify.py classifies every finding.
 *   npx tsx scripts/f4-verifier-replay.ts <before|after> <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { EMPTY_SUPERSESSION_INDEX } from "../lib/contract-model/compiler/amendment/operative-state";
import { buildSourceInventory } from "../lib/contract-model/compiler/semantic-verification/source-inventory";
import { buildIrInventory } from "../lib/contract-model/compiler/semantic-verification/ir-inventory";
import { reconcileInventories } from "../lib/contract-model/compiler/semantic-verification/reconciliation";
import { buildFindingsFromReconciliation } from "../lib/contract-model/compiler/semantic-verification/findings";
import { buildRetrievedEvidenceInventory, collectAdmissibleEvidence } from "../lib/contract-model/compiler/semantic-verification/retrieved-evidence";
import type { VerificationInput } from "../lib/contract-model/compiler/semantic-verification/types";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
const label = process.argv[2] ?? "after";
const out = process.argv[3] ?? "docs/phase-3-remediation-f4";
mkdirSync(out, { recursive: true });
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

const text = readFileSync(SRC, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), detectStructuralDefinitions("doc-a", text, nodes), detectStructuralReferences("doc-a", text, nodes));
const unit = JSON.parse(readFileSync(UNIT, "utf-8"));
const region = unit.compile.sourceContext.regions[0];
const windowText: string = region.text;
const candidateRef: string = unit.candidateRef;
const recorded = unit.verify;

const compilerInput = { companyId: "phase-3-validation-chwy", instrumentKey: "chwy-2026-revolving-credit-instrument", candidateRef, sourceDocumentId: "doc-a", sourceSectionRef: "6.08", operativeSourceText: windowText, operativeCharStart: region.charStart, toolAccess: { structuralIndex: index, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle: unit.contextBundle }, contextBundle: unit.contextBundle } as unknown as VerificationInput["compilerInput"];
const compilationResult = { rules: unit.compile.rules, definitions: unit.compile.definitions, sharedCapacities: unit.compile.sharedCapacities ?? [], toolCallLog: unit.compile.toolCallLog } as unknown as VerificationInput["compilationResult"];
const input: VerificationInput = { compilerInput, compilationResult };

const sourceInventory = buildSourceInventory(candidateRef, windowText, "doc-a", "6.08", null);
const irInventory = buildIrInventory(candidateRef, compilationResult.rules, compilationResult.definitions);
const evidence = collectAdmissibleEvidence(input, irInventory, { supersessionIndex: EMPTY_SUPERSESSION_INDEX });
const retrieved = buildRetrievedEvidenceInventory(candidateRef, evidence, compilationResult.definitions, EMPTY_SUPERSESSION_INDEX);
const reconciliation = reconcileInventories(sourceInventory, irInventory, label === "before" ? null : retrieved);
const findings = buildFindingsFromReconciliation(input, reconciliation);

const recordedDeterministic = (recorded.findings as { findingId: string; verificationMethod: string; severity: string; findingType: string; irPath: string | null; sourceEvidence: string; proposedIrEvidence: string; verifierReasoning: string }[]).filter((f) => f.verificationMethod === "DETERMINISTIC_ONLY");
const recordedSemantic = (recorded.findings as { findingId: string; verificationMethod: string; severity: string; findingType: string; irPath: string | null; ruleOrDefinitionId: string | null; sourceCitation: string; verifierReasoning: string }[]).filter((f) => f.verificationMethod !== "DETERMINISTIC_ONLY");

const summary = {
  artifact: `F-4 verifier deterministic replay (${label}) over frozen Chewy 6.08 - 0 model calls`,
  label, gitSha: execSync("git rev-parse HEAD").toString().trim(), at: new Date().toISOString(),
  inputs: { unit: UNIT, unitSha256: sha(readFileSync(UNIT)), document: SRC, documentSha256: sha(text), operativeTextChars: windowText.length, operativeTextSha256: sha(windowText), window: [region.charStart, region.charEnd], rules: compilationResult.rules.length, definitions: compilationResult.definitions.length, toolCallLogEntries: compilationResult.toolCallLog.length, toolCallLogHasRetrievedSourceRecords: compilationResult.toolCallLog.some((e) => e.retrievedSource !== undefined), operativeState: null, packageGraph: null, recordedVerifierAlgorithm: recorded.verifierAlgorithmVersion },
  evidenceSet: { localSourceHash: evidence.localSourceHash, evidenceSetHash: evidence.evidenceSetHash, packageDocumentIds: evidence.packageDocumentIds, authenticated: evidence.authenticated.map((e) => ({ evidenceId: e.evidenceId, requestKind: e.requestKind, requestKey: e.requestKey, role: e.role, representedDefinitionIds: e.representedDefinitionIds, documentId: e.documentId, documentVersion: e.documentVersion, sourceNodeId: e.sourceNodeId, sourceNodeKey: e.sourceNodeKey, charStart: e.charStart, charEnd: e.charEnd, chars: e.rawText.length, contentHash: e.contentHash, textHead: e.rawText.slice(0, 160).replace(/\s+/g, " "), duplicatesLocalWindow: e.duplicatesLocalWindow, compilerRecord: e.compilerRecord, linkage: e.linkage, checks: e.checks, numericItems: retrieved.entries.find((r) => r.evidenceId === e.evidenceId)?.items.map((i) => ({ kind: i.kind, rawText: i.rawText, numericValue: i.numericValue, currency: i.currency ?? null, documentCharStart: i.documentCharStart })) ?? null, reverseComparable: retrieved.entries.find((r) => r.evidenceId === e.evidenceId)?.reverseComparable ?? null })), rejected: evidence.rejected },
  reconciliationCounts: Object.fromEntries(["ACCOUNTED_FOR", "POSSIBLY_ACCOUNTED_FOR", "NOT_ACCOUNTED_FOR", "IR_ONLY", "AMBIGUOUS"].map((c) => [c, reconciliation.items.filter((r) => r.classification === c).length])),
  retrievedReconciliation: reconciliation.items.filter((r) => r.evidence).map((r) => ({ classification: r.classification, kind: r.sourceItem?.kind ?? null, rawText: r.sourceItem?.rawText ?? null, value: r.sourceItem?.numericValue ?? null, irPaths: r.irItems.map((i) => i.irPath), evidence: r.evidence, reason: r.reason })),
  irOnly: reconciliation.items.filter((r) => r.classification === "IR_ONLY").map((r) => ({ kind: r.irItems[0]!.kind, irPath: r.irItems[0]!.irPath, value: r.irItems[0]!.numericValue, currency: r.irItems[0]!.currency ?? null, ownerTermName: r.irItems[0]!.ownerTermName ?? null, citation: r.irItems[0]!.sourceCitation, reason: r.reason, finding: findings.find((f) => f.irPath === r.irItems[0]!.irPath && f.findingType === "UNSUPPORTED_IR_ADDITION")?.findingId ?? null })),
  findings: findings.map((f) => ({ findingId: f.findingId, findingType: f.findingType, severity: f.severity, ruleOrDefinitionId: f.ruleOrDefinitionId, irPath: f.irPath, sourceCitation: f.sourceCitation, sourceEvidence: f.sourceEvidence.slice(0, 100), proposedIrEvidence: f.proposedIrEvidence.slice(0, 100), reasoning: f.verifierReasoning })),
  materialDeterministic: findings.filter((f) => f.severity === "MATERIAL").length,
  recordedDeterministicFindings: recordedDeterministic.map((f) => ({ findingId: f.findingId, findingType: f.findingType, severity: f.severity, irPath: f.irPath, sourceEvidence: f.sourceEvidence.slice(0, 100), reasoning: f.verifierReasoning.slice(0, 200) })),
  recordedSemanticOnlyFindings: recordedSemantic.map((f) => ({ findingId: f.findingId, method: f.verificationMethod, findingType: f.findingType, severity: f.severity, ruleOrDefinitionId: f.ruleOrDefinitionId, irPath: f.irPath, sourceCitation: f.sourceCitation, reasoning: f.verifierReasoning.slice(0, 300) })),
};
writeFileSync(`${out}/replay-${label}.json`, JSON.stringify(summary, null, 1));
console.log(JSON.stringify({ label, counts: summary.reconciliationCounts, material: summary.materialDeterministic, findings: findings.length, authenticated: evidence.authenticated.map((e) => [e.requestKind, e.requestKey, e.role, e.duplicatesLocalWindow, e.rawText.length, retrieved.entries.find((r) => r.evidenceId === e.evidenceId)?.items.length ?? "dup", retrieved.entries.find((r) => r.evidenceId === e.evidenceId)?.reverseComparable]), rejected: evidence.rejected.map((r) => [r.requestKind, r.requestKey, r.claimedByCompiler, r.reason.slice(0, 120)]), retrievedRecon: summary.retrievedReconciliation.map((r) => [r.classification, r.kind, r.rawText, r.irPaths, r.evidence?.requestKey]), irOnly: summary.irOnly.map((x) => [x.kind, x.value, x.irPath]) }, null, 1));
