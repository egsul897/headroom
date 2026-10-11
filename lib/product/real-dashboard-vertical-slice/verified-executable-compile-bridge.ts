/**
 * Verified executable-rule compilation bridge for the Matthews dashboard slice.
 *
 * Advances beyond Phase 3 fact extraction: for operative clauses that classify
 * as fixed-dollar baskets, compile through compileFixedDollarBasket →
 * evaluateVerifiedCapacity (via evaluateFixedDollarCapacity) and feed GROSS
 * contractual figures into Position when fidelity PASS.
 *
 * Fail-closed when evidence does not support VE compilation (ratio rooms,
 * non-cap dollar amounts, multi-figure excerpts, fidelity FAIL).
 *
 * Honesty:
 * - sourceBackedGrossCapacityMm is SOURCE_BACKED_COMPILED_GROSS from operative text
 *   (e.g. $1,300M Permitted Debt (1)(a) ceiling) — NOT netted remaining.
 * - Modeled leaf evaluateProvision figures (e.g. $521.118 after secured debt)
 *   remain separate under MODELED_AUTHENTIC_EVIDENCE / GROSS_ONLY paths.
 * - Production capacity always refused on this path (no trusted-issuer / completeness).
 * - Does NOT flip AUTONOMOUS_COVENANT_COMPILATION_PROVEN — only fixed-dollar
 *   clauses that classify cleanly feed Position; other permissions stay leaf-encoded.
 */

import {
  classifyFixedDollarBasket,
  compileFixedDollarBasket,
  evaluateFixedDollarCapacity,
  type FixedDollarExecutableClass,
  type FidelityVerdict,
} from "@/lib/contract-model/compiler/fixed-dollar-basket";
import { TRUSTED_IDENTITY_PRODUCTION_ACTIVATION } from "@/lib/capacity";
import {
  MATTHEWS_INDENTURE_SOURCE,
  MATTHEWS_CREDIT_AGREEMENT_SOURCE,
} from "./source-excerpts-matthews";

/** Operative clause candidates carved from authentic reconstructed excerpts. */
export type OperativeClauseCandidate = {
  candidateId: string;
  documentId: string;
  sourceSectionRef: string;
  operativeSourceText: string;
  /** Expected leaf provision code this VE unit corresponds to, when any. */
  relatedLeafCode: string | null;
};

export type VerifiedExecutableValueClass =
  | "SOURCE_BACKED_COMPILED_GROSS"
  | "REFUSED_NOT_FIXED_DOLLAR"
  | "REFUSED_COMPILE_OR_FIDELITY"
  | "REFUSED_PRODUCTION";

export type VerifiedExecutableCompileUnit = {
  candidateId: string;
  documentId: string;
  sourceSectionRef: string;
  relatedLeafCode: string | null;
  compileClass: FixedDollarExecutableClass | "NOT_ATTEMPTED";
  classificationClass: string;
  fidelityVerdict: FidelityVerdict | null;
  hypotheticalOutcome: string;
  productionOutcome: string;
  /** Gross contractual $M from verified IR — source-backed, not modeled remaining. */
  sourceBackedGrossCapacityMm: number | null;
  valueClass: VerifiedExecutableValueClass;
  feedsPosition: boolean;
  displayedOnDashboard: boolean;
  limitations: string[];
};

export type VerifiedExecutableCompileBridgeResult = {
  asOfDate: string;
  candidatesAttempted: number;
  verifiedExecutableUnits: VerifiedExecutableCompileUnit[];
  /** Count of VE units that feed Position as GROSS (not AVAILABLE remaining). */
  verifiedExecutableUnitsFeedingPosition: number;
  productionCapacityPublished: boolean;
  trustedIdentityActivation: string;
  path: string[];
  limitations: string[];
};

/**
 * Isolate Permitted Debt (1)(a) sole-cap text from the Indenture excerpt.
 * Returns null when the authentic excerpt no longer contains the cap language.
 */
export function extractMatthewsPermittedDebt1aCandidate(): OperativeClauseCandidate | null {
  const text = MATTHEWS_INDENTURE_SOURCE.text;
  const match = text.match(
    /\(1\)\s*\(a\)\s*Debt under Debt Facilities and Qualified Receivables Transactions in an\s*aggregate principal amount outstanding not to exceed \$1,300,000,000/i,
  );
  if (!match) return null;
  return {
    candidateId: "matw-permitted-debt-1a-fixed-dollar",
    documentId: MATTHEWS_INDENTURE_SOURCE.documentId,
    sourceSectionRef: "def:Permitted Debt(1)(a)",
    operativeSourceText: `${match[0]}, plus`,
    relatedLeafCode: "ind_permitted_debt_1a_flat",
  };
}

/**
 * Notes grandfather clause — dollar present but not a "not to exceed" cap role.
 * Included so the bridge demonstrates fail-closed refusal (not silent skip).
 */
export function extractMatthewsNotesGrandfatherCandidate(): OperativeClauseCandidate | null {
  const text = MATTHEWS_INDENTURE_SOURCE.text;
  const match = text.match(
    /\(2\)\s*Debt represented by the Notes issued on the Issue Date in an aggregate principal\s*amount of \$300,000,000/i,
  );
  if (!match) return null;
  return {
    candidateId: "matw-permitted-debt-2-notes",
    documentId: MATTHEWS_INDENTURE_SOURCE.documentId,
    sourceSectionRef: "def:Permitted Debt(2)",
    operativeSourceText: `${match[0]};`,
    relatedLeafCode: "ind_permitted_debt_2_notes",
  };
}

