/**
 * UtilizationCompletenessCertificate validation.
 *
 * Success: remaining capacity is publishable only when both the capacity
 * calculation and the completeness evidence are independently defensible.
 *
 * This module does not create new legal authority. It validates that a
 * certificate carries the required issuer, evidence scope, completeness
 * method, and binding fingerprints — and refuses synthetic / fixture /
 * stale / mismatched certificates under production execution.
 */
import {
  authorizeCompletenessIssuer,
  type TrustedIssuerAuthorizationContext,
} from "./completeness-issuer-auth";
import type {
  CompletenessBindingFingerprints,
  UtilizationCompletenessCertificate,
  UtilizationExecutionMode,
} from "./utilization-types";

export interface CompletenessValidationContext {
  executionMode: UtilizationExecutionMode;
  evaluationAsOf: string;
  companyId: string;
  capacityRuleId: string;
  currency: string | null;
  /** Current operative world fingerprints — any mismatch stale-invalidates the certificate. */
  currentBindings: CompletenessBindingFingerprints;
  attributedRecordCount: number;
  /**
   * Trusted identity/authorization registry for the certificate's issuer.actorId.
   * Required. The certificate's issuer.role field alone never establishes authority.
   */
  trustedIssuerAuth: TrustedIssuerAuthorizationContext;
}

export interface CompletenessValidationResult {
  ok: boolean;
  /** Certificate may support remaining under this execution mode. */
  supportsRemainingClaim: boolean;
  /** Certificate is AUTHENTIC and production-authoritative (never true for synthetic/fixture). */
  productionAuthoritative: boolean;
  blockers: string[];
}

function asOfCutoff(iso: string): string {
  return iso.slice(0, 10);
}

function fingerprintEqual(a: CompletenessBindingFingerprints, b: CompletenessBindingFingerprints): string[] {
  const diffs: string[] = [];
  if (a.governingDocumentContentVersion !== b.governingDocumentContentVersion) {
    diffs.push("governingDocumentContentVersion");
  }
  if (a.ledgerEpochId !== b.ledgerEpochId) diffs.push("ledgerEpochId");
  if (a.financialSnapshotId !== b.financialSnapshotId) diffs.push("financialSnapshotId");
  if (asOfCutoff(a.financialStateAsOf) !== asOfCutoff(b.financialStateAsOf)) {
    diffs.push("financialStateAsOf");
  }
  if (a.operativeAmendmentSetId !== b.operativeAmendmentSetId) {
    diffs.push("operativeAmendmentSetId");
  }
  const aShared = [...a.sharedCapacityIdsInScope].sort().join("|");
  const bShared = [...b.sharedCapacityIdsInScope].sort().join("|");
  if (aShared !== bShared) diffs.push("sharedCapacityIdsInScope");
  return diffs;
}

/**
 * Validate a completeness certificate against the evaluation context.
 * Fail-closed: any missing field, wrong method, synthetic-in-production,
 * or binding mismatch refuses remaining authority.
 */
