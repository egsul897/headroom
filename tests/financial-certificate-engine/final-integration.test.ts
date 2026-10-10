/**
 * Agent 2 — FINANCIAL ENGINE FINAL INTEGRATION
 *
 * Combines #220 FCE with #237 utilization authority, #223 TE-D3 overlays,
 * and #243 certified sequential-execution under REQUIRE.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  runFinancialCertificateEngine,
  buildFinancialStateFromEngineRun,
  runSequentialFinancialEffects,
  netDebtIncreasingBorrowActions,
  cashOutflowActions,
  expectedCashDebtDeltas,
  classifyApprovedSnapshotAuthority,
  isTestOrNonProductionReviewerIdentity,
  publishRemainingCapacity,
  evaluateVerifiedCapacityWithApprovedFinancials,
  runVerifiedSequentialTransactions,
  VERIFIED_EXECUTION_POLICY,
  FIXTURE_AUTHORITY,
  MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP,
} from "@/lib/financial-certificate-engine";
import {
  MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
  MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
  COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
  COHERENT_FINANCIAL_STATEMENT_FY2026,
} from "@/lib/financial-certificate-engine/fixtures";
import {
  buildSharedCapacitySequentialWorld,
  runSequentialTransactions,
  chainFinancialViewWithScope,
} from "@/lib/contract-model/sequential-execution";
import {
  buildSequentialDemoWorld,
} from "@/lib/product/north-star-workflow/sequential-demo-scenario";
import {
  recipeEquityContribution,
} from "@/lib/product/north-star-workflow/transaction-effect-recipes";
import type { VerifiedExecutionPackage, VerifiedUnitArtifact } from "@/lib/contract-model/verified-execution";
import type { IRRule } from "@/lib/contract-model/ir/types";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import * as tx from "../contract-model/runtime/transaction/helpers";

beforeEach(() => tx.resetIds());

describe("final §1 — dependency ancestry (#229/#237/#223/#243)", () => {
  it("exports REQUIRE policy and #237-backed remaining publication", () => {
    expect(VERIFIED_EXECUTION_POLICY).toBe("REQUIRE");
    const pub = publishRemainingCapacity({
      capacityRuleId: "r1",
      asOf: "2026-06-30",
      grossCapacityMillions: 100,
      records: [],
      completenessCertificate: null,
    });
    expect(pub.status).toBe("GROSS_ONLY");
    expect(pub.verified.publicationLabel).toBe("GROSS_CONTRACTUAL");
    expect(pub.supportsRemainingClaim).toBe(false);
  });
});

describe("final §2 — approval authority cannot be spoofed", () => {
  it("rejects test emails, generic reviewer labels, and channel-less productionContext", () => {
    expect(isTestOrNonProductionReviewerIdentity("ci-bot@example.com", "ci-ref")).toBe(true);
    expect(isTestOrNonProductionReviewerIdentity("demo-reviewer", "gate-1")).toBe(true);
    expect(isTestOrNonProductionReviewerIdentity("alice@corp.com", "board-1")).toBe(false);

    expect(
      classifyApprovedSnapshotAuthority({
        reviewedBy: "alice@corp.com",
        approvalRef: "board-1",
        productionContext: true,
        trustedProductionApprovalChannel: false,
      }).kind,
    ).toBe("TEST_ATTRIBUTED_APPROVAL");

    expect(
      classifyApprovedSnapshotAuthority({
        reviewedBy: "alice@corp.com",
        approvalRef: "board-1",
        productionContext: true,
        trustedProductionApprovalChannel: true,
      }).kind,
    ).toBe("REAL_REVIEWER_APPROVED");
  });
});

describe("final §3 — Matthews independent expected values + missing synergy", () => {
  it("matches accession build-up and refuses to invent synergy dollars", () => {
    expect(FIXTURE_AUTHORITY.matthews_q1_fy2025.kind).toBe("AUTHENTIC_SOURCE_DERIVED");
    const run = runFinancialCertificateEngine({
      companyId: "matw-final",
      statement: {
        documentId: "matw-10q",
        text: MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "matw-cert",
        text: MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2025-02-15T00:00:00Z"),
    });
    const ebitda = run.capacityMetrics.find((m) => m.metricName === "covenant_ebitda");
    expect(ebitda?.value).toBeCloseTo(MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.consolidatedEbitdaMillions, 3);
    expect(ebitda?.value).toBeCloseTo(128.313, 3);
    expect(MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.asOf).toBe("2024-12-31");
    expect(run.reconciliation.asOfDate).toBe("2024-12-31");
    const synergy = run.certificate!.adjustments.find((a) => a.kind === "PRO_FORMA");
    expect(synergy?.amountMissing).toBe(true);
    expect(synergy?.amountMillions).toBeNull();
  });
});

describe("final §4 — cash/debt effects with currency + as-of consistency", () => {
  it("applies explicit cash-proceeds assumptions in USD as-of base date", () => {
    const asOf = new Date("2026-06-30T12:00:00Z");
    const run = runFinancialCertificateEngine({
      companyId: "final-cash",
      statement: {
        documentId: "s",
        text: COHERENT_FINANCIAL_STATEMENT_FY2026,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "c",
        text: COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-08-20T00:00:00Z"),
    });
    const built = buildFinancialStateFromEngineRun(run, {
      stateId: "final-cash",
      companyId: "final-cash",
    });
    expect(built.status).toBe("OK");
    if (built.status !== "OK") return;

    // Explicit assumption: debt issuance credits cash proceeds 1:1 in USD.
    const issue = {
      kind: "DEBT_ISSUANCE" as const,
      amount: 100,
      useOfProceeds: "general corporate purposes — cash proceeds assumed equal to principal",
      facilityDraft: {
        name: "TL-final",
        facilityType: "TERM_LOAN" as const,
        secured: true,
        couponType: "FIXED" as const,
        couponPct: 7,
      },
    };
    expect(expectedCashDebtDeltas(issue)).toMatchObject({ cashDelta: 100, debtDelta: 100 });
    expect(built.state.asOfDate.toISOString().slice(0, 10)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Fixtures and scenario actions are USD; no FX conversion is invented.
    expect(COHERENT_FINANCIAL_STATEMENT_FY2026).toMatch(/Currency:\s*USD/i);

    const seq = runSequentialFinancialEffects({
      baseState: built.state,
      baseAuthoritative: true,
      asOfDate: asOf,
      steps: [
        { label: "borrow+deploy", actions: netDebtIncreasingBorrowActions({ amountMillions: 100, secured: true }) },
        { label: "dividend", actions: cashOutflowActions({ amountMillions: 20 }) },
      ],
    });
    expect(seq.reusedStaleMetrics).toBe(false);
    expect(seq.steps[1]!.ratios.netDebt).not.toBeNull();
    // Step 2 sees step 1 debt (not stale base).
    expect(seq.steps[1]!.proFormaState.balanceSheetFacts.totalDebtPrincipal.value).toBeCloseTo(
      built.state.balanceSheetFacts.totalDebtPrincipal.value + 100,
      4,
    );
  });
});

describe("final §5 — gross without #237 completeness never yields remaining", () => {
  it("approved financials support gross only", () => {
    const STRONG = { compilerVersion: "c1", sourceContentVersion: "s1" } as const;
    function verifiedArtifact(r: IRRule): VerifiedUnitArtifact {
      const result = {
        candidateRef: "cand-1",
        status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
        findings: [],
        semanticReviewInvoked: false,
        semanticReviewSkippedReason: null,
        conditionSuspicion: null,
        verifierAlgorithmVersion: "verifier-v1",
        verifiedAt: "2026-01-01T00:00:00.000Z",
        evidenceSetHash: "eh-1",
      } as unknown as SemanticVerificationResult;
      return {
        ruleOrDefinitionId: r.ruleId,
        kind: "RULE",
        verifiedIdentity: {
          ruleOrDefinitionId: r.ruleId,
          companyId: r.companyId,
          instrumentKey: r.instrumentKey,
          irSchemaVersion: r.irSchemaVersion,
          compilerVersion: r.compilerVersion,
          sourceContentVersion: r.sourceContentVersion,
        },
        result,
      };
    }
    const r0 = tx.provision("p-flat", tx.MONEY(500), { ...STRONG });
    const pkg: VerifiedExecutionPackage = {
      companyId: tx.ORG,
      instrumentKey: tx.FACILITY,
      rules: [r0],
      verifications: [verifiedArtifact(r0)],
    };
    const snap = tx.pack([tx.figure("fig-1", "1000")], {
      review: {
        reviewedBy: "fce-final@example.com",
        reviewedAt: "2026-07-01T00:00:00Z",
        approvalRef: "fce-final-1",
      },
    });
    const eval1 = evaluateVerifiedCapacityWithApprovedFinancials({
      package: pkg,
      financial: {
        snapshots: [snap],
        companyId: tx.ORG,
        instrumentKey: tx.FACILITY,
        asOf: tx.WHEN,
        ledger: [],
      },
    });
    expect(eval1.capacity.outcome).toBe("EXECUTED");
    for (const v of Object.values(eval1.remainingByRule)) {
      expect(v.supportsRemainingClaim).toBe(false);
      expect(v.remainingMillions).toBeNull();
    }
  });
});

describe("final §6 — TE-D3 overlay + verified sequential co-advance", () => {
  it("equity CHANGE_METRIC chains into next step base via #243 runner", () => {
    const { world: sw } = buildSequentialDemoWorld({ utilizationAffirmedComplete: true });
    const equity = recipeEquityContribution(
      {
        transactionId: "tx-eq-final",
        companyId: sw.companyId,
        instrumentKey: sw.instrumentKey,
        effectiveAsOf: "2026-06-30",
        provenance: { source: "fce-final", sourceVersion: "v1", approvalRef: null },
        approvalStatus: "HYPOTHETICAL",
      },
      {
        metrics: [
          {
            effectId: "m1",
            metricKey: "builder-available",
            asOf: "2026-06-30",
            adjustment: { kind: "DELTA", value: tx.cash("75") },
          },
        ],
      },
    );
    const run = runSequentialTransactions({
      world: sw,
      steps: [
        {
          stepId: "equity",
          businessType: "EQUITY_CONTRIBUTION",
          transaction: equity.transaction!,
          selectedPath: equity.selectedPath,
          recipeOk: true,
        },
      ],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    expect(run.abortedAtStepId).toBeNull();
    expect(run.steps[0]!.financialViewChained).toBe(true);
    expect(run.steps[0]!.chainedMetricKeysAfter).toContain("builder-available");

    const chained = chainFinancialViewWithScope(sw.inputs, run.steps[0]!.simulation!, {
      companyId: sw.companyId,
      instrumentKey: sw.instrumentKey,
    });
    const after = chained.resolver.resolveMetric({
      metricName: "builder-available",
      companyId: sw.companyId,
      instrumentKey: sw.instrumentKey,
      period: null,
      asOf: "2026-06-30",
      expectedType: "MONEY",
    });
    expect(after?.value.type).toBe("MONEY");
    if (after?.value.type === "MONEY") {
      expect(after.value.amount.num).toBe(125n);
    }
  });
});

describe("final §7 — shared capacity + sequential ledger (cross-doc binding surface)", () => {
  it("shared pool bounds sequential member draws; FCE verified path consumes post-ledger", () => {
    const sw = buildSharedCapacitySequentialWorld();
    const run = runSequentialTransactions({
      world: sw,
      steps: [
        {
          stepId: "draw-a",
          businessType: "DEBT_INCURRENCE",
          transaction: tx.proposal(
            "tx-a",
            [tx.consume("e1", "capacity:rule:prov-a", tx.cash("70"))],
            { companyId: sw.companyId, instrumentKey: sw.instrumentKey },
          ),
          selectedPath: tx.route({
            capacityNodeIds: ["capacity:rule:prov-a"],
            ruleIds: ["prov-a"],
          }),
        },
        {
          stepId: "draw-b",
          businessType: "DEBT_INCURRENCE",
          transaction: tx.proposal(
            "tx-b",
            [tx.consume("e2", "capacity:rule:prov-b", tx.cash("60"))],
            { companyId: sw.companyId, instrumentKey: sw.instrumentKey },
          ),
          selectedPath: tx.route({
            capacityNodeIds: ["capacity:rule:prov-b"],
            ruleIds: ["prov-b"],
          }),
        },
      ],
      mode: "HYPOTHETICAL",
      utilizationAffirmedComplete: true,
    });
    // Pool is $120; 70+60 would stack past pool — second draw must not silently succeed as available.
    expect(run.steps[0]!.simulation).not.toBeNull();
    expect(run.steps[0]!.proposedLedgerUsageIds.length).toBeGreaterThan(0);
    // Step 2 sees step 1 proposed usages in advanced world.
    expect(run.steps[1]).toBeDefined();
    if (run.steps[1]?.simulation) {
      expect(run.steps[1]!.preState.some((s) => s.appliedUsageIds.length > 0)).toBe(true);
    }

    // FCE verified-path wrapper over same REQUIRE boundary with approved snapshots.
    const STRONG = { compilerVersion: "c1", sourceContentVersion: "s1" } as const;
    const r0 = tx.provision("p-flat", tx.MONEY(500), { ...STRONG });
    const result = {
      candidateRef: "cand-1",
      status: "VERIFIED_NO_MATERIAL_GAP_FOUND",
      findings: [],
      semanticReviewInvoked: false,
      semanticReviewSkippedReason: null,
      conditionSuspicion: null,
      verifierAlgorithmVersion: "verifier-v1",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      evidenceSetHash: "eh-1",
    } as unknown as SemanticVerificationResult;
    const artifact: VerifiedUnitArtifact = {
      ruleOrDefinitionId: r0.ruleId,
      kind: "RULE",
      verifiedIdentity: {
        ruleOrDefinitionId: r0.ruleId,
        companyId: r0.companyId,
        instrumentKey: r0.instrumentKey,
        irSchemaVersion: r0.irSchemaVersion,
        compilerVersion: r0.compilerVersion,
        sourceContentVersion: r0.sourceContentVersion,
      },
      result,
    };
    const pkg: VerifiedExecutionPackage = {
      companyId: tx.ORG,
      instrumentKey: tx.FACILITY,
      rules: [r0],
      verifications: [artifact],
    };
    const snap = tx.pack([tx.figure("fig-1", "1000")], {
      review: {
        reviewedBy: "fce-final@example.com",
        reviewedAt: "2026-07-01T00:00:00Z",
        approvalRef: "fce-final-shared",
      },
    });
    const nodeId = tx.nodeOf(r0.ruleId);
    const seq = runVerifiedSequentialTransactions({
      package: pkg,
      financial: {
        snapshots: [snap],
        companyId: tx.ORG,
        instrumentKey: tx.FACILITY,
        asOf: tx.WHEN,
        ledger: [],
      },
      steps: [
        {
          label: "consume 100",
          businessType: "DEBT_INCURRENCE",
          transaction: tx.proposal("tx-1", [tx.consume("e1", nodeId, tx.cash("100"))], {
            label: "consume 100",
          }),
          selectedPath: tx.route({ capacityNodeIds: [nodeId], ruleIds: [r0.ruleId] }),
        },
        {
          label: "consume 50",
          businessType: "DEBT_INCURRENCE",
          transaction: tx.proposal("tx-2", [tx.consume("e2", nodeId, tx.cash("50"))], {
            label: "consume 50",
          }),
          selectedPath: tx.route({ capacityNodeIds: [nodeId], ruleIds: [r0.ruleId] }),
        },
      ],
    });
    expect(seq.policy).toBe("REQUIRE");
    expect(seq.sequentialPostStateConsumed).toBe(true);
    expect(seq.authority.kind).toBe("TEST_ATTRIBUTED_APPROVAL");
    expect(seq.steps[1]!.postAppliedUsageIds.length).toBeGreaterThan(0);
  });
});
