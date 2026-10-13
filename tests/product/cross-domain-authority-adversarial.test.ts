/**
 * Adversarial tests for cross-domain verified-remaining authority + Simulate path.
 *
 * Covers final utilization-authority review for PR #340:
 * 1. Caller-supplied utilization flags cannot authorize remaining.
 * 2. Missing completeness evidence returns unknown remaining.
 * 3. Two baskets sharing one cap cannot double-count capacity.
 * 4. One blocking covenant blocks overall permission.
 * 5. Unsupported lien/investment conditions do not become clear.
 * 6. Changed approved financial inputs invalidate affected simulations.
 * 7. Coherent and Matthews use the same generalized execution path.
 * 8. Fabricated completeness / issuer / ledger / mismatched identity refuse.
 * 9. Modeled/gross never silently becomes verified remaining.
 * 10. Canonical owner is PR#340 v2 (not #334/#336 v1).
 */

import { describe, expect, it } from "vitest";
import type { UtilizationEvidenceRecord } from "@/lib/capacity/utilization-types";
import {
  productionTrustedIssuerAuth,
  sessionCounselPrincipal,
} from "@/lib/capacity/completeness-issuer-auth";
import {
  CROSS_DOMAIN_CANONICAL_OWNER,
  CROSS_DOMAIN_EVALUATION_VERSION,
  bindUtilizationAuthorityIdentity,
  buildApprovedFinancialIdentity,
  evaluateCrossDomainTransaction,
  resolveCanonicalVerifiedRemaining,
  sanitizeUtilizationAuthorityForSurface,
  type CrossDomainUtilizationAuthority,
  type UtilizationAuthorityExpectedIdentity,
} from "@/lib/product/cross-domain-transaction";
import {
  coherentDebtFundedAcquisition,
  coherentIntercompanyTransfer,
  coherentPackageData,
  evaluateCoherentScenario,
  evaluateMatthewsScenario,
  matthewsMinimalPackageData,
  matthewsRefinancing,
} from "@/lib/product/cross-domain-scenarios";
import { evaluateSimulateCrossDomainAcquisition } from "@/lib/product/cross-domain-simulate";

const AS_OF = "2026-06-30";
const RULE = "rule-rp-general";

function expectedIdentity(
  over: Partial<UtilizationAuthorityExpectedIdentity> = {},
): UtilizationAuthorityExpectedIdentity {
  return {
    companyId: "coherent",
    asOf: AS_OF,
    knownDocumentIds: ["doc-indenture", "doc-credit"],
    knownProvisionIds: [RULE, "prov-1", "ind_ratio_debt_secured"],
    ...over,
  };
}

function attributedRecord(
  over: Partial<UtilizationEvidenceRecord> &
    Pick<UtilizationEvidenceRecord, "usageId" | "amount" | "capacityRuleId">,
): UtilizationEvidenceRecord {
  return {
    kind: "ATTRIBUTED_RULE",
    currency: "USD",
    effectiveAsOf: "2026-01-01",
    sharedCapacityId: null,
    legacyBasketFamily: null,
    entityKey: null,
    status: "ACTIVE",
    approvalState: "APPROVED",
    sourceLabel: "adversarial-fixture",
    authenticity: "SYNTHETIC_LABELED",
    ...over,
  };
}

function baseAuth(
  over: Partial<CrossDomainUtilizationAuthority> = {},
): CrossDomainUtilizationAuthority {
  return {
    capacityRuleId: RULE,
    asOf: AS_OF,
    companyId: "coherent",
    documentId: "doc-indenture",
    provisionId: RULE,
    records: [
      attributedRecord({
        usageId: "u1",
        amount: 25,
        capacityRuleId: RULE,
      }),
    ],
    completenessCertificate: {
      capacityRuleId: RULE,
      asOf: AS_OF,
      approvalState: "APPROVED",
      sourceLabel: "synth completeness",
      kind: "VERIFIED_COMPLETE",
      authenticity: "SYNTHETIC_LABELED",
    },
    allowSyntheticRemaining: true,
    ...over,
  };
}

describe("canonical owner / version", () => {
  it("retains only PR#340 v2 as the canonical cross-domain implementation", () => {
    expect(CROSS_DOMAIN_EVALUATION_VERSION).toBe("cross-domain-transaction.v2");
    expect(CROSS_DOMAIN_CANONICAL_OWNER).toBe("PR#340");
  });
});

