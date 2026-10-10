/**
 * Adversarial security tests for the trusted identity boundary (HEADROOM Agent #8).
 *
 * Proves fail-closed production activation, discrete permissions, tenant isolation,
 * replay/revocation defense, and refusal of client/fixture authority injection.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TRUSTED_IDENTITY_BOUNDARY_VERIFIED,
  TRUSTED_IDENTITY_PRODUCTION_ACTIVATION,
  TRUSTED_IDENTITY_INVENTORY,
  TRUSTED_IDENTITY_DEPLOYMENT_REQUIREMENTS,
  isTrustedIdentityProductionActive,
  authorizeDecision,
  verifyAndMintPrincipal,
  mintTrustedIssuerAuthorizationContext,
  registerServerIdentityProvider,
  createTestIdentityHarness,
  resetTrustedIdentityRuntimeForTests,
  refuseClientInjectedIdentity,
  refuseUntrustedTrustedIssuerConstruction,
  getAuthorizationAuditLog,
  clearAuthorizationAuditLogForTests,
  authorizeCompletenessIssuer,
  evaluateCompletenessForRemainingClaim,
  PERMISSION_BUNDLES,
  TRUSTED_ISSUER_ACTIVATION,
  resolveTrustedIssuerAuthFromHost,
  mayUseAsProductionCapacityInput,
  type IdpVerificationResult,
} from "@/lib/capacity";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
/** Decision-time clock for tests — must stay behind real expiry from Date.now()-based mints. */
const DECISION_NOW = Date.now();

function counselCapable(
  overrides?: Partial<IdpVerificationResult>,
): IdpVerificationResult {
  return {
    principalId: "counsel-alice",
    companyScope: [COMPANY_A],
    permissions: [
      ...PERMISSION_BUNDLES.UTILIZATION_COMPLETENESS_COUNSEL,
    ],
    completenessRoles: ["COUNSEL_REVIEWER"],
    identityAssurance: "SESSION_AUTHENTICATED",
    // Relative to real wall clock so mint assertMintableVerification accepts it.
    expiresAtMs: Date.now() + 60 * 60 * 1000,
    authorizationBasis: "session:verified:test",
    ...overrides,
  };
}

function productionCapable(
  overrides?: Partial<IdpVerificationResult>,
): IdpVerificationResult {
  return counselCapable({
    principalId: "capacity-authz",
    permissions: [
      ...PERMISSION_BUNDLES.UTILIZATION_COMPLETENESS_COUNSEL,
      ...PERMISSION_BUNDLES.PRODUCTION_CAPACITY_AUTHORIZER,
    ],
    ...overrides,
  });
}

beforeEach(() => {
  resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
  clearAuthorizationAuditLogForTests({ allowTestReset: true });
});

afterEach(() => {
  resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
  clearAuthorizationAuditLogForTests({ allowTestReset: true });
});

describe("trusted identity boundary — inventory + activation", () => {
  it("reports no production IdP and keeps activation BLOCKED", () => {
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
    expect(isTrustedIdentityProductionActive()).toBe(false);
    expect(TRUSTED_IDENTITY_INVENTORY.loginSessionProvider.present).toBe(false);
    expect(TRUSTED_IDENTITY_INVENTORY.serviceAccountAuthentication.present).toBe(
      false,
    );
    expect(TRUSTED_IDENTITY_INVENTORY.productionActivation).toBe("BLOCKED");
    expect(TRUSTED_IDENTITY_DEPLOYMENT_REQUIREMENTS.length).toBeGreaterThanOrEqual(6);
    expect(TRUSTED_IDENTITY_BOUNDARY_VERIFIED).toBe(
      "TRUSTED_IDENTITY_BOUNDARY_VERIFIED",
    );
  });

  it("fails closed when no provider is registered", async () => {
    const minted = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "any",
    });
    expect(minted.principal).toBeNull();
    expect(minted.productionActivation).toBe("BLOCKED");
    expect(minted.blockers.some((b) => /no ServerIdentityProvider/i.test(b))).toBe(
      true,
    );
  });
});

