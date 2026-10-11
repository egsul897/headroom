/**
 * Bounded autonomous compilation pipeline (source → IR → capacity → Position feed).
 *
 * Reuses the existing fixed-dollar compiler / capacity evaluator. Does NOT create
 * a parallel covenant engine. Candidate discovery remains package-supplied;
 * compilation and classification are package-agnostic.
 *
 * Honesty partitions (never interchangeable):
 * - EXTRACTED_COVENANT_FACT
 * - VERIFIED_EXECUTABLE_RULE (fixed-dollar IR)
 * - GROSS_CONTRACTUAL_CAPACITY
 * - HYPOTHETICAL_MODELED_CAPACITY
 * - VERIFIED_REMAINING_CAPACITY (requires utilization completeness + trusted issuer)
 * - PRODUCTION_AVAILABLE_CAPACITY (BLOCKED while trusted-identity inactive)
 *
 * AUTONOMOUS_COVENANT_COMPILATION_PROVEN remains NOT_PROVEN until every Position
 * capacity row leaves hand-encoded CovenantProvisionInput.
 */

import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity";
import {
  compileVerifiedFixedDollarBridge,
  type OperativeClauseCandidate,
  type VerifiedExecutableCompileBridgeResult,
  type VerifiedExecutableCompileUnit,
} from "./verified-executable-compile-core";
import { matthewsVerifiedExecutableCandidates } from "./verified-executable-compile-bridge";
import { mhkVerifiedExecutableCandidates } from "./package-mhk-ve-candidates";
import { presentCapacityClaim, type CapacityClaimView } from "@/lib/customer-workflow/status-contract";

export type PipelinePublicationClass =
  | "EXTRACTED_COVENANT_FACT"
  | "VERIFIED_EXECUTABLE_RULE"
  | "GROSS_CONTRACTUAL_CAPACITY"
  | "HYPOTHETICAL_MODELED_CAPACITY"
  | "VERIFIED_REMAINING_CAPACITY"
  | "PRODUCTION_AVAILABLE_CAPACITY"
  | "UNSUPPORTED_STRUCTURE"
  | "REFUSED_MISSING_EVIDENCE";

export type PipelineTraceStep = {
  stage: string;
  detail: string;
};

export type PipelinePositionMetric = {
  code: string;
  documentId: string;
  sourceSectionRef: string;
  amountMillions: number | null;
  publicationClass: PipelinePublicationClass;
  claim: CapacityClaimView;
  mayPublishAvailable: boolean;
  unsupportedReason: string | null;
  provenance: string[];
};

export type AutonomousCompilationPipelineResult = {
  companyId: string;
  instrumentKey: string;
  asOfDate: string;
  path: PipelineTraceStep[];
  compile: VerifiedExecutableCompileBridgeResult;
  positionMetrics: PipelinePositionMetric[];
  unsupported: Array<{ candidateId: string; reason: string; valueClass: string }>;
  productionAvailablePublished: boolean;
  verifiedRemainingPublished: boolean;
  trustedIdentityActivation: string;
  milestones: {
    FIXED_DOLLAR_SOURCE_TO_POSITION: "PROVEN" | "PARTIAL" | "NOT_PROVEN";
    RATIO_AND_COMPLEX_STRUCTURES: "NOT_PROVEN" | "UNSUPPORTED";
    VERIFIED_REMAINING: "BLOCKED";
    PRODUCTION_AVAILABLE: "BLOCKED";
  };
  limitations: string[];
};

export type RunAutonomousPipelineArgs = {
  companyId: string;
  instrumentKey: string;
  asOfDate: string;
  candidates: readonly OperativeClauseCandidate[];
  packageLabel?: string;
};

function unitToMetric(u: VerifiedExecutableCompileUnit): PipelinePositionMetric {
  const feedsGross =
    u.valueClass === "SOURCE_BACKED_COMPILED_GROSS" && u.sourceBackedGrossCapacityMm != null;
  const amount = feedsGross ? u.sourceBackedGrossCapacityMm : null;
  const publicationClass: PipelinePublicationClass = feedsGross
    ? "GROSS_CONTRACTUAL_CAPACITY"
    : u.valueClass === "REFUSED_NOT_FIXED_DOLLAR" || u.valueClass === "REFUSED_COMPILE_OR_FIDELITY"
      ? "UNSUPPORTED_STRUCTURE"
      : "REFUSED_MISSING_EVIDENCE";

  const claim = presentCapacityClaim({
    claimKind: amount != null ? "GROSS_CONTRACTUAL" : "UNAVAILABLE",
    amountMillions: amount,
    remainingIsAuthoritative: false,
    publicationLabel: "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason: amount == null ? u.limitations.join(" ") : null,
  });

  return {
    code: `ve:${u.candidateId}`,
    documentId: u.documentId,
    sourceSectionRef: u.sourceSectionRef,
    amountMillions: amount,
    publicationClass,
    claim,
    mayPublishAvailable: false,
    unsupportedReason: feedsGross ? null : u.limitations.join(" | "),
    provenance: [
      `document:${u.documentId}`,
      `section:${u.sourceSectionRef}`,
      `valueClass:${u.valueClass}`,
      `compileClass:${u.compileClass}`,
    ],
  };
}

