/**
 * Canonical financial metric resolver — one entrypoint for capacity / simulation inputs.
 *
 * APPROVED_SNAPSHOT on a published number requires an exact NS-4 input binding
 * (value, unit, metric key, sourceVersion, period, as-of, snapshot identity).
 * Structural snapshot presence alone never labels package/computed figures APPROVED.
 * There is no forceEvidenceAuthority on the production API.
 */

import { createHash } from "crypto";
import type { FinancialSnapshotInput } from "@/lib/covenant-engine";
import type { FinancialSnapshot } from "@/lib/contract-model/north-star-bridge";
import { resolveContractualEbitdaDerivation } from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";
import { computeContractualMetricsPure } from "@/lib/product/contractual-metrics/service";
import { moneyMetricInput, type MetricInput } from "@/lib/contract-model/definition-execution";
import { resolveRegisteredPackage, type RegisteredFinancialPackage } from "./registry";
import { validateApprovedNs4SnapshotForPackage } from "./ns4-approval";
import {
  planPublishedFacts,
  type PublishedFactKey,
} from "./ns4-value-binding";
import type {
  CanonicalFinancialInputBundle,
  CapacityPublicationAuthority,
  FinancialEvidenceAuthority,
  TypedFinancialFact,
} from "./types";

function publicationFor(auth: FinancialEvidenceAuthority): CapacityPublicationAuthority {
  switch (auth) {
    case "APPROVED_SNAPSHOT":
      return "GROSS_FROM_APPROVED_SNAPSHOT";
    case "PROVISIONAL_RECONSTRUCTION":
      return "GROSS_PROVISIONAL_ONLY";
    case "SYNTHETIC_LABELED":
      return "GROSS_PROVISIONAL_ONLY";
    case "NONE":
      return "REFUSED";
  }
}

function moneyMetric(key: string, millions: number, period: string, asOf: string, note: string): MetricInput {
  return moneyMetricInput(key, millions, period, asOf, note);
}

