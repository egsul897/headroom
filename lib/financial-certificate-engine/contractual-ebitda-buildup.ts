/**
 * Contractual Consolidated EBITDA derivation / evidence breakdown.
 *
 * Extends the financial-certificate-engine — not a parallel capacity engine.
 * Distinguishes:
 *   - REPORTED_ONLY: certificate/seed reports a covenant EBITDA; no independent build-up
 *   - INDEPENDENTLY_DERIVED: components sum to the binding figure under a definition-first schedule
 *   - SUPPORTING_RECONSTRUCTION: public-filing line items reconstruct a nearby figure but
 *     do not independently confirm the binding reported value (methodology-order disclosure)
 *
 * Never invents missing component amounts. Never substitutes GAAP for contractual EBITDA.
 */

import type { EngineRunResult, ExtractedAdjustment, ExtractedDefinitionRef } from "./types";

export type EbitdaDerivationKind =
  | "INDEPENDENTLY_DERIVED"
  | "REPORTED_ONLY"
  | "SUPPORTING_RECONSTRUCTION"
  | "MISSING_INPUT";

export type EbitdaComponentApproval =
  | "REPORTED"
  | "RECONSTRUCTED"
  | "VERIFIED_LINE_ITEM"
  | "UNVERIFIED"
  | "UNRESOLVED";

export interface EbitdaBuildupComponent {
  label: string;
  amountMillions: number | null;
  amountMissing: boolean;
  sign: "plus" | "minus";
  documentCitation: string;
  measurementPeriod: string | null;
  approvalStatus: EbitdaComponentApproval;
  unresolvedNote?: string;
}

export interface ContractualEbitdaDerivation {
  kind: EbitdaDerivationKind;
  /** Value bound for capacity / ratio math — contractual only. */
  bindingContractualEbitdaMillions: number | null;
  /** Arithmetic sum of non-missing components when a schedule is present. */
  componentSumMillions: number | null;
  measurementPeriod: string | null;
  asOfDate: string | null;
  definitionTerm: string | null;
  definitionExcerpt: string | null;
  definitionCitation: string | null;
  components: EbitdaBuildupComponent[];
  unresolvedAdjustments: string[];
  /** Approval / authority label for the binding figure. */
  bindingApprovalStatus: string;
  methodologyDisclosure: string | null;
  notes: string[];
}

/** Structured evidence package — caller-supplied; no company-id branching inside the resolver. */
export interface ContractualEbitdaEvidencePackage {
  bindingContractualEbitdaMillions: number;
  asOfDate: string;
  measurementPeriod: string;
  definitionTerm: string;
  definitionExcerpt: string;
  definitionCitation: string;
  bindingApprovalStatus: string;
  /**
   * When true, components are a definition-first derivation of the binding value.
   * When false, components are at most a supporting reconstruction.
   */
  methodologyIndependent: boolean;
  components: EbitdaBuildupComponent[];
  unresolvedAdjustments: string[];
  methodologyDisclosure: string | null;
  notes?: string[];
}

const SUM_TOLERANCE = 0.05; // $M — allow minor rounding between $K→$M

function sumComponents(components: EbitdaBuildupComponent[]): number | null {
  if (components.length === 0) return null;
  if (components.some((c) => c.amountMissing || c.amountMillions == null)) return null;
  return components.reduce((acc, c) => {
    const amt = c.amountMillions!;
    return acc + (c.sign === "minus" ? -Math.abs(amt) : amt);
  }, 0);
}

/**
 * Resolve contractual EBITDA derivation from a structured evidence package.
 * Company-agnostic: behavior depends only on methodologyIndependent + component completeness.
 */