describe("trusted identity boundary — adversarial refusals", () => {
  it("refuses client-side authority injection and role-string forgery", async () => {
    const refused = refuseClientInjectedIdentity({
      actorId: "attacker",
      role: "COUNSEL_REVIEWER",
      identityAssurance: "SESSION_AUTHENTICATED",
    });
    expect(refused.ok).toBe(false);

    const decision = await authorizeDecision({
      principal: {
        principalId: "attacker",
        permissions: ["AUTHORIZE_PRODUCTION_CAPACITY"],
        companyScope: [COMPANY_A],
      },
      companyId: COMPANY_A,
      decision: "AUTHORIZE_PRODUCTION_CAPACITY",
      nowMs: DECISION_NOW,
    });
    expect(decision.granted).toBe(false);
    expect(decision.trustedIssuerAuth).toBeNull();
    expect(
      decision.blockers.some((b) => /client-injected|not a server-minted/i.test(b)),
    ).toBe(true);

    const forgedCtx = refuseUntrustedTrustedIssuerConstruction({
      principals: [
        {
          actorId: "forged",
          authorizedRoles: ["COUNSEL_REVIEWER"],
          identityAssurance: "SESSION_AUTHENTICATED",
          status: "ACTIVE",
        },
      ],
      requireNonFixtureIdentity: true,
    });
    expect(forgedCtx.ok).toBe(false);
  });

  it("refuses privilege escalation — counsel cannot authorize production capacity", async () => {
    registerServerIdentityProvider(
      createTestIdentityHarness({
        allowTestHarness: true,
        principalsByHandle: {
          "sess-counsel": counselCapable(),
        },
      }),
    );
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "sess-counsel",
    });
    expect(principal).not.toBeNull();

    const review = await authorizeDecision({
      principal,
      companyId: COMPANY_A,
      decision: "REVIEW_EVIDENCE",
      evidenceId: "ev-1",
      nowMs: DECISION_NOW,
    });
    expect(review.granted).toBe(true);

    const certify = await authorizeDecision({
      principal,
      companyId: COMPANY_A,
      decision: "CERTIFY_UTILIZATION_COMPLETENESS",
      evidenceId: "ev-1",
      nowMs: DECISION_NOW,
    });
    expect(certify.granted).toBe(true);
    expect(certify.trustedIssuerAuth).not.toBeNull();
    expect(certify.productionActivation).toBe("BLOCKED");

    const prod = await authorizeDecision({
      principal,
      companyId: COMPANY_A,
      decision: "AUTHORIZE_PRODUCTION_CAPACITY",
      evidenceId: "ev-1",
      nowMs: DECISION_NOW,
    });
    expect(prod.granted).toBe(false);
    expect(prod.trustedIssuerAuth).toBeNull();
    expect(
      prod.blockers.some(
        (b) =>
          /AUTHORIZE_PRODUCTION_CAPACITY|production activation|BLOCKED/i.test(b),
      ),
    ).toBe(true);
  });

  it("refuses cross-tenant approval", async () => {
    registerServerIdentityProvider(
      createTestIdentityHarness({
        allowTestHarness: true,
        principalsByHandle: {
          "sess-a": counselCapable({ companyScope: [COMPANY_A] }),
        },
      }),
    );
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "sess-a",
    });
    expect(principal).not.toBeNull();
    const cross = await authorizeDecision({
      principal,
      companyId: COMPANY_B,
      decision: "CERTIFY_UTILIZATION_COMPLETENESS",
      evidenceId: "ev-x",
      nowMs: DECISION_NOW,
    });
    expect(cross.granted).toBe(false);
    expect(cross.blockers.some((b) => /cross-tenant/i.test(b))).toBe(true);
  });

  it("refuses stale expiry and replay after jti consume", async () => {
    const shortTtl = Date.now() + 30_000;
    registerServerIdentityProvider(
      createTestIdentityHarness({
        allowTestHarness: true,
        principalsByHandle: {
          "sess-ttl": counselCapable({ expiresAtMs: shortTtl }),
        },
      }),
    );
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "sess-ttl",
    });
    expect(principal).not.toBeNull();

    const stale = await authorizeDecision({
      principal,
      companyId: COMPANY_A,
      decision: "REVIEW_EVIDENCE",
      nowMs: shortTtl + 1,
    });
    expect(stale.granted).toBe(false);
    expect(stale.blockers.some((b) => /expired|stale|revoked|consumed/i.test(b))).toBe(
      true,
    );

    // Fresh mint for replay test
    const again = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "sess-ttl",
    });
    expect(again.principal).not.toBeNull();
    const first = await authorizeDecision({
      principal: again.principal,
      companyId: COMPANY_A,
      decision: "REVIEW_EVIDENCE",
      nowMs: DECISION_NOW,
      consumeOnGrant: true,
    });
    expect(first.granted).toBe(true);

    const replay = await authorizeDecision({
      principal: again.principal,
      companyId: COMPANY_A,
      decision: "REVIEW_EVIDENCE",
      nowMs: DECISION_NOW,
    });
    expect(replay.granted).toBe(false);
    expect(replay.blockers.some((b) => /revoked|consumed|replay/i.test(b))).toBe(
      true,
    );
  });

  it("refuses approval after live revocation", async () => {
    const revoked = new Set<string>(["counsel-alice"]);
    registerServerIdentityProvider(
      createTestIdentityHarness({
        allowTestHarness: true,
        principalsByHandle: {
          // verifyCredentials also checks revoked set → mint fails
          "sess-live": counselCapable(),
        },
        revokedPrincipalIds: revoked,
      }),
    );
    const deniedMint = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "sess-live",
    });
    expect(deniedMint.principal).toBeNull();

    // Mint while active, then revoke before decision
    const activeRevoked = new Set<string>();
    registerServerIdentityProvider(
      createTestIdentityHarness({
        allowTestHarness: true,
        principalsByHandle: {
          "sess-then-revoke": counselCapable({ principalId: "to-revoke" }),
        },
        revokedPrincipalIds: activeRevoked,
      }),
    );
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "sess-then-revoke",
    });
    expect(principal).not.toBeNull();
    activeRevoked.add("to-revoke");
    const after = await authorizeDecision({
      principal,
      companyId: COMPANY_A,
      decision: "CERTIFY_UTILIZATION_COMPLETENESS",
      nowMs: DECISION_NOW,
      checkLiveRevocation: true,
    });
    expect(after.granted).toBe(false);
    expect(after.blockers.some((b) => /revok/i.test(b))).toBe(true);
  });

  it("refuses JSON-cloned / structural lookalike principals", async () => {
    registerServerIdentityProvider(
      createTestIdentityHarness({
        allowTestHarness: true,
        principalsByHandle: { "sess-ok": counselCapable() },
      }),
    );
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "sess-ok",
    });
    expect(principal).not.toBeNull();
    const clone = JSON.parse(JSON.stringify(principal));
    const mint = await mintTrustedIssuerAuthorizationContext({
      principal: clone,
      companyId: COMPANY_A,
      forProductionCapacity: false,
      nowMs: DECISION_NOW,
    });
    expect(mint.auth).toBeNull();
    expect(mint.blockers.some((b) => /not a server-minted|forged|JSON/i.test(b))).toBe(
      true,
    );
  });

  it("org-member / admin bundle does not receive every approval authority", async () => {
    const orgAdminLike: IdpVerificationResult = {
      principalId: "org-admin",
      companyScope: [COMPANY_A],
      // Deliberately: upload + review only — classic confused "admin" over-grant avoided
      permissions: ["UPLOAD_DOCUMENTS", "REVIEW_EVIDENCE"],
      completenessRoles: [],
      identityAssurance: "SESSION_AUTHENTICATED",
      expiresAtMs: Date.now() + 60 * 60 * 1000,
      authorizationBasis: "session:verified:org-admin",
    };
    registerServerIdentityProvider(
      createTestIdentityHarness({
        allowTestHarness: true,
        principalsByHandle: { "sess-admin": orgAdminLike },
      }),
    );
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "sess-admin",
    });
    expect(principal).not.toBeNull();

    expect(
      (
        await authorizeDecision({
          principal,
          companyId: COMPANY_A,
          decision: "UPLOAD_DOCUMENT",
          nowMs: DECISION_NOW,
        })
      ).granted,
    ).toBe(true);

    for (const decision of [
      "APPROVE_FINANCIAL_METRIC",
      "CERTIFY_UTILIZATION_COMPLETENESS",
      "AUTHORIZE_PRODUCTION_CAPACITY",
    ] as const) {
      const r = await authorizeDecision({
        principal,
        companyId: COMPANY_A,
        decision,
        nowMs: DECISION_NOW,
      });
      expect(r.granted, decision).toBe(false);
    }
  });

  it("test harness cannot activate production; synthetic fixture path stays blocked", async () => {
    registerServerIdentityProvider(
      createTestIdentityHarness({
        allowTestHarness: true,
        principalsByHandle: {
          "sa-prod": productionCapable({
            identityAssurance: "SERVICE_ACCOUNT",
            authorizationBasis: "service-account:verified:test",
          }),
        },
      }),
    );
    const { principal, productionActivation } = await verifyAndMintPrincipal({
      kind: "SERVICE_ACCOUNT",
      credentialHandle: "sa-prod",
    });
    expect(principal).not.toBeNull();
    expect(productionActivation).toBe("BLOCKED");
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");

    const prodMint = await mintTrustedIssuerAuthorizationContext({
      principal,
      companyId: COMPANY_A,
      forProductionCapacity: true,
      nowMs: DECISION_NOW,
    });
    expect(prodMint.auth).toBeNull();
    expect(prodMint.productionActivation).toBe("BLOCKED");
    expect(
      prodMint.blockers.some((b) => /BLOCKED|No production identity/i.test(b)),
    ).toBe(true);
  });

  it("records audit with principal, company, decision, time, evidence, basis", async () => {
    registerServerIdentityProvider(
      createTestIdentityHarness({
        allowTestHarness: true,
        principalsByHandle: { "sess-audit": counselCapable() },
      }),
    );
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "sess-audit",
    });
    expect(principal).not.toBeNull();
    await authorizeDecision({
      principal,
      companyId: COMPANY_A,
      decision: "CERTIFY_UTILIZATION_COMPLETENESS",
      evidenceId: "evidence-42",
      nowMs: DECISION_NOW,
    });
    const log = getAuthorizationAuditLog();
    expect(log.length).toBeGreaterThanOrEqual(1);
    const last = log[log.length - 1]!;
    expect(last.principalId).toBe("counsel-alice");
    expect(last.companyId).toBe(COMPANY_A);
    expect(last.decision).toBe("CERTIFY_UTILIZATION_COMPLETENESS");
    expect(last.evidenceId).toBe("evidence-42");
    expect(last.authorizationBasis).toMatch(/session:verified/);
    expect(last.atMs).toBe(DECISION_NOW);
    expect(last.granted).toBe(true);
  });
});

