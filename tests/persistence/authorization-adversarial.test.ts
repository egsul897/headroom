/**
 * Adversarial authorization tests for persistence production eligibility.
 * Disposable Postgres only. PRODUCTION_DB_TOUCHED: NO.
 * No test may bless an unsafe state.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createEphemeralDatabase, destroyEphemeralDatabase, type EphemeralDatabase } from "@/lib/testing/ephemeral-db";
import { assertDisposableDatabase } from "@/lib/testing/disposable-db";
import type { FinancialMetricEvidence } from "@/lib/capacity/financial-evidence";
import type { UtilizationCompletenessCertificate } from "@/lib/capacity/utilization-types";
import {
  productionTrustedIssuerAuth,
  sessionCounselPrincipal,
} from "@/lib/capacity/completeness-issuer-auth";
import {
  PERMISSION_BUNDLES,
  createTestIdentityHarness,
  registerServerIdentityProvider,
  resetTrustedIdentityRuntimeForTests,
  verifyAndMintPrincipal,
  clearAuthorizationAuditLogForTests,
} from "@/lib/capacity";
import {
  persistFinancialEvidenceBundle,
  approveFinancialEvidenceBundle,
  getLatestFinancialEvidenceBundle,
  persistUtilizationCompletenessRecord,
  getActiveCompletenessRecord,
  getProductionEligibleCompletenessRecord,
  revokeCompletenessRecord,
  TenantIsolationError,
  getFinancialEvidenceBundleById,
} from "@/lib/persistence";
import { assessSsrPersistedExecutionReadiness } from "@/lib/product/verified-transaction-execution/ssr-persisted-execution-gate";

const BASE_URL = process.env.DATABASE_URL;
const SKIP = !BASE_URL;
const describeDb = SKIP ? describe.skip : describe;

const COMPANY_A = "auth-adv-co-a";
const COMPANY_B = "auth-adv-co-b";

function metric(companyId: string, overrides?: Partial<FinancialMetricEvidence>): FinancialMetricEvidence {
  return {
    metricKey: "TOTAL_ASSETS",
    value: 1_000_000_000,
    currency: "USD",
    units: "USD",
    entity: {
      companyId,
      entityName: "Auth Adv Co",
      consolidationPerimeter: "Borrower and Restricted Subsidiaries",
    },
    accountingDefinition: "Total Consolidated Assets (covenant) — NOT GAAP Total Assets",
    sourceDocument: {
      documentId: "doc-10k",
      exactLocation: "p.42",
      excerpt: "Total assets",
    },
    reportingPeriod: "FY2024",
    measurementDate: "2024-12-31",
    amendmentRestatementStatus: "ORIGINAL",
    provenanceId: "prov-auth-1",
    verificationStatus: "VERIFIED",
    authenticity: "AUTHENTIC",
    ...overrides,
  };
}

async function mintApprover(companyId: string) {
  const handle = `sess-fin-${companyId}`;
  registerServerIdentityProvider(
    createTestIdentityHarness({
      allowTestHarness: true,
      principalsByHandle: {
        [handle]: {
          principalId: `fin-approver-${companyId}`,
          companyScope: [companyId],
          permissions: [...PERMISSION_BUNDLES.FINANCIAL_METRIC_APPROVER],
          completenessRoles: [],
          identityAssurance: "SESSION_AUTHENTICATED",
          expiresAtMs: Date.now() + 60 * 60 * 1000,
          authorizationBasis: "session:verified:test",
        },
      },
    }),
  );
  const minted = await verifyAndMintPrincipal({ kind: "SESSION", sessionHandle: handle });
  expect(minted.principal).not.toBeNull();
  return minted.principal!;
}

function authenticCert(ruleId: string, actorId: string): UtilizationCompletenessCertificate {
  return {
    capacityRuleId: ruleId,
    asOf: "2024-12-31",
    approvalState: "APPROVED",
    sourceLabel: "counsel",
    kind: "VERIFIED_COMPLETE",
    authenticity: "AUTHENTIC",
    issuer: { role: "COUNSEL_REVIEWER", actorId, attestedAt: "2024-12-31T12:00:00.000Z" },
  };
}

describeDb("persistence authorization adversarial", () => {
  let db: EphemeralDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    db = await createEphemeralDatabase(BASE_URL!);
    prisma = new PrismaClient({ datasources: { db: { url: db.databaseUrl } } });
    await assertDisposableDatabase(prisma);
    await prisma.company.createMany({
      data: [
        { id: COMPANY_A, name: "Auth Adv A", tenantKind: "EVALUATION" },
        { id: COMPANY_B, name: "Auth Adv B", tenantKind: "EVALUATION" },
      ],
    });
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await destroyEphemeralDatabase(db);
  });

  beforeEach(() => {
    resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
    clearAuthorizationAuditLogForTests({ allowTestReset: true });
  });

  afterEach(() => {
    resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
    clearAuthorizationAuditLogForTests({ allowTestReset: true });
  });

  it("forged issuer: ACTIVE AUTHENTIC cert is not production-eligible without trustedIssuerAuth", async () => {
    await persistUtilizationCompletenessRecord(prisma, {
      companyId: COMPANY_A,
      certificate: authenticCert("rule-forged", "forged-actor"),
    });
    expect(
      await getProductionEligibleCompletenessRecord(prisma, COMPANY_A, "rule-forged", "2024-12-31"),
    ).toBeNull();
    expect(await getActiveCompletenessRecord(prisma, COMPANY_A, "rule-forged", "2024-12-31")).not.toBeNull();
  });

  it("untrusted reviewer: trustedIssuerAuth present but actor not in registry → null", async () => {
    await persistUtilizationCompletenessRecord(prisma, {
      companyId: COMPANY_A,
      certificate: authenticCert("rule-untrusted", "not-in-registry"),
    });
    const auth = productionTrustedIssuerAuth([sessionCounselPrincipal("counsel-alice")]);
    expect(
      await getProductionEligibleCompletenessRecord(prisma, COMPANY_A, "rule-untrusted", "2024-12-31", {
        trustedIssuerAuth: auth,
      }),
    ).toBeNull();
  });

  it("revoked approval: REVOKED cert never production-eligible even with matching trusted issuer", async () => {
    const persisted = await persistUtilizationCompletenessRecord(prisma, {
      companyId: COMPANY_A,
      certificate: authenticCert("rule-revoked", "counsel-alice"),
    });
    const auth = productionTrustedIssuerAuth([sessionCounselPrincipal("counsel-alice")]);
    expect(
      await getProductionEligibleCompletenessRecord(prisma, COMPANY_A, "rule-revoked", "2024-12-31", {
        trustedIssuerAuth: auth,
      }),
    ).not.toBeNull();
    await revokeCompletenessRecord(prisma, COMPANY_A, persisted.id, {
      kind: "TRUSTED_ISSUER",
      actorId: "counsel-alice",
    });
    expect(
      await getProductionEligibleCompletenessRecord(prisma, COMPANY_A, "rule-revoked", "2024-12-31", {
        trustedIssuerAuth: auth,
      }),
    ).toBeNull();
  });

  it("cross-tenant company ID: foreign-tenant read/write refused", async () => {
    const r = await persistFinancialEvidenceBundle(prisma, {
      companyId: COMPANY_A,
      bundleKey: "fin-cross",
      asOfDate: "2024-12-31",
      metrics: [metric(COMPANY_A)],
    });
    await expect(getFinancialEvidenceBundleById(prisma, COMPANY_B, r.id)).rejects.toBeInstanceOf(
      TenantIsolationError,
    );
  });

  it("manufactured approval timestamp: VERIFIED metrics do not mint approvedAt", async () => {
    const r = await persistFinancialEvidenceBundle(prisma, {
      companyId: COMPANY_A,
      bundleKey: "fin-no-mint",
      asOfDate: "2024-12-31",
      metrics: [metric(COMPANY_A, { verificationStatus: "VERIFIED" })],
    });
    const loaded = await getLatestFinancialEvidenceBundle(prisma, COMPANY_A, "fin-no-mint");
    expect(loaded!.id).toBe(r.id);
    expect(loaded!.verificationStatus).toBe("VERIFIED");
    expect(loaded!.approvedAt).toBeNull();
  });

  it("forged TRUSTED_ISSUER approvalEvent / claimed label never sets approvedAt on persist", async () => {
    const when = new Date("2024-12-31T15:00:00.000Z");
    await persistFinancialEvidenceBundle(prisma, {
      companyId: COMPANY_A,
      bundleKey: "fin-forged-approval-event",
      asOfDate: "2024-12-31",
      metrics: [metric(COMPANY_A)],
      claimedReviewerLabel: "forged-counsel-label",
      approvalEvent: {
        approvedAt: when,
        actor: { kind: "TRUSTED_ISSUER", actorId: "counsel-alice" },
        authorizationNote: "forged — not IdP-verified",
      },
    });
    expect(
      (await getLatestFinancialEvidenceBundle(prisma, COMPANY_A, "fin-forged-approval-event"))!
        .approvedAt,
    ).toBeNull();

    await persistFinancialEvidenceBundle(prisma, {
      companyId: COMPANY_A,
      bundleKey: "fin-unauth-approval",
      asOfDate: "2024-12-31",
      metrics: [metric(COMPANY_A, { provenanceId: "prov-auth-2", value: 2 })],
      approvalEvent: {
        approvedAt: when,
        actor: { kind: "UNAUTHENTICATED" },
      },
    });
    expect(
      (await getLatestFinancialEvidenceBundle(prisma, COMPANY_A, "fin-unauth-approval"))!.approvedAt,
    ).toBeNull();
  });

  it("unauthenticated / forged principal cannot approve; VerifiedServerPrincipal can", async () => {
    const r = await persistFinancialEvidenceBundle(prisma, {
      companyId: COMPANY_A,
      bundleKey: "fin-approve-transition",
      asOfDate: "2024-12-31",
      metrics: [metric(COMPANY_A, { provenanceId: "prov-approve-1" })],
      claimedReviewerLabel: "I-am-counsel",
    });
    const forged = await approveFinancialEvidenceBundle(prisma, {
      companyId: COMPANY_A,
      bundleId: r.id,
      principal: {
        principalId: "attacker",
        permissions: ["APPROVE_FINANCIAL_METRICS"],
        companyScope: [COMPANY_A],
      },
      claimedReviewerLabel: "I-am-counsel",
    });
    expect(forged.ok).toBe(false);
    expect(forged.approvedAt).toBeNull();

    const principal = await mintApprover(COMPANY_A);
    const approved = await approveFinancialEvidenceBundle(prisma, {
      companyId: COMPANY_A,
      bundleId: r.id,
      principal,
    });
    expect(approved.ok).toBe(true);
    expect(approved.approvedAt).not.toBeNull();
    expect((await getFinancialEvidenceBundleById(prisma, COMPANY_A, r.id))!.approvedAt).not.toBeNull();
  });

  it("missing trusted identity: diagnostics refuse missing reviewer trustedIssuerAuth; never grants execution", () => {
    const a = assessSsrPersistedExecutionReadiness({
      surface: "ASK",
      tenantAuthenticated: true,
      companyId: COMPANY_A,
      prismaClientPresent: true,
      request: {
        companyId: COMPANY_A,
        verifiedPackage: { packageId: "vep" } as never,
        operativeSourceAuthority: {
          provisionalIdentity: false,
          authorityClassification: "CONFIRMED_OPERATIVE",
        } as never,
        financialEvidence: { metrics: [] } as never,
        utilization: { capacityRuleId: "r1" } as never,
        selectedLegalPath: { pathId: "p1" } as never,
        verifiedExecutableRule: { ruleId: "r1" } as never,
        reviewerAuthorization: {} as never,
        inputs: {} as never,
      },
    });
    expect(a.mayCallExecuteAndPersist).toBe(false);
    expect(a.blockers).toContain("MISSING_REVIEWER_TRUSTED_ISSUER");
    expect(a.blockers).toContain("CALLER_SUPPLIED_AUTH_NOT_PROOF");
    expect(a.mayPublishProductionAuthority).toBe(false);
    expect(a.gateSemantics).toBe("STRUCTURAL_DIAGNOSTICS_ONLY");
  });

  it("unauthorized execution attempt: tenantAuthenticated=false never grants executeAndPersist", () => {
    const a = assessSsrPersistedExecutionReadiness({
      surface: "POSITION",
      tenantAuthenticated: false,
      companyId: COMPANY_A,
      prismaClientPresent: true,
      request: {
        companyId: COMPANY_A,
        verifiedPackage: { packageId: "vep" } as never,
        operativeSourceAuthority: {
          provisionalIdentity: false,
          authorityClassification: "CONFIRMED_OPERATIVE",
        } as never,
        financialEvidence: { metrics: [1] } as never,
        utilization: { capacityRuleId: "r1" } as never,
        selectedLegalPath: { pathId: "p1" } as never,
        verifiedExecutableRule: { ruleId: "r1" } as never,
        reviewerAuthorization: { trustedIssuerAuth: { principals: [] } } as never,
        inputs: {} as never,
      },
    });
    expect(a.mayCallExecuteAndPersist).toBe(false);
    expect(a.blockers).toContain("MISSING_TENANT_AUTH");
    expect(a.mayPublishProductionAuthority).toBe(false);
  });

  it("incomplete operative authority refuses production publication path", () => {
    const a = assessSsrPersistedExecutionReadiness({
      surface: "SIMULATE",
      tenantAuthenticated: true,
      companyId: COMPANY_A,
      prismaClientPresent: true,
      request: {
        companyId: COMPANY_A,
        verifiedPackage: { packageId: "vep" } as never,
        operativeSourceAuthority: {
          provisionalIdentity: false,
          authorityClassification: "REVIEW_REQUIRED",
        } as never,
        financialEvidence: { metrics: [1] } as never,
        utilization: { capacityRuleId: "r1" } as never,
        selectedLegalPath: { pathId: "p1" } as never,
        verifiedExecutableRule: { ruleId: "r1" } as never,
        reviewerAuthorization: { trustedIssuerAuth: { principals: [] } } as never,
        inputs: {} as never,
      },
    });
    expect(a.blockers).toContain("INCOMPLETE_OPERATIVE_AUTHORITY");
    expect(a.mayCallExecuteAndPersist).toBe(false);
    expect(a.mayPublishProductionAuthority).toBe(false);
  });

  it("trusted issuer match can mark ACTIVE AUTHENTIC cert production-eligible (activation still separate)", async () => {
    await persistUtilizationCompletenessRecord(prisma, {
      companyId: COMPANY_A,
      certificate: authenticCert("rule-trusted", "counsel-alice"),
    });
    const auth = productionTrustedIssuerAuth([sessionCounselPrincipal("counsel-alice")]);
    const eligible = await getProductionEligibleCompletenessRecord(
      prisma,
      COMPANY_A,
      "rule-trusted",
      "2024-12-31",
      { trustedIssuerAuth: auth },
    );
    expect(eligible).not.toBeNull();
    expect(eligible!.authenticity).toBe("AUTHENTIC");
  });
});
