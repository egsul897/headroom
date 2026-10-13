/**
 * Canonical financial metric resolver — one entrypoint for capacity / simulation inputs.
 *
 * APPROVED_SNAPSHOT authority is derived only from a validated NS-4 APPROVED snapshot.
 * There is no caller force-override on the production API.
 */

import { createHash } from "crypto";
import type { FinancialSnapshotInput } from "@/lib/covenant-engine";
import type { FinancialSnapshot } from "@/lib/contract-model/north-star-bridge";
import { resolveContractualEbitdaDerivation } from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";
import { computeContractualMetricsPure } from "@/lib/product/contractual-metrics/service";
import { moneyMetricInput, type MetricInput } from "@/lib/contract-model/definition-execution";
import { resolveRegisteredPackage, type RegisteredFinancialPackage } from "./registry";
import { deriveEvidenceAuthority } from "./ns4-approval";
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

function readinessFor(
  auth: FinancialEvidenceAuthority,
  valueMillions: number | null,
): TypedFinancialFact["readiness"] {
  if (valueMillions == null) return "MISSING";
  if (auth === "NONE") return "MISSING";
  if (auth === "APPROVED_SNAPSHOT") return "AVAILABLE_VERIFIED";
  return "AVAILABLE_UNVERIFIED";
}

function moneyMetric(key: string, millions: number, period: string, asOf: string, note: string): MetricInput {
  return moneyMetricInput(key, millions, period, asOf, note);
}