export function resolveContractualEbitdaDerivation(
  evidence: ContractualEbitdaEvidencePackage,
): ContractualEbitdaDerivation {
  const componentSum = sumComponents(evidence.components);
  const unresolved = [...evidence.unresolvedAdjustments];
  const notes = [
    "GAAP EBITDA is never substituted for contractual Consolidated EBITDA.",
    ...(evidence.notes ?? []),
  ];

  if (!evidence.methodologyIndependent) {
    if (componentSum != null) {
      const gap = evidence.bindingContractualEbitdaMillions - componentSum;
      if (Math.abs(gap) > SUM_TOLERANCE) {
        unresolved.push(
          `Binding reported covenant EBITDA $${evidence.bindingContractualEbitdaMillions}M differs from supporting reconstruction sum $${componentSum.toFixed(3)}M (gap $${gap.toFixed(3)}M) — not treated as independent derivation.`,
        );
      }
    }
    return {
      kind: componentSum != null ? "SUPPORTING_RECONSTRUCTION" : "REPORTED_ONLY",
      bindingContractualEbitdaMillions: evidence.bindingContractualEbitdaMillions,
      componentSumMillions: componentSum,
      measurementPeriod: evidence.measurementPeriod,
      asOfDate: evidence.asOfDate,
      definitionTerm: evidence.definitionTerm,
      definitionExcerpt: evidence.definitionExcerpt,
      definitionCitation: evidence.definitionCitation,
      components: evidence.components,
      unresolvedAdjustments: unresolved,
      bindingApprovalStatus: evidence.bindingApprovalStatus,
      methodologyDisclosure: evidence.methodologyDisclosure,
      notes: [
        ...notes,
        "Binding capacity figure is the reported/seeded covenant EBITDA — supporting reconstruction does not independently confirm it.",
      ],
    };
  }

  if (componentSum == null) {
    return {
      kind: "REPORTED_ONLY",
      bindingContractualEbitdaMillions: evidence.bindingContractualEbitdaMillions,
      componentSumMillions: null,
      measurementPeriod: evidence.measurementPeriod,
      asOfDate: evidence.asOfDate,
      definitionTerm: evidence.definitionTerm,
      definitionExcerpt: evidence.definitionExcerpt,
      definitionCitation: evidence.definitionCitation,
      components: evidence.components,
      unresolvedAdjustments: [
        ...unresolved,
        "Component schedule incomplete — cannot claim independent derivation.",
      ],
      bindingApprovalStatus: evidence.bindingApprovalStatus,
      methodologyDisclosure: evidence.methodologyDisclosure,
      notes,
    };
  }

  const gap = Math.abs(componentSum - evidence.bindingContractualEbitdaMillions);
  if (gap > SUM_TOLERANCE) {
    unresolved.push(
      `Component sum $${componentSum.toFixed(3)}M does not match binding $${evidence.bindingContractualEbitdaMillions}M within tolerance — derivation not closed.`,
    );
    return {
      kind: "SUPPORTING_RECONSTRUCTION",
      bindingContractualEbitdaMillions: evidence.bindingContractualEbitdaMillions,
      componentSumMillions: componentSum,
      measurementPeriod: evidence.measurementPeriod,
      asOfDate: evidence.asOfDate,
      definitionTerm: evidence.definitionTerm,
      definitionExcerpt: evidence.definitionExcerpt,
      definitionCitation: evidence.definitionCitation,
      components: evidence.components,
      unresolvedAdjustments: unresolved,
      bindingApprovalStatus: evidence.bindingApprovalStatus,
      methodologyDisclosure: evidence.methodologyDisclosure,
      notes,
    };
  }

  return {
    kind: "INDEPENDENTLY_DERIVED",
    bindingContractualEbitdaMillions: evidence.bindingContractualEbitdaMillions,
    componentSumMillions: componentSum,
    measurementPeriod: evidence.measurementPeriod,
    asOfDate: evidence.asOfDate,
    definitionTerm: evidence.definitionTerm,
    definitionExcerpt: evidence.definitionExcerpt,
    definitionCitation: evidence.definitionCitation,
    components: evidence.components,
    unresolvedAdjustments: unresolved,
    bindingApprovalStatus: evidence.bindingApprovalStatus,
    methodologyDisclosure: evidence.methodologyDisclosure,
    notes: [...notes, "Component schedule sums to binding contractual EBITDA within tolerance."],
  };
}

/**
 * Derive from an FCE engine run alone (certificate reported value + nearby adjustments).
 * Amount-less addbacks become unresolved — never invented.
 */