/** CA §6.01(j) — no fixed-dollar cap; refuse VE compile. */
export function extractMatthewsCaLienCandidate(): OperativeClauseCandidate | null {
  const text = MATTHEWS_CREDIT_AGREEMENT_SOURCE.text;
  const match = text.match(/\(j\)\s*Liens securing the 2024 Note Offering[\s\S]*?Sixth Amendment\)\./i);
  if (!match) return null;
  return {
    candidateId: "matw-ca-601j",
    documentId: MATTHEWS_CREDIT_AGREEMENT_SOURCE.documentId,
    sourceSectionRef: "6.01(j)",
    operativeSourceText: match[0],
    relatedLeafCode: "ca_lien_601j_2024notes",
  };
}

export function matthewsVerifiedExecutableCandidates(): OperativeClauseCandidate[] {
  return [
    extractMatthewsPermittedDebt1aCandidate(),
    extractMatthewsNotesGrandfatherCandidate(),
    extractMatthewsCaLienCandidate(),
  ].filter((c): c is OperativeClauseCandidate => c != null);
}

function compileOne(
  candidate: OperativeClauseCandidate,
  asOfDate: string,
): VerifiedExecutableCompileUnit {
  const classification = classifyFixedDollarBasket(candidate.operativeSourceText);
  const baseLimitations = [
    "Gross contractual from verified fixed-dollar IR — not netted remaining.",
    "Not PRODUCTION_AUTHORITATIVE; trusted-identity BLOCKED.",
    "EDGAR-reconstructed operative excerpt — not package CERTIFIED IR.",
  ];

  if (classification.class === "NOT_FIXED_DOLLAR" || classification.amountUsd == null) {
    return {
      candidateId: candidate.candidateId,
      documentId: candidate.documentId,
      sourceSectionRef: candidate.sourceSectionRef,
      relatedLeafCode: candidate.relatedLeafCode,
      compileClass: "NOT_ATTEMPTED",
      classificationClass: classification.class,
      fidelityVerdict: null,
      hypotheticalOutcome: "NOT_ATTEMPTED",
      productionOutcome: "NOT_ATTEMPTED",
      sourceBackedGrossCapacityMm: null,
      valueClass: "REFUSED_NOT_FIXED_DOLLAR",
      feedsPosition: false,
      displayedOnDashboard: true,
      limitations: [
        ...baseLimitations,
        `Refuse VE compile: ${classification.reasons.join(", ") || "not_fixed_dollar"}.`,
      ],
    };
  }

  const compiled = compileFixedDollarBasket({
    companyId: "matthews",
    instrumentKey: "matthews-international-q1-fy2025",
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
      valueClass: "REFUSED_COMPILE_OR_FIDELITY",
      feedsPosition: false,
      displayedOnDashboard: true,
      limitations: [...baseLimitations, `Compile refused: ${compiled.executableClass}.`],
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
      limitations: [
        ...baseLimitations,
        `Fidelity=${hypo.fidelity.verdict}; hypo=${hypo.outcomeLabel}.`,
      ],
    };
  }

  // VE path succeeded for hypothetical gross. Production must remain refused.
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
    valueClass: productionRefused
      ? "SOURCE_BACKED_COMPILED_GROSS"
      : "REFUSED_PRODUCTION",
    // Feed Position only when production is correctly refused (fail-closed).
    feedsPosition: productionRefused,
    displayedOnDashboard: true,
    limitations: [
      ...baseLimitations,
      `SOURCE_BACKED_COMPILED_GROSS=$${grossMm}M from operative "not to exceed" language.`,
      "Distinct from leaf evaluateProvision modeled room (e.g. $521.118M after secured debt).",
      productionRefused
        ? "PRODUCTION_CAPACITY_REFUSED preserved."
        : "Unexpected production success — refused Position feed.",
    ],
  };
}

/**
 * Compile Matthews operative candidates through the verified fixed-dollar path.
 * Provider-free; no Neon writes; production capacity never published.
 */
export function compileMatthewsVerifiedExecutableBridge(
  asOfDate = "2024-12-31",
): VerifiedExecutableCompileBridgeResult {
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const path: string[] = ["operative-clause-candidates"];
  const candidates = matthewsVerifiedExecutableCandidates();
  path.push(`candidates:${candidates.length}`);

  const units = candidates.map((c) => {
    const unit = compileOne(c, asOfDate);
    path.push(
      unit.feedsPosition
        ? `ve-feed:${unit.candidateId}:${unit.sourceBackedGrossCapacityMm}`
        : `ve-refuse:${unit.candidateId}:${unit.valueClass}`,
    );
    return unit;
  });

  const feeding = units.filter((u) => u.feedsPosition);

  return {
    asOfDate,
    candidatesAttempted: candidates.length,
    verifiedExecutableUnits: units,
    verifiedExecutableUnitsFeedingPosition: feeding.length,
    productionCapacityPublished: false,
    trustedIdentityActivation: TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status,
    path,
    limitations: [
      "Only FIXED_DOLLAR_SOLE_CAP / gated fixed-dollar clauses become VE units.",
      "Ratio rooms (FCCR, leverage) are NOT compiled here — remain leaf evaluateProvision (MODELED).",
      "VE figures are SOURCE_BACKED_COMPILED_GROSS — never customer AVAILABLE remaining.",
      "AUTONOMOUS_COVENANT_COMPILATION_PROVEN remains NOT_PROVEN until all Position capacity leaves hand-encoded CovenantProvisionInput.",
      "Production IdP / trusted-issuer BLOCKED; no Neon writes; no paid inference.",
    ],
  };
}