function fingerprint(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

function factsFromAuthority(
  pkg: RegisteredFinancialPackage,
  ebitdaMillions: number | null,
  evidenceAuthority: FinancialEvidenceAuthority,
): TypedFinancialFact[] {
  return [
    {
      key: "contractual_ebitda",
      label: "Consolidated EBITDA (contractual)",
      valueMillions: ebitdaMillions,
      readiness: readinessFor(evidenceAuthority, ebitdaMillions),
      sourceCitation: pkg.ebitdaEvidence.definitionCitation,
      evidenceAuthority,
    },
    {
      key: "total_debt",
      label: "Consolidated Total Debt",
      valueMillions: pkg.totalDebt,
      readiness: readinessFor(evidenceAuthority, pkg.totalDebt),
      sourceCitation: `${pkg.sourceDocumentId} / financial evidence`,
      evidenceAuthority,
    },
    {
      key: "secured_debt",
      label: "Consolidated Secured Debt",
      valueMillions: pkg.securedDebt,
      readiness: readinessFor(evidenceAuthority, pkg.securedDebt),
      sourceCitation: `${pkg.sourceDocumentId} / financial evidence`,
      evidenceAuthority,
    },
    {
      key: "cash",
      label: "Unrestricted Cash",
      valueMillions: pkg.cash,
      readiness: readinessFor(evidenceAuthority, pkg.cash),
      sourceCitation: `${pkg.sourceDocumentId} / financial evidence`,
      evidenceAuthority,
    },
    {
      key: "interest_expense",
      label: "Consolidated Interest Expense",
      valueMillions: pkg.interestExpense,
      readiness: readinessFor(evidenceAuthority, pkg.interestExpense),
      sourceCitation: `${pkg.sourceDocumentId} / financial evidence`,
      evidenceAuthority,
    },
  ];
}

function toLegacySnapshot(pkg: RegisteredFinancialPackage, ebitda: number): FinancialSnapshotInput {
  return {
    ebitda,
    cash: pkg.cash,
    interestExpense: pkg.interestExpense,
    cumulativeNetIncome: pkg.cumulativeNetIncome,
    equityProceedsSinceIssue: pkg.equityProceedsSinceIssue,
    assumedNewDebtRatePct: pkg.assumedNewDebtRatePct,
    totalDebt: pkg.totalDebt,
    securedDebt: pkg.securedDebt,
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
   * Persisted NS-4 FinancialSnapshot. APPROVED_SNAPSHOT authority is granted
   * only when this snapshot passes validation (status, reviewer, approvalRef,
   * company/instrument scope, measurement period, as-of). Omitting it retains
   * the package's provisional/synthetic authority.
   */
  approvedNs4Snapshot?: FinancialSnapshot | null;
  /**
   * When true, reviewer classification may yield REAL_REVIEWER_APPROVED.
   * Default false — test-attributed reviewers stay disclosed as such.
   * Does not bypass structural validation.
   */
  productionContext?: boolean;
}

/**
 * Resolve canonical financial inputs by packageKey (preferred) or instrumentKey.
 * companyId is accepted only as a fixture convenience fallback.
 *
 * No forceEvidenceAuthority — provisional/synthetic packages cannot be promoted
 * by caller arguments.
 */
export async function resolveCanonicalFinancialInputs(
  args: ResolveCanonicalFinancialInputsArgs,
): Promise<CanonicalFinancialInputBundle | null> {
  const pkg = resolveRegisteredPackage(args);
  if (!pkg) return null;

  const derived = deriveEvidenceAuthority({
    pkg,
    approvedNs4Snapshot: args.approvedNs4Snapshot,
    productionContext: args.productionContext,
  });
  const evidenceAuthority = derived.evidenceAuthority;
  const ebitdaDerivation = resolveContractualEbitdaDerivation(pkg.ebitdaEvidence);

  // Phase 4A definition execution when a contractual-metrics package exists.
  let contractualMetrics = null;
  let ebitdaMillions: number | null = ebitdaDerivation.bindingContractualEbitdaMillions;
  if (pkg.contractualMetricsCompanyId === "matthews" || pkg.contractualMetricsCompanyId === "coherent") {
    contractualMetrics = await computeContractualMetricsPure(pkg.contractualMetricsCompanyId);
    if (contractualMetrics.consolidatedEbitda?.status === "CALCULATED") {
      ebitdaMillions = contractualMetrics.consolidatedEbitda.valueMillions;
    }
  } else if (ebitdaDerivation.kind === "INDEPENDENTLY_DERIVED" || ebitdaDerivation.kind === "REPORTED_ONLY") {
    ebitdaMillions = ebitdaDerivation.bindingContractualEbitdaMillions;
  }

  const missingInputs: string[] = [];
  if (ebitdaMillions == null) missingInputs.push("contractual_ebitda");
  if (!Number.isFinite(pkg.totalDebt)) missingInputs.push("total_debt");
  if (!Number.isFinite(pkg.cash)) missingInputs.push("cash");

  const legacyFinancialSnapshot =
    ebitdaMillions != null && missingInputs.length === 0 ? toLegacySnapshot(pkg, ebitdaMillions) : null;

  const runtimeMetrics: MetricInput[] = [];
  if (ebitdaMillions != null) {
    runtimeMetrics.push(
      moneyMetric("Consolidated EBITDA", ebitdaMillions, pkg.measurementPeriod, pkg.asOf, evidenceAuthority),
      moneyMetric(
        "Compliance Certificate Consolidated EBITDA",
        ebitdaMillions,
        pkg.measurementPeriod,
        pkg.asOf,
        evidenceAuthority,
      ),
    );
  }
  runtimeMetrics.push(
    moneyMetric("Consolidated Total Debt", pkg.totalDebt, pkg.measurementPeriod, pkg.asOf, evidenceAuthority),
    moneyMetric("Consolidated Secured Debt", pkg.securedDebt, pkg.measurementPeriod, pkg.asOf, evidenceAuthority),
    moneyMetric("Unrestricted Cash", pkg.cash, pkg.measurementPeriod, pkg.asOf, evidenceAuthority),
    moneyMetric(
      "Consolidated Interest Expense",
      pkg.interestExpense,
      pkg.measurementPeriod,
      pkg.asOf,
      evidenceAuthority,
    ),
  );

  // APPROVED → GROSS_FROM_APPROVED_SNAPSHOT only. Verified remaining requires
  // independent ledger completeness evidence (never implied by snapshot approval).
  const capacityPublication = publicationFor(evidenceAuthority);

  const notes = [
    "Canonical resolver: package/instrument-driven; companyId is fixture convenience only.",
    "Provisional / synthetic evidence never yields verified remaining capacity or PRODUCTION_AUTHORITY.",
    "UNKNOWN utilization ≠ zero; verified remaining stays null until utilization completeness is established.",
    `EBITDA derivation kind: ${ebitdaDerivation.kind}`,
    ...(ebitdaDerivation.methodologyDisclosure ? [ebitdaDerivation.methodologyDisclosure] : []),
    ...ebitdaDerivation.notes,
    ...derived.notes,
  ];

  const dependencyFingerprint = fingerprint([
    pkg.packageKey,
    pkg.instrumentKey,
    pkg.operativeVersionLabel,
    ebitdaMillions,
    pkg.totalDebt,
    pkg.securedDebt,
    pkg.cash,
    pkg.interestExpense,
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
    facts: factsFromAuthority(pkg, ebitdaMillions, evidenceAuthority),
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
 * Verified remaining / PRODUCTION_AUTHORITY require APPROVED + separate utilization
 * completeness. This resolver never sets VERIFIED_REMAINING_ELIGIBLE from snapshot
 * approval alone — UNKNOWN utilization cannot become verified remaining.
 */
export function mayClaimVerifiedRemaining(bundle: CanonicalFinancialInputBundle): boolean {
  return bundle.capacityPublication === "VERIFIED_REMAINING_ELIGIBLE";
}
