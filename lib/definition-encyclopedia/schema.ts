/**
 * Knowledge-factory–compatible Definition Encyclopedia schema (standalone).
 *
 * Intentionally independent of Prisma / DefinedTermNode / another agent's
 * store schema. Consumers may ingest this export without mutating production
 * certification or merge paths.
 */

import { z } from "zod";

export const DEFINITION_ENCYCLOPEDIA_SCHEMA_VERSION = "headroom-definition-encyclopedia.v1" as const;
export const KNOWLEDGE_FACTORY_EXPORT_KIND = "definition-encyclopedia-corpus" as const;

export const SourceIdentitySchema = z.object({
  sourceId: z.string(),
  packageKey: z.string(),
  documentId: z.string(),
  documentLabel: z.string(),
  agreementVersion: z.string(),
  documentType: z.enum(["CREDIT_AGREEMENT", "INDENTURE", "AMENDMENT", "ANCILLARY", "DEFINITIONS_EXCERPT", "OTHER"]),
  retrievalPath: z.string(),
  textSha256: z.string(),
  textByteLength: z.number().int().nonnegative(),
});

export const DependencyRefSchema = z.object({
  exactTerm: z.string(),
  normalizedTerm: z.string(),
  canonicalFamily: z.string().nullable(),
  /** Char offset of the dependency mention within exactText. */
  mentionOffset: z.number().int().nonnegative(),
  mentionLength: z.number().int().positive(),
});

export const EmbeddedExceptionSchema = z.object({
  kind: z.enum(["PROVIDED_THAT", "EXCEPT_THAT", "OTHER_THAN", "EXCLUDING", "SUBJECT_TO", "SO_LONG_AS", "UNLESS"]),
  excerpt: z.string(),
  offset: z.number().int().nonnegative(),
});

export const CalculationSignalSchema = z.object({
  kind: z.enum([
    "RATIO_OF",
    "SUM_OF",
    "GREATER_OF",
    "LESSER_OF",
    "MINUS",
    "PLUS_WITHOUT_DUPLICATION",
    "PERCENT_OF",
    "PRO_FORMA",
  ]),
  excerpt: z.string(),
  offset: z.number().int().nonnegative(),
});

export const CrossReferenceSchema = z.object({
  kind: z.enum(["SECTION", "ARTICLE", "CLAUSE", "SCHEDULE", "EXHIBIT", "DEFINITION"]),
  ref: z.string(),
  excerpt: z.string(),
  offset: z.number().int().nonnegative(),
});

export const DefinitionExampleSchema = z.object({
  exampleId: z.string(),
  /** Priority-family canonical label (grouping only; not legal equivalence). */
  canonicalTerm: z.string(),
  exactTerm: z.string(),
  normalizedTerm: z.string(),
  /** Exact definition span from source (declaration through next non-nested definition). */
  exactText: z.string(),
  exactTextSha256: z.string(),
  declarationKind: z.enum(["MEANS", "QUOTED_COLON", "UNQUOTED_COLON", "FORWARDING", "UNKNOWN"]),
  nested: z.boolean(),
  section: z.string().nullable(),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
  source: SourceIdentitySchema,
  dependencies: z.array(DependencyRefSchema),
  embeddedExceptions: z.array(EmbeddedExceptionSchema),
  calculations: z.array(CalculationSignalSchema),
  crossReferences: z.array(CrossReferenceSchema),
  /** Shared key for alternative formulations; never an equivalence assertion. */
  alternativeFormulationGroup: z.string(),
  unusualDraftingFlags: z.array(z.string()),
  semanticTrapFlags: z.array(z.string()),
  provenanceValidated: z.boolean(),
});

export const DependencyGraphEdgeSchema = z.object({
  fromExampleId: z.string(),
  toNormalizedTerm: z.string(),
  toExampleId: z.string().nullable(),
  canonicalFamily: z.string().nullable(),
});

export const AlternativeFormulationSchema = z.object({
  groupId: z.string(),
  canonicalTerm: z.string(),
  exampleIds: z.array(z.string()),
  exactTerms: z.array(z.string()),
  sourceIds: z.array(z.string()),
  equivalenceClaim: z.literal(false),
  note: z.string(),
});

