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
 * Phase 3F.1.2 - bumped whenever the structural identity/index construction
 * itself changes (a new hashed part in nodeId's construction, a change to
 * what counts as "the same occurrence") - never for a change that only
 * affects unrelated stage logic. Participates in structureOutputHash so any
 * cache/persisted artifact keyed on that hash is invalidated the moment
 * identity semantics change, rather than silently serving pre-remediation
 * structure under new-looking output.
 */
export const STRUCTURAL_INDEX_VERSION = "phase-3f1-2-structural-identity.v1";

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
  /**
   * Fully-qualified LEGAL REFERENCE, e.g. "VI", "6.01", "6.01(a)",
   * "6.01(a)(i)" - a human/legal drafting label, NOT a unique physical
   * occurrence identity (Phase 3F.1.2 correction: the same label can
   * legitimately be produced by more than one physical source location -
   * a cross-reference sentence, a table-of-contents entry, amendment-quoted
   * text - see docs/architecture/STRUCTURAL-NODE-IDENTITY-ADR.md). Kept for
   * display and for legal-reference lookup (StructuralIndex.findNodesByRef/
   * resolveUniqueNodeByRef), never as a map key for physical identity.
   */
  sectionRef: string;
  /**
   * LEGACY, non-authoritative reference key (`${documentId}::${normalized
   * sectionRef}`) - preserved for backward-compatible display/logging and
   * for StructuralIndex's deprecated singleton lookups only. Not unique:
   * two distinct physical occurrences can share the same nodeKey. Never use
   * this as physical identity in new code - use `nodeId` instead.
   * @deprecated Use `nodeId` for identity/map-key purposes; use `sectionRef`
   * for legal-reference lookup. Retained only for legacy consumers not yet
   * migrated and for human-readable logging.
   */
  nodeKey: string;
  /**
   * Phase 3F.1.2 - unique, deterministic PHYSICAL SOURCE OCCURRENCE identity
   * (documentId + nodeType + charStart, via the repo's existing
   * computeStableKey convention - see ADR "Option D"). Two physically
   * distinct occurrences can never share a nodeId, even when they share the
   * same sectionRef/nodeKey label. This is the authoritative map key for
   * every StructuralIndex lookup/traversal primitive. Stable only across
   * (identical source bytes + identical parser version) - NOT promised
   * stable across a parser algorithm change or a re-extraction (those are
   * legitimately different inputs and should mint different identities).
   */
  nodeId: string;
  /** Start of this node's own marker/heading. */
  charStart: number;
  /** End of this node's FULL owned span - own text plus every nested descendant's text (a section's char range naturally contains its lettered subsections, since they are physically nested in the source prose). Use charStart..(firstChild.charStart) for "own text only". */
  charEnd: number;
  /** Sibling order under the SAME parent (not a global index across the whole document). */
  ordinal: number;
  /**
   * LEGACY, non-authoritative parent LABEL (any level - an ARTICLE for a
   * top-level SECTION, a SECTION for a SUBSECTION, etc.), or null for a
   * top-level node with no enclosing parent. Two distinct parent
   * occurrences can share this same label. Never use for parent/child
   * ownership in new code - use `parentNodeId` instead.
   * @deprecated Use `parentNodeId` for occurrence-safe ownership.
   */
  parentSectionRef: string | null;
  /**
   * Phase 3F.1.2 - the DIRECT parent's own `nodeId` (the actual, physical
   * enclosing occurrence, determined during parsing from real nesting
   * position - never re-derived by matching parentSectionRef against a
   * label), or null for a top-level/root node with no enclosing parent.
   * This is the authoritative parent-child ownership key: a child list
   * keyed by parentNodeId can never merge children from two different
   * physical occurrences that happen to share a label.
   */
  parentNodeId: string | null;
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
