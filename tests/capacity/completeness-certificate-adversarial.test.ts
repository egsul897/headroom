/**
 * Adversarial completeness-certificate gate.
 *
 * Verifies forged, stale, mismatched, partial, incomplete, and synthetic
 * certificates cannot authorize production remaining-capacity claims.
 */
import { describe, expect, it } from "vitest";
import {
  DEMO_BINDINGS,
  authenticCompletenessCertificate,
  bindingFingerprints,
  buildSharedProductCapacityViews,
  computeVerifiedRemaining,
  demoTrustedIssuerAuth,
  evidenceFromAttributedLedger,
  productionTrustedIssuerAuth,
  refuseAuthoritativeRemaining,
  resolveUtilization,
  sessionCounselPrincipal,
  syntheticCompletenessCertificate,
  validateCompletenessCertificate,
} from "@/lib/capacity";
import type {
  CompletenessBindingFingerprints,
  CompletenessValidationContext,
  UtilizationCompletenessCertificate,
} from "@/lib/capacity";

const AS_OF = "2026-06-30";
const CO = "co-adv";
const RULE = "basket-adv";

const LIVE: CompletenessBindingFingerprints = bindingFingerprints({
  governingDocumentContentVersion: "doc-v3",
  ledgerEpochId: "ledger-epoch-9",
  financialSnapshotId: "snap-approved-9",
  financialStateAsOf: AS_OF,
  operativeAmendmentSetId: "amendments-set-2",
  sharedCapacityIdsInScope: [],
});

/** Trusted session counsel — independent of certificate issuer.role field. */
const PROD_AUTH = productionTrustedIssuerAuth([sessionCounselPrincipal("counsel-alice")]);
const DEMO_AUTH = demoTrustedIssuerAuth();

function prodCtx(
  over: Partial<CompletenessValidationContext> = {},
): CompletenessValidationContext {
  return {
    executionMode: "PRODUCTION",
    evaluationAsOf: AS_OF,
    companyId: CO,
    capacityRuleId: RULE,
    currency: "USD",
    currentBindings: LIVE,
    attributedRecordCount: 0,
    trustedIssuerAuth: PROD_AUTH,
    ...over,
  };
}

function baseAuthentic(
  over: Partial<UtilizationCompletenessCertificate> = {},
): UtilizationCompletenessCertificate {
  return authenticCompletenessCertificate({
    kind: "VERIFIED_EMPTY",
    capacityRuleId: RULE,
    companyId: CO,
    actorId: "counsel-alice",
    asOf: AS_OF,
    bindings: LIVE,
    ...over,
  });
}

describe("completeness certificate — issuer & method", () => {
  it("COUNSEL_REVIEWER / LEDGER_CUSTODIAN may issue; SYSTEM_FIXTURE cannot in PRODUCTION", () => {
    const counsel = validateCompletenessCertificate(baseAuthentic(), prodCtx());
    expect(counsel.productionAuthoritative).toBe(true);
    expect(counsel.supportsRemainingClaim).toBe(true);

    const fixture = validateCompletenessCertificate(
      syntheticCompletenessCertificate({
        kind: "VERIFIED_EMPTY",
        capacityRuleId: RULE,
        companyId: CO,
        asOf: AS_OF,
        bindings: LIVE,
      }),
      prodCtx(),
    );
    expect(fixture.productionAuthoritative).toBe(false);
    expect(fixture.supportsRemainingClaim).toBe(false);
  });

  it("REVIEWED_RECORDED_TRANSACTIONS_ONLY does not prove completeness", () => {
    const v = validateCompletenessCertificate(
      baseAuthentic({
        kind: "VERIFIED_COMPLETE",
        completenessMethod: "REVIEWED_RECORDED_TRANSACTIONS_ONLY",
      }),
      {
        executionMode: "PRODUCTION",
        evaluationAsOf: AS_OF,
        companyId: CO,
        capacityRuleId: RULE,
        currency: "USD",
        currentBindings: LIVE,
        attributedRecordCount: 1,
        trustedIssuerAuth: PROD_AUTH,
      },
    );
    expect(v.ok).toBe(false);
    expect(v.blockers.some((b) => /REVIEWED_RECORDED_TRANSACTIONS_ONLY/i.test(b))).toBe(true);
  });
});

