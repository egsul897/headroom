/**
 * Covenant Dependency Atlas — schema (offline dataset workstream).
 *
 * Directed, typed, source-backed edges among provisions and definitions.
 * Does NOT alter the production dependency resolver or compiler.
 * Legal dependency is never asserted from bare textual similarity.
 */

import { z } from "zod";

export const ATLAS_SCHEMA_VERSION = "covenant-dependency-atlas.v1" as const;
export const KF_EXPORT_SCHEMA_VERSION = "knowledge-factory.dependency-dataset.v1" as const;

/** Edge kinds required by the Covenant Dependency Atlas mission. */
export const DEPENDENCY_EDGE_KINDS = [
  "COVENANT_TO_DEFINITION",
  "DEFINITION_TO_DEFINITION",
  "COVENANT_TO_CONDITION",
  "COVENANT_TO_EXCEPTION",
  "COVENANT_TO_AMENDMENT",
  "COVENANT_TO_SHARED_BASKET",
  "COVENANT_TO_CROSS_DOCUMENT",
  "ENTITY_SCOPE",
  "RATIO_CALCULATION",
  "FINANCIAL_INPUT",
  "RECLASSIFICATION",
] as const;

export type DependencyEdgeKind = (typeof DEPENDENCY_EDGE_KINDS)[number];

