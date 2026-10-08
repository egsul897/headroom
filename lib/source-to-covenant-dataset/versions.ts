import { IR_SCHEMA_VERSION } from "../contract-model/ir/types";
import {
  SEMANTIC_COMPILER_ALGORITHM_VERSION,
  SEMANTIC_COMPILER_PROMPT_VERSION,
  SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
} from "../contract-model/compiler/semantic/types";
import {
  SEMANTIC_VERIFIER_ALGORITHM_VERSION,
  SEMANTIC_VERIFIER_PROMPT_VERSION,
} from "../contract-model/compiler/semantic-verification/types";
import { DATASET_BUILDER_VERSION, DATASET_SCHEMA_VERSION, type ToolVersionPins } from "./types";

/** Snapshot live compiler/IR/verifier version constants. Pins are provenance only. */
export function currentToolVersionPins(): ToolVersionPins {
  return {
    irSchemaVersion: IR_SCHEMA_VERSION,
    semanticCompilerAlgorithmVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION,
    semanticCompilerPromptVersion: SEMANTIC_COMPILER_PROMPT_VERSION,
    semanticCompilerToolPolicyVersion: SEMANTIC_COMPILER_TOOL_POLICY_VERSION,
    semanticVerifierAlgorithmVersion: SEMANTIC_VERIFIER_ALGORITHM_VERSION,
    semanticVerifierPromptVersion: SEMANTIC_VERIFIER_PROMPT_VERSION,
    datasetSchemaVersion: DATASET_SCHEMA_VERSION,
    datasetBuilderVersion: DATASET_BUILDER_VERSION,
    pinsAreNotLabelAuthority: true,
  };
}