describe("completeness certificate — evidence scope required", () => {
  it("requires company, agreement, provision, currency, effective date, coverage period", () => {
    const incomplete = baseAuthentic({
      scope: {
        companyId: "",
        operativeAgreementId: "",
        provisionOrBasketId: RULE,
        entityScopeKeys: [],
        currency: "",
        effectiveAsOf: "",
        coveragePeriodStart: "",
        coveragePeriodEnd: "",
      },
    });
    const v = validateCompletenessCertificate(
      incomplete,
      prodCtx(),
    );
    expect(v.ok).toBe(false);
    expect(v.blockers.some((b) => /companyId/i.test(b))).toBe(true);
    expect(v.blockers.some((b) => /operativeAgreementId/i.test(b))).toBe(true);
    expect(v.blockers.some((b) => /currency/i.test(b))).toBe(true);
    expect(v.blockers.some((b) => /coverage period/i.test(b))).toBe(true);
  });
});

describe("completeness certificate — adversarial invalidation", () => {
  it("forged / mismatched capacityRuleId refused", () => {
    const v = validateCompletenessCertificate(
      baseAuthentic(),
      prodCtx({
        capacityRuleId: "other-rule",
      }),
    );
    expect(v.supportsRemainingClaim).toBe(false);
    expect(v.blockers.some((b) => /provisionOrBasketId|mismatched/i.test(b))).toBe(true);
  });

  it("stale certificate when governing document / ledger / financial / amendment bindings change", () => {
    const staleDoc = validateCompletenessCertificate(
      baseAuthentic(),
      prodCtx({
        currentBindings: { ...LIVE, governingDocumentContentVersion: "doc-v4-amended" },
      }),
    );
    expect(staleDoc.supportsRemainingClaim).toBe(false);
    expect(staleDoc.blockers.some((b) => /stale|governingDocumentContentVersion/i.test(b))).toBe(true);

    const staleLedger = validateCompletenessCertificate(
      baseAuthentic(),
      prodCtx({
        currentBindings: { ...LIVE, ledgerEpochId: "ledger-epoch-10-new-row" },
      }),
    );
    expect(staleLedger.supportsRemainingClaim).toBe(false);

    const staleFin = validateCompletenessCertificate(
      baseAuthentic(),
      prodCtx({
        currentBindings: { ...LIVE, financialSnapshotId: "snap-new" },
      }),
    );
    expect(staleFin.supportsRemainingClaim).toBe(false);

    const staleAmend = validateCompletenessCertificate(
      baseAuthentic(),
      prodCtx({
        currentBindings: { ...LIVE, operativeAmendmentSetId: "amendments-set-3" },
      }),
    );
    expect(staleAmend.supportsRemainingClaim).toBe(false);
  });

  it("UNKNOWN opening/reclass/supersession policies refuse (silent invalidation risk)", () => {
    for (const policy of ["openingBalancePolicy", "reclassificationPolicy", "supersessionPolicy"] as const) {
      const cert = baseAuthentic({ [policy]: "UNKNOWN" } as Partial<UtilizationCompletenessCertificate>);
      const v = validateCompletenessCertificate(
      cert,
      prodCtx(),
    );
      expect(v.ok).toBe(false);
      expect(v.blockers.some((b) => b.includes(policy) || /UNKNOWN/i.test(b))).toBe(true);
    }
  });

  it("shared-capacity in scope without sharedCapacityCompletenessAttested refused", () => {
    const bindings = { ...LIVE, sharedCapacityIdsInScope: ["shared-rp-pool"] };
    const cert = baseAuthentic({
      bindings,
      sharedCapacityCompletenessAttested: false,
    });
    const v = validateCompletenessCertificate(
      cert,
      prodCtx({
        currentBindings: bindings,
      }),
    );
    expect(v.ok).toBe(false);
    expect(v.blockers.some((b) => /shared-capacity/i.test(b))).toBe(true);
  });

  it("partial / kind-mismatched certificates refused", () => {
    const emptyWithRecords = validateCompletenessCertificate(
      baseAuthentic({ kind: "VERIFIED_EMPTY" }),
      prodCtx({
        attributedRecordCount: 2,
        trustedIssuerAuth: PROD_AUTH,
      }),
    );
    expect(emptyWithRecords.ok).toBe(false);

    const completeWithNone = validateCompletenessCertificate(
      baseAuthentic({
        kind: "VERIFIED_COMPLETE",
        completenessMethod: "EXHAUSTIVE_ATTRIBUTED_LEDGER_ENUMERATION",
      }),
      {
        executionMode: "PRODUCTION",
        evaluationAsOf: AS_OF,
        companyId: CO,
        capacityRuleId: RULE,
        currency: "USD",
        currentBindings: LIVE,
        attributedRecordCount: 0,
        trustedIssuerAuth: PROD_AUTH,
      },
    );
    expect(completeWithNone.ok).toBe(false);
  });

  it("evaluation as-of outside coverage period refused", () => {
    const cert = baseAuthentic({
      scope: {
        companyId: CO,
        operativeAgreementId: "agr-1",
        provisionOrBasketId: RULE,
        entityScopeKeys: [],
        currency: "USD",
        effectiveAsOf: "2025-01-01",
        coveragePeriodStart: "2025-01-01",
        coveragePeriodEnd: "2025-12-31",
      },
    });
    const v = validateCompletenessCertificate(
      cert,
      prodCtx(),
    );
    expect(v.ok).toBe(false);
    expect(v.blockers.some((b) => /coverage period/i.test(b))).toBe(true);
  });
});