export function deriveContractualEbitdaFromEngineRun(run: EngineRunResult): ContractualEbitdaDerivation {
  const cert = run.certificate;
  const ebitdaMetric =
    cert?.metrics.find((m) => m.family === "CONTRACTUAL_EBITDA") ??
    run.capacityMetrics.find((m) => m.metricName === "covenant_ebitda");

  const binding =
    ebitdaMetric && "canonicalValue" in ebitdaMetric
      ? ebitdaMetric.canonicalValue
      : ebitdaMetric && "value" in ebitdaMetric
        ? (ebitdaMetric as { value: number }).value
        : null;

  if (binding == null) {
    return {
      kind: "MISSING_INPUT",
      bindingContractualEbitdaMillions: null,
      componentSumMillions: null,
      measurementPeriod: null,
      asOfDate: run.reconciliation.asOfDate,
      definitionTerm: null,
      definitionExcerpt: null,
      definitionCitation: null,
      components: [],
      unresolvedAdjustments: ["CONTRACTUAL_EBITDA missing from certificate/statement evidence"],
      bindingApprovalStatus: run.reconciliation.disposition,
      methodologyDisclosure: null,
      notes: ["GAAP is never substituted."],
    };
  }

  const calc = cert?.certificateCalculations.find((c) => c.family === "CONTRACTUAL_EBITDA");
  const adjustments: ExtractedAdjustment[] = calc?.components?.length
    ? calc.components
    : cert?.adjustments.filter((a) => a.kind === "ADDBACK" || a.kind === "EXCLUSION" || a.kind === "PRO_FORMA") ??
      [];

  const def: ExtractedDefinitionRef | undefined = cert?.definitions.find((d) =>
    /Consolidated EBITDA/i.test(d.term),
  );

  const components: EbitdaBuildupComponent[] = adjustments.map((a) => ({
    label: a.label,
    amountMillions: a.amountMillions,
    amountMissing: a.amountMissing || a.amountMillions == null,
    sign: a.kind === "EXCLUSION" ? "minus" : "plus",
    documentCitation: `${a.source.documentRole} · ${a.source.documentId}${a.source.section ? ` · ${a.source.section}` : ""}`,
    measurementPeriod: cert?.identity.reportingPeriod ?? null,
    approvalStatus: a.amountMissing ? "UNRESOLVED" : "UNVERIFIED",
    unresolvedNote: a.amountMissing ? "Amount not present in source — not invented." : undefined,
  }));

  const unresolved = components
    .filter((c) => c.amountMissing)
    .map((c) => `Addback/exclusion without amount: ${c.label}`);

  const componentSum = sumComponents(components.filter((c) => !c.amountMissing));

  // Certificate path alone never claims independent derivation unless every
  // component has an amount AND the sum matches the reported value.
  if (components.length === 0 || components.some((c) => c.amountMissing) || componentSum == null) {
    return {
      kind: "REPORTED_ONLY",
      bindingContractualEbitdaMillions: binding,
      componentSumMillions: componentSum,
      measurementPeriod: cert?.identity.reportingPeriod ?? null,
      asOfDate: run.reconciliation.asOfDate ?? cert?.identity.fiscalDate ?? null,
      definitionTerm: def?.term ?? "Consolidated EBITDA",
      definitionExcerpt: def?.excerpt ?? null,
      definitionCitation: def?.source.section ?? def?.source.documentId ?? null,
      components,
      unresolvedAdjustments: unresolved,
      bindingApprovalStatus: `${run.reconciliation.disposition} (extraction — not capacity approval)`,
      methodologyDisclosure: null,
      notes: [
        "Binding figure is the certificate-reported Consolidated EBITDA.",
        "Incomplete or amount-less addbacks prevent an independent build-up claim.",
      ],
    };
  }

  const gap = Math.abs(componentSum - binding);
  if (gap > SUM_TOLERANCE) {
    return {
      kind: "SUPPORTING_RECONSTRUCTION",
      bindingContractualEbitdaMillions: binding,
      componentSumMillions: componentSum,
      measurementPeriod: cert?.identity.reportingPeriod ?? null,
      asOfDate: run.reconciliation.asOfDate ?? null,
      definitionTerm: def?.term ?? "Consolidated EBITDA",
      definitionExcerpt: def?.excerpt ?? null,
      definitionCitation: def?.source.section ?? null,
      components,
      unresolvedAdjustments: [
        ...unresolved,
        `Component sum $${componentSum.toFixed(3)}M ≠ reported $${binding}M — not closed as independent derivation.`,
      ],
      bindingApprovalStatus: `${run.reconciliation.disposition} (extraction — not capacity approval)`,
      methodologyDisclosure: null,
      notes: ["Reported certificate value remains the binding contractual EBITDA."],
    };
  }

  return {
    kind: "INDEPENDENTLY_DERIVED",
    bindingContractualEbitdaMillions: binding,
    componentSumMillions: componentSum,
    measurementPeriod: cert?.identity.reportingPeriod ?? null,
    asOfDate: run.reconciliation.asOfDate ?? null,
    definitionTerm: def?.term ?? "Consolidated EBITDA",
    definitionExcerpt: def?.excerpt ?? null,
    definitionCitation: def?.source.section ?? null,
    components,
    unresolvedAdjustments: unresolved,
    bindingApprovalStatus: `${run.reconciliation.disposition} (extraction — not capacity approval)`,
    methodologyDisclosure: null,
    notes: ["Certificate components sum to reported Consolidated EBITDA within tolerance."],
  };
}

/**
 * Merge a structured evidence package over an engine-run derivation.
 * Evidence package controls methodologyIndependence; engine supplies definition/reported cross-check.
 */
export function mergeEbitdaDerivationWithEvidence(
  fromEngine: ContractualEbitdaDerivation,
  evidence: ContractualEbitdaEvidencePackage,
): ContractualEbitdaDerivation {
  const fromEvidence = resolveContractualEbitdaDerivation(evidence);
  // Prefer evidence schedule for components; keep engine definition if evidence lacks excerpt.
  return {
    ...fromEvidence,
    definitionExcerpt: fromEvidence.definitionExcerpt ?? fromEngine.definitionExcerpt,
    definitionCitation: fromEvidence.definitionCitation ?? fromEngine.definitionCitation,
    unresolvedAdjustments: [
      ...new Set([...fromEvidence.unresolvedAdjustments, ...fromEngine.unresolvedAdjustments]),
    ],
    notes: [...fromEvidence.notes, ...fromEngine.notes.filter((n) => !fromEvidence.notes.includes(n))],
  };
}