function fingerprint(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

function packageBaselineAuthority(pkg: RegisteredFinancialPackage): FinancialEvidenceAuthority {
  const baseline = pkg.evidenceAuthority;
  return baseline === "APPROVED_SNAPSHOT" ? "PROVISIONAL_RECONSTRUCTION" : baseline;
}

function toLegacySnapshot(
  values: Record<PublishedFactKey, number | null>,
  pkg: RegisteredFinancialPackage,
): FinancialSnapshotInput | null {
  const ebitda = values.contractual_ebitda;
  const cash = values.cash;
  const totalDebt = values.total_debt;
  const securedDebt = values.secured_debt;
  const interestExpense = values.interest_expense;
  if (
    ebitda == null ||
    cash == null ||
    totalDebt == null ||
    securedDebt == null ||
    interestExpense == null
  ) {
    return null;
  }
  return {
    ebitda,
    cash,
    interestExpense,
    cumulativeNetIncome: pkg.cumulativeNetIncome,
    equityProceedsSinceIssue: pkg.equityProceedsSinceIssue,
    assumedNewDebtRatePct: pkg.assumedNewDebtRatePct,
    totalDebt,
    securedDebt,
    totalAssets: pkg.totalAssets,
  };
}

export interface ResolveCanonicalFinancialInputsArgs {
  packageKey?: string | null;
  instrumentKey?: string | null;
  companyId?: string | null;
  /**
   * Optional ledger content fingerprint for dependency invalidation.
   * Does not imply utilization completeness or verified remaining.
   */
  ledgerFingerprint?: string;
  /**
   * Persisted NS-4 FinancialSnapshot. Individual facts become APPROVED_SNAPSHOT
   * only when bound to exact snapshot inputs (not merely because this object is present).
   */
  approvedNs4Snapshot?: FinancialSnapshot | null;
  /**
   * When true, reviewer classification may yield REAL_REVIEWER_APPROVED.
   * Default false — nonempty reviewedBy/approvalRef alone is never trusted-issuer proof.
   */
  productionContext?: boolean;
}

/**
 * Resolve canonical financial inputs by packageKey (preferred) or instrumentKey.
 * companyId is accepted only as a fixture convenience fallback.
 */
export async function resolveCanonicalFinancialInputs(
  args: ResolveCanonicalFinancialInputsArgs,
): Promise<CanonicalFinancialInputBundle | null> {
  const pkg = resolveRegisteredPackage(args);
  if (!pkg) return null;

  const baselineAuthority = packageBaselineAuthority(pkg);
  const ebitdaDerivation = resolveContractualEbitdaDerivation(pkg.ebitdaEvidence);

  // Phase 4A / package fallbacks — never auto-labeled APPROVED.
  let contractualMetrics = null;
  let fallbackEbitda: number | null = ebitdaDerivation.bindingContractualEbitdaMillions;
  if (pkg.contractualMetricsCompanyId === "matthews" || pkg.contractualMetricsCompanyId === "coherent") {
    contractualMetrics = await computeContractualMetricsPure(pkg.contractualMetricsCompanyId);
    if (contractualMetrics.consolidatedEbitda?.status === "CALCULATED") {
      fallbackEbitda = contractualMetrics.consolidatedEbitda.valueMillions;
    }
  } else if (ebitdaDerivation.kind === "INDEPENDENTLY_DERIVED" || ebitdaDerivation.kind === "REPORTED_ONLY") {
    fallbackEbitda = ebitdaDerivation.bindingContractualEbitdaMillions;
  }

  const fallbacks: Record<PublishedFactKey, number | null> = {
    contractual_ebitda: fallbackEbitda,
    total_debt: Number.isFinite(pkg.totalDebt) ? pkg.totalDebt : null,
    secured_debt: Number.isFinite(pkg.securedDebt) ? pkg.securedDebt : null,
    cash: Number.isFinite(pkg.cash) ? pkg.cash : null,
    interest_expense: Number.isFinite(pkg.interestExpense) ? pkg.interestExpense : null,
  };

  const structuralNotes: string[] = [];
  let structuralOk = false;
  let reviewerDisclosure: string | null = null;
  let realReviewerApproval = false;

  if (args.approvedNs4Snapshot) {
    const validation = validateApprovedNs4SnapshotForPackage(args.approvedNs4Snapshot, pkg, {
      productionContext: args.productionContext,
    });
    if (validation.ok) {
      structuralOk = true;
      reviewerDisclosure = validation.authorityDisclosure;
      realReviewerApproval = validation.realReviewerApproval;
      structuralNotes.push(
        `NS-4 snapshot ${validation.snapshotId} passed structural validation for package ${pkg.packageKey}`,
        validation.authorityDisclosure,
        realReviewerApproval
          ? "Reviewer classified REAL_REVIEWER_APPROVED (productionContext + non-test identity)"
          : "Nonempty reviewedBy/approvalRef is NOT trusted-issuer proof — classified TEST_ATTRIBUTED_APPROVAL unless productionContext + non-test reviewer",
      );
    } else {
      structuralNotes.push(
        "NS-4 snapshot failed structural validation — no fact may be APPROVED_SNAPSHOT from this snapshot",
        ...validation.reasons.map((r) => `NS-4 validation: ${r}`),
      );
    }
  }

  const planned = planPublishedFacts({
    pkg,
    fallbacks,
    baselineAuthority,
    approvedNs4Snapshot: args.approvedNs4Snapshot,
    structuralOk,
  });

  const facts: TypedFinancialFact[] = planned.facts.map((f) => ({
    key: f.factKey,
    label: f.label,
    valueMillions: f.valueMillions,
    readiness: f.readiness,
    sourceCitation: f.sourceCitation,
    evidenceAuthority: f.evidenceAuthority,
    approvedProvenance: f.provenance,
  }));

  // Bundle APPROVED only when every capacity-critical published fact is approved-bound.
  const evidenceAuthority: FinancialEvidenceAuthority = planned.allCapacityFactsApproved
    ? "APPROVED_SNAPSHOT"
    : baselineAuthority;
  const capacityPublication = publicationFor(evidenceAuthority);

  const publishedValues = Object.fromEntries(
    planned.facts.map((f) => [f.factKey, f.valueMillions]),
  ) as Record<PublishedFactKey, number | null>;

  const missingInputs: string[] = [];
  for (const key of Object.keys(publishedValues) as PublishedFactKey[]) {
    if (publishedValues[key] == null) missingInputs.push(key);
  }

  const legacyFinancialSnapshot = toLegacySnapshot(publishedValues, pkg);

  const runtimeMetrics: MetricInput[] = [];
  const ebitdaPub = publishedValues.contractual_ebitda;
  const ebitdaAuth =
    planned.facts.find((f) => f.factKey === "contractual_ebitda")?.evidenceAuthority ?? baselineAuthority;
  if (ebitdaPub != null) {
    runtimeMetrics.push(
      moneyMetric("Consolidated EBITDA", ebitdaPub, pkg.measurementPeriod, pkg.asOf, ebitdaAuth),
      moneyMetric(
        "Compliance Certificate Consolidated EBITDA",
        ebitdaPub,
        pkg.measurementPeriod,
        pkg.asOf,
        ebitdaAuth,
      ),
    );
  }
  for (const [factKey, metricName] of [
    ["total_debt", "Consolidated Total Debt"],
    ["secured_debt", "Consolidated Secured Debt"],
    ["cash", "Unrestricted Cash"],
    ["interest_expense", "Consolidated Interest Expense"],
  ] as const) {
    const v = publishedValues[factKey];
    const auth = planned.facts.find((f) => f.factKey === factKey)?.evidenceAuthority ?? baselineAuthority;
    if (v != null) {
      runtimeMetrics.push(moneyMetric(metricName, v, pkg.measurementPeriod, pkg.asOf, auth));
    }
  }

  const notes = [
    "Canonical resolver: package/instrument-driven; companyId is fixture convenience only.",
    "APPROVED_SNAPSHOT attaches only to values bound to exact NS-4 inputs — never to package/computed substitutes merely because a matching approved snapshot exists.",
    "Provisional / synthetic evidence never yields verified remaining capacity or PRODUCTION_AUTHORITY.",
    "Gross mathematical capacity (GROSS_*) is separate from verified remaining — UNKNOWN utilization ≠ zero.",
    `EBITDA derivation kind: ${ebitdaDerivation.kind}`,
    ...(ebitdaDerivation.methodologyDisclosure ? [ebitdaDerivation.methodologyDisclosure] : []),
    ...ebitdaDerivation.notes,
    ...structuralNotes,
    ...planned.notes,
    planned.allCapacityFactsApproved
      ? "All capacity-critical facts approved-bound — bundle GROSS_FROM_APPROVED_SNAPSHOT (verified remaining still refused)"
      : "Not all capacity-critical facts approved-bound — bundle retains package baseline authority for publication",
  ];

  const dependencyFingerprint = fingerprint([
    pkg.packageKey,
    pkg.instrumentKey,
    pkg.operativeVersionLabel,
    publishedValues,
    facts.map((f) => ({
      k: f.key,
      a: f.evidenceAuthority,
      p: f.approvedProvenance,
      v: f.valueMillions,
    })),
    ebitdaDerivation.kind,
    evidenceAuthority,
    args.approvedNs4Snapshot?.snapshotId ?? null,
    args.approvedNs4Snapshot?.version ?? null,
    args.ledgerFingerprint ?? "ledger:absent",
    contractualMetrics?.consolidatedEbitda?.definition?.definitionId ?? null,
  ]);

  return {
    identity: {
      packageKey: pkg.packageKey,
      instrumentKey: pkg.instrumentKey,
      sourceDocumentId: pkg.sourceDocumentId,
      operativeVersionLabel: pkg.operativeVersionLabel,
      companyId: pkg.companyId,
      entityScope: pkg.entityScope,
      measurementPeriod: pkg.measurementPeriod,
      asOf: pkg.asOf,
      currency: "USD",
      unit: "USD_MILLIONS",
    },
    evidenceAuthority,
    capacityPublication,
    contractualMetrics,
    ebitdaDerivation,
    facts,
    unsupportedMechanics: [...pkg.unsupportedMechanics, ...ebitdaDerivation.unresolvedAdjustments],
    missingInputs,
    legacyFinancialSnapshot,
    runtimeMetrics,
    dependencyFingerprint,
    notes,
  };
}

/** True when bundle may feed gross capacity math (not verified remaining). */
export function mayEvaluateGrossCapacity(bundle: CanonicalFinancialInputBundle): boolean {
  return (
    bundle.legacyFinancialSnapshot != null &&
    bundle.capacityPublication !== "REFUSED" &&
    bundle.evidenceAuthority !== "NONE"
  );
}

/**
 * Verified remaining requires APPROVED + independent utilization completeness.
 * Never implied by snapshot approval or gross capacity math.
 */
export function mayClaimVerifiedRemaining(bundle: CanonicalFinancialInputBundle): boolean {
  return bundle.capacityPublication === "VERIFIED_REMAINING_ELIGIBLE";
}
