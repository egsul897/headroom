/**
 * Package-agnostic verified fixed-dollar compile core.
 *
 * Candidate discovery may be package-specific. Compilation and capacity
 * evaluation here must not branch on companyId / issuer — only on operative
 * text + the shared fixed-dollar IR path.
 *
 * Outputs SOURCE_BACKED_COMPILED_GROSS only. Never publishes production
 * AVAILABLE remaining. Incomplete / unsupported formulations refuse.
 */

import {
  classifyFixedDollarBasket,
  compileFixedDollarBasket,
  evaluateFixedDollarCapacity,
  type FixedDollarExecutableClass,
  type FidelityVerdict,
} from "@/lib/contract-model/compiler/fixed-dollar-basket";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity";

export type OperativeClauseCandidate = {
  candidateId: string;
  documentId: string;
  sourceSectionRef: string;
  operativeSourceText: string;
  relatedLeafCode: string | null;
};

export type VerifiedExecutableValueClass =
  | "SOURCE_BACKED_COMPILED_GROSS"
  | "UNSUPPORTED"
  | "REFUSED_NOT_FIXED_DOLLAR"
  | "REFUSED_COMPILE_OR_FIDELITY"
  | "REFUSED_PRODUCTION";

export type VerifiedExecutableCompileUnit = {
  candidateId: string;
  documentId: string;
  sourceSectionRef: string;
  relatedLeafCode: string | null;
  compileClass: FixedDollarExecutableClass | "NOT_ATTEMPTED" | "UNSUPPORTED";
  classificationClass: string;
  fidelityVerdict: FidelityVerdict | null;
  hypotheticalOutcome: string;
  productionOutcome: string;
  sourceBackedGrossCapacityMm: number | null;
  valueClass: VerifiedExecutableValueClass;
  feedsPosition: boolean;
  displayedOnDashboard: boolean;
  limitations: string[];
  /** Missing legal structure / classification reason when valueClass is UNSUPPORTED. */
  missingLegalStructure: string | null;
};

export type VerifiedExecutableCompileBridgeResult = {
  companyId: string;
  instrumentKey: string;
  asOfDate: string;
  candidatesAttempted: number;
  verifiedExecutableUnits: VerifiedExecutableCompileUnit[];
  verifiedExecutableUnitsFeedingPosition: number;
  productionCapacityPublished: boolean;
  trustedIdentityActivation: string;
  path: string[];
  limitations: string[];
};

export type CompileVerifiedFixedDollarArgs = {
  companyId: string;
  instrumentKey: string;
  asOfDate: string;
  candidates: readonly OperativeClauseCandidate[];
  /** Extra honesty notes appended to the result limitations. */
  extraLimitations?: readonly string[];
};