describe("trusted identity boundary — bridge into TrustedIssuerAuthorizationContext", () => {
  it("minted completeness context authorizes matching certificate issuer only", async () => {
    registerServerIdentityProvider(
      createTestIdentityHarness({
        allowTestHarness: true,
        principalsByHandle: { "sess-bridge": counselCapable() },
      }),
    );
    const { principal } = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "sess-bridge",
    });
    expect(principal).not.toBeNull();
    const mint = await mintTrustedIssuerAuthorizationContext({
      principal,
      companyId: COMPANY_A,
      forProductionCapacity: false,
      nowMs: DECISION_NOW,
    });
    expect(mint.auth).not.toBeNull();
    expect(mint.auth!.requireNonFixtureIdentity).toBe(true);

    const ok = authorizeCompletenessIssuer(
      { actorId: "counsel-alice", role: "COUNSEL_REVIEWER" },
      mint.auth,
    );
    expect(ok.ok).toBe(true);

    const forged = authorizeCompletenessIssuer(
      { actorId: "forged-attacker", role: "COUNSEL_REVIEWER" },
      mint.auth,
    );
    expect(forged.ok).toBe(false);

    // Even with a valid local mint, repository production activation remains BLOCKED —
    // confused-deputy: having a test context must not imply production authority online.
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
  });

  it("evaluateCompletenessForRemainingClaim still requires trusted auth object", () => {
    const without = evaluateCompletenessForRemainingClaim({
      cert: {
        capacityRuleId: "r1",
        asOf: "2026-10-10",
        approvalState: "APPROVED",
        sourceLabel: "t",
        kind: "VERIFIED_COMPLETE",
        authenticity: "AUTHENTIC",
        issuer: {
          role: "COUNSEL_REVIEWER",
          actorId: "counsel-alice",
        },
      },
      trustedIssuerAuth: null,
    });
    expect(without.productionAuthoritative).toBe(false);
    expect(without.supportsRemainingClaim).toBe(false);
  });

  it("untrusted reviewer strings / client credentials / test identities cannot activate production", async () => {
    // Free-text reviewer label — never a VerifiedServerPrincipal
    const reviewerString = await authorizeDecision({
      principal: { reviewedBy: "human-reviewer@example.com", role: "admin" },
      companyId: COMPANY_A,
      decision: "AUTHORIZE_PRODUCTION_CAPACITY",
      nowMs: DECISION_NOW,
    });
    expect(reviewerString.granted).toBe(false);
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
    expect(TRUSTED_ISSUER_ACTIVATION.status).toBe("BLOCKED");

    // Client credential-shaped object
    const clientCreds = await authorizeDecision({
      principal: {
        kind: "SESSION",
        sessionHandle: "cookie-value",
        permissions: ["AUTHORIZE_PRODUCTION_CAPACITY"],
      },
      companyId: COMPANY_A,
      decision: "AUTHORIZE_PRODUCTION_CAPACITY",
      nowMs: DECISION_NOW,
    });
    expect(clientCreds.granted).toBe(false);

    // Test harness mint still cannot flip production activation
    registerServerIdentityProvider(
      createTestIdentityHarness({
        allowTestHarness: true,
        principalsByHandle: {
          "sess-test": productionCapable({
            identityAssurance: "SERVICE_ACCOUNT",
            authorizationBasis: "service-account:verified:test",
          }),
        },
      }),
    );
    const { principal } = await verifyAndMintPrincipal({
      kind: "SERVICE_ACCOUNT",
      credentialHandle: "sess-test",
    });
    expect(principal).not.toBeNull();
    const prod = await authorizeDecision({
      principal,
      companyId: COMPANY_A,
      decision: "AUTHORIZE_PRODUCTION_CAPACITY",
      nowMs: DECISION_NOW,
    });
    expect(prod.granted).toBe(false);
    expect(prod.productionActivation).toBe("BLOCKED");
    expect(isTrustedIdentityProductionActive()).toBe(false);
    expect(mayUseAsProductionCapacityInput({
      contractVersion: "verified-input-contract.v1",
      companyId: COMPANY_A,
      evaluationAsOf: "2026-10-10",
      trustClasses: ["AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE"],
      financial: {
        trustClass: "AUTHENTICATED_APPROVED_FINANCIAL_EVIDENCE",
        productionAuthoritative: true,
        snapshot: {} as never,
        blockers: [],
      },
      utilization: {
        trustClass: "VERIFIED_UTILIZATION_COMPLETE",
        productionAuthoritative: true,
        knowledge: "KNOWN_ATTRIBUTED",
        resolution: {} as never,
        supportsRemainingClaim: true,
        blockers: [],
      },
      productionAuthority: "ACTIVE",
      productionActivation: "ACTIVE",
      blockers: [],
      note: "forged-handoff",
    })).toBe(false);
  });

  it("dual activation with #273/#279 host mint remains fail-closed for production", () => {
    expect(TRUSTED_ISSUER_ACTIVATION.status).toBe("BLOCKED");
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
    const host = resolveTrustedIssuerAuthFromHost();
    expect(host.auth).toBeNull();
    expect(host.activation).toBe("BLOCKED");
  });
});
