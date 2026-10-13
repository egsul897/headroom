/**
 * Canonical Simulate bridge for cross-domain package evaluation.
 *
 * PRODUCTION surface only — allowSyntheticRemaining is forced false and
 * caller-supplied trustedIssuerAuth JSON is ignored (host resolution only).
 * Uses the same CompanyCovenantData loader path as Position. Does not invent
 * VEP / production remaining authority.
 *
 * Contractual EBITDA evidence is resolved by company / package / document /
 * source-version / approved-snapshot identity — NEVER by matching EBITDA
 * dollar values across companies.
 */

import type { CompanyCovenantData } from "@/lib/covenant-engine";
import {
  COHERENT_EBITDA_EVIDENCE,
  MATTHEWS_EBITDA_EVIDENCE,
  resolveContractualEbitdaDerivation,
} from "@/lib/financial-certificate-engine";
import type {
  ContractualEbitdaDerivation,
  ContractualEbitdaEvidencePackage,
} from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";
import {
  buildApprovedFinancialIdentity,
  evaluateCrossDomainTransaction,
  type ApprovedFinancialIdentity,
  type ContemplatedCrossDomainTransaction,
  type CrossDomainTransactionEvaluation,
  type CrossDomainUtilizationAuthority,
} from "@/lib/product/cross-domain-transaction";
import { coherentDebtFundedAcquisition } from "@/lib/product/cross-domain-scenarios";

/** Identity keys required to bind an evidence package — never EBITDA amount. */
export interface ContractualEbitdaEvidenceIdentity {
  companyId: string;
  evaluationDate: string;
  /** Operative document ids in the financing package (optional tighten). */
  documentIds?: readonly string[] | null;
  /** Approved NS-4 / financial snapshot id when bound (optional tighten). */
  approvedSnapshotId?: string | null;
  /** Explicit package / source-version key when known (e.g. coherent_fy2026). */
  packageKey?: string | null;
}

interface RegisteredEbitdaEvidence {
  companyId: string;
  packageKey: string;
  /** asOf / evaluation dates accepted for this package. */
  asOfDates: readonly string[];
  /** Optional document-id fragments that confirm package membership. */
  documentIdHints?: readonly string[];
  evidence: ContractualEbitdaEvidencePackage;
}

/**
 * Registry keyed by company + package identity. Dollar amounts are never
 * used as join keys — two companies with identical EBITDA cannot swap evidence.
 */
const CONTRACTUAL_EBITDA_EVIDENCE_REGISTRY: readonly RegisteredEbitdaEvidence[] = [
  {
    companyId: "coherent",
    packageKey: "coherent_fy2026",
    asOfDates: ["2026-06-30"],
    documentIdHints: ["coherent-credit-agreement", "coherent-2029-notes"],
    evidence: COHERENT_EBITDA_EVIDENCE,
  },
  {
    companyId: "matthews",
    packageKey: "matthews_q1_fy2025",
    asOfDates: ["2024-12-31", "2025-03-31"],
    documentIdHints: ["matw-indenture", "matthews"],
    evidence: MATTHEWS_EBITDA_EVIDENCE,
  },
];

/**
 * Resolve contractual EBITDA evidence by package identity only.
 * Returns null when company/asOf/package identity does not bind — never
 * falls back to matching bindingContractualEbitdaMillions across companies.
 */
