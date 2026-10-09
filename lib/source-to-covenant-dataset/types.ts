/**
 * Source-to-Covenant Compilation Dataset — types.
 *
 * This is a DATA AND EVALUATION workstream, not a replacement compiler.
 * Records connect authentic financing-document language to structured
 * covenant representation CANDIDATES. Labels carry explicit verification
 * status; compiler output is never treated as ground truth by itself.
 */

export const DATASET_SCHEMA_VERSION = "source-to-covenant-dataset.v1" as const;
export const DATASET_BUILDER_VERSION = "source-to-covenant-builder.v1" as const;

/** Pinned compiler / IR / model versions recorded at dataset build time — for provenance only, never as automatic label authority. */
export interface ToolVersionPins {
  irSchemaVersion: string;
  semanticCompilerAlgorithmVersion: string;
  semanticCompilerPromptVersion: string;
  semanticCompilerToolPolicyVersion: string;
  semanticVerifierAlgorithmVersion: string;
  semanticVerifierPromptVersion: string;
  datasetSchemaVersion: typeof DATASET_SCHEMA_VERSION;
  datasetBuilderVersion: typeof DATASET_BUILDER_VERSION;
  /** Explicit disclosure: these pins identify tooling context, not label authority. */
  pinsAreNotLabelAuthority: true;
}

export type ExamplePolarity = "POSITIVE" | "NEGATIVE";

export type ExampleRole =
  | "OPERATIVE_COVENANT"
  | "DEFINITION"
  | "EXCEPTION_BASKET"
  | "CONDITION"
  | "AMENDMENT_EFFECT"
  | "BOILERPLATE_OR_RESERVED"
  | "CROSS_REFERENCE_ONLY"
  | "UNSUPPORTED_SEMANTICS";

export type LabelVerificationStatus =
  | "HUMAN_SOURCE_VERIFIED"
  | "HUMAN_HYPOTHESIS"
  | "MODEL_HYPOTHESIS"
  | "UNRESOLVED"
  | "UNSUPPORTED"
  | "NOT_APPLICABLE";

export type UncertaintyLevel = "LOW" | "MEDIUM" | "HIGH" | "UNRESOLVED";

export type SplitBucket = "train" | "dev" | "eval-heldout";

export type PermissionProhibitionClass =
  | "PERMISSION"
  | "PROHIBITION"
  | "RATIO_TEST"
  | "DEFINITION"
  | "CONDITION"
  | "AMENDMENT_MECHANIC"
  | "NONE"
  | "UNRESOLVED";

export interface SourceDocumentIdentity {
  issuerId: string;
  issuerName: string;
  instrumentKey: string;
  documentId: string;
  /** Relative path under the repository root to the authentic source fixture. */
  sourceFixturePath: string;
  filingAccession?: string;
  cik?: string;
  exhibit?: string;
  agreementDate?: string;
  sourceUrl?: string;
}

export interface OperativeVersionIdentity {
  /** Which document version supplies the operative text for this example. */
  operativeDocumentId: string;
  asOfDate: string | null;
  amendmentIdentity: string | null;
  /** True when the window is from a restated / amended operative text. */
  isRestatedOperativeText: boolean;
}

export interface StructuralIdentity {
  sectionRef: string;
  /** Optional structural node key when known from fixtures; null when not bound. */
  sourceNodeKey: string | null;
  articleRef: string | null;
  unitKind: ExampleRole;
}

export interface ControllingContext {
  /** Exact legal text window — complete controlling context, not an isolated snippet. */
  exactText: string;
  charStartInFixture: number | null;
  charEndInFixture: number | null;
  sourceTextSha256: string;
  windowSha256: string;
  /** Definitions required to interpret the operative window, keyed by term name. */
  definitions: Record<string, string>;
  definitionSourceSha256: string | null;
  exceptions: string[];
  conditions: string[];
  crossReferences: string[];
  entityScopeNotes: string[];
}

