/**
 * Phase 3F.1.6.RX Workstream H (AUDIT-F1) - domain types for durable
 * semantic-truth persistence. See prisma/schema.prisma's own
 * SemanticTruthRecord/SemanticTruthTrustStatus doc comments for the full
 * design rationale, and
 * docs/phase-3f1-6-rx-final-blocker-closure/09-semantic-truth-persistence-design.json
 * for the design writeup.
 */
import type { SemanticTruthKind, SemanticTruthTrustStatus } from "@prisma/client";
import type { IRDefinition, IRRule } from "../../ir/types";
import type { SemanticVerificationResult } from "../../compiler/semantic-verification/types";

export type { SemanticTruthKind, SemanticTruthTrustStatus };

/** Bounded summary of one SemanticVerificationFinding - never the full finding's raw proposedIrEvidence/deterministicSignals dump (this model's own schema comment). */
export interface SemanticTruthFindingSummary {
  findingId: string;
  findingType: string;
  severity: string;
  sourceCitation: string;
  verifierReasoning: string;
}

/** Algorithm/prompt/tool version provenance for one compiled candidate - reused verbatim from the real SemanticCompilerInput the orchestrator already built for this candidate (never re-derived or paraphrased from the IRRule/IRDefinition object itself, which only carries a single generic `compilerVersion` string, not the individual algorithm/prompt/tool-policy axes). */
export interface SemanticTruthCompilerVersions {
  irSchemaVersion: string;
  compilerAlgorithmVersion: string;
  compilerPromptVersion: string;
  toolPolicyVersion: string;
}

/** One semantic object (an IRRule or IRDefinition) awaiting durable persistence, paired with the verification result for the candidate it was compiled from (null when verification never ran for that candidate at all - a real, disclosed "compiled but unchecked" state). */
export interface SemanticTruthObjectInput {
  kind: SemanticTruthKind;
  object: IRRule | IRDefinition;
  candidateRef: string | null;
  compilerVersions: SemanticTruthCompilerVersions;
  verification: SemanticVerificationResult | null;
  /** SEMANTIC_VERIFIER_PROMPT_VERSION at the time verification ran - SemanticVerificationResult itself carries `verifierAlgorithmVersion` but not a top-level prompt version (only per-finding), so the orchestrator passes the same global constant it already imports. Null when `verification` is null. */
  verifierPromptVersion: string | null;
}

export interface PersistSemanticTruthInput {
  companyId: string;
  packageKey: string | null;
  instrumentKey: string;
  analysisRunId: string | null;
  objects: SemanticTruthObjectInput[];
}

export interface PersistSemanticTruthSummary {
  upserted: number;
  unchanged: number;
  byTrustStatus: Record<SemanticTruthTrustStatus, number>;
}
