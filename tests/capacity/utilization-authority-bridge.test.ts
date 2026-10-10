/**
 * Canonical utilization authority on post-#237 main + completeness authority gate.
 * Adversarial false-permission cases for empty ledger / synthetic completeness.
 */
import { describe, expect, it } from "vitest";
import {
  DEMO_BINDINGS,
  assertCanonicalUtilizationContract,
  assertMayPublishRemaining,
  authenticCompletenessCertificate,
  decideSolverUtilizationAuthority,
  evidenceFromAttributedLedger,
  resolveCanonicalUtilizationAuthority,
  resolveUtilization,
  solverAuthoritySupportsRemaining,
  syntheticCompletenessCertificate,
  toSolverUtilizationAuthority,
} from "@/lib/capacity";
import { computeSharedConstraintCurrentUsage } from "@/lib/solver/shared-usage";

const AS_OF = "2026-06-30";
const CO = "co-bridge";
const RULE = "r1";

describe("utilization authority bridge (post-#237 + completeness gate)", () => {
  it("empty ledger → UNKNOWN, solver non-authoritative", () => {
    const { resolution, solver, decision } = resolveCanonicalUtilizationAuthority({
      capacityRuleId: RULE,
      companyId: CO,
      asOf: AS_OF,
      records: [],
      executionMode: "PRODUCTION",
    });
    expect(resolution.knowledge).toBe("UNKNOWN");
    expect(resolution.supportsRemainingClaim).toBe(false);
    expect(decision.authoritativeForRemaining).toBe(false);
    expect(solver.currentUsageSupportsRemainingClaim).toBe(false);
    expect(solverAuthoritySupportsRemaining(solver)).toBe(false);
  });

  it("approved individual entries alone → attributed known, remaining not supported", () => {
    const { resolution, solver } = resolveCanonicalUtilizationAuthority({
      capacityRuleId: RULE,
      companyId: CO,
      asOf: AS_OF,
      records: [
        evidenceFromAttributedLedger({
          usageId: "u1",
          amount: 10,
          currency: "USD",
          effectiveAsOf: "2026-01-01",
          capacityRuleId: RULE,
          status: "ACTIVE",
          approvalState: "APPROVED",
          sourceLabel: "approved row",
          authenticity: "AUTHENTIC",
        }),
      ],
      executionMode: "PRODUCTION",
    });
    expect(resolution.attributedAmount).toBe(10);
    expect(resolution.supportsRemainingClaim).toBe(false);
    expect(solver.currentUsageSupportsRemainingClaim).toBe(false);
  });

  it("AUTHENTIC VERIFIED_COMPLETE → solver COMPUTED + supports remaining", () => {
    const cert = authenticCompletenessCertificate({
      kind: "VERIFIED_COMPLETE",
      capacityRuleId: RULE,
      companyId: CO,
      actorId: "counsel-alice",
      asOf: AS_OF,
      bindings: DEMO_BINDINGS,
    });
    const { resolution, solver, decision } = resolveCanonicalUtilizationAuthority({
      capacityRuleId: RULE,
      companyId: CO,
      asOf: AS_OF,
      records: [
        evidenceFromAttributedLedger({
          usageId: "u1",
          amount: 10,
          currency: "USD",
          effectiveAsOf: "2026-01-01",
          capacityRuleId: RULE,
          status: "ACTIVE",
          approvalState: "APPROVED",
          sourceLabel: "approved row",
          authenticity: "AUTHENTIC",
        }),
      ],
      completenessCertificate: cert,
      currentBindings: DEMO_BINDINGS,
      executionMode: "PRODUCTION",
    });
    expect(resolution.supportsRemainingClaim).toBe(true);
    expect(resolution.productionAuthoritative).toBe(true);
    expect(decision.authoritativeForRemaining).toBe(true);
    expect(assertMayPublishRemaining(decision)).toBe(true);
    expect(solver.currentUsageSupportsRemainingClaim).toBe(true);
    expect(solver.currentUsageStatus).toBe("COMPUTED");
    expect(solver.currentUsage).toBe(10);
  });

  it("AUTHENTIC VERIFIED_EMPTY → solver VERIFIED_ZERO", () => {
    const cert = authenticCompletenessCertificate({
      kind: "VERIFIED_EMPTY",
      capacityRuleId: RULE,
      companyId: CO,
      actorId: "counsel-alice",
      asOf: AS_OF,
      bindings: DEMO_BINDINGS,
    });
    const { solver } = resolveCanonicalUtilizationAuthority({
      capacityRuleId: RULE,
      companyId: CO,
      asOf: AS_OF,
      records: [],
      completenessCertificate: cert,
      currentBindings: DEMO_BINDINGS,
      executionMode: "PRODUCTION",
    });
    expect(solver.currentUsageSupportsRemainingClaim).toBe(true);
    expect(solver.currentUsageStatus).toBe("VERIFIED_ZERO");
    expect(solver.currentUsage).toBe(0);
  });

  it("synthetic completeness never maps to authoritative remaining under PRODUCTION", () => {
    const { resolution, decision } = resolveCanonicalUtilizationAuthority({
      capacityRuleId: RULE,
      companyId: CO,
      asOf: AS_OF,
      records: [],
      completenessCertificate: syntheticCompletenessCertificate({
        kind: "VERIFIED_EMPTY",
        capacityRuleId: RULE,
        companyId: CO,
        asOf: AS_OF,
        bindings: DEMO_BINDINGS,
      }),
      currentBindings: DEMO_BINDINGS,
      executionMode: "PRODUCTION",
    });
    expect(resolution.supportsRemainingClaim).toBe(false);
    expect(resolution.productionAuthoritative).toBe(false);
    expect(decision.authoritativeForRemaining).toBe(false);
  });

  it("solver thin-cert path: SYNTHETIC refused; AUTHENTIC VERIFIED_EMPTY allowed on empty attribution", () => {
    const synthetic = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 0,
      measuredUsage: 0,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: {
        kind: "VERIFIED_EMPTY",
        approvalState: "APPROVED",
        sourceLabel: "fixture",
        authenticity: "SYNTHETIC_LABELED",
      },
    });
    expect(synthetic.authoritativeForRemaining).toBe(false);

    const authentic = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 0,
      measuredUsage: 0,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: {
        kind: "VERIFIED_EMPTY",
        approvalState: "APPROVED",
        sourceLabel: "counsel",
        authenticity: "AUTHENTIC",
      },
    });
    expect(authentic.authoritativeForRemaining).toBe(true);
    expect(authentic.solverStatus).toBe("VERIFIED_ZERO");

    const viaCompute = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [],
      completenessCertificate: {
        kind: "VERIFIED_EMPTY",
        approvalState: "APPROVED",
        sourceLabel: "counsel",
        authenticity: "AUTHENTIC",
      },
    });
    expect(viaCompute.authoritative).toBe(true);
    expect(viaCompute.status).toBe("VERIFIED_ZERO");
  });

  it("canonical contract guard rejects false-permission configurations", () => {
    const empty = resolveUtilization({
      capacityRuleId: RULE,
      companyId: CO,
      asOf: AS_OF,
      records: [],
      executionMode: "PRODUCTION",
    });
    const check = assertCanonicalUtilizationContract({
      emptyLedgerSupportsRemaining: empty.supportsRemainingClaim,
      individualApprovedEntriesImplyComplete: false,
      syntheticCertificateSupportsRemaining: false,
      nonAuthoritativeSolverUsageProducesRemaining: false,
      knowledgeWhenEmptyLedger: empty.knowledge,
    });
    expect(check.ok).toBe(true);

    const bad = assertCanonicalUtilizationContract({
      emptyLedgerSupportsRemaining: true,
      individualApprovedEntriesImplyComplete: true,
      syntheticCertificateSupportsRemaining: true,
      nonAuthoritativeSolverUsageProducesRemaining: true,
      knowledgeWhenEmptyLedger: "VERIFIED_ZERO",
    });
    expect(bad.ok).toBe(false);
    expect(bad.violations.length).toBeGreaterThanOrEqual(4);
  });

  it("toSolverUtilizationAuthority never invents authoritative zero from UNKNOWN", () => {
    const resolution = resolveUtilization({
      capacityRuleId: RULE,
      companyId: CO,
      asOf: AS_OF,
      records: [],
      executionMode: "PRODUCTION",
    });
    const solver = toSolverUtilizationAuthority(resolution);
    expect(solver.currentUsageSupportsRemainingClaim).toBe(false);
    expect(solver.currentUsage).toBe(0);
    expect(solver.currentUsageStatus).not.toBe("VERIFIED_ZERO");
  });
});
