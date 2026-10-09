/**
 * Test / demo helpers for completeness certificates.
 * All certificates created here are SYNTHETIC_LABELED unless explicitly overridden.
 * They must never be treated as production authority.
 */
import { bindingFingerprints } from "./completeness-certificate";
import type {
  CompletenessBindingFingerprints,
  UtilizationCompletenessCertificate,
} from "./utilization-types";

export const DEMO_BINDINGS: CompletenessBindingFingerprints = bindingFingerprints({
  governingDocumentContentVersion: "demo-doc-v1",
  ledgerEpochId: "demo-ledger-epoch-1",
  financialSnapshotId: "demo-snap-1",
  financialStateAsOf: "2026-06-30",
  operativeAmendmentSetId: "demo-amendments-none",
  sharedCapacityIdsInScope: [],
});

export function syntheticCompletenessCertificate(
  over: Partial<UtilizationCompletenessCertificate> & {
    kind: UtilizationCompletenessCertificate["kind"];
    capacityRuleId: string;
    companyId: string;
    asOf?: string;
  },
): UtilizationCompletenessCertificate {
  const asOf = over.asOf ?? "2026-06-30";
  const capacityRuleId = over.capacityRuleId;
  return {
    certificateId: over.certificateId ?? `syn-cert-${capacityRuleId}-${over.kind}`,
    kind: over.kind,
    approvalState: "APPROVED",
    authenticity: over.authenticity ?? "SYNTHETIC_LABELED",
    issuer: over.issuer ?? {
      role: "SYSTEM_FIXTURE",
      actorId: "demo-fixture",
      attestedAt: `${asOf}T00:00:00.000Z`,
    },
    scope: over.scope ?? {
      companyId: over.companyId,
      operativeAgreementId: "demo-agreement",
      provisionOrBasketId: capacityRuleId,
      entityScopeKeys: [],
      currency: "USD",
      effectiveAsOf: asOf,
      coveragePeriodStart: "2020-01-01",
      coveragePeriodEnd: asOf,
    },
    bindings: over.bindings ?? DEMO_BINDINGS,
    completenessMethod:
      over.completenessMethod ??
      (over.kind === "VERIFIED_EMPTY"
        ? "AFFIRMATIVE_EMPTY_PATH_ATTESTATION"
        : "EXHAUSTIVE_ATTRIBUTED_LEDGER_ENUMERATION"),
    openingBalancePolicy: over.openingBalancePolicy ?? "EXPLICITLY_ATTESTED_ZERO",
    reclassificationPolicy: over.reclassificationPolicy ?? "NONE_IN_COVERAGE_PERIOD",
    supersessionPolicy: over.supersessionPolicy ?? "NONE_IN_COVERAGE_PERIOD",
    sharedCapacityCompletenessAttested: over.sharedCapacityCompletenessAttested ?? true,
    sourceLabel:
      over.sourceLabel ??
      "SYNTHETIC_LABELED completeness certificate — not production authority",
  };
}

/** Authentic-shaped certificate for adversarial tests (still needs matching bindings). */
export function authenticCompletenessCertificate(
  over: Partial<UtilizationCompletenessCertificate> & {
    kind: UtilizationCompletenessCertificate["kind"];
    capacityRuleId: string;
    companyId: string;
    actorId: string;
    asOf?: string;
    bindings: CompletenessBindingFingerprints;
  },
): UtilizationCompletenessCertificate {
  const base = syntheticCompletenessCertificate({
    ...over,
    authenticity: "AUTHENTIC",
    issuer: {
      role: over.issuer?.role ?? "COUNSEL_REVIEWER",
      actorId: over.actorId,
      attestedAt: over.issuer?.attestedAt ?? `${over.asOf ?? "2026-06-30"}T12:00:00.000Z`,
    },
    sourceLabel: over.sourceLabel ?? "AUTHENTIC counsel completeness attestation",
  });
  return { ...base, bindings: over.bindings };
}
