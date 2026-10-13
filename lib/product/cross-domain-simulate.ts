/**
 * Canonical Simulate bridge for cross-domain package evaluation.
 *
 * PRODUCTION surface only — allowSyntheticRemaining is forced false and
 * caller-supplied trustedIssuerAuth JSON is ignored (host resolution only).
 * Uses the same CompanyCovenantData loader path as Position. Does not invent
 * VEP / production remaining authority.
 *
 * Contractual EBITDA evidence is bound by authenticated company / document /
 * measurement-period / as-of / source-version identity — never by numeric
 * EBITDA equality alone.
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

/** Catalog of identity-bearing evidence packages for Simulate binding. */
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

function attachEbitdaDerivation(params: {
  data: CompanyCovenantData;
  evaluationDate: string;
  financialSnapshotId?: string | null;
}): {
  derivation: ContractualEbitdaDerivation | null;
  refusalReason: string | null;
} {
  const bound = bindContractualEbitdaEvidenceByIdentity({
    companyId: params.data.companyId,
    documentIds: params.data.documents.map((d) => d.id),
    evaluationDate: params.evaluationDate,
    financialSnapshotId: params.financialSnapshotId ?? null,
  });
  return { derivation: bound.derivation, refusalReason: bound.refusalReason };
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
  /** Optional authenticated snapshot id for evidence binding. */
  financialSnapshotId?: string | null;
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
      snapshotId: params.financialSnapshotId ?? null,
    });
  const ebitda = attachEbitdaDerivation({
    data: params.data,
    evaluationDate: params.evaluationDate,
    financialSnapshotId: params.financialSnapshotId ?? expected.snapshotId,
  });
  const evaluation = evaluateCrossDomainTransaction({
    data: params.data,
    transaction: tx,
    ebitdaDerivation: ebitda.derivation,
    utilizationAuthority: params.utilizationAuthority ?? null,
    expectedFinancialIdentity: expected,
    // Production Simulate boundary — never TEST_DEMO.
    authoritySurface: "PRODUCTION",
  });
  if (ebitda.refusalReason) {
    evaluation.packageLimitations.push(ebitda.refusalReason);
  }
  return evaluation;
}
