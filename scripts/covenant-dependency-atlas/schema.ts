/**
 * Covenant Dependency Atlas — schema (v2 / Phase 2).
 *
 * Directed, typed, source-backed edges among provisions and definitions.
 * Does NOT alter the production dependency resolver or compiler.
 * Legal dependency is never asserted from bare textual similarity.
 *
 * Phase 2: multi-metric completeness (never inventory coverage as legal
 * completeness), root-cause classification on unresolved/ambiguous edges,
 * and node-identity reconciliation for KF export.
 */

import { z } from "zod";

export const ATLAS_SCHEMA_VERSION = "covenant-dependency-atlas.v2" as const;
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

/** Priority legal-relationship kinds for Phase 2 expansion coverage. */
export const PRIORITY_EDGE_KINDS = [
  "RECLASSIFICATION",
  "ENTITY_SCOPE",
  "COVENANT_TO_SHARED_BASKET",
  "COVENANT_TO_CROSS_DOCUMENT",
  "RATIO_CALCULATION",
  "FINANCIAL_INPUT",
  "COVENANT_TO_CONDITION",
  "COVENANT_TO_AMENDMENT",
] as const;

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
  "SECTION",
] as const;

export type NodeKind = (typeof NODE_KINDS)[number];

export const EVIDENCE_CLASSES = [
  "EXPLICIT_GROUND_TRUTH_NOTE",
  "GROUND_TRUTH_INVENTORY_DECLARATION",
  "EXPLICIT_SOURCE_CONNECTIVE",
  "AUTHORED_SOURCE_SPAN",
  "STRUCTURAL_UNIT_RELATION",
  /** Structural-index adapter: definition occurrence inside a section body. */
  "STRUCTURAL_DEFINITION_OCCURRENCE",
  /** Structural-index adapter: typed cross-reference with legal connective. */
  "STRUCTURAL_CROSS_REFERENCE",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const RESOLUTION_STATUSES = ["RESOLVED", "UNRESOLVED", "AMBIGUOUS"] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const ROOT_CAUSE_CODES = [
  "MISSING_DEFINITION",
  "MISSING_EXTERNAL_DOCUMENT",
  "AMENDMENT_TARGET_RESOLUTION",
  "STRUCTURAL_PARSING_FAILURE",
  "AMBIGUOUS_REFERENCE",
  "ENTITY_SCOPE_UNCERTAINTY",
  "INCORRECT_CANDIDATE_EDGE",
  "OTHER",
] as const;

export type RootCauseCode = (typeof ROOT_CAUSE_CODES)[number];

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
  rationale: z.string().min(1),
  sourceSpans: z.array(SourceSpanSchema).min(1),
  unresolvedReason: z.string().nullable(),
  sharedBasketKey: z.string().nullable(),
  financialInputKey: z.string().nullable(),
  /** Phase 2: root-cause classification for unresolved/ambiguous edges. */
  rootCause: z.enum(ROOT_CAUSE_CODES).nullable(),
  /** true when a controlling-restriction concealment risk is plausible. */
  controllingRestrictionRisk: z.boolean().default(false),
});
export type AtlasEdge = z.infer<typeof AtlasEdgeSchema>;

export const GraphMotifSchema = z.object({
  motifId: z.string(),
  motifType: z.enum(["DIAMOND_SHARED_DEPENDENCY", "GENUINE_CYCLE"]),
  nodeIds: z.array(z.string()).min(1),
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
  /** Phase 2: always gap when priority kind has zero edges, even if expectedMinimum is 0. */
  priorityGap: z.boolean(),
  notes: z.string(),
});
export type CompletenessBucket = z.infer<typeof CompletenessBucketSchema>;

/**
 * Phase 2 multi-metric completeness — NEVER a single "legal completeness" score.
 * The deprecated `completenessScore` field is retained as inventoryCoverage only
 * for backward compatibility and is explicitly NOT legal-semantic verification.
 */
export const CompletenessMetricsSchema = z.object({
  inventoryCoverage: z.number().min(0).max(1),
  edgeDiscoveryCoverage: z.number().min(0).max(1),
  edgeResolutionRate: z.number().min(0).max(1),
  sourceProvenanceCoverage: z.number().min(0).max(1),
  dependencyTypeCoverage: z.number().min(0).max(1),
  /** Always null/0 until independent legal review — never auto-asserted. */
  legalSemanticVerification: z.literal(0),
  legalSemanticVerificationStatus: z.literal("NOT_PERFORMED"),
});
export type CompletenessMetrics = z.infer<typeof CompletenessMetricsSchema>;

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
  /** @deprecated Phase 1 field — equals metrics.inventoryCoverage; NOT legal completeness. */
  completenessScore: z.number().min(0).max(1),
  metrics: CompletenessMetricsSchema,
  gaps: z.array(z.string()),
});
export type DocumentCompletenessReport = z.infer<typeof DocumentCompletenessReportSchema>;

export const AtlasDocumentSchema = z.object({
  documentId: z.string(),
  sourceFile: z.string().nullable(),
  packageId: z.string(),
  extractionMode: z.enum(["GROUND_TRUTH_ASSISTED", "STRUCTURAL_INDEX_ONLY"]).default("GROUND_TRUTH_ASSISTED"),
  nodes: z.array(AtlasNodeSchema),
  edges: z.array(AtlasEdgeSchema),
  motifs: z.array(GraphMotifSchema),
  completeness: DocumentCompletenessReportSchema,
});
export type AtlasDocument = z.infer<typeof AtlasDocumentSchema>;

export const NodeIdentityReconciliationSchema = z.object({
  atlasNodeCountRaw: z.number().int().nonnegative(),
  atlasNodeCountUnique: z.number().int().nonnegative(),
  kfExportNodeCount: z.number().int().nonnegative(),
  duplicateNodeIds: z.array(
    z.object({
      nodeId: z.string(),
      occurrences: z.number().int().positive(),
      documentIds: z.array(z.string()),
    }),
  ),
  explanation: z.string(),
  silentDataLoss: z.literal(false),
});
export type NodeIdentityReconciliation = z.infer<typeof NodeIdentityReconciliationSchema>;

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
    uniqueNodes: z.number().int().nonnegative(),
    edges: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    unresolved: z.number().int().nonnegative(),
    ambiguous: z.number().int().nonnegative(),
    diamonds: z.number().int().nonnegative(),
    cycles: z.number().int().nonnegative(),
  }),
  nodeIdentity: NodeIdentityReconciliationSchema.optional(),
});
export type AtlasDataset = z.infer<typeof AtlasDatasetSchema>;

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
      rootCause: z.enum(ROOT_CAUSE_CODES).nullable(),
      controllingRestrictionRisk: z.boolean(),
    }),
  ),
  nodeIdentity: NodeIdentityReconciliationSchema,
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

export function nodeIdForSection(documentId: string, sectionRef: string): string {
  return `node:${documentId}:section:${sectionRef.toLowerCase().replace(/\s+/g, "_")}`;
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
