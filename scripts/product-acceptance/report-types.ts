/**
 * Report vocabulary for the independent product-acceptance runner.
 *
 * Severities and outcome classes are the mission's own; they are deliberately NOT the compiler's internal
 * finding/certification vocabularies so that a finding here is an independent judgement about product behaviour,
 * never a restatement of what the compiler said about itself.
 */
import type { Severity } from "./corpus";

/** How a stage was executed in this offline run. MOCKED stages produce no evidence about model behaviour. */
export type StageMode = "PRODUCTION" | "MOCKED" | "NOT_RUN";

export type StageName =
  | "STRUCTURE"
  | "PACKAGE_GRAPH"
  | "DISCOVERY_PASS_A"
  | "DISCOVERY_PASS_B_PLUS"
  | "AMENDMENT_DETERMINISTIC"
  | "AMENDMENT_INTERPRETER"
  | "OPERATIVE_STATE"
  | "CONTEXT_RETRIEVAL"
  | "SEMANTIC_INVENTORY"
  | "SEMANTIC_COMPOSITION"
  | "SEMANTIC_VERIFICATION_LAYER1"
  | "SEMANTIC_VERIFICATION_LAYER2"
  | "CERTIFICATION"
  | "RUNTIME_CAPACITY"
  | "RUNTIME_SIMULATION";

export interface StageRecord {
  stage: StageName;
  mode: StageMode;
  /** What the mode means for the evidence value of this stage's results. */
  note: string;
  /** Version strings the production code reports for itself, when exposed. */
  versions?: Record<string, string>;
  durationMs?: number;
  error?: string;
}

/**
 * Outcome classes (mission §3): the runner must distinguish a wrong answer from an honest refusal, a missing
 * capability, missing evidence and a broken test harness.
 */
export type OutcomeClass =
  | "INCORRECT_RESULT"
  | "CORRECT_FAIL_CLOSED"
  | "CAPABILITY_NOT_IMPLEMENTED"
  | "MISSING_EVIDENCE"
  | "TEST_INFRASTRUCTURE_FAILURE";

export interface Finding {
  findingId: string;
  packageId: string;
  stage: StageName;
  stageMode: StageMode;
  severity: Severity;
  outcomeClass: OutcomeClass;
  /** The manifest expectation this finding is about (covenant id, structure ref, case id, prohibited-claim id…). */
  expectationRef: string;
  expected: string;
  actual: string;
  /** Minimal reproduction: the package, document(s), section(s) and the production call that produced `actual`. */
  repro: string;
  /** Whether a deterministic (non-model) layer produced this result - a deterministic wrong answer is a defect, not variance. */
  deterministic: boolean;
}

/** One checked expectation; PASS lines are kept so the report shows coverage, not only failures. */
export interface Check {
  checkId: string;
  packageId: string;
  stage: StageName;
  stageMode: StageMode;
  expectationRef: string;
  kind: "EXACT" | "INVARIANT" | "PROHIBITED_CLAIM" | "UNSUPPORTED_CONSTRUCT" | "AMBIGUITY" | "RUNTIME_CASE";
  result: "PASS" | "FAIL" | "NOT_TESTED";
  detail: string;
  findingId?: string;
}

export interface PackageReport {
  packageId: string;
  title: string;
  manifestSha256: string;
  documents: Array<{ documentId: string; sha256: string; role: string; operative: boolean }>;
  stages: StageRecord[];
  checks: Check[];
  findings: Finding[];
  /** Per-stage counts for the summary. */
  summary: { checks: number; pass: number; fail: number; notTested: number; findingsBySeverity: Record<string, number>; findingsByOutcome: Record<string, number> };
  /** Free-form observations that are not expectation failures (e.g. what the mocked model was asked to do). */
  observations: string[];
}

export interface AcceptanceReport {
  reportVersion: "product-acceptance-report.v1";
  generatedAt: string;
  repository: { headSha: string; branch: string; dirty: boolean };
  corpus: { corpusSha256: string; packages: Array<{ packageId: string; manifestSha256: string; documents: Array<{ documentId: string; sha256: string }> }> };
  /** Stated once for the whole run: which stages were production, mocked or not run, and why. */
  executionContract: {
    providerCalls: 0;
    network: "NONE";
    mockedStages: StageName[];
    notRunStages: StageName[];
    mockDisclosure: string[];
  };
  packages: PackageReport[];
  totals: { checks: number; pass: number; fail: number; notTested: number; findings: number; findingsBySeverity: Record<string, number>; findingsByOutcome: Record<string, number> };
}
