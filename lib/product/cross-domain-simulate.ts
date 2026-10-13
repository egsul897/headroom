/**
 * Canonical Simulate bridge for cross-domain package evaluation.
 *
 * PRODUCTION surface only — allowSyntheticRemaining is forced false and
 * caller-supplied trustedIssuerAuth JSON is ignored (host resolution only).
 * Uses the same CompanyCovenantData loader path as Position. Does not invent
 * VEP / production remaining authority.
 *
 * Contractual EBITDA evidence is resolved by company / package / document /
 * source-version / approved-snapshot / measurement-period / as-of identity —
 * NEVER by matching EBITDA dollar values across companies.
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

/** Catalog of identity-bearing evidence packages for Simulate / debt-intelligence binding. */
export const SIMULATE_EBITDA_EVIDENCE_CATALOG: readonly ContractualEbitdaEvidencePackage[] = [
  COHERENT_EBITDA_EVIDENCE,
  MATTHEWS_EBITDA_EVIDENCE,
];

export interface EbitdaEvidenceBindingRequest {
  companyId: string;
  documentIds: readonly string[];
  evaluationDate: string;
  /** When set, must equal evidence.bindingIdentity.measurementPeriod. */
  measurementPeriod?: string | null;
  /** When set, must equal evidence.bindingIdentity.financialSnapshotId. */
  financialSnapshotId?: string | null;
  /** When set, must equal evidence.bindingIdentity.sourceVersionId. */
  sourceVersionId?: string | null;
  catalog?: readonly ContractualEbitdaEvidencePackage[];
}

export interface EbitdaEvidenceBindingResult {
  derivation: ContractualEbitdaDerivation | null;
  matched: ContractualEbitdaEvidencePackage | null;
  refusalReason: string | null;
}

/**
 * Bind contractual EBITDA evidence by authenticated identity fields only.
 * Numeric bindingContractualEbitdaMillions is never used as a selector.
 * Fail closed when request or package identity cannot be established / matched.
 *
 * Used by debt-intelligence and identity-binding tests (#340/#341).
 */
export function bindContractualEbitdaEvidenceByIdentity(
  request: EbitdaEvidenceBindingRequest,
): EbitdaEvidenceBindingResult {
  if (!request.companyId?.trim()) {
    return {
      derivation: null,
      matched: null,
      refusalReason:
        "Contractual EBITDA evidence withheld — company identity missing (fail closed).",
    };
  }
  if (!request.documentIds.length) {
    return {
      derivation: null,
      matched: null,
      refusalReason:
        "Contractual EBITDA evidence withheld — document/package identity missing (fail closed).",
    };
  }
  if (!request.evaluationDate?.trim()) {
    return {
      derivation: null,
      matched: null,
      refusalReason:
        "Contractual EBITDA evidence withheld — evaluation as-of identity missing (fail closed).",
    };
  }

  const catalog = request.catalog ?? SIMULATE_EBITDA_EVIDENCE_CATALOG;
  const asOf = request.evaluationDate.slice(0, 10);
  const matches: ContractualEbitdaEvidencePackage[] = [];

  for (const pkg of catalog) {
    const id = pkg.bindingIdentity;
    if (id == null) continue; // packages without identity cannot bind
    if (id.companyId !== request.companyId) continue;
    if (id.asOfDate.slice(0, 10) !== asOf) continue;
    const docOverlap = id.documentIds.some((d) => request.documentIds.includes(d));
    if (!docOverlap) continue;
    if (
      request.measurementPeriod != null &&
      request.measurementPeriod !== "" &&
      id.measurementPeriod !== request.measurementPeriod
    ) {
      continue;
    }
    if (
      request.sourceVersionId != null &&
      request.sourceVersionId !== "" &&
      id.sourceVersionId !== request.sourceVersionId
    ) {
      continue;
    }
    if (
      request.financialSnapshotId != null &&
      request.financialSnapshotId !== "" &&
      (id.financialSnapshotId ?? null) !== request.financialSnapshotId
    ) {
      continue;
    }
    matches.push(pkg);
  }

  if (matches.length === 0) {
    return {
      derivation: null,
      matched: null,
      refusalReason:
        "Contractual EBITDA evidence withheld — no package matches authenticated company/document/period/as-of/source-version identity (numeric EBITDA alone never binds).",
    };
  }
  if (matches.length > 1) {
    return {
      derivation: null,
      matched: null,
      refusalReason:
        "Contractual EBITDA evidence withheld — ambiguous identity match across multiple packages (fail closed).",
    };
  }

  const matched = matches[0]!;
  return {
    matched,
    derivation: resolveContractualEbitdaDerivation(matched),
    refusalReason: null,
  };
}

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
 *
 * Explicit packageKey that does not bind this company → refuse (no asOf fallback).
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
    // Explicit packageKey that does not bind this company → refuse (no asOf fallback).
    if (!matched) return null;
  } else {
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
  /** Approved NS-4 / financial snapshot id (HEAD identity path). */
  approvedSnapshotId?: string | null;
  /** Alias accepted from #340 simulate wiring. */
  financialSnapshotId?: string | null;
  /** Explicit package key — wrong key refuses (no asOf fallback). */
  packageKey?: string | null;
}): CrossDomainTransactionEvaluation {
  const amount = params.amountMillions ?? 150;
  const tx = securedDebtFundedAcquisitionTransaction({
    amountMillions: amount,
    evaluationDate: params.evaluationDate,
  });
  const snapshotId =
    params.approvedSnapshotId ?? params.financialSnapshotId ?? null;
  const expected =
    params.expectedFinancialIdentity ??
    buildApprovedFinancialIdentity({
      companyId: params.data.companyId,
      asOf: params.evaluationDate,
      financials: params.data.financials,
      snapshotId,
    });
  const ebitdaDerivation = resolveContractualEbitdaEvidenceForPackage({
    companyId: params.data.companyId,
    evaluationDate: params.evaluationDate,
    documentIds: params.data.documents.map((d) => d.id),
    approvedSnapshotId: snapshotId ?? expected.snapshotId ?? null,
    packageKey: params.packageKey ?? null,
  });
  // Also surface #340 binder refusal when registry path did not bind but docs are present.
  const binderRefusal =
    ebitdaDerivation == null
      ? bindContractualEbitdaEvidenceByIdentity({
          companyId: params.data.companyId,
          documentIds: params.data.documents.map((d) => d.id),
          evaluationDate: params.evaluationDate,
          financialSnapshotId: snapshotId ?? expected.snapshotId,
        }).refusalReason
      : null;
  const evaluation = evaluateCrossDomainTransaction({
    data: params.data,
    transaction: tx,
    ebitdaDerivation,
    utilizationAuthority: params.utilizationAuthority ?? null,
    expectedFinancialIdentity: expected,
    // Production Simulate boundary — never TEST_DEMO.
    authoritySurface: "PRODUCTION",
  });
  if (binderRefusal && ebitdaDerivation == null) {
    evaluation.packageLimitations.push(binderRefusal);
  }
  return evaluation;
}