/**
 * Run the shared autonomous fixed-dollar pipeline for any package.
 * No companyId conditionals in compilation — identity is metadata only.
 */
export function runAutonomousCompilationPipeline(
  args: RunAutonomousPipelineArgs,
): AutonomousCompilationPipelineResult {
  const path: PipelineTraceStep[] = [
    { stage: "authentic-documents", detail: args.packageLabel ?? args.instrumentKey },
    { stage: "operative-clause-candidates", detail: `${args.candidates.length} candidates` },
    { stage: "governing-document-resolution", detail: "candidate.documentId + sourceSectionRef retained" },
    { stage: "source-backed-verified-IR", detail: "compileFixedDollarBasket (shared)" },
    { stage: "executable-capacity-rules", detail: "evaluateFixedDollarCapacity hypo+production" },
    { stage: "financial-utilization-evidence", detail: "not required for GROSS; required for remaining" },
    { stage: "shared-capacity-engine", detail: "fixed-dollar evaluator (no parallel engine)" },
    { stage: "position-dashboard-feed", detail: "GROSS_CONTRACTUAL only; AVAILABLE refused" },
  ];

  const compile = compileVerifiedFixedDollarBridge({
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    asOfDate: args.asOfDate,
    candidates: args.candidates,
    extraLimitations: [
      "Pipeline feeds GROSS_CONTRACTUAL from verified fixed-dollar IR only.",
      "Verified remaining / PRODUCTION AVAILABLE require completeness + trusted issuer (BLOCKED).",
    ],
  });

  const positionMetrics = compile.verifiedExecutableUnits.map(unitToMetric);
  for (const m of positionMetrics) {
    if (m.mayPublishAvailable || m.claim.claimLabel.includes("AVAILABLE")) {
      throw new Error(`Pipeline refused AVAILABLE publication for ${m.code}`);
    }
    if (m.publicationClass === "PRODUCTION_AVAILABLE_CAPACITY") {
      throw new Error(`Pipeline must not emit PRODUCTION_AVAILABLE_CAPACITY for ${m.code}`);
    }
  }

  const unsupported = compile.verifiedExecutableUnits
    .filter((u) => !u.feedsPosition)
    .map((u) => ({
      candidateId: u.candidateId,
      reason: u.limitations.join(" | "),
      valueClass: u.valueClass,
    }));

  const feeding = positionMetrics.filter((m) => m.amountMillions != null);

  return {
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    asOfDate: args.asOfDate,
    path,
    compile,
    positionMetrics,
    unsupported,
    productionAvailablePublished: false,
    verifiedRemainingPublished: false,
    trustedIdentityActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
    milestones: {
      FIXED_DOLLAR_SOURCE_TO_POSITION: feeding.length > 0 ? "PROVEN" : "NOT_PROVEN",
      RATIO_AND_COMPLEX_STRUCTURES: "UNSUPPORTED",
      VERIFIED_REMAINING: "BLOCKED",
      PRODUCTION_AVAILABLE: "BLOCKED",
    },
    limitations: [
      ...compile.limitations,
      "Ratio / leverage / greater-of / cross-document baskets are UNSUPPORTED on this bridge.",
      "Hand-encoded leaf CovenantProvisionInput rows are outside this pipeline.",
      `Trusted-identity activation: ${TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status}.`,
    ],
  };
}

/** Convenience: Matthews candidates through the shared pipeline. */
export function runMatthewsAutonomousPipeline(asOfDate = "2024-12-31") {
  return runAutonomousCompilationPipeline({
    companyId: "matthews",
    instrumentKey: "matthews-international-q1-fy2025",
    asOfDate,
    candidates: matthewsVerifiedExecutableCandidates(),
    packageLabel: "Matthews Indenture + CA excerpts",
  });
}

/** Convenience: authentic MHK candidates through the same shared pipeline. */
export function runMhkAutonomousPipeline(asOfDate = "2025-06-30") {
  return runAutonomousCompilationPipeline({
    companyId: "mhk",
    instrumentKey: "mhk-2026-credit-agreement",
    asOfDate,
    candidates: mhkVerifiedExecutableCandidates(),
    packageLabel: "MHK 2026 Credit Agreement (product-proof/002)",
  });
}
