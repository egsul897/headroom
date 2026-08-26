/**
 * Phase C compiler shared types (docs/phase-c-contract-compiler-v1.md).
 * One stage function per ContractCompilerStageKind; the orchestrator
 * (orchestrator.ts) is the only caller of these, and is the only place that
 * persists ContractCompilerStage rows - stage modules return a plain
 * result, they never touch ContractCompilerStage themselves.
 */
import type { ContractCompilerStageStatus } from "@prisma/client";
import type { AnalyzerCallTelemetry } from "../analyzer/telemetry";

export interface CompilerDocumentInput {
  documentId: string;
  /** Short, human-meaningful label (e.g. "Credit Agreement", "Indenture") - never a company/document name baked into any prompt string, only used for structuring bounded context. */
  label: string;
  text: string;
}

export interface CompilerPackageInput {
  companyId: string;
  packageKey: string;
  documents: CompilerDocumentInput[];
}

/** What every stage function returns - the orchestrator maps this onto a persisted ContractCompilerStage row. */
export interface StageRunResult<TOutput> {
  status: ContractCompilerStageStatus;
  output: TOutput;
  provider?: string;
  model?: string;
  telemetry?: AnalyzerCallTelemetry | null;
  error?: string;
  /** Human-readable reasons a stage is BLOCKED/REVIEW_REQUIRED rather than COMPLETED - never silent (task §74/§75). */
  notes?: string[];
}

/** Structural node the STRUCTURE stage produces (task §8/§9) - a coarser granularity than the full DocumentNodeType taxonomy (ARTICLE/SECTION only, not SUBSECTION/CLAUSE/PROVISO), a deliberate v1 scope bound, see docs/phase-c-contract-compiler-v1.md's own disclosed limitation. */
export interface StructuralNode {
  documentId: string;
  nodeType: "ARTICLE" | "SECTION";
  heading: string;
  sectionRef: string;
  charStart: number;
  charEnd: number;
  ordinal: number;
  parentSectionRef: string | null;
}

export type ProvisionInventoryClass = "MATERIAL_RULE_CANDIDATE" | "DEFINITION" | "QUALITATIVE_OBLIGATION" | "BOILERPLATE_NOT_APPLICABLE" | "UNCERTAIN" | "UNHANDLED";

export interface ProvisionInventoryItem {
  sourceSectionRef: string;
  documentId: string;
  classification: ProvisionInventoryClass;
  /** Best-guess CovenantFamily where classification is MATERIAL_RULE_CANDIDATE - a real enum member or null, never invented text (task §13). */
  covenantFamilyGuess: string | null;
  summary: string;
}