describe("1 — caller-supplied utilization flags cannot authorize remaining", () => {
  it("true/true flags still leave verifiedRemainingMillions null without authority", () => {
    const tx = coherentDebtFundedAcquisition(100);
    tx.assumptions.utilizationAttributed = true;
    tx.assumptions.utilizationCompletenessCertified = true;
    const result = evaluateCrossDomainTransaction({
      data: coherentPackageData(),
      transaction: tx,
      utilizationAuthority: null,
    });
    expect(result.packageLimitations.some((l) => /ignored for verified remaining/i.test(l))).toBe(
      true,
    );
    for (const d of result.domains) {
      expect(d.verifiedRemainingMillions).toBeNull();
    }
    const withModeled = result.domains.filter((d) => d.modeledRemainingMillions != null);
    expect(withModeled.length).toBeGreaterThan(0);
    for (const d of withModeled) {
      expect(d.verifiedRemainingMillions).toBeNull();
      expect(d.verifiedRemainingRefusalReason).toMatch(/canonical utilization/i);
    }
  });

  it("resolveCanonicalVerifiedRemaining ignores absence of flags — requires authority object", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 200,
      modeledRemainingMillions: 150,
      gateSatisfied: true,
      utilizationAuthority: null,
      expectedIdentity: expectedIdentity(),
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBeNull();
    expect(claim.modeledRemainingMillions).toBe(150);
    expect(claim.verifiedRemainingRefusalReason).toMatch(/cannot authorize/i);
  });
});

describe("2 — missing completeness evidence returns unknown remaining", () => {
  it("attributed records without completeness certificate → null verified remaining", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth({ completenessCertificate: null }),
      expectedIdentity: expectedIdentity(),
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBeNull();
    expect(claim.verifiedRemainingRefusalReason).toBeTruthy();
    expect(claim.modeledRemainingMillions).toBe(75);
  });
});

describe("3 — two baskets sharing one cap cannot double-count capacity", () => {
  it("successful first shared claim; second claim on same sharedCapacityId refused", () => {
    const sharedId = "pool-lien-shared";
    const auth = (ruleId: string): CrossDomainUtilizationAuthority => ({
      capacityRuleId: ruleId,
      asOf: AS_OF,
      companyId: "coherent",
      documentId: "doc-indenture",
      provisionId: ruleId,
      sharedCapacityId: sharedId,
      records: [
        {
          usageId: "pool-u1",
          kind: "ATTRIBUTED_SHARED_POOL",
          amount: 40,
          currency: "USD",
          effectiveAsOf: "2026-01-01",
          capacityRuleId: null,
          sharedCapacityId: sharedId,
          legacyBasketFamily: null,
          entityKey: null,
          status: "ACTIVE",
          approvalState: "APPROVED",
          sourceLabel: "adversarial-shared-pool",
          authenticity: "SYNTHETIC_LABELED",
        },
      ],
      completenessCertificate: {
        capacityRuleId: ruleId,
        asOf: AS_OF,
        approvalState: "APPROVED",
        sourceLabel: "synth shared completeness",
        kind: "VERIFIED_COMPLETE",
        authenticity: "SYNTHETIC_LABELED",
      },
      allowSyntheticRemaining: true,
      crossDocumentConstraints: [sharedId],
    });

    const claimed = new Set<string>();
    const identity = expectedIdentity({
      knownProvisionIds: ["basket-a", "basket-b", RULE],
    });
    const first = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 60,
      gateSatisfied: true,
      utilizationAuthority: auth("basket-a"),
      expectedIdentity: identity,
      authoritySurface: "TEST_DEMO",
      claimedSharedPools: claimed,
    });
    expect(first.verifiedRemainingMillions).toBe(60);
    expect(claimed.has(sharedId)).toBe(true);

    const second = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 60,
      gateSatisfied: true,
      utilizationAuthority: auth("basket-b"),
      expectedIdentity: identity,
      authoritySurface: "TEST_DEMO",
      claimedSharedPools: claimed,
    });
    expect(second.verifiedRemainingMillions).toBeNull();
    expect(second.verifiedRemainingRefusalReason).toMatch(/double-count/i);
    // Must not sum two verified remainings across baskets on one pool
    expect((first.verifiedRemainingMillions ?? 0) + (second.verifiedRemainingMillions ?? 0)).toBe(
      60,
    );
  });
});

