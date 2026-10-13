/**
 * Canonical financial metric resolver — one entrypoint for capacity / simulation inputs.
 */

import { createHash } from "crypto";
import type { FinancialSnapshotInput } from "@/lib/covenant-engine";
import { resolveContractualEbitdaDerivation } from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";
import { computeContractualMetricsPure } from "@/lib/product/contractual-metrics/service";
import { moneyMetricInput, type MetricInput } from "@/lib/contract-model/definition-execution";
import { resolveRegisteredPackage, type RegisteredFinancialPackage } from "./registry";
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

const AUTHORITY_RANK: Record<FinancialEvidenceAuthority, number> = {
  NONE: 0,
  SYNTHETIC_LABELED: 1,
  PROVISIONAL_RECONSTRUCTION: 2,
  APPROVED_SNAPSHOT: 3,
};

/**
 * forceEvidenceAuthority may demote or leave authority unchanged — never promote
 * synthetic/provisional package facts to APPROVED_SNAPSHOT (or any higher rank).
 */
export function resolveEffectiveEvidenceAuthority(
  packageAuthority: FinancialEvidenceAuthority,
  forced?: FinancialEvidenceAuthority | null,
): { authority: FinancialEvidenceAuthority; refusedPromotion: boolean } {
  if (forced == null) return { authority: packageAuthority, refusedPromotion: false };
  if (AUTHORITY_RANK[forced] > AUTHORITY_RANK[packageAuthority]) {
    return { authority: packageAuthority, refusedPromotion: true };
  }
  return { authority: forced, refusedPromotion: false };
}

function moneyMetric(key: string, millions: number, period: string, asOf: string, note: string): MetricInput {
  return moneyMetricInput(key, millions, period, asOf, note);
}

function fingerprint(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

function factsFromPackage(pkg: RegisteredFinancialPackage, ebitdaMillions: number | null): TypedFinancialFact[] {
  const auth = pkg.evidenceAuthority;
  const readiness =
    auth === "APPROVED_SNAPSHOT" ? "AVAILABLE_VERIFIED" : auth === "NONE" ? "MISSING" : "AVAILABLE_UNVERIFIED";
  return [
    {
      key: "contractual_ebitda",
      label: "Consolidated EBITDA (contractual)",
      valueMillions: ebitdaMillions,
      readiness: ebitdaMillions == null ? "MISSING" : readiness,
      sourceCitation: pkg.ebitdaEvidence.definitionCitation,
      evidenceAuthority: auth,
    },
    {
      key: "total_debt",
      label: "Consolidated Total Debt",
      valueMillions: pkg.totalDebt,
      readiness,
      sourceCitation: `${pkg.sourceDocumentId} / financial evidence`,
      evidenceAuthority: auth,
    },
    {
      key: "secured_debt",
      label: "Consolidated Secured Debt",
      valueMillions: pkg.securedDebt,
      readiness,
      sourceCitation: `${pkg.sourceDocumentId} / financial evidence`,
      evidenceAuthority: auth,
    },
    {
      key: "cash",
      label: "Unrestricted Cash",
      valueMillions: pkg.cash,
      readiness,
      sourceCitation: `${pkg.sourceDocumentId} / financial evidence`,
      evidenceAuthority: auth,
    },
    {
      key: "interest_expense",
      label: "Consolidated Interest Expense",
      valueMillions: pkg.interestExpense,
      readiness,
      sourceCitation: `${pkg.sourceDocumentId} / financial evidence`,
      evidenceAuthority: auth,
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

/**
 * Resolve canonical financial inputs by packageKey (preferred) or instrumentKey.
 * companyId is accepted only as a fixture convenience fallback.
 */
export async function resolveCanonicalFinancialInputs(args: {
  packageKey?: string | null;
  instrumentKey?: string | null;
  companyId?: string | null;
  /** Optional override ledger fingerprint for dependency invalidation tests. */
  ledgerFingerprint?: string;
  /**
   * Optional authority override. May demote only — never promotes synthetic or
   * provisional package facts to APPROVED_SNAPSHOT / verified readiness.
   */
  forceEvidenceAuthority?: FinancialEvidenceAuthority;
}): Promise<CanonicalFinancialInputBundle | null> {
  const pkg = resolveRegisteredPackage(args);
  if (!pkg) return null;

  const { authority: evidenceAuthority, refusedPromotion } = resolveEffectiveEvidenceAuthority(
    pkg.evidenceAuthority,
    args.forceEvidenceAuthority,
  );
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
      moneyMetric("Compliance Certificate Consolidated EBITDA", ebitdaMillions, pkg.measurementPeriod, pkg.asOf, evidenceAuthority),
    );
  }
  runtimeMetrics.push(
    moneyMetric("Consolidated Total Debt", pkg.totalDebt, pkg.measurementPeriod, pkg.asOf, evidenceAuthority),
    moneyMetric("Consolidated Secured Debt", pkg.securedDebt, pkg.measurementPeriod, pkg.asOf, evidenceAuthority),
    moneyMetric("Unrestricted Cash", pkg.cash, pkg.measurementPeriod, pkg.asOf, evidenceAuthority),
    moneyMetric("Consolidated Interest Expense", pkg.interestExpense, pkg.measurementPeriod, pkg.asOf, evidenceAuthority),
  );

  const capacityPublication = publicationFor(evidenceAuthority);
  // Never eligible for verified remaining without APPROVED + complete utilization (not supplied here).
  const publication: CapacityPublicationAuthority =
    evidenceAuthority === "APPROVED_SNAPSHOT" ? "GROSS_FROM_APPROVED_SNAPSHOT" : capacityPublication;

  const notes = [
    "Canonical resolver: package/instrument-driven; companyId is fixture convenience only.",
    "Provisional / synthetic evidence never yields verified remaining capacity or PRODUCTION_AUTHORITY.",
    `EBITDA derivation kind: ${ebitdaDerivation.kind}`,
    ...(ebitdaDerivation.methodologyDisclosure ? [ebitdaDerivation.methodologyDisclosure] : []),
    ...ebitdaDerivation.notes,
    ...(refusedPromotion
      ? [
          `forceEvidenceAuthority=${args.forceEvidenceAuthority} refused — cannot promote package authority ${pkg.evidenceAuthority}.`,
        ]
      : []),
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
    args.forceEvidenceAuthority ?? null,
    refusedPromotion,
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
    capacityPublication: publication,
    contractualMetrics,
    ebitdaDerivation,
    facts: factsFromPackage(pkg, ebitdaMillions),
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

/** Verified remaining / PRODUCTION_AUTHORITY require APPROVED + separate utilization completeness. */
export function mayClaimVerifiedRemaining(bundle: CanonicalFinancialInputBundle): boolean {
  return bundle.capacityPublication === "VERIFIED_REMAINING_ELIGIBLE";
}
