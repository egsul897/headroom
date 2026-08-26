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

/**
 * Structural node the STRUCTURE stage produces (task §8/§9; widened in
 * Phase 2A, docs/phase-2a-structural-index.md, to the full nested
 * DocumentNodeType taxonomy - ARTICLE/SECTION/SUBSECTION/CLAUSE/SUBCLAUSE -
 * previously a deliberate v1 scope bound covering only ARTICLE/SECTION).
 */
export interface StructuralNode {
  documentId: string;
  nodeType: "ARTICLE" | "SECTION" | "SUBSECTION" | "CLAUSE" | "SUBCLAUSE";
  heading: string;
  /** Fully-qualified ref, e.g. "VI", "6.01", "6.01(a)", "6.01(a)(i)" - never a bare marker alone for nested levels, so it can be compared directly against a rule's own sourceSectionRef citation style. */
  sectionRef: string;
  /** Document-scoped exact structural identity (`${documentId}::${normalized sectionRef}`) - the stable identity the task asks for, independent of DB persistence and never derived from fuzzy string matching. */
  nodeKey: string;
  /** Start of this node's own marker/heading. */
  charStart: number;
  /** End of this node's FULL owned span - own text plus every nested descendant's text (a section's char range naturally contains its lettered subsections, since they are physically nested in the source prose). Use charStart..(firstChild.charStart) for "own text only". */
  charEnd: number;
  /** Sibling order under the SAME parent (not a global index across the whole document). */
  ordinal: number;
  /** The DIRECT parent's own sectionRef (any level - an ARTICLE for a top-level SECTION, a SECTION for a SUBSECTION, etc.), or null for a top-level node with no enclosing parent. */
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