export interface CandidateOutput {
  candidateCovenantFamily: string | null;
  candidatePermissionProhibitionClass: PermissionProhibitionClass;
  proposedFormulaOrCapacity: {
    shape: string | null;
    description: string;
    figures: string[];
    capacityUnlimited: boolean | null;
  };
  proposedConditions: Array<{
    conditionType: string;
    description: string;
    status: "PROPOSED" | "UNSUPPORTED" | "MISSING_INPUT";
  }>;
  proposedDependencyEdges: Array<{
    edgeType: string;
    targetRef: string;
    description: string;
  }>;
  missingInputs: string[];
  uncertainty: {
    level: UncertaintyLevel;
    reasons: string[];
  };
  verificationStatus: LabelVerificationStatus;
  /** Free-text notes; must never claim compiler output as approved ground truth. */
  labelNotes: string;
}

export interface SourceToCovenantRecord {
  exampleId: string;
  /** v1 or v2 (Phase-2 integrity extensions). */
  schemaVersion: typeof DATASET_SCHEMA_VERSION | "source-to-covenant-dataset.v2";
  polarity: ExamplePolarity;
  role: ExampleRole;
  split: SplitBucket;
  document: SourceDocumentIdentity;
  operativeVersion: OperativeVersionIdentity;
  structural: StructuralIdentity;
  governingProhibition: string | null;
  input: ControllingContext;
  output: CandidateOutput;
  toolVersions: ToolVersionPins;
  /** Near-duplicate cluster id when detected; null if unique. */
  nearDuplicateClusterId: string | null;
  /** Safety: this record must not enter Claude acceptance / verifier few-shot corpora. */
  contaminationRestrictions: {
    excludeFromClaudeAcceptanceCorpus: true;
    excludeFromVerifierFewShots: true;
    excludeFromCompilerPromptFewShots: true;
    usageRightsReviewRequiredBeforeSft: true;
  };
  authoredAt: string;
  authoringMethod: "HUMAN_SOURCE_READING" | "HUMAN_SOURCE_READING_PLUS_CATALOG" | "SYNTHETIC_NEGATIVE";
}

export interface ProvenanceManifest {
  schemaVersion: typeof DATASET_SCHEMA_VERSION;
  datasetBuilderVersion: typeof DATASET_BUILDER_VERSION;
  builtAt: string;
  toolVersions: ToolVersionPins;
  safety: {
    compilerOutputNotUsedAsGroundTruth: true;
    noAutomaticSemanticApproval: true;
    claudeAcceptanceCorpusNotContaminated: true;
    noPaidInferenceUsed: true;
    usageRightsReviewRequiredBeforeSftOrDistillation: true;
  };
  issuers: Array<{
    issuerId: string;
    issuerName: string;
    splitRole: "train_or_dev" | "eval_heldout";
    instruments: string[];
    sourceFixtureRoots: string[];
  }>;
  recordCounts: {
    total: number;
    bySplit: Record<SplitBucket, number>;
    byPolarity: Record<ExamplePolarity, number>;
    byVerificationStatus: Partial<Record<LabelVerificationStatus, number>>;
  };
  sourceTextHashes: Array<{
    exampleId: string;
    sourceFixturePath: string;
    sourceTextSha256: string;
    windowSha256: string;
    amendmentIdentity: string | null;
  }>;
}

export interface DuplicateReport {
  schemaVersion: typeof DATASET_SCHEMA_VERSION;
  exactDuplicatePairs: Array<{ a: string; b: string; windowSha256: string }>;
  nearDuplicateClusters: Array<{
    clusterId: string;
    exampleIds: string[];
    method: string;
    similarity: number;
  }>;
  heldOutContamination: Array<{
    trainOrDevExampleId: string;
    heldOutExampleId: string;
    reason: string;
  }>;
}

export interface QualityReport {
  schemaVersion: typeof DATASET_SCHEMA_VERSION;
  builtAt: string;
  checks: Array<{
    id: string;
    status: "PASS" | "FAIL" | "WARN";
    detail: string;
  }>;
  summary: {
    totalRecords: number;
    verifiedLabelCount: number;
    hypothesisLabelCount: number;
    unresolvedOrUnsupportedCount: number;
    negativeExampleCount: number;
    heldOutIssuerCount: number;
    exactDuplicateCount: number;
    nearDuplicateClusterCount: number;
    readyForImport: boolean;
  };
}