export const NODE_KINDS = [
  "COVENANT",
  "DEFINITION",
  "CONDITION",
  "EXCEPTION",
  "BASKET",
  "SHARED_BASKET",
  "AMENDMENT",
  "FINANCIAL_TEST",
  "FINANCIAL_INPUT",
  "ENTITY_SCOPE_RULE",
  "CROSS_DOCUMENT_TARGET",
  "EVENT_OF_DEFAULT",
  "OTHER_OPERATIVE",
  "UNRESOLVED_TARGET",
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

/** How the edge was established — never STRING_SIMILARITY / TERM_CO_OCCURRENCE alone. */
export const EVIDENCE_CLASSES = [
  /** Explicit legal relationship recorded in authored ground-truth notes. */
  "EXPLICIT_GROUND_TRUTH_NOTE",
  /** Inventory-declared keyDefinedTerms / unitType pairing in ground truth. */
  "GROUND_TRUTH_INVENTORY_DECLARATION",
  /** Source text carries an explicit legal connective (as defined in / subject to / …). */
  "EXPLICIT_SOURCE_CONNECTIVE",
  /** Hand-authored relationship with cited source span. */
  "AUTHORED_SOURCE_SPAN",
  /** Structural unit-type adjacency (e.g. EXCEPTION unit under a COVENANT section). */
  "STRUCTURAL_UNIT_RELATION",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const RESOLUTION_STATUSES = ["RESOLVED", "UNRESOLVED", "AMBIGUOUS"] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const ConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const SourceSpanSchema = z.object({
  documentId: z.string(),
  sourceFile: z.string().nullable(),
  sectionRef: z.string().nullable(),
  unitId: z.string().nullable(),
  charStart: z.number().int().nonnegative().nullable(),
  charEnd: z.number().int().nonnegative().nullable(),
  excerpt: z.string().nullable(),
});
export type SourceSpan = z.infer<typeof SourceSpanSchema>;

export const AtlasNodeSchema = z.object({
  nodeId: z.string(),
  kind: z.enum(NODE_KINDS),
  documentId: z.string(),
  label: z.string(),
  sectionRef: z.string().nullable(),
  unitId: z.string().nullable(),
  termName: z.string().nullable(),
  materiality: z.string().nullable(),
  notes: z.string().nullable(),
});
export type AtlasNode = z.infer<typeof AtlasNodeSchema>;

export const AtlasEdgeSchema = z.object({
  edgeId: z.string(),
  kind: z.enum(DEPENDENCY_EDGE_KINDS),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  resolution: z.enum(RESOLUTION_STATUSES),
  confidence: ConfidenceSchema,
  evidenceClass: z.enum(EVIDENCE_CLASSES),
  /** Human-readable, source-backed justification — never "terms look similar". */
  rationale: z.string().min(1),
  sourceSpans: z.array(SourceSpanSchema).min(1),
  /** Optional unresolved / ambiguous detail preserved for downstream review. */
  unresolvedReason: z.string().nullable(),
  /** Optional shared-basket / pool identity when kind is COVENANT_TO_SHARED_BASKET. */
  sharedBasketKey: z.string().nullable(),
  /** Optional financial-input key when kind is FINANCIAL_INPUT. */
  financialInputKey: z.string().nullable(),
});
export type AtlasEdge = z.infer<typeof AtlasEdgeSchema>;

export const GraphMotifSchema = z.object({
  motifId: z.string(),
  motifType: z.enum(["DIAMOND_SHARED_DEPENDENCY", "GENUINE_CYCLE"]),
  /** Diamonds need ≥2 nodes; genuine self-loop cycles may be a single node. */
  nodeIds: z.array(z.string()).min(1),
  /** Self-loop cycles may carry a single edge id. */
  edgeIds: z.array(z.string()).min(1),
  explanation: z.string(),
});
export type GraphMotif = z.infer<typeof GraphMotifSchema>;

export const CompletenessBucketSchema = z.object({
  kind: z.enum(DEPENDENCY_EDGE_KINDS),
  expectedMinimum: z.number().int().nonnegative(),
  observedResolved: z.number().int().nonnegative(),
  observedUnresolved: z.number().int().nonnegative(),
  observedAmbiguous: z.number().int().nonnegative(),
  missingOrThin: z.boolean(),
  notes: z.string(),
});
export type CompletenessBucket = z.infer<typeof CompletenessBucketSchema>;

export const DocumentCompletenessReportSchema = z.object({
  documentId: z.string(),
  sourceFile: z.string().nullable(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  resolvedEdgeCount: z.number().int().nonnegative(),
  unresolvedEdgeCount: z.number().int().nonnegative(),
  ambiguousEdgeCount: z.number().int().nonnegative(),
  buckets: z.array(CompletenessBucketSchema),
  diamondCount: z.number().int().nonnegative(),
  cycleCount: z.number().int().nonnegative(),
  completenessScore: z.number().min(0).max(1),
  gaps: z.array(z.string()),
});
export type DocumentCompletenessReport = z.infer<typeof DocumentCompletenessReportSchema>;

export const AtlasDocumentSchema = z.object({
  documentId: z.string(),
  sourceFile: z.string().nullable(),
  packageId: z.string(),
  nodes: z.array(AtlasNodeSchema),
  edges: z.array(AtlasEdgeSchema),
  motifs: z.array(GraphMotifSchema),
  completeness: DocumentCompletenessReportSchema,
});
export type AtlasDocument = z.infer<typeof AtlasDocumentSchema>;

export const AtlasDatasetSchema = z.object({
  schemaVersion: z.literal(ATLAS_SCHEMA_VERSION),
  generatedAt: z.string(),
  paidInference: z.literal(false),
  productionResolverTouched: z.literal(false),
  methodology: z.string(),
  packages: z.array(
    z.object({
      packageId: z.string(),
      documents: z.array(AtlasDocumentSchema),
    }),
  ),
  totals: z.object({
    documents: z.number().int().nonnegative(),
    nodes: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    ambiguous: z.number().int().nonnegative(),
    diamonds: z.number().int().nonnegative(),
    cycles: z.number().int().nonnegative(),
  }),
});
export type AtlasDataset = z.infer<typeof AtlasDatasetSchema>;

/** Knowledge-factory compatible export: flat nodes/edges + motifs + completeness. */
export const KnowledgeFactoryExportSchema = z.object({
  schemaVersion: z.literal(KF_EXPORT_SCHEMA_VERSION),
  atlasSchemaVersion: z.literal(ATLAS_SCHEMA_VERSION),
  generatedAt: z.string(),
  paidInference: z.literal(false),
  merges: z.literal(false),
  certificationChanges: z.literal(false),
  productionResolverTouched: z.literal(false),
  nodes: z.array(AtlasNodeSchema),
  edges: z.array(AtlasEdgeSchema),
  motifs: z.array(GraphMotifSchema),
  completenessReports: z.array(DocumentCompletenessReportSchema),
  unresolvedRelationships: z.array(
    z.object({
      edgeId: z.string(),
      kind: z.enum(DEPENDENCY_EDGE_KINDS),
      fromNodeId: z.string(),
      toNodeId: z.string(),
      resolution: z.enum(["UNRESOLVED", "AMBIGUOUS"]),
      unresolvedReason: z.string().nullable(),
      rationale: z.string(),
    }),
  ),
  counts: z.object({
    nodes: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
    byKind: z.record(z.string(), z.number().int().nonnegative()),
    byResolution: z.record(z.string(), z.number().int().nonnegative()),
    diamonds: z.number().int().nonnegative(),
    cycles: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    ambiguous: z.number().int().nonnegative(),
  }),
});
export type KnowledgeFactoryExport = z.infer<typeof KnowledgeFactoryExportSchema>;

export function edgeIdOf(kind: DependencyEdgeKind, fromNodeId: string, toNodeId: string, disambiguator = ""): string {
  const base = `${kind}::${fromNodeId}::${toNodeId}`;
  return disambiguator ? `${base}::${disambiguator}` : base;
}

export function nodeIdForUnit(documentId: string, unitId: string): string {
  return `node:${documentId}:unit:${unitId}`;
}

export function nodeIdForTerm(documentId: string, termName: string): string {
  return `node:${documentId}:term:${termName.toLowerCase().replace(/\s+/g, "_")}`;
}

export function nodeIdForFinancialInput(key: string): string {
  return `node:financial_input:${key}`;
}

export function nodeIdForCrossDocument(targetLabel: string): string {
  return `node:cross_document:${targetLabel.toLowerCase().replace(/\s+/g, "_")}`;
}

export function nodeIdForUnresolved(documentId: string, label: string): string {
  return `node:${documentId}:unresolved:${label.toLowerCase().replace(/\s+/g, "_")}`;
}