function compileOne(
  candidate: OperativeClauseCandidate,
  asOfDate: string,
  companyId: string,
  instrumentKey: string,
): VerifiedExecutableCompileUnit {
  const classification = classifyFixedDollarBasket(candidate.operativeSourceText);
  const baseLimitations = [
    "Gross contractual from verified fixed-dollar IR — not netted remaining.",
    "Not PRODUCTION_AUTHORITATIVE; trusted-identity BLOCKED.",
    "Operative source text must support fixed-dollar classification — unsupported forms refuse.",
  ];

  if (classification.class === "NOT_FIXED_DOLLAR" || classification.amountUsd == null) {
    const missing =
      classification.reasons.join("; ") ||
      "Clause is not a fixed-dollar sole/gated cap (ratio, structural, or non-cap dollar language).";
    return {
      candidateId: candidate.candidateId,
      documentId: candidate.documentId,
      sourceSectionRef: candidate.sourceSectionRef,
      relatedLeafCode: candidate.relatedLeafCode,
      compileClass: "UNSUPPORTED",
      classificationClass: classification.class,
      fidelityVerdict: null,
      hypotheticalOutcome: "NOT_ATTEMPTED",
      productionOutcome: "NOT_ATTEMPTED",
      sourceBackedGrossCapacityMm: null,
      // Keep REFUSED_NOT_FIXED_DOLLAR for multipackage locks; UNSUPPORTED is the product label.
      valueClass: "REFUSED_NOT_FIXED_DOLLAR",
      feedsPosition: false,
      displayedOnDashboard: true,
      limitations: [...baseLimitations, `UNSUPPORTED: ${missing}`],
      missingLegalStructure: missing,
    };
  }

  const compiled = compileFixedDollarBasket({
    companyId,
    instrumentKey,
    sourceDocumentId: candidate.documentId,
    candidateRef: candidate.candidateId,
    sourceSectionRef: candidate.sourceSectionRef,
    operativeSourceText: candidate.operativeSourceText,
    covenantFamily: "INDEBTEDNESS",
    action: "INCUR_DEBT",
  });

  if (
    compiled.executableClass === "UNSUPPORTED" ||
    compiled.executableClass === "FAILED" ||
    !compiled.rule
  ) {
    const missing = `Fixed-dollar compile returned ${compiled.executableClass}.`;
    return {
      candidateId: candidate.candidateId,
      documentId: candidate.documentId,
      sourceSectionRef: candidate.sourceSectionRef,
      relatedLeafCode: candidate.relatedLeafCode,
      compileClass: compiled.executableClass,
      classificationClass: classification.class,
      fidelityVerdict: null,
      hypotheticalOutcome: "FAILED",
      productionOutcome: "NOT_ATTEMPTED",
      sourceBackedGrossCapacityMm: null,
      valueClass: "UNSUPPORTED",
      feedsPosition: false,
      displayedOnDashboard: true,
      limitations: [...baseLimitations, `UNSUPPORTED: ${missing}`],
      missingLegalStructure: missing,
    };
  }

  const hypo = evaluateFixedDollarCapacity({
    compile: compiled,
    operativeSourceText: candidate.operativeSourceText,
    authorityMode: "CALLER_STIPULATED_HYPOTHETICAL",
    asOf: asOfDate,
  });
  const prod = evaluateFixedDollarCapacity({
    compile: compiled,
    operativeSourceText: candidate.operativeSourceText,
    authorityMode: "PRODUCTION",
    asOf: asOfDate,
  });

  const fidelityOk = hypo.fidelity.verdict === "PASS";
  const hypoOk = hypo.outcomeLabel === "VERIFIED_EXECUTABLE" && hypo.availableAmountUsd != null;
  const productionRefused = prod.outcomeLabel === "PRODUCTION_CAPACITY_REFUSED";

  if (!fidelityOk || !hypoOk) {
    const missing = `Fidelity or hypothetical evaluation failed (${hypo.fidelity.verdict}/${hypo.outcomeLabel}).`;
    return {
      candidateId: candidate.candidateId,
      documentId: candidate.documentId,
      sourceSectionRef: candidate.sourceSectionRef,
      relatedLeafCode: candidate.relatedLeafCode,
      compileClass: compiled.executableClass,
      classificationClass: classification.class,
      fidelityVerdict: hypo.fidelity.verdict,
      hypotheticalOutcome: hypo.outcomeLabel,
      productionOutcome: prod.outcomeLabel,
      sourceBackedGrossCapacityMm: null,
      valueClass: "REFUSED_COMPILE_OR_FIDELITY",
      feedsPosition: false,
      displayedOnDashboard: true,
      limitations: [...baseLimitations, missing],
      missingLegalStructure: missing,
    };
  }

  const grossMm = hypo.availableAmountUsd! / 1_000_000;
  return {
    candidateId: candidate.candidateId,
    documentId: candidate.documentId,
    sourceSectionRef: candidate.sourceSectionRef,
    relatedLeafCode: candidate.relatedLeafCode,
    compileClass: compiled.executableClass,
    classificationClass: classification.class,
    fidelityVerdict: hypo.fidelity.verdict,
    hypotheticalOutcome: hypo.outcomeLabel,
    productionOutcome: prod.outcomeLabel,
    sourceBackedGrossCapacityMm: grossMm,
    valueClass: productionRefused ? "SOURCE_BACKED_COMPILED_GROSS" : "REFUSED_PRODUCTION",
    feedsPosition: productionRefused,
    displayedOnDashboard: true,
    limitations: [
      ...baseLimitations,
      `SOURCE_BACKED_COMPILED_GROSS=$${grossMm}M from operative "not to exceed" language.`,
      productionRefused
        ? "PRODUCTION_CAPACITY_REFUSED preserved."
        : "Unexpected production success — refused Position feed.",
    ],
    missingLegalStructure: null,
  };
}

/**
 * Compile any package's operative clause candidates through the shared
 * fixed-dollar VE path. No issuer-specific branches in this function.
 */
export function compileVerifiedFixedDollarBridge(
  args: CompileVerifiedFixedDollarArgs,
): VerifiedExecutableCompileBridgeResult {
  // Deterministic fixed-dollar compile — no process.env mutation; no paid APIs.
  const path: string[] = [
    "operative-clause-candidates",
    `package:${args.companyId}:${args.instrumentKey}`,
  ];
  path.push(`candidates:${args.candidates.length}`);

  const units = args.candidates.map((c) => {
    const unit = compileOne(c, args.asOfDate, args.companyId, args.instrumentKey);
    path.push(
      unit.feedsPosition
        ? `ve-feed:${unit.candidateId}:${unit.sourceBackedGrossCapacityMm}`
        : `ve-refuse:${unit.candidateId}:${unit.valueClass}`,
    );
    return unit;
  });

  const feeding = units.filter((u) => u.feedsPosition);

  return {
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    asOfDate: args.asOfDate,
    candidatesAttempted: args.candidates.length,
    verifiedExecutableUnits: units,
    verifiedExecutableUnitsFeedingPosition: feeding.length,
    productionCapacityPublished: false,
    trustedIdentityActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
    path,
    limitations: [
      "Only FIXED_DOLLAR_SOLE_CAP / gated fixed-dollar clauses become VE units.",
      "Ratio / structural / greater-of formulations refuse or stay outside this bridge.",
      "VE figures are SOURCE_BACKED_COMPILED_GROSS — never customer AVAILABLE remaining.",
      "Compile path is package-agnostic; candidate discovery may still be package-specific.",
      "AUTONOMOUS_COVENANT_COMPILATION_PROVEN remains NOT_PROVEN until all Position capacity leaves hand-encoded CovenantProvisionInput.",
      "Production IdP / trusted-issuer BLOCKED; no Neon writes; no paid inference.",
      ...(args.extraLimitations ?? []),
    ],
  };
}
