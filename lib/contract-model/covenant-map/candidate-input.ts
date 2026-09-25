/**
 * THE production builder of a candidate's compiler input. One operative-source rule (candidate-span.ts), one context
 * bundle builder (context-retrieval/pipeline.ts), one lineage resolution against the operative state. The pilot's
 * buildInput delegates here; nothing else may assemble a SemanticCompilerInput for a discovered candidate.
 */
import type { DiscoveredCandidate } from "../compiler/discovery/types";
import type { StructuralIndex } from "../compiler/structural-index";
import type { StructuralNode } from "../compiler/types";
import type { PackageGraphResult } from "../compiler/package-graph/types";
import type { AmendmentEffectCandidate, NodeSupersessionIndex, OperativeContractState, OperativeProvisionView } from "../compiler/amendment/types";
import type { CovenantContextBundle, RetrievalBudget } from "../compiler/context-retrieval/types";
import { buildCovenantContextBundle } from "../compiler/context-retrieval/pipeline";
import { resolveOperativeSource, governingProvisionFor } from "../compiler/candidate-span";
import type { OperativeLineageRef } from "../ir/types";
import { IR_SCHEMA_VERSION } from "../ir/types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION, type SemanticCompilerInput } from "../compiler/semantic/types";
import { computeSourceContentVersion } from "./source-content-version";
import type { IdentityStrength } from "./types";

export interface CandidateInputPackage {
  companyId: string;
  instrumentKey: string;
  packageKey: string;
  index: StructuralIndex;
  packageGraph: PackageGraphResult | null;
  exactTermsByDocument: Map<string, Map<string, string>>;
  operativeState: OperativeContractState | null;
  amendmentEffects: AmendmentEffectCandidate[] | null;
  supersessionIndex?: NodeSupersessionIndex;
  retrievalBudget?: RetrievalBudget;
}

export interface CandidateCompilerInputBuild {
  input: SemanticCompilerInput;
  bundle: CovenantContextBundle;
  anchorNode: StructuralNode | null;
  operativeSourceText: string;
  operativeProvision: OperativeProvisionView | null;
  sourceContentVersion: string;
  identityStrength: IdentityStrength;
}

/** The operative-state provision view that governs this candidate's anchor node, if the instrument has one. */
export function operativeProvisionFor(candidate: Pick<DiscoveredCandidate, "structuralNodeIds" | "documentId" | "normalizedSourceRef">, state: OperativeContractState | null): OperativeProvisionView | null {
  return governingProvisionFor(candidate, state);
}

export function operativeLineageFor(provision: OperativeProvisionView | null): OperativeLineageRef | null {
  if (!provision) return null;
  return { instrumentKey: provision.instrumentKey, provisionKey: provision.provisionKey, asOfDate: provision.asOfDate, operativeStatus: provision.status, currentSourceDocumentId: provision.currentSourceDocumentId };
}

/** Assembles the compiler input from an ALREADY-BUILT bundle (the pilot's entry point; the production builder below calls it). */
export function assembleCompilerInput(candidate: DiscoveredCandidate, bundle: CovenantContextBundle, pkg: Omit<CandidateInputPackage, "exactTermsByDocument" | "packageKey" | "retrievalBudget" | "supersessionIndex">): SemanticCompilerInput {
  const provision = operativeProvisionFor(candidate, pkg.operativeState);
  const source = resolveOperativeSource(candidate, pkg.index, pkg.operativeState);
  return {
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
    sourceDocumentId: candidate.documentId,
    candidateRef: candidate.discoveryId,
    sourceSectionRef: candidate.normalizedSourceRef,
    operativeSourceText: source.text,
    operativeSourceOrigin: source.origin,
    contextBundle: bundle,
    operativeLineage: operativeLineageFor(provision),
    toolAccess: { structuralIndex: pkg.index, operativeState: pkg.operativeState, packageGraph: pkg.packageGraph, amendmentEffects: pkg.amendmentEffects, contextBundle: bundle },
    irSchemaVersion: IR_SCHEMA_VERSION,
    compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
    compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
    toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
    operativeCharStart: source.origin === "STRUCTURAL_NODE" && candidate.structuralNodeIds[0] ? pkg.index.getNodeById(candidate.structuralNodeIds[0])?.charStart ?? null : null,
  };
}

export function buildCandidateCompilerInput(candidate: DiscoveredCandidate, pkg: CandidateInputPackage): CandidateCompilerInputBuild {
  const bundle = buildCovenantContextBundle(
    { candidate, packageKey: pkg.packageKey, companyId: pkg.companyId, instrumentKey: pkg.instrumentKey, budget: pkg.retrievalBudget },
    { index: pkg.index, packageGraph: pkg.packageGraph, exactTermsByDocument: pkg.exactTermsByDocument, operativeState: pkg.operativeState, supersessionIndex: pkg.supersessionIndex },
  );
  const input = assembleCompilerInput(candidate, bundle, pkg);
  const anchorId = candidate.structuralNodeIds[0] ?? null;
  const anchorNode = anchorId ? pkg.index.getNodeById(anchorId) ?? null : null;
  const provision = operativeProvisionFor(candidate, pkg.operativeState);
  const scv = computeSourceContentVersion({ documentId: candidate.documentId, structuralNodeId: anchorNode?.nodeId ?? null, operativeSourceText: input.operativeSourceText, provisionKey: provision?.provisionKey ?? null, appliedEffectIds: provision?.appliedChain.map((e) => e.effectId) ?? [] });
  return { input, bundle, anchorNode, operativeSourceText: input.operativeSourceText, operativeProvision: provision, sourceContentVersion: scv.version, identityStrength: scv.strength };
}