export function validateCompletenessCertificate(
  cert: UtilizationCompletenessCertificate | null | undefined,
  ctx: CompletenessValidationContext,
): CompletenessValidationResult {
  const blockers: string[] = [];
  if (cert == null) {
    return {
      ok: false,
      supportsRemainingClaim: false,
      productionAuthoritative: false,
      blockers: ["no completeness certificate presented"],
    };
  }

  if (cert.approvalState !== "APPROVED") {
    blockers.push("certificate approvalState is not APPROVED");
  }
  if (!cert.certificateId || cert.certificateId.trim() === "") {
    blockers.push("certificateId missing");
  }
  if (!cert.issuer?.actorId || !cert.issuer?.attestedAt) {
    blockers.push("issuer actorId/attestedAt missing");
  }

  // Issuer authority — role string on the certificate is never trusted alone.
  // Authorize actorId against the host-supplied trusted identity/authorization registry.
  if (ctx.executionMode === "PRODUCTION" && !ctx.trustedIssuerAuth?.requireNonFixtureIdentity) {
    blockers.push(
      "PRODUCTION execution requires trustedIssuerAuth.requireNonFixtureIdentity — fixture registries cannot authorize production remaining",
    );
  }
  const issuerAuth = authorizeCompletenessIssuer(
    { actorId: cert.issuer.actorId, role: cert.issuer.role },
    ctx.trustedIssuerAuth,
  );
  if (!issuerAuth.ok) {
    blockers.push(...issuerAuth.blockers);
  }
  const issuerProductionOk =
    issuerAuth.ok &&
    (cert.issuer.role === "COUNSEL_REVIEWER" || cert.issuer.role === "LEDGER_CUSTODIAN") &&
    ctx.trustedIssuerAuth?.requireNonFixtureIdentity === true &&
    issuerAuth.matchedPrincipal != null &&
    (issuerAuth.matchedPrincipal.identityAssurance === "SESSION_AUTHENTICATED" ||
      issuerAuth.matchedPrincipal.identityAssurance === "SERVICE_ACCOUNT");
  if (cert.issuer.role === "SYSTEM_FIXTURE" && ctx.executionMode === "PRODUCTION") {
    blockers.push("SYSTEM_FIXTURE issuer cannot establish production completeness authority");
  }
  if (
    cert.issuer.role !== "COUNSEL_REVIEWER" &&
    cert.issuer.role !== "LEDGER_CUSTODIAN" &&
    cert.issuer.role !== "SYSTEM_FIXTURE"
  ) {
    blockers.push(
      `issuer role ${String((cert.issuer as { role: string }).role)} is not an allowed completeness issuer`,
    );
  }

  // Synthetic / demo certificates cannot be authoritative in production execution.
  if (cert.authenticity === "SYNTHETIC_LABELED" && ctx.executionMode === "PRODUCTION") {
    blockers.push("SYNTHETIC_LABELED completeness certificate refused under PRODUCTION execution");
  }
  if (cert.authenticity !== "AUTHENTIC" && cert.authenticity !== "SYNTHETIC_LABELED") {
    blockers.push("certificate authenticity must be AUTHENTIC or SYNTHETIC_LABELED");
  }

  // Completeness method must actually prove completeness.
  if (cert.completenessMethod === "REVIEWED_RECORDED_TRANSACTIONS_ONLY") {
    blockers.push(
      "completenessMethod REVIEWED_RECORDED_TRANSACTIONS_ONLY confirms recorded rows were reviewed — it does not prove historical completeness",
    );
  }
  if (cert.kind === "VERIFIED_EMPTY" && cert.completenessMethod !== "AFFIRMATIVE_EMPTY_PATH_ATTESTATION") {
    blockers.push("VERIFIED_EMPTY requires completenessMethod AFFIRMATIVE_EMPTY_PATH_ATTESTATION");
  }
  if (
    cert.kind === "VERIFIED_COMPLETE" &&
    cert.completenessMethod !== "EXHAUSTIVE_ATTRIBUTED_LEDGER_ENUMERATION"
  ) {
    blockers.push("VERIFIED_COMPLETE requires completenessMethod EXHAUSTIVE_ATTRIBUTED_LEDGER_ENUMERATION");
  }

  // Evidence scope identity.
  const scope = cert.scope;
  if (!scope?.companyId || scope.companyId !== ctx.companyId) {
    blockers.push("certificate companyId missing or mismatched");
  }
  if (!scope?.operativeAgreementId) {
    blockers.push("operativeAgreementId missing");
  }
  if (!scope?.provisionOrBasketId || scope.provisionOrBasketId !== ctx.capacityRuleId) {
    blockers.push("provisionOrBasketId missing or mismatched to capacityRuleId");
  }
  if (!scope?.currency) {
    blockers.push("currency missing on certificate scope");
  } else if (ctx.currency != null && scope.currency !== ctx.currency) {
    blockers.push("certificate currency mismatched to evaluation currency");
  }
  if (!scope?.effectiveAsOf) {
    blockers.push("effectiveAsOf missing on certificate scope");
  }
  if (!scope?.coveragePeriodStart || !scope?.coveragePeriodEnd) {
    blockers.push("historical coverage period (start/end) missing");
  } else {
    const evalAsOf = asOfCutoff(ctx.evaluationAsOf);
    if (asOfCutoff(scope.coveragePeriodStart) > evalAsOf || asOfCutoff(scope.coveragePeriodEnd) < evalAsOf) {
      blockers.push("evaluation as-of date falls outside certificate historical coverage period");
    }
    if (asOfCutoff(scope.coveragePeriodEnd) < asOfCutoff(scope.effectiveAsOf)) {
      blockers.push("coveragePeriodEnd precedes effectiveAsOf");
    }
  }
  if (!Array.isArray(scope?.entityScopeKeys)) {
    blockers.push("entityScopeKeys must be present (empty array attests company-level scope)");
  }

  // Policies that prevent silent invalidation by amendments / reclass / supersession / opening balances.
  if (cert.openingBalancePolicy === "UNKNOWN") {
    blockers.push("openingBalancePolicy UNKNOWN — opening balances could silently invalidate completeness");
  }
  if (cert.reclassificationPolicy === "UNKNOWN") {
    blockers.push("reclassificationPolicy UNKNOWN — reclassifications could silently invalidate completeness");
  }
  if (cert.supersessionPolicy === "UNKNOWN") {
    blockers.push("supersessionPolicy UNKNOWN — superseded transactions could silently invalidate completeness");
  }

  const sharedIds = cert.bindings?.sharedCapacityIdsInScope ?? [];
  if (sharedIds.length > 0 && !cert.sharedCapacityCompletenessAttested) {
    blockers.push(
      "shared-capacity ids in scope without sharedCapacityCompletenessAttested — shared-pool usage could silently escape the set",
    );
  }

  // Staleness / binding mismatch against current operative world.
  if (!cert.bindings) {
    blockers.push("binding fingerprints missing");
  } else {
    const required = [
      "governingDocumentContentVersion",
      "ledgerEpochId",
      "financialSnapshotId",
      "financialStateAsOf",
      "operativeAmendmentSetId",
    ] as const;
    for (const k of required) {
      if (!cert.bindings[k] || String(cert.bindings[k]).trim() === "") {
        blockers.push(`binding ${k} missing`);
      }
    }
    const diffs = fingerprintEqual(cert.bindings, ctx.currentBindings);
    if (diffs.length > 0) {
      blockers.push(
        `certificate stale/mismatched vs current operative world: ${diffs.join(", ")} — governing document, ledger, financial state, amendments, or shared-capacity scope changed`,
      );
    }
  }

  // Kind vs evidence shape.
  if (cert.kind === "VERIFIED_EMPTY" && ctx.attributedRecordCount > 0) {
    blockers.push("VERIFIED_EMPTY conflicts with attributed usage records present");
  }
  if (cert.kind === "VERIFIED_COMPLETE" && ctx.attributedRecordCount === 0) {
    blockers.push("VERIFIED_COMPLETE requires attributed records — use VERIFIED_EMPTY for zero usage");
  }

  const structuralOk = blockers.length === 0;
  const productionAuthoritative =
    structuralOk &&
    cert.authenticity === "AUTHENTIC" &&
    issuerProductionOk &&
    ctx.executionMode === "PRODUCTION";

  const demoOk =
    structuralOk &&
    ctx.executionMode === "DEMO_SYNTHETIC" &&
    (cert.authenticity === "SYNTHETIC_LABELED" || cert.authenticity === "AUTHENTIC");

  const supportsRemainingClaim =
    ctx.executionMode === "PRODUCTION" ? productionAuthoritative : demoOk;

  return {
    ok: structuralOk,
    supportsRemainingClaim,
    productionAuthoritative,
    blockers,
  };
}

/** Build fingerprints for tests / demos — production must supply real epoch ids. */
export function bindingFingerprints(
  over: Partial<CompletenessBindingFingerprints> &
    Pick<
      CompletenessBindingFingerprints,
      | "governingDocumentContentVersion"
      | "ledgerEpochId"
      | "financialSnapshotId"
      | "financialStateAsOf"
      | "operativeAmendmentSetId"
    >,
): CompletenessBindingFingerprints {
  return {
    sharedCapacityIdsInScope: over.sharedCapacityIdsInScope ?? [],
    governingDocumentContentVersion: over.governingDocumentContentVersion,
    ledgerEpochId: over.ledgerEpochId,
    financialSnapshotId: over.financialSnapshotId,
    financialStateAsOf: over.financialStateAsOf,
    operativeAmendmentSetId: over.operativeAmendmentSetId,
  };
}
