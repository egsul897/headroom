/**
 * F-4 DIAGNOSIS - reproduces, through the code at the starting SHA and the frozen Chewy artifacts only (0 model calls),
 * the chain behind the two post-F3 deterministic findings attributed to compiler-retrieved source:
 *   original document -> 6.08 verifier window -> compiler getDefinition("Threshold Amount") -> tool log -> IR definition
 *   -> verifier source inventory (local window only) -> IR_ONLY findings for MONEY(324000000) / PERCENT(0.45).
 *   npx tsx scripts/f4-diagnosis.ts <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { resolveOperativeDefinitionEvidence, resolveUniqueDefinitionByRef } from "../lib/contract-model/compiler/amendment/operative-state";
import { buildSourceInventory } from "../lib/contract-model/compiler/semantic-verification/source-inventory";
import { buildIrInventory } from "../lib/contract-model/compiler/semantic-verification/ir-inventory";
import { reconcileInventories } from "../lib/contract-model/compiler/semantic-verification/reconciliation";
import { buildFindingsFromReconciliation } from "../lib/contract-model/compiler/semantic-verification/findings";
import type { VerificationInput } from "../lib/contract-model/compiler/semantic-verification/types";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
const out = process.argv[2] ?? "docs/phase-3-remediation-f4";
mkdirSync(out, { recursive: true });
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const text = readFileSync(SRC, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), detectStructuralDefinitions("doc-a", text, nodes), detectStructuralReferences("doc-a", text, nodes));
const unit = JSON.parse(readFileSync(UNIT, "utf-8"));
const region = unit.compile.sourceContext.regions[0];
const windowText: string = region.text;
const candidateRef: string = unit.candidateRef;

// Verifier BEFORE: local window only (exactly verify.ts's Layer 1 path).
const compilerInput = { companyId: "phase-3-validation-chwy", instrumentKey: "chwy-2026-revolving-credit-instrument", candidateRef, sourceDocumentId: "doc-a", sourceSectionRef: "6.08", operativeSourceText: windowText } as unknown as VerificationInput["compilerInput"];
const compilationResult = { rules: unit.compile.rules, definitions: unit.compile.definitions } as unknown as VerificationInput["compilationResult"];
const sourceInventory = buildSourceInventory(candidateRef, windowText, "doc-a", "6.08", null);
const irInventory = buildIrInventory(candidateRef, compilationResult.rules, compilationResult.definitions);
const reconciliation = reconcileInventories(sourceInventory, irInventory);
const findings = buildFindingsFromReconciliation({ compilerInput, compilationResult }, reconciliation);
const irOnly = reconciliation.items.filter((r) => r.classification === "IR_ONLY");

// The retrieved term: linkage from the frozen tool log + the compiled definition.
const logEntries = (unit.compile.toolCallLog as { toolName: string; input: { term?: string; ref?: string }; outputSummary: string; charsReturned: number }[]);
const defEntry = logEntries.find((e) => e.toolName === "getDefinition" && e.input.term === "Threshold Amount")!;
const irDef = (unit.compile.definitions as { termName: string; definitionId: string; provenance: unknown; calculationExpression: unknown; sufficiency: string }[]).find((d) => d.termName === "Threshold Amount")!;
const defIndex = (unit.compile.definitions as { termName: string }[]).findIndex((d) => d.termName === "Threshold Amount");

// Independent location of the authentic definition in the frozen document (the verifier's own allowed input: the structural index).
const resolution = resolveOperativeDefinitionEvidence({ index, operativeState: null, term: "Threshold Amount", searchDocumentIds: ["doc-a"] });
const located = resolveUniqueDefinitionByRef(index, "doc-a", "Threshold Amount");
const def = located.status === "UNIQUE" ? located.definition : null;
const fullText = def ? index.getDefinitionFullText(def.exactTerm, "doc-a") ?? "" : "";
const defStart = def?.charStart ?? -1;
const defEnd = def ? def.charStart + fullText.length : -1;
const outsideWindow = def ? defEnd <= region.charStart || defStart >= region.charEnd : null;
const defInventory = buildSourceInventory(candidateRef, fullText, "doc-a", `definition:${def?.exactTerm ?? "?"}`, null);
const defNumeric = defInventory.items.filter((i) => i.kind === "AMOUNT" || i.kind === "PERCENT" || i.kind === "RATIO").map((i) => ({ kind: i.kind, rawText: i.rawText, numericValue: i.numericValue, currency: (i as unknown as { currency?: string }).currency ?? null, charStartInDefinition: i.charStart }));

const f4Findings = irOnly.filter((r) => r.irItems[0]!.irPath.startsWith(`definitions[${defIndex}]`)).map((r) => {
  const f = findings.find((x) => x.irPath === r.irItems[0]!.irPath && x.findingType === "UNSUPPORTED_IR_ADDITION")!;
  const ir = r.irItems[0]!;
  const supporting = defNumeric.find((v) => v.kind === ir.kind && v.numericValue === ir.numericValue) ?? null;
  return {
    findingId: f.findingId, severity: f.severity, findingType: f.findingType, irPath: ir.irPath, irKind: ir.kind, irValue: ir.numericValue, irCurrency: (ir as unknown as { currency?: string }).currency ?? null,
    sourceTerm: "Threshold Amount",
    supportingSourceText: supporting ? supporting.rawText : null, supportingSourceInDefinition: supporting,
    documentId: "doc-a", documentVersion: "base document (never amended; operativeState null in the frozen run)", sourceNodeId: def?.sourceNodeId ?? null, sourceNodeKey: def?.sourceNodeKey ?? null, definitionSpan: [defStart, defEnd], definitionTextSha256: sha(fullText),
    outsideVerifierLocalWindow: outsideWindow, verifierWindow: [region.charStart, region.charEnd],
    compilerRetrieval: { toolName: defEntry.toolName, input: defEntry.input, outputSummary: defEntry.outputSummary, charsReturned: defEntry.charsReturned, note: "resolveOperativeDefinitionEvidence -> base-document branch -> index.getDefinitionFullText; the tool returned the text to the model" },
    provenanceSurvivingToday: { toolCallLog: "outputSummary + charsReturned only - no raw text, no documentId, no node, no span, no hash (ToolCallLogEntry doc: 'never the full raw text')", irProvenance: irDef.provenance, note: "the IR provenance is a compiler-written excerpt with sourceNodeKey null and a free-text citation - a compiler claim, not an authenticated location" },
    whyVerifierCannotAuthenticateToday: "verify.ts builds the source inventory from compilerInput.operativeSourceText only (the 6.08 window); it never resolves the terms the IR depends on against its own allowed input (toolAccess.structuralIndex / operativeState), and nothing in its input carries an authenticated retrieved-source record - so the definition's figures exist nowhere in its evidence set",
    resultingFinding: `${f.severity} ${f.findingType}: ${f.verifierReasoning}`,
  };
});

const record = {
  artifact: "F-4 diagnosis + reproduction through starting-SHA code over frozen Chewy 6.08 artifacts (0 model calls)",
  gitSha: execSync("git rev-parse HEAD").toString().trim(),
  inputs: { unitSha256: sha(readFileSync(UNIT, "utf-8")), documentSha256: sha(text), windowSha256: sha(windowText), windowChars: windowText.length },
  reproducedPostF3State: { deterministicFindings: findings.length, material: findings.filter((f) => f.severity === "MATERIAL").length, irOnly: irOnly.map((r) => ({ kind: r.irItems[0]!.kind, value: r.irItems[0]!.numericValue, irPath: r.irItems[0]!.irPath })) },
  retrievedDefinition: { term: "Threshold Amount", resolution: { outcome: resolution.outcome, status: (resolution as { status?: string }).status ?? null, source: (resolution as { source?: string }).source ?? null, isCurrentTruth: (resolution as { isCurrentTruth?: boolean }).isCurrentTruth ?? null, documentId: (resolution as { documentId?: string }).documentId ?? null }, located: def ? { documentId: def.documentId, exactTerm: def.exactTerm, sourceNodeId: def.sourceNodeId, sourceNodeKey: def.sourceNodeKey, charStart: defStart, charEnd: defEnd, textChars: fullText.length, textSha256: sha(fullText), textHead: fullText.slice(0, 200).replace(/\s+/g, " ") } : null, outsideVerifierLocalWindow: outsideWindow, numericValuesInDefinition: defNumeric, irExcerptClaim: irDef.provenance, irExcerptMatchesLocatedTextAfterWhitespaceNormalization: fullText.replace(/\s+/g, " ").includes(String((irDef.provenance as { excerpt?: string }).excerpt ?? "").replace(/\s+/g, " ")) },
  f4Findings,
  earliestDefect: { classification: "A. RETRIEVED_SOURCE_PROVENANCE_NOT_RECORDED", module: "lib/contract-model/compiler/semantic/tools.ts :: getDefinition.execute -> ToolCallLogger.run (ToolCallLogEntry)", detail: "the retrieval resolves the authentic text (resolveOperativeDefinitionEvidence) but records only outputSummary/charsReturned; documentId, node, span, raw text and content hash are discarded, and the IR keeps only a compiler-written excerpt with sourceNodeKey null. Downstream, C. VERIFIER_INPUT_EXCLUDES_AUTHENTICATED_RETRIEVED_SOURCE (verify.ts inventories compilerInput.operativeSourceText only) is the consequence: even with a provenance record the verifier had no path to admit authenticated outside-window source." },
  toolLog: logEntries,
};
writeFileSync(`${out}/00-diagnosis-and-reproduction.json`, JSON.stringify(record, null, 1));
console.log(JSON.stringify({ reproduced: record.reproducedPostF3State, located: record.retrievedDefinition.located, outsideWindow, defNumeric, f4: f4Findings.map((f) => [f.findingId.slice(0, 8), f.irKind, f.irValue, f.supportingSourceText]), earliest: record.earliestDefect.classification }, null, 1));
