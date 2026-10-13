/**
 * Adapter: cross-domain package modeling → verified execution spine.
 *
 * Does NOT reimplement capacity arithmetic. Preserves useful multi-family
 * modeling from evaluateCrossDomainTransaction while routing authoritative
 * remaining / transaction-permissibility claims through the verified spine.
 */

import type { CompanyCovenantData } from "@/lib/covenant-engine";
import type { ContractualEbitdaDerivation } from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";
import {
  evaluateCrossDomainTransaction,
  type ContemplatedCrossDomainTransaction,
  type CrossDomainTransactionEvaluation,
} from "@/lib/product/cross-domain-transaction";
import {
  assertNotPromotedFromCrossDomainGross,
  classifyCrossDomainEvaluation,
  classifyVerifiedSimulate,
  composeAuthoritativePermissibility,
  executionAuthorityToCustomerStatus,
  type CanonicalExecutionIdentities,
  type ExecutionAuthorityClass,
  type TransactionPermissibilityVerdict,
} from "@/lib/product/canonical-execution-authority";
import type { VerifiedSimulateAuthorityInput } from "@/lib/product/canonical-execution-authority";
import type { CustomerStatusCode } from "@/lib/customer-workflow/status-contract";

export const CROSS_DOMAIN_SPINE_ADAPTER_VERSION =
  "cross-domain-spine-adapter.v1" as const;

export interface CrossDomainSpinePresentation {
  adapterVersion: typeof CROSS_DOMAIN_SPINE_ADAPTER_VERSION;
  /** Supporting multi-family model (may be gross-clear). */
  modeled: CrossDomainTransactionEvaluation;
  modeledAuthorityClass: ExecutionAuthorityClass;
  /** Authoritative permissibility — verified spine only (composed with blockers). */
  authoritative: TransactionPermissibilityVerdict;
  customerStatus: CustomerStatusCode;
  /** Ready-to-render chip label for product surfaces. */
  displayAuthorityLabel: ExecutionAuthorityClass;
  identities: CanonicalExecutionIdentities;
}

function identitiesFromData(
  data: CompanyCovenantData,
  tx: ContemplatedCrossDomainTransaction,
): CanonicalExecutionIdentities {
  return {
    companyId: data.companyId,
    instrumentKey: null,
    documentIds: data.documents.map((d) => d.id),
    provisionCodes: data.provisions.map((p) => p.code),
    packageVersion: null,
    entityScope: tx.assumptions.entityScope,
    financialSnapshotId: null,
    ledgerAuthority:
      data.ledger.length === 0
        ? "NONE"
        : tx.assumptions.utilizationCompletenessCertified
          ? "UNKNOWN_HISTORY"
          : "ATTRIBUTED",
    evaluationDate: tx.assumptions.evaluationDate,
  };
}

/**
 * Run supporting cross-domain modeling and classify it under the canonical
 * authority vocabulary. Does not consult the verified spine — use
 * `presentCrossDomainWithVerifiedSpine` for authoritative composition.
 */
export function presentCrossDomainModeling(args: {
  data: CompanyCovenantData;
  transaction: ContemplatedCrossDomainTransaction;
  ebitdaDerivation?: ContractualEbitdaDerivation | null;
}): {
  modeled: CrossDomainTransactionEvaluation;
  modeledAuthorityClass: ExecutionAuthorityClass;
  supportingVerdict: TransactionPermissibilityVerdict;
  identities: CanonicalExecutionIdentities;
} {
  const modeled = evaluateCrossDomainTransaction({
    data: args.data,
    transaction: args.transaction,
    ebitdaDerivation: args.ebitdaDerivation ?? null,
  });
  const identities = identitiesFromData(args.data, args.transaction);
  const modeledAuthorityClass = assertNotPromotedFromCrossDomainGross(modeled);
  const supportingVerdict = classifyCrossDomainEvaluation(modeled, identities);
  return { modeled, modeledAuthorityClass, supportingVerdict, identities };
}

/**
 * Authoritative product presentation: verified spine decides PERMITTED;
 * cross-domain contributes modeled domain slices and can only add blockers.
 */
export function presentCrossDomainWithVerifiedSpine(args: {
  data: CompanyCovenantData;
  transaction: ContemplatedCrossDomainTransaction;
  ebitdaDerivation?: ContractualEbitdaDerivation | null;
  verifiedSimulate: VerifiedSimulateAuthorityInput | null;
}): CrossDomainSpinePresentation {
  const { modeled, modeledAuthorityClass, supportingVerdict, identities } =
    presentCrossDomainModeling(args);

  const spineVerdict = classifyVerifiedSimulate(args.verifiedSimulate, identities);
  const authoritative = composeAuthoritativePermissibility({
    verified: spineVerdict,
    crossDomain: supportingVerdict,
    identities,
  });

  return {
    adapterVersion: CROSS_DOMAIN_SPINE_ADAPTER_VERSION,
    modeled,
    modeledAuthorityClass,
    authoritative,
    customerStatus: executionAuthorityToCustomerStatus(authoritative.authorityClass),
    displayAuthorityLabel: authoritative.authorityClass,
    identities,
  };
}
