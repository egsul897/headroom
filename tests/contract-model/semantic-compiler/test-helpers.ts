/** Shared minimal fixtures for Phase 3B semantic-compiler tests - never a real network call, never real package evidence (grounded fixtures live in the real-regression scripts, not here). */
import type { CovenantContextBundle } from "../../../lib/contract-model/compiler/context-retrieval/types";
import type { SemanticCompilerInput, SemanticToolAccess } from "../../../lib/contract-model/compiler/semantic/types";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, SEMANTIC_COMPILER_PROMPT_VERSION, SEMANTIC_COMPILER_TOOL_POLICY_VERSION } from "../../../lib/contract-model/compiler/semantic/types";
import { IR_SCHEMA_VERSION } from "../../../lib/contract-model/ir/types";
import type { StructuralIndex } from "../../../lib/contract-model/compiler/structural-index";

export const TEST_COMPANY_ID = "sem-test-co";
export const TEST_INSTRUMENT_KEY = "sem-test-instrument";
export const TEST_DOCUMENT_ID = "sem-test-doc";

export function emptyContextBundle(overrides: Partial<CovenantContextBundle> = {}): CovenantContextBundle {
  return {
    bundleId: "bundle-1",
    packageKey: "pkg-1",
    companyId: TEST_COMPANY_ID,
    instrumentKey: TEST_INSTRUMENT_KEY,
    originatingDocumentId: TEST_DOCUMENT_ID,
    originatingDiscoveryId: "discovery-1",
    originatingStructuralNodeKeys: [],
    normalizedSourceRef: "9.01",
    originatingFamilies: [],
    items: [],
    edges: [],
    unresolvedDependencies: [],
    retrievalAlgorithmVersion: "test-v1",
    semanticPromptVersion: null,
    providerIdentity: null,
    contentIdentity: "content-1",
    sufficiencyState: "SUFFICIENT",
    stopReasons: [],
    performance: {
      itemsConsidered: 0,
      itemsRetained: 0,
      duplicatePathsDeduplicated: 0,
      maxDefinitionDepthReached: 0,
      maxCrossReferenceDepthReached: 0,
      crossReferenceTraversals: 0,
      crossDocumentLeads: 0,
      deterministicWallClockMs: 0,
      semanticWallClockMs: 0,
      semanticCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
    ...overrides,
  };
}

function stubStructuralIndex(): StructuralIndex {
  return {
    getNode: () => undefined,
    getNodeByRef: () => undefined,
    getChildren: () => [],
    getParent: () => undefined,
    getAncestors: () => [],
    getSiblings: () => [],
    getDescendants: () => [],
    getDefinition: () => undefined,
    getDefinitionFullText: () => undefined,
    allDefinitions: () => [],
    findReferencesFrom: () => [],
    findReferencesTo: () => [],
    getNodeText: () => "",
    searchStructuralNodes: () => [],
    allNodes: () => [],
    getDocumentText: () => undefined,
  };
}

export function testCompilerInput(overrides: Partial<SemanticCompilerInput> = {}): SemanticCompilerInput {
  const contextBundle = overrides.contextBundle ?? emptyContextBundle();
  const toolAccess: SemanticToolAccess = overrides.toolAccess ?? {
    structuralIndex: stubStructuralIndex(),
    operativeState: null,
    packageGraph: null,
    amendmentEffects: null,
    contextBundle,
  };
  return {
    companyId: TEST_COMPANY_ID,
    instrumentKey: TEST_INSTRUMENT_KEY,
    sourceDocumentId: TEST_DOCUMENT_ID,
    candidateRef: "candidate-1",
    sourceSectionRef: "9.01",
    operativeSourceText: "(test operative text)",
    contextBundle,
    operativeLineage: null,
    toolAccess,
    irSchemaVersion: IR_SCHEMA_VERSION,
    compilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
    compilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
    toolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
    ...overrides,
  };
}
