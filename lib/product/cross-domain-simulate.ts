/**
 * Canonical Simulate bridge for cross-domain package evaluation.
 *
 * PRODUCTION surface only — allowSyntheticRemaining is forced false and
 * caller-supplied trustedIssuerAuth JSON is ignored (host resolution only).
 * Uses the same CompanyCovenantData loader path as Position. Does not invent
 * VEP / production remaining authority.
 */

import type { CompanyCovenantData } from "@/lib/covenant-engine";
import {
  COHERENT_EBITDA_EVIDENCE,
  MATTHEWS_EBITDA_EVIDENCE,
  resolveContractualEbitdaDerivation,
} from "@/lib/financial-certificate-engine";
import type { ContractualEbitdaDerivation } from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";
import {
  buildApprovedFinancialIdentity,
  evaluateCrossDomainTransaction,
  type ApprovedFinancialIdentity,
  type ContemplatedCrossDomainTransaction,
  type CrossDomainTransactionEvaluation,
  type CrossDomainUtilizationAuthority,
} from "@/lib/product/cross-domain-transaction";
import { coherentDebtFundedAcquisition } from "@/lib/product/cross-domain-scenarios";

function attachEbitdaDerivation(
  data: CompanyCovenantData,
): ContractualEbitdaDerivation | null {
  const ebitda = data.financials?.ebitda;
  if (ebitda == null) return null;
  // Evidence packages are matched by binding figure, not company-id engine branches.
  if (Math.abs(ebitda - COHERENT_EBITDA_EVIDENCE.bindingContractualEbitdaMillions) < 0.01) {
    return resolveContractualEbitdaDerivation(COHERENT_EBITDA_EVIDENCE);
  }
  if (Math.abs(ebitda - MATTHEWS_EBITDA_EVIDENCE.bindingContractualEbitdaMillions) < 0.01) {
    return resolveContractualEbitdaDerivation(MATTHEWS_EBITDA_EVIDENCE);
  }
  return null;
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
    });
  return evaluateCrossDomainTransaction({
    data: params.data,
    transaction: tx,
    ebitdaDerivation: attachEbitdaDerivation(params.data),
    utilizationAuthority: params.utilizationAuthority ?? null,
    expectedFinancialIdentity: expected,
    // Production Simulate boundary — never TEST_DEMO.
    authoritySurface: "PRODUCTION",
  });
}