describe("4 — one blocking covenant blocks overall permission", () => {
  it("Matthews SSNL above threshold → overall blocked", () => {
    const result = evaluateMatthewsScenario(matthewsRefinancing(50));
    expect(result.debtSimulation?.status).toBe("blocked");
    expect(result.overallStatus).toBe("blocked");
  });
});

describe("5 — unsupported lien/investment conditions do not become clear", () => {
  it("intercompany UNSUPPORTED investment is not clear", () => {
    const result = evaluateCoherentScenario(coherentIntercompanyTransfer(25));
    const inv = result.domains.find((d) => d.domain === "INVESTMENTS_ACQUISITIONS");
    expect(inv?.support).toBe("UNSUPPORTED");
    expect(inv?.status).toBe("not_tested");
  });

  it("PARTIAL liens stay review_required, never clear", () => {
    const result = evaluateCoherentScenario(coherentDebtFundedAcquisition(150));
    const liens = result.domains.find((d) => d.domain === "LIENS_SECURED_CAPACITY");
    expect(liens?.support).toBe("PARTIAL");
    expect(liens?.status).toBe("review_required");
  });
});

describe("6 — changed approved financial inputs invalidate affected simulations", () => {
  it("fingerprint mismatch marks ratio/debt review_required and financialIdentityValid false", () => {
    const data = coherentPackageData();
    const expected = buildApprovedFinancialIdentity({
      companyId: data.companyId,
      asOf: AS_OF,
      financials: data.financials,
      snapshotId: "snap-original",
    });
    expect(data.financials).toBeTruthy();
    const mutated = {
      ...data,
      financials: { ...data.financials!, ebitda: data.financials!.ebitda + 50 },
    };
    const result = evaluateCrossDomainTransaction({
      data: mutated,
      transaction: coherentDebtFundedAcquisition(150),
      expectedFinancialIdentity: expected,
    });
    expect(result.financialIdentityValid).toBe(false);
    const ratios = result.domains.find((d) => d.domain === "FINANCIAL_COVENANTS_RATIO_CAPACITY");
    expect(ratios?.status).toBe("review_required");
    expect(ratios?.missingInputs).toContain("approved financial identity match");
    const debt = result.domains.find((d) => d.domain === "DEBT_INCURRENCE_REFINANCING");
    expect(debt?.status).toBe("review_required");
    expect(result.packageLimitations.some((l) => /financial inputs changed/i.test(l))).toBe(true);
  });
});

describe("7 — Coherent and Matthews use the same generalized execution path", () => {
  it("both evaluations share version + evaluator shape (no company-id branch)", () => {
    const coherent = evaluateCoherentScenario(coherentDebtFundedAcquisition(100));
    const matthews = evaluateMatthewsScenario(matthewsRefinancing(50));
    expect(coherent.version).toBe(CROSS_DOMAIN_EVALUATION_VERSION);
    expect(matthews.version).toBe(CROSS_DOMAIN_EVALUATION_VERSION);
    expect(coherent.version).toBe(matthews.version);
    const viaSimulate = evaluateSimulateCrossDomainAcquisition({
      data: matthewsMinimalPackageData(),
      amountMillions: 50,
      evaluationDate: "2024-12-31",
    });
    expect(viaSimulate.version).toBe(CROSS_DOMAIN_EVALUATION_VERSION);
    expect(viaSimulate.scenario.kind).toBe("DEBT_FUNDED_ACQUISITION");
    expect(viaSimulate.approvedFinancialIdentity?.companyId).toBe("matthews");
  });
});

