/**
 * Live Corpus Quality Gate — types.
 *
 * Three evaluation layers (never collapsed):
 *   1. infrastructure — retrieval/parse/index/hash integrity
 *   2. extraction — deterministic discovery/structure signals
 *   3. legally_verified — only where independent GT exists against source
 *
 * Status vocabulary: PASS | FAIL | UNVERIFIED
 * UNVERIFIED is required when independent GT is unavailable — never PASS.
 */

export type GateStatus = "PASS" | "FAIL" | "UNVERIFIED";

export type EvaluationLayer = "infrastructure" | "extraction" | "legally_verified";

export type AuditDimension =
  | "source_integrity"
  | "structural_completeness"
  | "definition_completeness"
  | "negative_covenant_discovery"
  | "exception_and_condition_recall"
  | "cross_reference_completeness"
  | "amendment_authority"
  | "entity_scope_recognition"
  | "false_affirmative_capacity"
  | "provenance_correctness"
  | "unresolved_and_unsupported_semantics";

export type DefectSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface AuditFinding {
  findingId: string;
  sampleId: string;
  dimension: AuditDimension;
  layer: EvaluationLayer;
  status: GateStatus;
  summary: string;
  evidence: Record<string, unknown>;
  independentGroundTruth: boolean;
  notes?: string;
}

export interface ProductionDefect {
  defectId: string;
  severity: DefectSeverity;
  title: string;
  sampleId: string;
  dimension: AuditDimension;
  reproducibleSteps: string[];
  expectedSafeBehavior: string;
  observedBehavior: string;
  fixturePaths: string[];
  returnTo: "production-agent";
  blocksLegalVerification: boolean;
}

export interface LayerSummary {
  layer: EvaluationLayer;
  pass: number;
  fail: number;
  unverified: number;
  findings: string[];
}

export interface LiveCorpusQualityReport {
  schemaVersion: "live-corpus-quality-gate.v1";
  generatedAt: string;
  headSha: string;
  branch: string;
  paidCalls: 0;
  certificationImpact: "NONE";
  claudeOwnedFixturesModified: false;
  productionLegalRulesModified: false;
  firstRealEdgarBatch: string;
  sampleIds: string[];
  authenticDocumentCount: number;
  syntheticDocumentCount: 0;
  findings: AuditFinding[];
  layerSummaries: LayerSummary[];
  dimensionRollup: Array<{
    dimension: AuditDimension;
    pass: number;
    fail: number;
    unverified: number;
  }>;
  highestRiskOmissions: ProductionDefect[];
  outstandingGaps: string[];
  reproducibleCommands: string[];
  gateVerdict:
    | "LIVE_CORPUS_QUALITY_GATE_RECORDED_WITH_DEFECTS"
    | "LIVE_CORPUS_QUALITY_GATE_ALL_PASS"
    | "LIVE_CORPUS_QUALITY_GATE_BLOCKED";
}
