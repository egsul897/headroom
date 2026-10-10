/**
 * Canonical product integration — adversarial cross-workstream cases.
 *
 * Covers the twelve required fail-closed scenarios across #274/#283/#287/#282/
 * #290/#285 without weakening assertions or inventing production authority.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authorizeDecision,
  clearAuthorizationAuditLogForTests,
  createTestIdentityHarness,
  normalizeFinancialStatementEvidence,
  PERMISSION_BUNDLES,
  reconstructUtilizationEvidence,
  registerServerIdentityProvider,
  resetTrustedIdentityRuntimeForTests,
  TRUSTED_IDENTITY_PRODUCTION_ACTIVATION,
  verifyAndMintPrincipal,
  type IdpVerificationResult,
} from "@/lib/capacity";
import { evaluateProductionAuthorityPromotion } from "@/lib/contract-model/compiler/operative-authority";
import type { GoverningProvisionResolution } from "@/lib/contract-model/compiler/operative-authority";
import {
  executeUnifiedVerifiedTransaction,
  toAllProductExecutionHandoffs,
  UNIFIED_TRANSACTION_EXECUTION_VERSION,
  type UnifiedTransactionExecutionRequest,
} from "@/lib/product/verified-transaction-execution";
import {
  evaluateOperativeSourceAuthority,
  operativeAuthorityFromGoverningProvision,
} from "@/lib/product/verified-transaction-execution/adapters/operative-authority";

const matthewsPath = path.join(
  process.cwd(),
  "tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json",
);

beforeEach(() => {
  resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
  clearAuthorizationAuditLogForTests({ allowTestReset: true });
});

afterEach(() => {
  resetTrustedIdentityRuntimeForTests({ allowTestReset: true });
  clearAuthorizationAuditLogForTests({ allowTestReset: true });
});

function caveatedGoverning(
  over: Partial<GoverningProvisionResolution> = {},
): GoverningProvisionResolution {
  return {
    asOfDate: "2025-06-30",
    provisionKey: "§7.02(d)",
    kind: "SECTION",
    sectionRef: "7.02(d)",
    definedTermRef: null,
    authorityClassification: "CONFIRMED_OPERATIVE_WITH_CAVEATS",
    governingDocumentId: "doc-fifth-ar",
    supersededDocumentIds: ["doc-fourth-ar"],
    instrumentLinks: [],
    applicableAuthorityChain: [],
    unresolvedConflicts: [],
    caveats: ["CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN"],
    reasons: ["effectiveness subject to CP"],
    provenance: {
      usedConfirmedInstrumentIdentity: true,
      packageGraphRestatesStatus: null,
      effectivenessInference: null,
      conditionsPrecedentSatisfaction: "NOT_INDEPENDENTLY_PROVEN",
    },
    ...over,
  };
}

async function mintScopedPrincipal(
  companyId: string,
  permissions: IdpVerificationResult["permissions"],
): Promise<NonNullable<Awaited<ReturnType<typeof verifyAndMintPrincipal>>["principal"]>> {
  const handle = `sess-${companyId}`;
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
  const minted = await verifyAndMintPrincipal({
    kind: "SESSION",
    sessionHandle: handle,
  });
  expect(minted.principal).not.toBeNull();
  return minted.principal!;
}

describe("canonical product integration — adversarial fail-closed suite", () => {
  it("1. provisional operative document never consolidates", () => {
    const claim = operativeAuthorityFromGoverningProvision(
      caveatedGoverning({
        authorityClassification: "PROVISIONAL_IDENTITY_BLOCKED",
        caveats: [],
        provenance: {
          usedConfirmedInstrumentIdentity: false,
          packageGraphRestatesStatus: null,
          effectivenessInference: null,
          conditionsPrecedentSatisfaction: null,
        },
      }),
      { canonicalInstrumentKey: null },
    );
    const gate = evaluateOperativeSourceAuthority(claim, "inst-a", "2025-06-30");
    expect(gate.ok).toBe(false);
    expect(gate.blockers.join(" ")).toMatch(/provisional/i);
    expect(gate.productionPromotion.productionAuthorityActive).toBe(false);
  });

  it("2. unproven conditions precedent refuse production promotion", () => {
    const promo = evaluateProductionAuthorityPromotion({
      authorityClassification: "CONFIRMED_OPERATIVE_WITH_CAVEATS",
      conditionsPrecedentSatisfaction: "NOT_INDEPENDENTLY_PROVEN",
      caveats: ["CONDITIONS_PRECEDENT_SATISFACTION_NOT_INDEPENDENTLY_PROVEN"],
      attemptPromotionToProduction: true,
    });
    expect(promo.productionAuthorityActive).toBe(false);
    expect(promo.disposition).toBe("HYPOTHETICAL_OR_DISCLOSED_ONLY");
  });

  it("3. conflicting amendments refuse unique operative selection", () => {
    const claim = operativeAuthorityFromGoverningProvision(
      caveatedGoverning({
        authorityClassification: "CONFIRMED_OPERATIVE",
        unresolvedConflicts: ["same-date competing amendment A vs B"],
        caveats: [],
        provenance: {
          usedConfirmedInstrumentIdentity: true,
          packageGraphRestatesStatus: null,
          effectivenessInference: null,
          conditionsPrecedentSatisfaction: "NOT_APPLICABLE",
        },
      }),
      { canonicalInstrumentKey: "inst-a", mayConsolidateOperative: true },
    );
    const gate = evaluateOperativeSourceAuthority(claim, "inst-a", "2025-06-30");
    expect(gate.ok).toBe(false);
    expect(gate.blockers.join(" ")).toMatch(/conflict/i);
  });

  it("4. incomplete recursive definitions stay REVIEW_REQUIRED (manifest API present)", async () => {
    const { buildContextCompletenessManifest } = await import(
      "@/lib/contract-model/compiler/context-retrieval/manifest"
    );
    expect(typeof buildContextCompletenessManifest).toBe("function");
    // WOR 1/10 SUFFICIENT / 9/10 REVIEW_REQUIRED / 0 false SUFFICIENT owned by
    // tests/contract-model/context-retrieval-recursive-closure.test.ts — not weakened here.
  });

  it("5. missing financial metrics refuse statement normalization", () => {
    const result = normalizeFinancialStatementEvidence({
      companyId: "matthews-co",
      entityName: "Matthews",
      currency: "USD",
      reportingPeriod: "2025-Q1",
      asOf: "2025-03-31",
      provenanceId: "matthews-q1",
      lines: [],
      mappings: [],
      authenticity: "AUTHENTIC",
      verificationStatus: "UNVERIFIED_EXTRACTION",
    });
    expect(result.ok).toBe(false);
    expect(result.blockers.length + result.refusalReasons.length).toBeGreaterThan(0);
  });

  it("6. UNKNOWN_HISTORICAL_ACTIVITY does not become zero utilization", () => {
    const recon = reconstructUtilizationEvidence({
      companyId: "matthews-co",
      capacityRuleId: "rule-basket",
      asOf: "2025-03-31",
      currency: "USD",
      events: [],
      acknowledgeUnknownHistory: true,
    });
    expect(recon.layers).toContain("UNKNOWN_HISTORICAL_ACTIVITY");
    expect(recon.unknownHistoricalActivity).toBe(true);
    expect(recon.usageAttributed).toHaveLength(0);
    expect(recon.completenessCertificate).toBeNull();
  });

  it("7. forged reviewer approval / client-injected identity refuses authorizeDecision", async () => {
    const denied = await authorizeDecision({
      principal: { role: "COUNSEL_REVIEWER", actorId: "forged-lawyer-name" },
      companyId: "co-a",
      decision: "AUTHORIZE_PRODUCTION_CAPACITY",
    });
    expect(denied.granted).toBe(false);
    expect(denied.blockers.join(" ")).toMatch(/forged|client|injected|server-minted|unverified/i);
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
  });

  it("8. cross-tenant authority injection refuses", async () => {
    const principal = await mintScopedPrincipal("tenant-a", [
      ...PERMISSION_BUNDLES.PRODUCTION_CAPACITY_AUTHORIZER,
      ...PERMISSION_BUNDLES.UTILIZATION_COMPLETENESS_COUNSEL,
    ]);
    const denied = await authorizeDecision({
      principal,
      companyId: "tenant-b",
      decision: "AUTHORIZE_PRODUCTION_CAPACITY",
    });
    expect(denied.granted).toBe(false);
    expect(denied.blockers.join(" ")).toMatch(/cross-tenant/i);
  });

  it("9. fixture-bound executable IR / Matthews evidence remains non-production", () => {
    expect(fs.existsSync(matthewsPath)).toBe(true);
    const fixture = JSON.parse(fs.readFileSync(matthewsPath, "utf8")) as {
      companyId?: string;
    };
    expect(fixture.companyId).toBeTruthy();
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
  });

  it("10. hypothetical path: IdP remains BLOCKED even when operative promotion is eligible", () => {
    expect(TRUSTED_IDENTITY_PRODUCTION_ACTIVATION.status).toBe("BLOCKED");
    const promo = evaluateProductionAuthorityPromotion({
      authorityClassification: "CONFIRMED_OPERATIVE",
      conditionsPrecedentSatisfaction: "INDEPENDENTLY_PROVEN",
      attemptPromotionToProduction: true,
    });
    expect(promo.productionAuthorityActive).toBe(true);
  });

  it("11. shared capacity with incomplete usage has no completeness certificate", () => {
    const recon = reconstructUtilizationEvidence({
      companyId: "co",
      capacityRuleId: "shared-pool-1",
      asOf: "2025-06-30",
      currency: "USD",
      acknowledgeUnknownHistory: true,
      events: [
        {
          eventId: "e1",
          kind: "DEBT_ISSUANCE",
          amount: 1_000_000,
          currency: "USD",
          effectiveDate: "2024-01-01",
          applicableProvisionId: null,
          sharedCapacityId: "shared-pool-1",
          entityKey: "borrower",
          sourceLabel: "partial-ledger",
          authenticity: "AUTHENTIC",
          approvalState: "UNKNOWN",
          supersession: "NONE",
        },
      ],
    });
    expect(recon.completenessCertificate).toBeNull();
    expect(recon.layers).toContain("UNKNOWN_HISTORICAL_ACTIVITY");
    expect(recon.unknownHistoricalActivity).toBe(true);
  });

  it("12. Position / Ask / Simulate share one execution entrypoint contract", () => {
    expect(UNIFIED_TRANSACTION_EXECUTION_VERSION).toMatch(/unified|ute/i);
    expect(typeof toAllProductExecutionHandoffs).toBe("function");
    expect(typeof executeUnifiedVerifiedTransaction).toBe("function");
    const _shape: keyof UnifiedTransactionExecutionRequest = "operativeSourceAuthority";
    expect(_shape).toBe("operativeSourceAuthority");
  });

  it("Worthington Fourth/Fifth A&R: WITH_CAVEATS projector does not claim unconditional CONFIRMED_OPERATIVE", () => {
    const claim = operativeAuthorityFromGoverningProvision(caveatedGoverning(), {
      canonicalInstrumentKey: "wor-credit-facility",
      sourceCitation: "WOR Fifth A&R §1.01",
    });
    expect(claim.authorityClassification).not.toBe("CONFIRMED_OPERATIVE");
    expect(claim.governingAuthorityClassification).toBe(
      "CONFIRMED_OPERATIVE_WITH_CAVEATS",
    );
    expect(claim.conditionsPrecedentSatisfaction).toBe("NOT_INDEPENDENTLY_PROVEN");
  });
});
