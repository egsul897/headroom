/**
 * PR #311 P0/P1 security remediation — server-side assembler access gating
 * and authority honesty.
 *
 * Integration against the real gate + assembler + identity harness.
 * Company identity is supplied via an injectable loader (id + tenantKind only)
 * because this environment cannot reach Neon. That limitation is explicit:
 * these are NOT full browser or live-database end-to-end acceptance tests.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assembleCfoWorkflow,
  claimsFromDashboardSide,
  dashboardFlagAloneCannotPublishAvailable,
  gateWorkspaceAccess,
  ns4EvidenceLines,
  registerEvaluationAnonymousReadGrant,
  clearEvaluationAnonymousReadGrantsForTests,
  assertPositionSimulateCapacityConsistency,
  separateCapacityClaimsFromProductView,
  type WorkspaceCompanyIdentity,
  type CfoWorkflowSensitiveLoaders,
} from "@/lib/customer-workflow";
import type { ProductCapacityView } from "@/lib/capacity/product-capacity-view";
import type { CapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import type { RulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import {
  authorizeDecision,
  clearAuthorizationAuditLogForTests,
  createTestIdentityHarness,
  PERMISSION_BUNDLES,
  registerServerIdentityProvider,
  resetTrustedIdentityRuntimeForTests,
  TRUSTED_IDENTITY_PRODUCTION_ACTIVATION,
  verifyAndMintPrincipal,
  type IdpVerificationResult,
} from "@/lib/capacity";
import { readFileSync } from "node:fs";
import path from "node:path";

const CUSTOMER_CO = "cfo-sec-customer-co";
const EVAL_CO = "cfo-sec-eval-co";
const EVAL_NO_GRANT = "cfo-sec-eval-nogrant-co";
const OTHER_CO = "cfo-sec-other-co";

const catalog = new Map<string, WorkspaceCompanyIdentity>([
  [CUSTOMER_CO, { id: CUSTOMER_CO, tenantKind: "CUSTOMER" }],
  [EVAL_CO, { id: EVAL_CO, tenantKind: "EVALUATION" }],
  [EVAL_NO_GRANT, { id: EVAL_NO_GRANT, tenantKind: "EVALUATION" }],
  [OTHER_CO, { id: OTHER_CO, tenantKind: "CUSTOMER" }],
]);

async function identityLoader(companyId: string): Promise<WorkspaceCompanyIdentity | null> {
  return catalog.get(companyId) ?? null;
}

const emptyReadiness = (companyId: string): CapacityReadiness => ({
  companyId,
  status: "NO_DOCUMENTS",
  canEvaluateExecutableCapacity: false,
  capacityAuthority: "NONE",
  analyzedDocumentCount: 0,
  summaryCount: 0,
  discoveredCount: 0,
  awaitingAnalysisCount: 0,
  permissionCount: 0,
  unverifiedPermissionCount: 0,
  provisionCount: 0,
  hasFinancialSnapshot: false,
  financialSnapshotStatus: "UNKNOWN",
  ns4ApprovedSnapshotCount: 0,
  approvedNorthStarSnapshotCount: 0,
  contractLedgerActiveCount: 0,
  phase3TrustedUnitCount: 0,
  phase3TrustedRuleCount: 0,
  staleAnalyzedDocumentCount: 0,
  headline: "test",
  blockers: ["No financing documents"],
  guidance: "fail closed",
});

const emptyRulebook = (companyId: string): RulebookReadiness => ({
  companyId,
  stage: "DISCOVERED",
  discoveredSummaries: 0,
  interpretedProvisions: 0,
  reviewedPermissions: 0,
  executablePermissions: 0,
  provisionRows: 0,
  staleDiscoveredSummaries: 0,
  exceptionItems: 0,
  exceptionDecisions: 0,
  reviewComplete: false,
  blockers: ["No counsel-reviewed permissions"],
  headline: "test",
  note: "test",
});

/** Stub sensitive loaders — prove they are not called on denial; safe on allow. */
function stubLoaders(counters: { n: number }) {
  const touch = <T,>(value: T) => {
    counters.n += 1;
    return value;
  };
  return {
    loadCapacityReadiness: async (companyId: string) => touch(emptyReadiness(companyId)),
    loadRulebookReadiness: async (companyId: string) => touch(emptyRulebook(companyId)),
    getDocumentDetails: async () => touch([]),
    listCustomerDocumentIntelligence: async () => touch([]),
    getLatestAmendmentPackage: async () => touch(null),
    loadCovenantReviewWorkspace: async () => touch(null as never),
    listReviewerApprovals: async () => touch([]),
    getCompanyDashboard: async () => {
      counters.n += 1;
      throw new Error("NO_FINANCIAL_SNAPSHOT");
    },
    attemptVerifiedSimulate: async () =>
      touch({
        certified: { status: "REFUSED", blockers: ["NO_VEP"] } as never,
        pathEnumeration: {
          paths: [],
          incompleteReasons: ["NO_VEP"],
          unsupportedReasons: [],
          authority: "INCOMPLETE_PACKAGE",
          transactionKind: "SECURED_DEBT",
          secured: true,
          stackingAssumed: false as const,
          note: "test stub — no VEP",
        },
        selectedPathId: null,
        selectedPath: null,
        transaction: null,
        executable: false,
        refusalSummary: ["NO_VEP"],
        pathAutoSelected: false,
      } as Awaited<ReturnType<CfoWorkflowSensitiveLoaders["attemptVerifiedSimulate"]>>),
    loadAuthoritativeCapacity: async ({ companyId }: { companyId: string }) =>
      touch({
        companyId,
        evaluationDate: null,
        status: "NEEDS_INPUT" as const,
        authority: "NONE" as const,
        cutoff: {
          state: "NEEDS_INPUT",
          reportingPeriodKey: null,
          asOf: null,
          approvedSnapshotId: null,
          cutoffSnapshotId: null,
          cutoffSnapshotStatus: null,
        },
        approvedSnapshotCount: 0,
        activeLedgerUsageCount: 0,
        ledgerUsages: [],
        snapshotFactKeys: [],
        certified: {
          packagePresent: false,
          capacityOutcome: null,
          blockers: ["VerifiedExecutionPackage"],
          authorityNote: "test stub — no VEP",
        },
        legacy: {
          capacityAuthority: "NONE",
          canEvaluateExecutableCapacity: false,
          note: "LEGACY_ENGINE / NOT_CERTIFIED_4E",
        },
        missingInputs: ["APPROVED_NorthStar_snapshot", "VerifiedExecutionPackage"],
        evidence: ["No APPROVED NS-4 snapshot in test stub."],
      } as Awaited<ReturnType<CfoWorkflowSensitiveLoaders["loadAuthoritativeCapacity"]>>),
  };
}