describe("8 — fabricated cert / issuer / ledger / mismatched identity refuse", () => {
  it("positive control: bound synthetic authority can publish remaining (TEST_DEMO only)", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 999,
      gateSatisfied: true,
      utilizationAuthority: baseAuth(),
      expectedIdentity: expectedIdentity(),
      authoritySurface: "TEST_DEMO",
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBe(75); // 100 − 25
    // Modeled is NOT used as verified
    expect(claim.verifiedRemainingMillions).not.toBe(999);
    expect(claim.modeledRemainingMillions).toBe(999);
  });

  it("fabricated AUTHENTIC cert with forged issuer.role and no trustedIssuerAuth → refuse", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth({
        allowSyntheticRemaining: false,
        records: [
          attributedRecord({
            usageId: "u-auth",
            amount: 25,
            capacityRuleId: RULE,
            authenticity: "AUTHENTIC",
          }),
        ],
        completenessCertificate: {
          capacityRuleId: RULE,
          asOf: AS_OF,
          approvalState: "APPROVED",
          sourceLabel: "forged cert",
          kind: "VERIFIED_COMPLETE",
          authenticity: "AUTHENTIC",
          issuer: { role: "COUNSEL_REVIEWER", actorId: "forged-counsel" },
        },
        trustedIssuerAuth: null,
      }),
      expectedIdentity: expectedIdentity(),
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBeNull();
    expect(claim.verifiedRemainingRefusalReason).toMatch(
      /trusted issuer|issuer|authoritative|authenticity/i,
    );
  });

  it("fabricated issuer actorId not in host registry → refuse", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth({
        allowSyntheticRemaining: false,
        records: [
          attributedRecord({
            usageId: "u-auth",
            amount: 25,
            capacityRuleId: RULE,
            authenticity: "AUTHENTIC",
          }),
        ],
        completenessCertificate: {
          capacityRuleId: RULE,
          asOf: AS_OF,
          approvalState: "APPROVED",
          sourceLabel: "forged cert",
          kind: "VERIFIED_COMPLETE",
          authenticity: "AUTHENTIC",
          issuer: { role: "COUNSEL_REVIEWER", actorId: "not-in-registry" },
        },
        trustedIssuerAuth: productionTrustedIssuerAuth([
          sessionCounselPrincipal("different-counsel"),
        ]),
      }),
      expectedIdentity: expectedIdentity(),
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBeNull();
    expect(claim.verifiedRemainingRefusalReason).toMatch(/not found|forged|unauthorized|issuer/i);
  });

  it("unapproved ledger records cannot authorize remaining", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth({
        records: [
          attributedRecord({
            usageId: "u-unapproved",
            amount: 25,
            capacityRuleId: RULE,
            approvalState: "UNAPPROVED",
          }),
        ],
      }),
      expectedIdentity: expectedIdentity(),
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBeNull();
  });

  it("SYNTHETIC completeness without allowSyntheticRemaining → refuse", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth({ allowSyntheticRemaining: false }),
      expectedIdentity: expectedIdentity(),
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBeNull();
    expect(claim.verifiedRemainingRefusalReason).toMatch(/synthetic|authoritative|remaining/i);
  });

  it("mismatched companyId / asOf / documentId / provisionId refuse binding", () => {
    expect(
      bindUtilizationAuthorityIdentity(baseAuth({ companyId: "other-co" }), expectedIdentity()),
    ).toMatch(/companyId/);
    expect(
      bindUtilizationAuthorityIdentity(baseAuth({ asOf: "2020-01-01" }), expectedIdentity()),
    ).toMatch(/as-of/);
    expect(
      bindUtilizationAuthorityIdentity(
        baseAuth({ documentId: "doc-not-in-package" }),
        expectedIdentity(),
      ),
    ).toMatch(/documentId/);
    expect(
      bindUtilizationAuthorityIdentity(
        baseAuth({ provisionId: "prov-unknown" }),
        expectedIdentity(),
      ),
    ).toMatch(/provisionId/);

    for (const bad of [
      baseAuth({ companyId: "other-co" }),
      baseAuth({ asOf: "2020-01-01" }),
      baseAuth({ documentId: "doc-not-in-package" }),
      baseAuth({ provisionId: "prov-unknown" }),
    ]) {
      const claim = resolveCanonicalVerifiedRemaining({
        grossCapacityMillions: 100,
        modeledRemainingMillions: 75,
        gateSatisfied: true,
        utilizationAuthority: bad,
        expectedIdentity: expectedIdentity(),
        claimedSharedPools: new Set(),
      });
      expect(claim.verifiedRemainingMillions).toBeNull();
      expect(claim.modeledRemainingMillions).toBe(75);
    }
  });

  it("completeness certificate capacityRuleId / asOf mismatch refuses", () => {
    const wrongRule = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth({
        completenessCertificate: {
          capacityRuleId: "other-rule",
          asOf: AS_OF,
          approvalState: "APPROVED",
          sourceLabel: "mismatch",
          kind: "VERIFIED_COMPLETE",
          authenticity: "SYNTHETIC_LABELED",
        },
      }),
      expectedIdentity: expectedIdentity(),
      claimedSharedPools: new Set(),
    });
    expect(wrongRule.verifiedRemainingMillions).toBeNull();
    expect(wrongRule.verifiedRemainingRefusalReason).toMatch(/capacityRuleId/);

    const wrongAsOf = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth({
        completenessCertificate: {
          capacityRuleId: RULE,
          asOf: "2019-01-01",
          approvalState: "APPROVED",
          sourceLabel: "mismatch",
          kind: "VERIFIED_COMPLETE",
          authenticity: "SYNTHETIC_LABELED",
        },
      }),
      expectedIdentity: expectedIdentity(),
      claimedSharedPools: new Set(),
    });
    expect(wrongAsOf.verifiedRemainingMillions).toBeNull();
    expect(wrongAsOf.verifiedRemainingRefusalReason).toMatch(/as-of/);
  });

  it("ledger records attributed to a foreign capacityRuleId refuse", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth({
        records: [
          attributedRecord({
            usageId: "u-foreign",
            amount: 25,
            capacityRuleId: "totally-different-rule",
          }),
        ],
      }),
      expectedIdentity: expectedIdentity(),
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBeNull();
    expect(claim.verifiedRemainingRefusalReason).toMatch(/different capacityRuleId/);
  });

  it("missing expectedIdentity refuses even with otherwise-valid synthetic authority", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth(),
      expectedIdentity: null,
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBeNull();
    expect(claim.verifiedRemainingRefusalReason).toMatch(/expected evaluation identity/);
  });
});