describe("product surfaces refuse non-production remaining", () => {
  it("Position / Simulate / Ask / verified-execution refuse synthetic completeness", () => {
    const views = buildSharedProductCapacityViews({
      gross: { amount: 100, gateSatisfied: true, modeled: true, capacityRuleId: RULE },
      utilization: {
        companyId: CO,
        capacityRuleId: RULE,
        asOf: AS_OF,
        records: [
          evidenceFromAttributedLedger({
            usageId: "u1",
            amount: 40,
            currency: "USD",
            effectiveAsOf: "2026-01-01",
            capacityRuleId: RULE,
            status: "ACTIVE",
            approvalState: "APPROVED",
            sourceLabel: "syn",
            authenticity: "SYNTHETIC_LABELED",
          }),
        ],
        executionMode: "DEMO_SYNTHETIC",
        currentBindings: DEMO_BINDINGS,
        trustedIssuerAuth: DEMO_AUTH,
        completenessCertificate: syntheticCompletenessCertificate({
          kind: "VERIFIED_COMPLETE",
          capacityRuleId: RULE,
          companyId: CO,
          asOf: AS_OF,
        }),
      },
    });
    for (const surface of ["POSITION", "SIMULATE", "ASK", "VERIFIED_EXECUTION"] as const) {
      expect(views[surface].supportedRemainingCapacity).toBeNull();
      expect(views[surface].mayPublishAvailable).toBe(false);
      expect(views[surface].productionAuthoritativeRemaining).toBe(false);
      expect(views[surface].blockers.some((b) => /authoritative remaining refused/i.test(b))).toBe(true);
    }
  });

  it("production-authoritative certificate can publish remaining on all surfaces", () => {
    const views = buildSharedProductCapacityViews({
      gross: { amount: 100, gateSatisfied: true, modeled: true, capacityRuleId: RULE },
      utilization: {
        companyId: CO,
        capacityRuleId: RULE,
        asOf: AS_OF,
        records: [
          evidenceFromAttributedLedger({
            usageId: "u1",
            amount: 40,
            currency: "USD",
            effectiveAsOf: "2026-01-01",
            capacityRuleId: RULE,
            status: "ACTIVE",
            approvalState: "APPROVED",
            sourceLabel: "authentic-ledger",
            authenticity: "AUTHENTIC",
          }),
        ],
        executionMode: "PRODUCTION",
        currentBindings: LIVE,
        trustedIssuerAuth: PROD_AUTH,
        completenessCertificate: authenticCompletenessCertificate({
          kind: "VERIFIED_COMPLETE",
          capacityRuleId: RULE,
          companyId: CO,
          actorId: "counsel-alice",
          asOf: AS_OF,
          bindings: LIVE,
          completenessMethod: "EXHAUSTIVE_ATTRIBUTED_LEDGER_ENUMERATION",
          openingBalancePolicy: "INCLUDED_IN_ATTRIBUTED_SET",
        }),
      },
    });
    for (const surface of ["POSITION", "SIMULATE", "ASK", "VERIFIED_EXECUTION"] as const) {
      expect(views[surface].supportedRemainingCapacity).toBe(60);
      expect(views[surface].mayPublishAvailable).toBe(true);
      expect(views[surface].productionAuthoritativeRemaining).toBe(true);
    }
  });

  it("refuseAuthoritativeRemaining strips demo remaining", () => {
    const r = resolveUtilization({
      companyId: CO,
      capacityRuleId: RULE,
      asOf: AS_OF,
      records: [],
      executionMode: "DEMO_SYNTHETIC",
      currentBindings: DEMO_BINDINGS,
      trustedIssuerAuth: DEMO_AUTH,
      completenessCertificate: syntheticCompletenessCertificate({
        kind: "VERIFIED_EMPTY",
        capacityRuleId: RULE,
        companyId: CO,
        asOf: AS_OF,
      }),
    });
    expect(r.supportsRemainingClaim).toBe(true);
    expect(r.productionAuthoritative).toBe(false);
    const verified = computeVerifiedRemaining({
      gross: { amount: 50, gateSatisfied: true, modeled: true, capacityRuleId: RULE },
      utilization: r,
    });
    expect(verified.supportedRemaining).toBe(50);
    const gated = refuseAuthoritativeRemaining(verified);
    expect(gated.remaining).toBeNull();
    expect(gated.mayPublishAvailable).toBe(false);
  });
});

