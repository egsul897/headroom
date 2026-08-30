/**
 * Phase 3C Layer 2 - the adversarial semantic reviewer's own orchestration.
 * A single bounded, schema-forced call (reusing lib/contract-model/compiler/llm-caller.ts's
 * provider-abstract StageCaller/getStageCaller - a generic, covenant-
 * agnostic call primitive already used across this codebase, NOT the
 * compiler's own tool-use loop) - matching North Star §9's own "pre-bound
 * context is the right V1 pattern until a real case demonstrably needs
 * live tool-calling" precedent: this reviewer receives the full source
 * text, context bundle, proposed IR, and deterministic signals up front,
 * exactly as task §12 specifies, rather than a tool-use loop built before
 * any real case has shown pre-bound context is insufficient.
 *
 * Deliberately does NOT import lib/contract-model/compiler/semantic/caller.ts
 * (the compiler's own tool-use loop) or lib/contract-model/compiler/semantic/compile.ts
 * - enforced by tests/contract-model/semantic-verification-independence.test.ts.
 */
import { getStageCaller, type StageCaller } from "../llm-caller";
import { buildVerifierFewShotExamplesBlock, buildVerifierSystemPrompt } from "./prompt";
import { computeSemanticVerificationFindingId } from "./identity";
import { SubmitVerificationFindingsSchema, type WireVerificationFinding } from "./wire-schema";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, SEMANTIC_VERIFIER_PROMPT_VERSION } from "./types";
import type { ReconciliationResult, SemanticVerificationFinding, SemanticVerificationFindingType, SemanticVerificationSeverity, VerificationInput } from "./types";
import type { AnalyzerCallTelemetry } from "../../analyzer/telemetry";

const VALID_FINDING_TYPES: SemanticVerificationFindingType[] = [
  "MISSING_RULE",
  "MISSING_BASKET",
  "MISSING_EXCEPTION",
  "MISSING_CONDITION",
  "MISSING_PROVISO",
  "MISSING_SHARED_CAP",
  "MISSING_RECLASSIFICATION",
  "MISSING_DEPENDENCY",
  "MISSING_DEFINITION_EFFECT",
  "WRONG_AMOUNT",
  "WRONG_PERCENT",
  "WRONG_RATIO",
  "WRONG_METRIC",
  "WRONG_FORMULA",
  "WRONG_LOGIC",
  "WRONG_ACTION",
  "WRONG_POSTURE",
  "WRONG_ENTITY_SCOPE",
  "WRONG_TRANSACTION_SCOPE",
  "WRONG_DEPENDENCY",
  "UNSUPPORTED_IR_ADDITION",
  "PROVENANCE_MISMATCH",
  "POSSIBLE_DUPLICATE_RULE",
  "POSSIBLE_RULE_MERGE_ERROR",
  "POSSIBLE_RULE_SPLIT_ERROR",
  "VERIFICATION_CONTEXT_INCOMPLETE",
  "OTHER_MATERIAL_SEMANTIC_DISCREPANCY",
];
const VALID_SEVERITIES: SemanticVerificationSeverity[] = ["MATERIAL", "NON_MATERIAL", "UNCERTAIN"];

/** Tolerant enum matching (exact, then upper-snake-case) - the same Phase 2F.2 lesson semantic/normalize.ts's own matchEnum applies, reimplemented locally (never imported from semantic/normalize.ts, which is off-limits per the Independence Contract) since it is a generic few-line utility, not compiler reasoning. */
function matchEnum<T extends string>(raw: string, valid: readonly T[], fallback: T): T {
  if ((valid as readonly string[]).includes(raw)) return raw as T;
  const upperSnake = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if ((valid as readonly string[]).includes(upperSnake)) return upperSnake as T;
  return fallback;
}

function summarizeReconciliationForPrompt(reconciliation: ReconciliationResult): string {
  const relevant = reconciliation.items.filter((i) => i.classification !== "ACCOUNTED_FOR" && i.classification !== "POSSIBLY_ACCOUNTED_FOR");
  if (relevant.length === 0) return "(none - the deterministic pass found no unresolved numeric or structural discrepancy)";
  return relevant.map((i) => `- [${i.classification}] ${i.reason}`).join("\n");
}