describe("10 — PRODUCTION boundary strips synthetic / forged trustedIssuerAuth", () => {
  it("allowSyntheticRemaining=true cannot authorize on default PRODUCTION surface", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth({ allowSyntheticRemaining: true }),
      expectedIdentity: expectedIdentity(),
      // authoritySurface omitted → PRODUCTION
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBeNull();
    expect(claim.modeledRemainingMillions).toBe(75);
  });

  it("sanitizeUtilizationAuthorityForSurface forces synthetic false and drops caller trustedIssuerAuth", () => {
    const forged = productionTrustedIssuerAuth([sessionCounselPrincipal("forged-from-json")]);
    const sanitized = sanitizeUtilizationAuthorityForSurface(
      baseAuth({
        allowSyntheticRemaining: true,
        trustedIssuerAuth: forged,
      }),
      "PRODUCTION",
    );
    expect(sanitized.auth?.allowSyntheticRemaining).toBe(false);
    expect(sanitized.auth?.trustedIssuerAuth).toBeNull(); // host currently BLOCKED
    expect(sanitized.disclosures.some((d) => /allowSyntheticRemaining=true stripped/i.test(d))).toBe(
      true,
    );
    expect(sanitized.disclosures.some((d) => /Caller-supplied trustedIssuerAuth ignored/i.test(d))).toBe(
      true,
    );
  });

  it("forged trustedIssuerAuth JSON + AUTHENTIC cert cannot produce production-authoritative remaining", () => {
    const forgedAuth = productionTrustedIssuerAuth([sessionCounselPrincipal("forged-counsel")]);
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth({
        allowSyntheticRemaining: true, // also stripped
        records: [
          attributedRecord({
            usageId: "u-auth",
            amount: 25,
            capacityRuleId: RULE,
            authenticity: "AUTHENTIC",
          }),
        ],
        completenessCertificate: {
          capacityRuleId: RULE,
          asOf: AS_OF,
          approvalState: "APPROVED",
          sourceLabel: "forged production-looking cert",
          kind: "VERIFIED_COMPLETE",
          authenticity: "AUTHENTIC",
          issuer: { role: "COUNSEL_REVIEWER", actorId: "forged-counsel" },
        },
        trustedIssuerAuth: forgedAuth,
      }),
      expectedIdentity: expectedIdentity(),
      authoritySurface: "PRODUCTION",
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBeNull();
    // Even if TEST_DEMO would accept forgedAuth, PRODUCTION replaces it with host null
    expect(claim.verifiedResult?.mayPublishAvailable ?? false).toBe(false);
    expect(claim.verifiedResult?.utilization.productionAuthoritative ?? false).toBe(false);
  });

  it("evaluateCrossDomainTransaction PRODUCTION strips sneaky synthetic authority", () => {
    const result = evaluateCrossDomainTransaction({
      data: coherentPackageData(),
      transaction: coherentDebtFundedAcquisition(100),
      utilizationAuthority: baseAuth({ allowSyntheticRemaining: true }),
      authoritySurface: "PRODUCTION",
    });
    expect(result.packageLimitations.some((l) => /allowSyntheticRemaining=true stripped/i.test(l))).toBe(
      true,
    );
    expect(result.domains.every((d) => d.verifiedRemainingMillions == null)).toBe(true);
  });

  it("Simulate production bridge refuses synthetic flag + forged trustedIssuerAuth", () => {
    const viaSimulate = evaluateSimulateCrossDomainAcquisition({
      data: coherentPackageData(),
      amountMillions: 150,
      evaluationDate: AS_OF,
      utilizationAuthority: baseAuth({
        allowSyntheticRemaining: true,
        trustedIssuerAuth: productionTrustedIssuerAuth([
          sessionCounselPrincipal("request-json-counsel"),
        ]),
        records: [
          attributedRecord({
            usageId: "u-auth",
            amount: 25,
            capacityRuleId: RULE,
            authenticity: "AUTHENTIC",
          }),
        ],
        completenessCertificate: {
          capacityRuleId: RULE,
          asOf: AS_OF,
          approvalState: "APPROVED",
          sourceLabel: "request body",
          kind: "VERIFIED_COMPLETE",
          authenticity: "AUTHENTIC",
          issuer: { role: "COUNSEL_REVIEWER", actorId: "request-json-counsel" },
        },
      }),
    });
    expect(viaSimulate.packageLimitations.some((l) => /PRODUCTION authority surface/i.test(l))).toBe(
      true,
    );
    expect(viaSimulate.domains.every((d) => d.verifiedRemainingMillions == null)).toBe(true);
  });

  it("caller completeness booleans still cannot authorize on PRODUCTION", () => {
    const tx = coherentDebtFundedAcquisition(100);
    tx.assumptions.utilizationAttributed = true;
    tx.assumptions.utilizationCompletenessCertified = true;
    const result = evaluateCrossDomainTransaction({
      data: coherentPackageData(),
      transaction: tx,
      utilizationAuthority: baseAuth({ allowSyntheticRemaining: true }),
      authoritySurface: "PRODUCTION",
    });
    expect(result.domains.every((d) => d.verifiedRemainingMillions == null)).toBe(true);
  });

  it("wrong ledger identity still refuses on PRODUCTION even with synthetic hatch attempted", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 100,
      modeledRemainingMillions: 75,
      gateSatisfied: true,
      utilizationAuthority: baseAuth({
        allowSyntheticRemaining: true,
        companyId: "wrong-company",
      }),
      expectedIdentity: expectedIdentity(),
      authoritySurface: "PRODUCTION",
      claimedSharedPools: new Set(),
    });
    expect(claim.verifiedRemainingMillions).toBeNull();
    expect(claim.verifiedRemainingRefusalReason).toMatch(/companyId/);
  });
});

