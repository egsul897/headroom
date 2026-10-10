/**
 * HEADROOM-2 — adversarial financial evidence + verified-input handoff.
 *
 * Production authority must be refused unless all evidence and authorization
 * gates are satisfied. Authenticated fixtures demonstrate the contract but
 * do not activate production authority.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  TRUSTED_ISSUER_ACTIVATION,
  buildVerifiedCapacityInputHandoff,
  evidenceFromAttributedLedger,
  mayUseAsProductionCapacityInput,
  mintHostVerifiedIdentityForTests,
  productionTrustedIssuerAuth,
  refuseUntrustedIssuerClaim,
  registerHostIdentityProvider,
  resolveTrustedIssuerAuthFromHost,
  resolveUtilization,
  sessionCounselPrincipal,
  trustedIssuerAuthFromHostIdentities,
  validateFinancialMetricEvidence,
  type AuthenticatedFinancialSnapshotEvidence,
  type FinancialMetricEvidence,
} from "@/lib/capacity";

const AS_OF = "2026-06-30";
const COMPANY = "co-headroom-2";

const PROD_AUTH = productionTrustedIssuerAuth([sessionCounselPrincipal("counsel-alice")]);

function baseMetric(over: Partial<FinancialMetricEvidence> = {}): FinancialMetricEvidence {
  return {
    metricKey: "CONSOLIDATED_EBITDA",
    value: 500,
    currency: "USD",
    units: "USD_MILLIONS",
    entity: {
      companyId: COMPANY,
      entityName: "Headroom Demo Holdings",
      consolidationPerimeter: "Borrower and Restricted Subsidiaries",
    },
    sourceDocument: {
      documentId: "doc-10q-2026q2",
      exactLocation: "Note 12 / Consolidated EBITDA reconciliation / line 4",
      excerpt: "Consolidated EBITDA $500 million",
    },
    reportingPeriod: "FY2026-Q2",
    measurementDate: "2026-06-30",
    accountingDefinition: "Consolidated EBITDA as defined in Credit Agreement §1.01",
    amendmentRestatementStatus: "ORIGINAL",
    verificationStatus: "VERIFIED",
    authenticity: "AUTHENTIC",
    issuer: {
      role: "COUNSEL_REVIEWER",
      actorId: "counsel-alice",
      attestedAt: `${AS_OF}T12:00:00.000Z`,
    },
    provenanceId: "prov-ebitda-001",
    maxAgeDays: 120,
    ...over,
  };
}

function snapshot(
  metrics: FinancialMetricEvidence[],
  over: Partial<AuthenticatedFinancialSnapshotEvidence> = {},
): AuthenticatedFinancialSnapshotEvidence {
  return {
    companyId: COMPANY,
    asOf: AS_OF,
    reportingPeriod: "FY2026-Q2",
    currency: "USD",
    metrics,
    provenanceId: "snap-prov-001",
    ...over,
  };
}

function attributed(amount: number, over: Partial<Parameters<typeof evidenceFromAttributedLedger>[0]> = {}) {
  return evidenceFromAttributedLedger({
    usageId: over.usageId ?? "u1",
    amount,
    currency: "USD",
    effectiveAsOf: "2026-01-15",
    capacityRuleId: "rule-a",
    status: "ACTIVE",
    approvalState: "APPROVED",
    sourceLabel: "ledger",
    authenticity: "AUTHENTIC",
    ...over,
  });
}

afterEach(() => {
  registerHostIdentityProvider(null);
});

describe("HEADROOM-2 financial evidence adversarial", () => {
  it("forged issuer cannot establish production financial authority", () => {
    const r = validateFinancialMetricEvidence({
      evidence: baseMetric({
        issuer: { role: "COUNSEL_REVIEWER", actorId: "forged-attacker" },
      }),
      expectedCompanyId: COMPANY,
      evaluationAsOf: AS_OF,
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(r.productionAuthoritative).toBe(false);
    expect(r.refusalReasons).toContain("FORGED_ISSUER");
  });

  it("APPROVED-shaped evidence with missing authenticity / unverified extraction refuses", () => {
    const r = validateFinancialMetricEvidence({
      evidence: baseMetric({
        verificationStatus: "UNVERIFIED_EXTRACTION",
        authenticity: "AUTHENTIC",
      }),
      expectedCompanyId: COMPANY,
      evaluationAsOf: AS_OF,
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(r.ok).toBe(false);
    expect(r.productionAuthoritative).toBe(false);
    expect(r.refusalReasons).toContain("UNVERIFIED_EXTRACTION");
    expect(r.blockers.some((b) => /extracted values are not verified/i.test(b))).toBe(true);
  });

  it("unauthorized issuer role refuses", () => {
    const r = validateFinancialMetricEvidence({
      evidence: baseMetric({
        issuer: { role: "LEDGER_CUSTODIAN", actorId: "counsel-alice" },
      }),
      expectedCompanyId: COMPANY,
      evaluationAsOf: AS_OF,
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(r.productionAuthoritative).toBe(false);
    expect(r.refusalReasons).toContain("UNAUTHORIZED_ISSUER");
  });

  it("stale financial snapshot refuses", () => {
    const r = validateFinancialMetricEvidence({
      evidence: baseMetric({
        measurementDate: "2025-01-01",
        maxAgeDays: 90,
      }),
      expectedCompanyId: COMPANY,
      evaluationAsOf: AS_OF,
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(r.productionAuthoritative).toBe(false);
    expect(r.refusalReasons).toContain("STALE_SNAPSHOT");
  });

  it("wrong entity refuses", () => {
    const r = validateFinancialMetricEvidence({
      evidence: baseMetric({
        entity: {
          companyId: "other-co",
          entityName: "Other",
          consolidationPerimeter: "Borrower",
        },
      }),
      expectedCompanyId: COMPANY,
      evaluationAsOf: AS_OF,
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(r.refusalReasons).toContain("WRONG_ENTITY");
    expect(r.productionAuthoritative).toBe(false);
  });

  it("wrong currency refuses", () => {
    const r = validateFinancialMetricEvidence({
      evidence: baseMetric({ currency: "EUR" }),
      expectedCompanyId: COMPANY,
      expectedCurrency: "USD",
      evaluationAsOf: AS_OF,
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(r.refusalReasons).toContain("WRONG_CURRENCY");
  });

  it("wrong accounting period refuses", () => {
    const r = validateFinancialMetricEvidence({
      evidence: baseMetric({ reportingPeriod: "FY2025-Q4" }),
      expectedCompanyId: COMPANY,
      expectedReportingPeriod: "FY2026-Q2",
      evaluationAsOf: AS_OF,
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(r.refusalReasons).toContain("WRONG_ACCOUNTING_PERIOD");
  });

  it("restated or superseded financial evidence refuses", () => {
    for (const status of ["RESTATED", "SUPERSEDED"] as const) {
      const r = validateFinancialMetricEvidence({
        evidence: baseMetric({ amendmentRestatementStatus: status }),
        expectedCompanyId: COMPANY,
        evaluationAsOf: AS_OF,
        trustedIssuerAuth: PROD_AUTH,
      });
      expect(r.refusalReasons).toContain("RESTATED_OR_SUPERSEDED");
      expect(r.productionAuthoritative).toBe(false);
    }
  });

  it("missing utilization history is UNKNOWN — never zero", () => {
    const u = resolveUtilization({
      capacityRuleId: "rule-a",
      asOf: AS_OF,
      records: [],
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(u.knowledge).toBe("UNKNOWN");
    expect(u.attributedAmount).toBeNull();
    expect(u.supportsRemainingClaim).toBe(false);
    expect(u.blockers.some((b) => /empty ledger/i.test(b))).toBe(true);
  });

  it("APPROVED completeness without authenticity refuses remaining", () => {
    const u = resolveUtilization({
      capacityRuleId: "rule-a",
      asOf: AS_OF,
      records: [attributed(25)],
      completenessCertificate: {
        capacityRuleId: "rule-a",
        asOf: AS_OF,
        approvalState: "APPROVED",
        sourceLabel: "approved-no-auth",
        kind: "VERIFIED_COMPLETE",
        // authenticity omitted
        issuer: { role: "COUNSEL_REVIEWER", actorId: "counsel-alice" },
      },
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(u.supportsRemainingClaim).toBe(false);
    expect(u.productionAuthoritative).toBe(false);
    expect(u.blockers.some((b) => /missing authenticity/i.test(b))).toBe(true);
  });

  it("duplicate ledger usage refuses remaining", () => {
    const u = resolveUtilization({
      capacityRuleId: "rule-a",
      asOf: AS_OF,
      records: [attributed(10, { usageId: "dup" }), attributed(15, { usageId: "dup" })],
      completenessCertificate: {
        capacityRuleId: "rule-a",
        asOf: AS_OF,
        approvalState: "APPROVED",
        sourceLabel: "complete",
        kind: "VERIFIED_COMPLETE",
        authenticity: "AUTHENTIC",
        issuer: { role: "COUNSEL_REVIEWER", actorId: "counsel-alice" },
      },
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(u.supportsRemainingClaim).toBe(false);
    expect(u.blockers.some((b) => /duplicate ledger usage/i.test(b))).toBe(true);
  });

  it("shared pool utilization is distinguished and still requires completeness", () => {
    const u = resolveUtilization({
      capacityRuleId: "rule-a",
      asOf: AS_OF,
      sharedCapacityId: "pool-1",
      records: [
        attributed(40, {
          usageId: "pool-u",
          sharedCapacityId: "pool-1",
          kind: "ATTRIBUTED_SHARED_POOL",
        }),
      ],
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(u.knowledge).toBe("SHARED_POOL");
    expect(u.attributedAmount).toBe(40);
    expect(u.supportsRemainingClaim).toBe(false);
  });

  it("synthetic fixture contamination cannot establish production financial authority", () => {
    const r = validateFinancialMetricEvidence({
      evidence: baseMetric({ authenticity: "SYNTHETIC_LABELED" }),
      expectedCompanyId: COMPANY,
      evaluationAsOf: AS_OF,
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(r.ok).toBe(false);
    expect(r.productionAuthoritative).toBe(false);
    expect(r.refusalReasons).toContain("SYNTHETIC_FIXTURE");
  });

  it("caller-stipulated hypothetical values refuse production authority", () => {
    const r = validateFinancialMetricEvidence({
      evidence: baseMetric({ authenticity: "CALLER_STIPULATED_HYPOTHETICAL" }),
      expectedCompanyId: COMPANY,
      evaluationAsOf: AS_OF,
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(r.refusalReasons).toContain("CALLER_STIPULATED");
    expect(r.productionAuthoritative).toBe(false);
  });

  it("missing trusted host context fails closed", () => {
    const host = resolveTrustedIssuerAuthFromHost();
    expect(host.auth).toBeNull();
    expect(host.activation).toBe("BLOCKED");
    expect(TRUSTED_ISSUER_ACTIVATION.status).toBe("BLOCKED");

    const r = validateFinancialMetricEvidence({
      evidence: baseMetric(),
      expectedCompanyId: COMPANY,
      evaluationAsOf: AS_OF,
      trustedIssuerAuth: null,
    });
    expect(r.productionAuthoritative).toBe(false);
    expect(r.refusalReasons).toContain("MISSING_TRUSTED_HOST_CONTEXT");
  });

  it("tampered provenance refuses", () => {
    const r = validateFinancialMetricEvidence({
      evidence: baseMetric({ provenanceId: "prov-tampered" }),
      expectedCompanyId: COMPANY,
      evaluationAsOf: AS_OF,
      trustedIssuerAuth: PROD_AUTH,
      expectedProvenanceId: "prov-ebitda-001",
    });
    expect(r.refusalReasons).toContain("TAMPERED_PROVENANCE");
    expect(r.productionAuthoritative).toBe(false);
  });

  it("certificate / JSON / fixture claims cannot mint trusted host identity", () => {
    const refused = refuseUntrustedIssuerClaim({
      role: "COUNSEL_REVIEWER",
      actorId: "counsel-alice",
      fromCertificate: true,
    });
    expect(refused.ok).toBe(false);

    const forgedPlain = {
      actorId: "counsel-alice",
      authorizedRoles: ["COUNSEL_REVIEWER" as const],
      identityAssurance: "SESSION_AUTHENTICATED" as const,
      status: "ACTIVE" as const,
    };
    expect(trustedIssuerAuthFromHostIdentities([forgedPlain])).toBeNull();
  });

  it("fully authenticated fixture demonstrates contract but does not activate production", () => {
    const identity = mintHostVerifiedIdentityForTests(
      {
        actorId: "counsel-alice",
        authorizedRoles: ["COUNSEL_REVIEWER"],
        identityAssurance: "SESSION_AUTHENTICATED",
      },
      { allowTestMint: true },
    );
    registerHostIdentityProvider({
      verifyCurrentPrincipal: () => identity,
    });

    const handoff = buildVerifiedCapacityInputHandoff({
      companyId: COMPANY,
      evaluationAsOf: AS_OF,
      financial: snapshot([
        baseMetric(),
        baseMetric({
          metricKey: "TOTAL_DEBT",
          value: 1200,
          provenanceId: "prov-debt-001",
          sourceDocument: {
            documentId: "doc-10q-2026q2",
            exactLocation: "Balance sheet / Total debt",
          },
        }),
      ]),
      requiredFinancialMetrics: ["CONSOLIDATED_EBITDA", "TOTAL_DEBT"],
      utilization: {
        capacityRuleId: "rule-a",
        asOf: AS_OF,
        records: [attributed(25)],
        completenessCertificate: {
          capacityRuleId: "rule-a",
          asOf: AS_OF,
          approvalState: "APPROVED",
          sourceLabel: "auth-complete",
          kind: "VERIFIED_COMPLETE",
          authenticity: "AUTHENTIC",
          issuer: { role: "COUNSEL_REVIEWER", actorId: "counsel-alice" },
        },
      },
    });

    expect(handoff.financial.productionAuthoritative).toBe(true);
    expect(handoff.utilization.productionAuthoritative).toBe(true);
    expect(handoff.trustClasses).toContain("AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE");
    expect(handoff.trustClasses).toContain("VERIFIED_UTILIZATION_COMPLETE");
    // Repository activation remains BLOCKED — fixture must not activate production.
    expect(handoff.productionActivation).toBe("BLOCKED");
    expect(handoff.productionAuthority).toBe("REFUSED");
    expect(mayUseAsProductionCapacityInput(handoff)).toBe(false);
    expect(TRUSTED_ISSUER_ACTIVATION.status).toBe("BLOCKED");
  });

  it("caller-stipulated handoff is labeled and never production-authoritative", () => {
    const handoff = buildVerifiedCapacityInputHandoff({
      companyId: COMPANY,
      evaluationAsOf: AS_OF,
      financial: snapshot([
        baseMetric({ authenticity: "CALLER_STIPULATED_HYPOTHETICAL" }),
      ]),
      requiredFinancialMetrics: ["CONSOLIDATED_EBITDA"],
      utilization: {
        capacityRuleId: "rule-a",
        asOf: AS_OF,
        records: [],
      },
      allowCallerStipulated: true,
      trustedIssuerAuth: null,
    });
    expect(handoff.financial.trustClass).toBe("CALLER_STIPULATED_HYPOTHETICAL");
    expect(handoff.utilization.trustClass).toBe("UNKNOWN");
    expect(handoff.productionAuthority).toBe("REFUSED");
    expect(mayUseAsProductionCapacityInput(handoff)).toBe(false);
  });
});
