/**
 * Track E offline replay. Stored CONMED §7.5(a) wire through the current
 * normalizer and Layer 1 verifier. No model call. Soft gate.
 *
 * The structural index is the semantic-compiler test stub. Gate binding and
 * the "Section 7.5" invented-reference classification do not consult it.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ContextItem, CovenantContextBundle } from "../lib/contract-model/compiler/context-retrieval/types";
import { normalizeSubmission } from "../lib/contract-model/compiler/semantic/normalize";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION } from "../lib/contract-model/compiler/semantic/types";
import type { SemanticCompilationResult, SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";
import type { SubmitCompilationInput } from "../lib/contract-model/compiler/semantic/wire-schema";
import { verifyCompiledCandidate } from "../lib/contract-model/compiler/semantic-verification/verify";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION } from "../lib/contract-model/compiler/semantic-verification/types";
import { IR_SCHEMA_VERSION, type IRExpression } from "../lib/contract-model/ir/types";
import { validateRule } from "../lib/contract-model/ir/validate";
import { emptyContextBundle, testCompilerInput } from "../tests/contract-model/semantic-compiler/test-helpers";

const EVIDENCE = "docs/phase-3-conmed-population-verified/run-original/evidence/discovery-candidate:baca43714b8502cc9c596c23.json";
const OUT = "docs/p3-track-e-conmed-75a-missing-condition-rerun-62a40be.json";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function walk(expr: IRExpression | null, out: { kind: string; sourceEvidence?: string; type?: string | null; requiredReview?: boolean }[]): void {
  if (!expr) return;
  if (expr.kind === "UNSUPPORTED") {
    out.push({ kind: expr.kind, sourceEvidence: expr.sourceEvidence, type: expr.type, requiredReview: expr.requiredReview });
    return;
  }
  if (expr.kind === "AND" || expr.kind === "OR") {
    out.push({ kind: expr.kind });
    for (const op of expr.operands) walk(op, out);
    return;
  }
  out.push({ kind: expr.kind });
}

async function main(): Promise<void> {
  const evidenceBytes = fs.readFileSync(EVIDENCE);
  const evidence = JSON.parse(evidenceBytes.toString("utf8"));
  const operative = evidence.compilerInput.operativeSourceText as string;
  const items: ContextItem[] = (evidence.contextBundle.items as Array<Record<string, unknown>>).map((item) => ({
    itemId: String(item.itemId),
    type: item.type as ContextItem["type"],
    documentId: evidence.compilerInput.sourceDocumentId as string,
    structuralNodeKey: null,
    structuralNodeId: null,
    normalizedRef: String(item.normalizedRef),
    sourceCitation: String(item.normalizedRef),
    excerptText: String(item.excerptText),
    reason: "stored evidence replay",
    retrievalDepth: 0,
    retrievalPath: [],
    retrievalMethod: "STRUCTURAL_TRAVERSAL",
    confidence: null,
    evidenceState: item.evidenceState as ContextItem["evidenceState"],
  }));
  const contextBundle: CovenantContextBundle = emptyContextBundle({
    bundleId: evidence.contextBundle.bundleId,
    companyId: evidence.compilerInput.companyId,
    instrumentKey: evidence.compilerInput.instrumentKey,
    originatingDocumentId: evidence.compilerInput.sourceDocumentId,
    originatingDiscoveryId: evidence.candidateRef,
    normalizedSourceRef: evidence.compilerInput.sourceSectionRef,
    sufficiencyState: evidence.contextBundle.sufficiencyState,
    items,
    edges: evidence.contextBundle.edges,
  });
  const stub = testCompilerInput().toolAccess.structuralIndex;
  const input: SemanticCompilerInput = testCompilerInput({
    companyId: evidence.compilerInput.companyId,
    instrumentKey: evidence.compilerInput.instrumentKey,
    sourceDocumentId: evidence.compilerInput.sourceDocumentId,
    candidateRef: evidence.candidateRef,
    sourceSectionRef: evidence.compilerInput.sourceSectionRef,
    operativeSourceText: operative,
    contextBundle,
    operativeLineage: null,
    irSchemaVersion: IR_SCHEMA_VERSION,
    compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
    compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
    toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
    toolAccess: { structuralIndex: stub, operativeState: null, packageGraph: null, amendmentEffects: null, contextBundle },
  });
  const submission = evidence.compilation.rawModelOutput as SubmitCompilationInput;
  const normalized = normalizeSubmission(submission, input);
  const rule = normalized.rules[0]!;
  const gateTree: { kind: string; sourceEvidence?: string; type?: string | null; requiredReview?: boolean }[] = [];
  const gatedBy = rule.capacityExpression && rule.capacityExpression.kind === "UNLIMITED_CAPACITY" ? rule.capacityExpression.gatedBy : null;
  walk(gatedBy, gateTree);
  const validation = validateRule(rule);
  const compilation = {
    status: "REVIEW_REQUIRED",
    failureReasons: ["SEMANTIC_ACCOUNTABILITY_INCOMPLETE"],
    errorDetail: null,
    rules: normalized.rules,
    definitions: normalized.definitions,
    sharedCapacities: normalized.sharedCapacities,
    irExtensionCandidates: normalized.irExtensionCandidates,
    unresolvedIssues: normalized.warnings.map((w) => w.message),
    toolCallLog: [],
    inputHasUnresolvedOperativeEvidence: false,
    rawModelOutput: submission,
    provider: "replay",
    model: "stored-wire",
    telemetry: null,
    compiledAt: new Date(0).toISOString(),
  } as unknown as SemanticCompilationResult;
  const verification = await verifyCompiledCandidate({ compilerInput: input, compilationResult: compilation }, { skipSemanticReview: true });
  const summary = {
    tip: "62a40be22b9598d9732e9ce2574d86d2228d6270",
    evidencePath: EVIDENCE,
    evidenceSha256: sha256(evidenceBytes.toString("utf8")),
    operativeSha256: sha256(operative),
    operativeChars: operative.length,
    storedCompilerAlgorithmVersion: evidence.compilerInput.compilerAlgorithmVersion,
    storedCompilerPromptVersion: evidence.compilerInput.compilerPromptVersion,
    replayCompilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
    replayCompilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
    verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION,
    structuralIndex: "tests/contract-model/semantic-compiler/test-helpers.ts stub",
    semanticReview: "skipped (skipSemanticReview: true). No provider call.",
    ruleCount: normalized.rules.length,
    ruleId: rule.ruleId,
    sufficiency: rule.sufficiency,
    sufficiencyReasons: rule.sufficiencyReasons,
    conditions: rule.conditions.map((c) => ({
      conditionId: c.conditionId,
      conditionType: c.conditionType,
      expression: c.expression,
      excerpt: c.provenance?.excerpt ?? null,
      excerptResolutionStatus: c.provenance?.excerptResolution?.status ?? null,
      excerptSourceKind: c.provenance?.excerptResolution?.sourceKind ?? null,
      charStart: c.provenance?.excerptResolution?.charStart ?? null,
      charEnd: c.provenance?.excerptResolution?.charEnd ?? null,
      description: c.description,
      inventoryItemIds: c.inventoryItemIds ?? [],
    })),
    capacityKind: rule.capacityExpression?.kind ?? null,
    gatedByKind: gatedBy?.kind ?? null,
    gateTree,
    falseCompleteness: validation.issues.filter((i) => i.kind === "FALSE_COMPLETENESS").map((i) => i.message),
    warnings: normalized.warnings.map((w) => ({ kind: w.kind, message: w.message })),
    sourceReferenceAudit: rule.sourceReferenceAudit ?? null,
    entityScopeAuditStatus: rule.entityScopeAudit?.status ?? null,
    dependsOn: rule.dependsOn,
    unresolvedDependencies: rule.unresolvedDependencies ?? [],
    definitionCount: normalized.definitions.length,
    verification: {
      status: verification.status,
      semanticReviewInvoked: verification.semanticReviewInvoked,
      semanticReviewSkippedReason: verification.semanticReviewSkippedReason,
      contextBundleSufficiencyState: evidence.contextBundle.sufficiencyState,
      findings: verification.findings.map((f) => ({
        findingType: f.findingType,
        severity: f.severity,
        verificationMethod: f.verificationMethod,
        irPath: f.irPath,
      })),
      reconciliationMaterialUnresolvedCount: verification.reconciliation.materialUnresolvedCount,
      reconciliationItemCount: verification.reconciliation.items.length,
      sourceInventorySupersessionStatus: verification.sourceInventory.supersessionStatus,
      sourceInventoryItems: verification.sourceInventory.items.map((i) => ({ kind: i.kind, rawText: i.rawText })),
      irInventory: verification.irInventory.items.map((i) => ({ kind: i.kind, irPath: i.irPath, textValue: i.textValue })),
      qualitativeVerdict: verification.qualitativeLineage?.units.map((u) => ({ unitId: u.unitId, verdict: u.verdict, grounded: u.grounded, ungrounded: u.ungrounded })) ?? [],
      qualitativeMaterialUngrounded: verification.qualitativeLineage?.materialUngrounded ?? null,
    },
  };
  const outPath = path.resolve(OUT);
  fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${outPath}\n`);
  process.stdout.write(`${JSON.stringify({
    sufficiency: summary.sufficiency,
    excerpts: summary.conditions.map((c) => c.excerpt),
    gatedByKind: summary.gatedByKind,
    verificationStatus: summary.verification.status,
    findingCount: summary.verification.findings.length,
  })}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