describe("trusted issuer identity — not caller-supplied role alone", () => {
  it("forged COUNSEL_REVIEWER role without trusted principal is refused", () => {
    const forged = authenticCompletenessCertificate({
      kind: "VERIFIED_EMPTY",
      capacityRuleId: RULE,
      companyId: CO,
      actorId: "forged-attacker",
      asOf: AS_OF,
      bindings: LIVE,
      issuer: {
        role: "COUNSEL_REVIEWER",
        actorId: "forged-attacker",
        attestedAt: `${AS_OF}T12:00:00.000Z`,
      },
    });
    expect(forged.issuer.actorId).toBe("forged-attacker");
    const v = validateCompletenessCertificate(forged, prodCtx());
    expect(v.supportsRemainingClaim).toBe(false);
    expect(v.productionAuthoritative).toBe(false);
    expect(v.blockers.some((b) => /not found in trusted identity|forged/i.test(b))).toBe(true);
  });

  it("actorId present but unauthorized for claimed role is refused", () => {
    const auth = productionTrustedIssuerAuth([
      {
        actorId: "counsel-alice",
        authorizedRoles: ["LEDGER_CUSTODIAN"],
        identityAssurance: "SESSION_AUTHENTICATED",
        status: "ACTIVE",
      },
    ]);
    const v = validateCompletenessCertificate(baseAuthentic(), prodCtx({ trustedIssuerAuth: auth }));
    expect(v.supportsRemainingClaim).toBe(false);
    expect(v.blockers.some((b) => /not authorized for role COUNSEL_REVIEWER/i.test(b))).toBe(true);
  });

  it("missing trustedIssuerAuth context refuses even with perfect certificate shape", () => {
    const v = validateCompletenessCertificate(baseAuthentic(), {
      ...prodCtx(),
      // @ts-expect-error intentional adversarial omission
      trustedIssuerAuth: null,
    });
    expect(v.supportsRemainingClaim).toBe(false);
    expect(v.blockers.some((b) => /trusted issuer authorization context missing/i.test(b))).toBe(true);
  });
});