export const UnusualDraftingFindingSchema = z.object({
  findingId: z.string(),
  exampleId: z.string(),
  flag: z.string(),
  detail: z.string(),
  excerpt: z.string(),
});

export const SemanticTrapFindingSchema = z.object({
  trapId: z.string(),
  exampleId: z.string(),
  flag: z.string(),
  detail: z.string(),
  excerpt: z.string(),
});

export const AmendmentChangeSchema = z.object({
  changeId: z.string(),
  packageKey: z.string(),
  canonicalTerm: z.string(),
  normalizedTerm: z.string(),
  beforeExampleId: z.string(),
  afterExampleId: z.string(),
  beforeAgreementVersion: z.string(),
  afterAgreementVersion: z.string(),
  textChanged: z.boolean(),
  beforeTextSha256: z.string(),
  afterTextSha256: z.string(),
  /** Compact textual delta note (not a legal interpretation). */
  observation: z.string(),
});

export const EncyclopediaStatsSchema = z.object({
  sourceDocumentCount: z.number().int().nonnegative(),
  definitionExampleCount: z.number().int().nonnegative(),
  priorityCanonicalCoverage: z.record(z.string(), z.number().int().nonnegative()),
  missingCanonicalTerms: z.array(z.string()),
  dependencyEdgeCount: z.number().int().nonnegative(),
  alternativeFormulationGroupCount: z.number().int().nonnegative(),
  unusualDraftingCount: z.number().int().nonnegative(),
  semanticTrapCount: z.number().int().nonnegative(),
  amendmentChangeCount: z.number().int().nonnegative(),
  targetMinimumExamples: z.number().int().positive(),
  targetMet: z.boolean(),
});

export const KnowledgeFactoryExportSchema = z.object({
  schemaVersion: z.literal(DEFINITION_ENCYCLOPEDIA_SCHEMA_VERSION),
  exportKind: z.literal(KNOWLEDGE_FACTORY_EXPORT_KIND),
  generatedAt: z.string(),
  generator: z.object({
    name: z.string(),
    version: z.string(),
    paidInference: z.literal(false),
    mergesCertificationOrForeignSchema: z.literal(false),
  }),
  sources: z.array(SourceIdentitySchema),
  definitions: z.array(DefinitionExampleSchema),
  dependencyGraph: z.object({
    nodes: z.array(z.object({ exampleId: z.string(), normalizedTerm: z.string(), canonicalTerm: z.string() })),
    edges: z.array(DependencyGraphEdgeSchema),
  }),
  alternativeFormulations: z.array(AlternativeFormulationSchema),
  unusualDrafting: z.array(UnusualDraftingFindingSchema),
  semanticTraps: z.array(SemanticTrapFindingSchema),
  amendmentChanges: z.array(AmendmentChangeSchema),
  stats: EncyclopediaStatsSchema,
  searchableIndexPath: z.string(),
});

export type SourceIdentity = z.infer<typeof SourceIdentitySchema>;
export type DefinitionExample = z.infer<typeof DefinitionExampleSchema>;
export type KnowledgeFactoryExport = z.infer<typeof KnowledgeFactoryExportSchema>;
export type AmendmentChange = z.infer<typeof AmendmentChangeSchema>;
export type DependencyGraphEdge = z.infer<typeof DependencyGraphEdgeSchema>;
export type DependencyRef = z.infer<typeof DependencyRefSchema>;
export type EmbeddedException = z.infer<typeof EmbeddedExceptionSchema>;
export type CalculationSignal = z.infer<typeof CalculationSignalSchema>;
export type CrossReference = z.infer<typeof CrossReferenceSchema>;
export type AlternativeFormulation = z.infer<typeof AlternativeFormulationSchema>;
export type UnusualDraftingFinding = z.infer<typeof UnusualDraftingFindingSchema>;
export type SemanticTrapFinding = z.infer<typeof SemanticTrapFindingSchema>;