function buildUserContent(input: VerificationInput, reconciliation: ReconciliationResult): string {
  const { compilerInput, compilationResult } = input;
  const contextItemsSummary = compilerInput.contextBundle.items.map((i) => `- [${i.itemId}] (${i.type}, ${i.sourceCitation}): ${i.excerptText}`).join("\n") || "(none)";
  const unresolvedSummary = compilerInput.contextBundle.unresolvedDependencies.map((u) => `- ${u.dependencyType} (${u.severity}): ${u.reason}`).join("\n") || "(none)";
  const proposedIr = {
    rules: compilationResult.rules.map((r) => ({ ruleId: r.ruleId, sourceSectionRef: r.sourceSectionRef, action: r.action, posture: r.posture, capacityExpression: r.capacityExpression, conditions: r.conditions, exceptions: r.exceptions, dependsOn: r.dependsOn, entityScope: r.entityScope, entityScopeExcluded: r.entityScopeExcluded, sufficiency: r.sufficiency })),
    definitions: compilationResult.definitions.map((d) => ({ definitionId: d.definitionId, termName: d.termName, calculationExpression: d.calculationExpression, dependsOnTerms: d.dependsOnTerms, sufficiency: d.sufficiency })),
  };

  return [
    `Operative source text (${compilerInput.sourceSectionRef ?? "no section ref"}):`,
    compilerInput.operativeSourceText,
    "",
    compilerInput.operativeLineage
      ? `Operative-state status: ${compilerInput.operativeLineage.operativeStatus} (as of ${compilerInput.operativeLineage.asOfDate}).`
      : "Operative-state status: this provision was never amended (no operative lineage).",
    "",
    "Retrieved context items:",
    contextItemsSummary,
    "",
    "Unresolved dependencies Phase 2 already flagged:",
    unresolvedSummary,
    "",
    "PROPOSED IR (what you are checking - do not trust this merely because it is well-formed JSON):",
    JSON.stringify(proposedIr, null, 2),
    "",
    "Deterministic discrepancy signals from an independent, non-AI pass (investigate each, do not merely rubber-stamp):",
    summarizeReconciliationForPrompt(reconciliation),
  ].join("\n");
}

export interface SemanticReviewResult {
  findings: SemanticVerificationFinding[];
  overallNotes: string[];
  provider: string;
  model: string;
  telemetry: AnalyzerCallTelemetry | null;
  failed: boolean;
  failureDetail: string | null;
  /**
   * Phase 3F.1.6.RX Workstream E precision fix. True when this result came
   * from the no-credential SyntheticStageCaller fallback (llm-caller.ts) -
   * a Zod-defaults stub with no genuine reading of the source text at all -
   * rather than a real (or a test's scripted stand-in for a real) reviewer.
   * verify.ts uses this to make sure a stub's inevitable empty findings
   * array is never mistaken for an independent adversarial confirmation
   * that nothing is wrong; only a genuine review's silence carries that
   * weight.
   */
  isSynthetic: boolean;
}

function normalizeWireFinding(wire: WireVerificationFinding, input: VerificationInput, provider: string, model: string): SemanticVerificationFinding {
  const { compilerInput } = input;
  const findingType = matchEnum(wire.findingType, VALID_FINDING_TYPES, "OTHER_MATERIAL_SEMANTIC_DISCREPANCY");
  const severity = matchEnum(wire.severity, VALID_SEVERITIES, "UNCERTAIN");
  const sourceCitation = wire.sourceCitation || compilerInput.sourceSectionRef || "(unknown)";

  return {
    findingId: computeSemanticVerificationFindingId(compilerInput.companyId, compilerInput.instrumentKey, compilerInput.candidateRef, findingType, wire.ruleOrDefinitionId, wire.irPath, sourceCitation, SEMANTIC_VERIFIER_ALGORITHM_VERSION),
    companyId: compilerInput.companyId,
    instrumentKey: compilerInput.instrumentKey,
    sourceDocumentId: compilerInput.sourceDocumentId,
    candidateRef: compilerInput.candidateRef,
    ruleOrDefinitionId: wire.ruleOrDefinitionId,
    irPath: wire.irPath,
    findingType,
    severity,
    sourceEvidence: wire.sourceEvidence,
    sourceCitation,
    proposedIrEvidence: wire.proposedIrEvidence,
    verifierReasoning: wire.reasoning,
    deterministicSignals: [],
    verificationMethod: "SEMANTIC_ONLY",
    provider,
    model,
    verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION,
    verifierPromptVersion: SEMANTIC_VERIFIER_PROMPT_VERSION,
    resolutionStatus: "OPEN",
    createdAt: new Date().toISOString(),
  };
}

export async function runAdversarialSemanticReview(input: VerificationInput, reconciliation: ReconciliationResult, caller: StageCaller = getStageCaller()): Promise<SemanticReviewResult> {
  const systemPrompt = buildVerifierSystemPrompt({ verifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION, verifierPromptVersion: SEMANTIC_VERIFIER_PROMPT_VERSION }) + "\n\n" + buildVerifierFewShotExamplesBlock();
  const userContent = buildUserContent(input, reconciliation);

  try {
    const wireResult = await caller.call(SubmitVerificationFindingsSchema, "semantic_verification", systemPrompt, userContent);
    const findings = wireResult.findings.map((f) => normalizeWireFinding(f, input, caller.providerName, caller.model));
    return { findings, overallNotes: wireResult.overallNotes, provider: caller.providerName, model: caller.model, telemetry: caller.lastTelemetry(), failed: false, failureDetail: null, isSynthetic: caller.isSynthetic };
  } catch (err) {
    return { findings: [], overallNotes: [], provider: caller.providerName, model: caller.model, telemetry: caller.lastTelemetry(), failed: true, failureDetail: err instanceof Error ? err.message : String(err), isSynthetic: caller.isSynthetic };
  }
}