describe("9 — modeled/gross never silently becomes verified remaining", () => {
  it("large modeled remaining stays modeled when authority refuses", () => {
    const claim = resolveCanonicalVerifiedRemaining({
      grossCapacityMillions: 5000,
      modeledRemainingMillions: 5000,
      gateSatisfied: true,
      utilizationAuthority: null,
      expectedIdentity: expectedIdentity(),
      claimedSharedPools: new Set(),
    });
    expect(claim.modeledRemainingMillions).toBe(5000);
    expect(claim.verifiedRemainingMillions).toBeNull();
  });

  it("end-to-end evaluate never copies modeled into verified without authority", () => {
    const result = evaluateCoherentScenario(coherentDebtFundedAcquisition(150));
    for (const d of result.domains) {
      if (d.modeledRemainingMillions != null) {
        expect(d.verifiedRemainingMillions).toBeNull();
      }
      if (d.grossCapacityMillions != null && d.verifiedRemainingMillions != null) {
        // Must come from util math, not identity with gross
        expect(d.verifiedRemainingRefusalReason).toBeNull();
      } else {
        expect(d.verifiedRemainingMillions).toBeNull();
      }
    }
  });

  it("Simulate loader passes utilizationAuthority:null — verified always null", () => {
    const viaSimulate = evaluateSimulateCrossDomainAcquisition({
      data: coherentPackageData(),
      amountMillions: 150,
      evaluationDate: AS_OF,
      utilizationAuthority: null,
    });
    expect(viaSimulate.domains.every((d) => d.verifiedRemainingMillions == null)).toBe(true);
  });
});
