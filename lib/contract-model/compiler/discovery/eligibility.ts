/**
 * Agent 1 / Agent 6 coordination — conservative eligibility for discovery candidates.
 *
 * Pass A deterministic signals are inventory findings only. They must never become
 * executable capacity rules merely because a structural node fired a signal.
 * Advancement to executable status requires later semantic discovery (Pass B–D),
 * legal interpretation, verification, and a CERTIFIED VerifiedExecutionPackage
 * under REQUIRE — none of which this module performs or fakes.
 */
import type { DeterministicCandidate } from "./types";

/** Failure / stop classification for execution-readiness reporting. */
export type StageFailureClass =
  | "OPERATIONAL_CREDENTIAL"
  | "OPERATIONAL_AUTHORIZATION"
  | "SUBSTANTIVE_LEGAL_INTERPRETATION"
  | "MISSING_EVIDENCE"
  | "CASCADE_FROM_UPSTREAM"
  | "NONE";

export type DiscoveryEligibilityStatus =
  /** Pass A (or earlier) signal only — not a sealed discovery, not executable. */
  | "SIGNAL_ONLY_NOT_EXECUTABLE"
  /** Semantic discovery produced a candidate still awaiting verification. */
  | "DISCOVERED_NEEDS_VERIFICATION"
  /** Verified + CERTIFIED path only — never granted by this module from Pass A alone. */
  | "EXECUTABLE_ELIGIBLE";

export interface PassAEligibilityAssessment {
  documentId: string;
  sectionRef: string | null;
  nodeId: string;
  status: DiscoveryEligibilityStatus;
  executable: false;
  reason: string;
  agent1Gate: "CONSERVATIVE_ELIGIBILITY";
}

/**
 * Assess a Pass A deterministic candidate. Always NOT_EXECUTABLE.
 * Coordinates with Agent 1: discovery identification ≠ execution eligibility.
 */
export function assessPassAEligibility(candidate: DeterministicCandidate): PassAEligibilityAssessment {
  return {
    documentId: candidate.documentId,
    sectionRef: candidate.sectionRef,
    nodeId: candidate.nodeId,
    status: "SIGNAL_ONLY_NOT_EXECUTABLE",
    executable: false,
    reason:
      "Pass A deterministic signal hit is an inventory candidate only. Agent 1 conservative eligibility: not executable without Pass B–D semantic discovery, legal interpretation, verification, and CERTIFIED VerifiedExecutionPackage under REQUIRE.",
    agent1Gate: "CONSERVATIVE_ELIGIBILITY",
  };
}

export function assessPassAPopulation(candidates: DeterministicCandidate[]): {
  total: number;
  executableCount: 0;
  allSignalOnly: true;
  assessments: PassAEligibilityAssessment[];
  policy: string;
} {
  return {
    total: candidates.length,
    executableCount: 0,
    allSignalOnly: true,
    assessments: candidates.map(assessPassAEligibility),
    policy: "PASS_A_NEVER_EXECUTABLE_WITHOUT_DOWNSTREAM_GATES",
  };
}

/** Classify a pipeline stage stop for reporting (credential ≠ legal). */
export function classifyStageFailure(args: {
  stage: string;
  reason: string | null;
  upstreamCredentialBlocked: boolean;
}): StageFailureClass {
  const reason = args.reason ?? "";
  if (/BLOCKED_BY_MISSING_CREDENTIAL|AI_GATEWAY|ANTHROPIC/i.test(reason)) {
    return "OPERATIONAL_CREDENTIAL";
  }
  if (/without explicit authorization|paid inference|AUTHORIZATION/i.test(reason)) {
    return "OPERATIONAL_AUTHORIZATION";
  }
  if (args.upstreamCredentialBlocked && (args.stage === "VERIFIED_RULE" || args.stage === "LEGAL_INTERPRETATION")) {
    return args.stage === "LEGAL_INTERPRETATION" && /BLOCKED_BY_MISSING_CREDENTIAL/i.test(reason)
      ? "OPERATIONAL_CREDENTIAL"
      : "CASCADE_FROM_UPSTREAM";
  }
  if (/MISSING_EVIDENCE|DO_NOT_INVENT|APPROVED|utilization|certificate/i.test(reason)) {
    return "MISSING_EVIDENCE";
  }
  if (/REVIEW_REQUIRED|interpretation|cross-rule|legal/i.test(reason)) {
    return "SUBSTANTIVE_LEGAL_INTERPRETATION";
  }
  if (args.upstreamCredentialBlocked) return "CASCADE_FROM_UPSTREAM";
  return "NONE";
}