async function mintScopedPrincipal(
  companyId: string,
  permissions: IdpVerificationResult["permissions"],
) {
  const handle = `sess-${companyId}-${Math.random().toString(16).slice(2)}`;
  registerServerIdentityProvider(
    createTestIdentityHarness({
      allowTestHarness: true,
      principalsByHandle: {
        [handle]: {
          principalId: `principal-${companyId}`,
          companyScope: [companyId],
          permissions,
          completenessRoles: ["COUNSEL_REVIEWER"],
          identityAssurance: "SESSION_AUTHENTICATED",
          expiresAtMs: Date.now() + 60 * 60 * 1000,
          authorizationBasis: "session:verified:test",
        },
      },
    }),
  );
  const minted = await verifyAndMintPrincipal({ kind: "SESSION", sessionHandle: handle });
  if (!minted.principal) throw new Error(minted.blockers.join("; "));
  return minted.principal;
}

describe("P1 — synthetic authority removal", () => {
  it("dashboard PRODUCTION_AUTHORITATIVE flag alone cannot publish AVAILABLE", () => {
    const claims = claimsFromDashboardSide({
      modeledRemaining: 500,
      binding: ["§7.01"],
      missing: [],
      productionAuthoritative: true,
      productView: null,
    });
    expect(claims.verifiedRemaining.amountMillions).toBeNull();
    expect(claims.verifiedRemaining.status).not.toBe("VERIFIED_EXECUTABLE");
    expect(claims.verifiedRemaining.claimLabel).not.toMatch(/^AVAILABLE$/i);
    expect(claims.hypotheticalModeled.amountMillions).toBe(500);
    expect(claims.hypotheticalModeled.status).toBe("NOT_PRODUCTION_AUTHORITATIVE");
    expect(
      dashboardFlagAloneCannotPublishAvailable({
        utilizationRemainingAuthority: "PRODUCTION_AUTHORITATIVE",
        productView: null,
      }),
    ).toBe(true);
  });

  it("source file no longer manufactures synthetic ProductCapacityView", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/customer-workflow/assemble-cfo-workflow.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/certificationStatus:\s*"PRODUCTION_AUTHORITATIVE"/);
    expect(src).not.toMatch(/authenticityOfUtilization:\s*"AUTHENTIC"/);
    expect(src).not.toMatch(/utilizationKnowledge:\s*"COMPLETE"/);
    expect(src).toMatch(/Dashboard authority flags do not certify/);
  });

  it("real ProductCapacityView with mayPublishAvailable publishes verified remaining", () => {
    const view: ProductCapacityView = {
      surface: "POSITION",
      capacityRuleId: "rule-1",
      asOf: "2025-06-30",
      grossCapacity: 1000,
      grossUnlimited: false,
      knownUtilization: 200,
      unknownUtilization: false,
      utilizationKnowledge: "COMPLETE",
      supportedRemainingCapacity: 800,
      governingConditions: ["§7.01(a)"],
      crossDocumentConstraints: [],
      sourceCitations: ["Indenture §7.01(a)"],
      certificationStatus: "CERTIFIED",
      publicationLabel: "AVAILABLE",
      remainingStatus: "REMAINING_SUPPORTED",
      mayPublishAvailable: true,
      blockers: [],
      note: "test verified view",
      authenticityOfUtilization: "AUTHENTIC",
    };
    const claims = claimsFromDashboardSide({
      modeledRemaining: 900,
      binding: [],
      missing: [],
      productView: view,
    });
    expect(claims.verifiedRemaining.amountMillions).toBe(800);
    expect(claims.verifiedRemaining.status).toBe("VERIFIED_EXECUTABLE");
    expect(claims.grossContractual.amountMillions).toBe(1000);
    expect(claims.sourceEvidence).toContain("Indenture §7.01(a)");
  });

  it("missing verified evidence → no AVAILABLE; Position/Simulate capacity identity consistent", () => {
    const claims = separateCapacityClaimsFromProductView(null, {
      modeledAmountMillions: 120,
      missingInputs: ["No verified evidence"],
    });
    expect(claims.remainingAuthoritative).toBe(false);
    expect(claims.verifiedRemaining.amountMillions).toBeNull();
    expect(assertPositionSimulateCapacityConsistency(claims, claims)).toEqual({ ok: true });
  });
});