export function resolveContractualEbitdaEvidenceForPackage(
  identity: ContractualEbitdaEvidenceIdentity,
): ContractualEbitdaDerivation | null {
  const companyId = identity.companyId.trim().toLowerCase();
  if (!companyId) return null;
  const asOf = identity.evaluationDate.slice(0, 10);
  const packageKey = identity.packageKey?.trim().toLowerCase() ?? null;
  const docIds = (identity.documentIds ?? []).map((d) => d.toLowerCase());

  const candidates = CONTRACTUAL_EBITDA_EVIDENCE_REGISTRY.filter(
    (row) => row.companyId === companyId,
  );
  if (candidates.length === 0) return null;

  let matched: RegisteredEbitdaEvidence | undefined;
  if (packageKey) {
    matched = candidates.find((r) => r.packageKey === packageKey);
    // Explicit packageKey for another company's key → refuse (already filtered by company).
  }
  if (!matched) {
    // asOf is required to bind when packageKey is absent — never fall back to
    // document hints alone (prevents wrong-period / cross-company date tricks).
    matched = candidates.find((r) => r.asOfDates.includes(asOf));
  }
  if (!matched) return null;

  // Optional document tighten: when docs are supplied and none hint-match, refuse.
  if (docIds.length > 0 && (matched.documentIdHints?.length ?? 0) > 0) {
    const docOk = matched.documentIdHints!.some((hint) =>
      docIds.some((d) => d.includes(hint.toLowerCase())),
    );
    if (!docOk) return null;
  }

  // Snapshot identity: refuse when the snapshot label names a different company.
  if (identity.approvedSnapshotId) {
    const snap = identity.approvedSnapshotId.toLowerCase();
    for (const other of CONTRACTUAL_EBITDA_EVIDENCE_REGISTRY) {
      if (other.companyId !== matched.companyId && snap.includes(other.companyId)) {
        return null;
      }
    }
  }

  return resolveContractualEbitdaDerivation(matched.evidence);
}

/** @deprecated Use resolveContractualEbitdaEvidenceForPackage — value matching removed. */
export function attachEbitdaDerivationByIdentity(
  data: CompanyCovenantData,
  evaluationDate: string,
  approvedSnapshotId?: string | null,
): ContractualEbitdaDerivation | null {
  return resolveContractualEbitdaEvidenceForPackage({
    companyId: data.companyId,
    evaluationDate,
    documentIds: data.documents.map((d) => d.id),
    approvedSnapshotId: approvedSnapshotId ?? null,
  });
}

/** Secured debt-funded acquisition template for Simulate (same evaluator for all companies). */
export function securedDebtFundedAcquisitionTransaction(params: {
  amountMillions: number;
  evaluationDate: string;
  entityScope?: string[];
}): ContemplatedCrossDomainTransaction {
  const base = coherentDebtFundedAcquisition(params.amountMillions);
  return {
    ...base,
    assumptions: {
      ...base.assumptions,
      evaluationDate: params.evaluationDate,
      entityScope: params.entityScope ?? base.assumptions.entityScope,
      statements: [
        ...base.assumptions.statements,
        "Simulate path uses the same company-state and approved financial identity as Position.",
      ],
    },
  };
}

export function evaluateSimulateCrossDomainAcquisition(params: {
  data: CompanyCovenantData;
  amountMillions?: number;
  evaluationDate: string;
  utilizationAuthority?: CrossDomainUtilizationAuthority | null;
  expectedFinancialIdentity?: ApprovedFinancialIdentity | null;
  approvedSnapshotId?: string | null;
  packageKey?: string | null;
}): CrossDomainTransactionEvaluation {
  const amount = params.amountMillions ?? 150;
  const tx = securedDebtFundedAcquisitionTransaction({
    amountMillions: amount,
    evaluationDate: params.evaluationDate,
  });
  const expected =
    params.expectedFinancialIdentity ??
    buildApprovedFinancialIdentity({
      companyId: params.data.companyId,
      asOf: params.evaluationDate,
      financials: params.data.financials,
      snapshotId: params.approvedSnapshotId ?? null,
    });
  const ebitdaDerivation = resolveContractualEbitdaEvidenceForPackage({
    companyId: params.data.companyId,
    evaluationDate: params.evaluationDate,
    documentIds: params.data.documents.map((d) => d.id),
    approvedSnapshotId:
      params.approvedSnapshotId ?? expected.snapshotId ?? null,
    packageKey: params.packageKey ?? null,
  });
  return evaluateCrossDomainTransaction({
    data: params.data,
    transaction: tx,
    ebitdaDerivation,
    utilizationAuthority: params.utilizationAuthority ?? null,
    expectedFinancialIdentity: expected,
    // Production Simulate boundary — never TEST_DEMO.
    authoritySurface: "PRODUCTION",
  });
}