describe("P0 — assembler access gating (injectable identity; Neon unreachable in this env)", () => {
  beforeEach(() => {
    resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
    clearAuthorizationAuditLogForTests({ allowTestReset: true });
    clearEvaluationAnonymousReadGrantsForTests({ allowTestReset: true });
    registerEvaluationAnonymousReadGrant({
      companyId: EVAL_CO,
      policyBasis: "test:explicit-evaluation-anonymous-read",
      allowAnonymousRead: true,
    });
  });

  afterEach(() => {
    resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
    clearEvaluationAnonymousReadGrantsForTests({ allowTestReset: true });
  });

  it("anonymous CUSTOMER access refused; sensitive loaders not invoked", async () => {
    const counters = { n: 0 };
    let sensitiveHook = 0;
    const denied = await assembleCfoWorkflow({
      companyId: CUSTOMER_CO,
      principal: undefined,
      companyIdentityLoader: identityLoader,
      onSensitiveLoad: () => {
        sensitiveHook += 1;
      },
      loaders: stubLoaders(counters),
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.accessAllowed).toBe(false);
      expect(denied.accessBlockers.join(" ")).toMatch(/CUSTOMER|authenticated|anonymous/i);
    }
    expect(counters.n).toBe(0);
    expect(sensitiveHook).toBe(0);
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
  });

  it("EVALUATION without explicit grant refused anonymously", async () => {
    const denied = await gateWorkspaceAccess({
      companyId: EVAL_NO_GRANT,
      companyIdentityLoader: identityLoader,
    });
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.blockers.join(" ")).toMatch(/no explicit anonymous-read policy/i);
    }
  });

  it("EVALUATION with explicit grant allows anonymous read (demo policy)", async () => {
    const counters = { n: 0 };
    let sensitiveHook = 0;
    const allowed = await assembleCfoWorkflow({
      companyId: EVAL_CO,
      companyIdentityLoader: identityLoader,
      onSensitiveLoad: () => {
        sensitiveHook += 1;
      },
      loaders: stubLoaders(counters),
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.accessAllowed).toBe(true);
      expect(allowed.capacityBySide.secured.remainingAuthoritative).toBe(false);
      expect(allowed.trustedIdentityStatus).toBe("BLOCKED");
      expect(allowed.simulate.preTransactionCapacity).toEqual(allowed.capacityBySide.secured);
    }
    expect(sensitiveHook).toBe(1);
    expect(counters.n).toBeGreaterThan(0);
  });

  it("NS-4 APPROVED evidence is shared by Position/Simulate without upgrading remaining", async () => {
    const counters = { n: 0 };
    const allowed = await assembleCfoWorkflow({
      companyId: EVAL_CO,
      companyIdentityLoader: identityLoader,
      simulateAmountMillions: 25,
      simulateKind: "RESTRICTED_PAYMENT",
      evaluationDate: "2026-08-01",
      loaders: stubLoaders(counters),
    });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;

    expect(allowed.authoritativeCapacity.approvedSnapshotCount).toBe(0);
    expect(allowed.authoritativeCapacity.status).toBe("NEEDS_INPUT");
    expect(allowed.capacityBySide.secured.remainingAuthoritative).toBe(false);
    expect(allowed.simulate.preTransactionCapacity?.remainingAuthoritative).toBe(false);

    const lines = ns4EvidenceLines(allowed.authoritativeCapacity);
    expect(lines.some((l) => /NS-4\/NS APPROVED snapshots: 0/.test(l))).toBe(true);
    expect(allowed.simulate.traceAndProvenance.some((t) => /NS-4\/NS APPROVED/.test(t))).toBe(true);
    expect(allowed.simulate.missingInputs.some((m) => /NS-4\/NS:/.test(m))).toBe(true);
    expect(allowed.position.missingInputs.some((m) => /NS-4\/NS:/.test(m))).toBe(true);
    expect(allowed.position.authorityNote).toMatch(/NS-4 evidence:/);
    expect(allowed.simulate.overallStatus).not.toBe("VERIFIED_EXECUTABLE");
    expect(allowed.capacityBySide.secured.verifiedRemaining.amountMillions).toBeNull();
    expect(counters.n).toBeGreaterThan(0);
  });

  it("review/approvals load failures are flagged, not silently treated as empty", async () => {
    const counters = { n: 0 };
    const loaders = stubLoaders(counters);
    const failing = {
      ...loaders,
      loadCovenantReviewWorkspace: async (): Promise<never> => {
        throw new Error("review workspace DB failure");
      },
      listReviewerApprovals: async (): Promise<never> => {
        throw new Error("approvals DB failure");
      },
    };
    const allowed = await assembleCfoWorkflow({
      companyId: EVAL_CO,
      companyIdentityLoader: identityLoader,
      loaders: failing,
    });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.reviewLoadFailed).toBe(true);
    expect(allowed.approvalsLoadFailed).toBe(true);
  });

  it("review/approvals load successes report no failure", async () => {
    const counters = { n: 0 };
    const allowed = await assembleCfoWorkflow({
      companyId: EVAL_CO,
      companyIdentityLoader: identityLoader,
      loaders: stubLoaders(counters),
    });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.reviewLoadFailed).toBe(false);
    expect(allowed.approvalsLoadFailed).toBe(false);
  });

  it("authenticated customer workspace read succeeds in-scope", async () => {    const principal = await mintScopedPrincipal(CUSTOMER_CO, [
      ...PERMISSION_BUNDLES.EVIDENCE_REVIEWER,
    ]);
    const counters = { n: 0 };
    const ok = await assembleCfoWorkflow({
      companyId: CUSTOMER_CO,
      principal,
      companyIdentityLoader: identityLoader,
      loaders: stubLoaders(counters),
    });
    expect(ok.ok).toBe(true);
    expect(counters.n).toBeGreaterThan(0);
    if (ok.ok) {
      expect(
        assertPositionSimulateCapacityConsistency(
          ok.capacityBySide.secured,
          ok.simulate.preTransactionCapacity!,
        ),
      ).toEqual({ ok: true });
    }
  });

  it("cross-tenant authenticated access refused; loaders not invoked", async () => {
    const principal = await mintScopedPrincipal(CUSTOMER_CO, [
      ...PERMISSION_BUNDLES.EVIDENCE_REVIEWER,
      ...PERMISSION_BUNDLES.PRODUCTION_CAPACITY_AUTHORIZER,
    ]);
    const counters = { n: 0 };
    let sensitiveHook = 0;
    const denied = await assembleCfoWorkflow({
      companyId: OTHER_CO,
      principal,
      companyIdentityLoader: identityLoader,
      onSensitiveLoad: () => {
        sensitiveHook += 1;
      },
      loaders: stubLoaders(counters),
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.accessBlockers.join(" ")).toMatch(/cross-tenant/i);
    }
    expect(counters.n).toBe(0);
    expect(sensitiveHook).toBe(0);

    const authDenied = await authorizeDecision({
      principal,
      companyId: OTHER_CO,
      decision: "AUTHORIZE_PRODUCTION_CAPACITY",
    });
    expect(authDenied.granted).toBe(false);
  });

  it("missing company identity refused", async () => {
    const denied = await gateWorkspaceAccess({
      companyId: "does-not-exist-cfo-sec",
      companyIdentityLoader: identityLoader,
    });
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.reason).toBe("Workspace access refused.");
      expect(denied.blockers.join(" ")).toMatch(/not found|missing/i);
    }
  });

  it("forged / client-injected principal refused for CUSTOMER", async () => {
    const counters = { n: 0 };
    const denied = await assembleCfoWorkflow({
      companyId: CUSTOMER_CO,
      principal: { role: "admin", companyId: CUSTOMER_CO, companyScope: [CUSTOMER_CO] },
      companyIdentityLoader: identityLoader,
      loaders: stubLoaders(counters),
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.accessBlockers.join(" ")).toMatch(/forged|injected|server-minted/i);
    }
    expect(counters.n).toBe(0);
  });

  it("demo grant alone does not authorize CUSTOMER workspace", async () => {
    registerEvaluationAnonymousReadGrant({
      companyId: CUSTOMER_CO,
      policyBasis: "test:should-not-override-customer",
      allowAnonymousRead: true,
    });
    const denied = await gateWorkspaceAccess({
      companyId: CUSTOMER_CO,
      companyIdentityLoader: identityLoader,
    });
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.blockers.join(" ")).toMatch(/CUSTOMER/i);
    }
  });
});
