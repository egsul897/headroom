/**
 * Agent 2 financial-engine integration gate — independent verification.
 */

import { describe, expect, it } from "vitest";
import {
  runFinancialCertificateEngine,
  deriveContractualMetrics,
  buildFinancialStateFromEngineRun,
  runSequentialFinancialEffects,
  netDebtIncreasingBorrowActions,
  cashOutflowActions,
  debtRepaymentActions,
  equityContributionCashActions,
  applyEquityProceedsBump,
  expectedCashDebtDeltas,
  FIXTURE_AUTHORITY,
  MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP,
  MATTHEWS_FIXTURE_AUTHORITY,
  COHERENT_FIXTURE_AUTHORITY,
  SYNTHETIC_FIXTURE_AUTHORITY,
  classifyApprovedSnapshotAuthority,
  publishRemainingCapacity,
  evaluateVerifiedCapacityWithApprovedFinancials,
  runVerifiedSequentialTransactions,
  VERIFIED_EXECUTION_POLICY,
} from "@/lib/financial-certificate-engine";
import {
  MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
  MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
  COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
  COHERENT_FINANCIAL_STATEMENT_FY2026,
} from "@/lib/financial-certificate-engine/fixtures";
import { runScenario } from "@/lib/financial-core/scenario";
import type { VerifiedExecutionPackage, VerifiedUnitArtifact } from "@/lib/contract-model/verified-execution";
import type { IRRule } from "@/lib/contract-model/ir/types";
import type { SemanticVerificationResult } from "@/lib/contract-model/compiler/semantic-verification/types";
import * as tx from "../contract-model/runtime/transaction/helpers";

describe("gate §1 — suite identity", () => {
  it("keeps authentic fixture authority registry on the integration candidate", () => {
    expect(FIXTURE_AUTHORITY.matthews_q1_fy2025.kind).toBe("AUTHENTIC_SOURCE_DERIVED");
    expect(MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.consolidatedEbitdaMillions).toBe(128.313);
    expect(MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.accession).toBe("0000063296-25-000006");
  });
});

describe("gate §2 — Matthews authentic contractual EBITDA + addbacks", () => {
  const run = runFinancialCertificateEngine({
    companyId: "matw-gate",
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

  it("matches provenance accession build-up for Consolidated EBITDA and addbacks", () => {
    expect(MATTHEWS_FIXTURE_AUTHORITY.realReviewerApproval).toBe(false);
    expect(MATTHEWS_FIXTURE_AUTHORITY.kind).toBe("AUTHENTIC_SOURCE_DERIVED");

    const contractual = run.capacityMetrics.find((m) => m.metricName === "covenant_ebitda");
    expect(contractual?.value).toBeCloseTo(MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.consolidatedEbitdaMillions, 3);

    const gaap = run.statement?.metrics.find((m) => m.family === "GAAP_EBITDA");
    expect(gaap?.canonicalValue).toBeCloseTo(MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.gaapEbitdaMillions, 3);
    expect(run.contractualEbitdaDistinctFromGaap).toBe(true);

    const addbacks = run.certificate!.adjustments.filter((a) => a.kind === "ADDBACK" && !a.amountMissing);
    const byLabel = Object.fromEntries(addbacks.map((a) => [a.label.toLowerCase(), a.amountMillions!]));
    expect(byLabel["depreciation and amortization"]).toBeCloseTo(93.751, 3);
    expect(byLabel["goodwill write-downs (non-cash)"]).toBeCloseTo(16.727, 3);
    expect(byLabel["asset write-downs (non-cash)"]).toBeCloseTo(16.847, 3);
    expect(byLabel["stock-based compensation (non-cash)"]).toBeCloseTo(18.806, 3);

    const sumAddbacks =
      MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.addbacksMillions.depreciationAndAmortization +
      MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.addbacksMillions.goodwillWriteDowns +
      MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.addbacksMillions.assetWriteDowns +
      MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP.addbacksMillions.stockBasedCompensation;
    expect(sumAddbacks).toBeCloseTo(146.131, 3);

    expect(run.certificate!.definitions.some((d) => /Consolidated EBITDA/i.test(d.term))).toBe(true);
    expect(run.reconciliation.findings.some((f) => f.code === "PRO_FORMA_ACQUISITION")).toBe(true);

    // Missing pro forma synergy $ — documented, never inferred.
    const synergyAdj = run.certificate!.adjustments.find(
      (a) => a.kind === "PRO_FORMA" && /synerg/i.test(a.label),
    );
    expect(synergyAdj).toBeDefined();
    expect(synergyAdj!.amountMissing).toBe(true);
    expect(synergyAdj!.amountMillions == null).toBe(true);
    // Contractual EBITDA must equal sourced build-up, not build-up + invented synergy.
    expect(contractual?.value).toBeCloseTo(128.313, 3);
  });
});

describe("gate §3 — authority classification", () => {
  it("distinguishes authentic, seed-aligned, synthetic, and test-attributed APPROVED", () => {
    expect(MATTHEWS_FIXTURE_AUTHORITY.kind).toBe("AUTHENTIC_SOURCE_DERIVED");
    expect(COHERENT_FIXTURE_AUTHORITY.kind).toBe("SEED_ALIGNED_MODELED");
    expect(SYNTHETIC_FIXTURE_AUTHORITY.kind).toBe("SYNTHETIC_CALCULATION_TEST");

    const testApproval = classifyApprovedSnapshotAuthority({
      reviewedBy: "fce-reviewer@example.com",
      approvalRef: "fce-approval-bridge-1",
    });
    expect(testApproval.kind).toBe("TEST_ATTRIBUTED_APPROVAL");
    expect(testApproval.realReviewerApproval).toBe(false);

    // Caller-supplied productionContext alone never confers REAL approval.
    const contextOnly = classifyApprovedSnapshotAuthority({
      reviewedBy: "jane.counsel@acme.com",
      approvalRef: "board-minutes-2026-06",
      productionContext: true,
    });
    expect(contextOnly.kind).toBe("TEST_ATTRIBUTED_APPROVAL");

    // Test email + asserted production channel still cannot be REAL.
    const testEmailWithChannel = classifyApprovedSnapshotAuthority({
      reviewedBy: "fce-reviewer@example.com",
      approvalRef: "fce-approval-bridge-1",
      productionContext: true,
      trustedProductionApprovalChannel: true,
    });
    expect(testEmailWithChannel.kind).toBe("TEST_ATTRIBUTED_APPROVAL");

    const real = classifyApprovedSnapshotAuthority({
      reviewedBy: "jane.counsel@acme.com",
      approvalRef: "board-minutes-2026-06",
      productionContext: true,
      trustedProductionApprovalChannel: true,
    });
    expect(real.kind).toBe("REAL_REVIEWER_APPROVED");
  });
});

describe("gate §4 — independent cash/debt effects", () => {
  const asOf = new Date("2026-06-30T12:00:00Z");

  function baseState() {
    const run = runFinancialCertificateEngine({
      companyId: "gate-cash",
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
      stateId: "gate-cash",
      companyId: "gate-cash",
    });
    if (built.status !== "OK") throw new Error(built.reason);
    return built.state;
  }

  it("verifies borrowing, dividend, repayment, and equity contribution deltas independently", () => {
    const state = baseState();
    const cash0 = state.balanceSheetFacts.cash.value;
    const debt0 = state.balanceSheetFacts.totalDebtPrincipal.value;

    const issue = {
      kind: "DEBT_ISSUANCE" as const,
      amount: 100,
      useOfProceeds: "general",
      facilityDraft: {
        name: "TL-gate",
        facilityType: "TERM_LOAN" as const,
        secured: true,
        couponType: "FIXED" as const,
        couponPct: 7,
      },
    };
    expect(expectedCashDebtDeltas(issue)).toEqual({
      cashDelta: 100,
      debtDelta: 100,
      note: "Issuance credits cash and increases principal.",
    });
    const afterIssue = runScenario(
      { id: "i", companyId: state.companyId, baseFinancialStateId: state.id, actions: [issue] },
      state,
      [],
      [],
      asOf,
    );
    expect(afterIssue.proFormaState.balanceSheetFacts.cash.value).toBeCloseTo(cash0 + 100, 6);
    expect(afterIssue.proFormaState.balanceSheetFacts.totalDebtPrincipal.value).toBeCloseTo(debt0 + 100, 6);
    const facilityId = afterIssue.proFormaFacilities[0]!.id;

    const div = { kind: "DIVIDEND" as const, amount: 40 };
    expect(expectedCashDebtDeltas(div).cashDelta).toBe(-40);
    const afterDiv = runScenario(
      { id: "d", companyId: state.companyId, baseFinancialStateId: state.id, actions: [div] },
      afterIssue.proFormaState,
      afterIssue.proFormaFacilities,
      afterIssue.proFormaEvents,
      asOf,
    );
    expect(afterDiv.proFormaState.balanceSheetFacts.cash.value).toBeCloseTo(cash0 + 100 - 40, 6);
    expect(afterDiv.proFormaState.balanceSheetFacts.totalDebtPrincipal.value).toBeCloseTo(debt0 + 100, 6);

    const repay = debtRepaymentActions({ facilityId, amountMillions: 25 })[0]!;
    expect(expectedCashDebtDeltas(repay)).toMatchObject({ cashDelta: -25, debtDelta: -25 });
    const afterRepay = runScenario(
      { id: "r", companyId: state.companyId, baseFinancialStateId: state.id, actions: [repay] },
      afterDiv.proFormaState,
      afterDiv.proFormaFacilities,
      afterDiv.proFormaEvents,
      asOf,
    );
    expect(afterRepay.proFormaState.balanceSheetFacts.cash.value).toBeCloseTo(cash0 + 100 - 40 - 25, 6);
    expect(afterRepay.proFormaState.balanceSheetFacts.totalDebtPrincipal.value).toBeCloseTo(debt0 + 100 - 25, 6);

    const eqCash = equityContributionCashActions({ amountMillions: 50 })[0]!;
    expect(expectedCashDebtDeltas(eqCash)).toMatchObject({ cashDelta: 50, debtDelta: 0 });
    const afterEqCash = runScenario(
      { id: "e", companyId: state.companyId, baseFinancialStateId: state.id, actions: [eqCash] },
      afterRepay.proFormaState,
      afterRepay.proFormaFacilities,
      afterRepay.proFormaEvents,
      asOf,
    );
    const eqPrior = afterRepay.proFormaState.incomeStatementFacts.equityProceedsSinceIssue.value;
    const afterEq = applyEquityProceedsBump(afterEqCash.proFormaState, 50, asOf);
    expect(afterEq.balanceSheetFacts.cash.value).toBeCloseTo(cash0 + 100 - 40 - 25 + 50, 6);
    expect(afterEq.balanceSheetFacts.totalDebtPrincipal.value).toBeCloseTo(debt0 + 100 - 25, 6);
    expect(afterEq.incomeStatementFacts.equityProceedsSinceIssue.value).toBeCloseTo(eqPrior + 50, 6);
  });
});

describe("gate §5–§7 — verified-execution sequential post-state", () => {
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

  it("step two consumes step one’s ledger + re-evaluates capacity through verified boundary", () => {
    const r0 = tx.provision("p-flat", tx.MONEY(500), { ...STRONG });
    const pkg: VerifiedExecutionPackage = {
      companyId: tx.ORG,
      instrumentKey: tx.FACILITY,
      rules: [r0],
      verifications: [verifiedArtifact(r0)],
    };
    const snap = tx.pack([tx.figure("fig-1", "1000")], {
      review: {
        reviewedBy: "fce-gate@example.com",
        reviewedAt: "2026-07-01T00:00:00Z",
        approvalRef: "fce-gate-1",
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
    expect(eval1.policy).toBe(VERIFIED_EXECUTION_POLICY);
    expect(eval1.authority.kind).toBe("TEST_ATTRIBUTED_APPROVAL");
    expect(eval1.capacity.outcome).toBe("EXECUTED");
    for (const v of Object.values(eval1.remainingByRule)) {
      expect(v.supportsRemainingClaim).toBe(false);
      expect(v.remainingMillions).toBeNull();
    }

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
          label: "Txn1 consume 100",
          transaction: tx.proposal("tx-1", [tx.consume("e1", nodeId, tx.cash("100"))], {
            label: "consume 100",
          }),
          selectedPath: tx.route({ capacityNodeIds: [nodeId], ruleIds: [r0.ruleId] }),
        },
        {
          label: "Txn2 consume 50 on post-state",
          transaction: tx.proposal("tx-2", [tx.consume("e2", nodeId, tx.cash("50"))], {
            label: "consume 50",
          }),
          selectedPath: tx.route({ capacityNodeIds: [nodeId], ruleIds: [r0.ruleId] }),
        },
      ],
    });

    expect(seq.steps).toHaveLength(2);
    expect(seq.policy).toBe(VERIFIED_EXECUTION_POLICY);
    expect(seq.steps[0]!.simulation.outcome).toBe("EXECUTED");
    expect(seq.steps[1]!.simulation.outcome).toBe("EXECUTED");
    expect(seq.sequentialPostStateConsumed).toBe(true);
    expect(seq.sequentialRun.abortedAtStepId).toBeNull();
    expect(seq.steps[1]!.postLedger.length).toBeGreaterThanOrEqual(seq.steps[0]!.postLedger.length);
    expect(seq.steps[1]!.ledgerConsumedFromPrior).toBe(true);
    expect(seq.steps[1]!.capacityConstraintsReevaluated).toBe(true);
    expect(seq.steps[1]!.postAppliedUsageIds.length).toBeGreaterThan(0);
    // Independent post-check matched simulation post-state (#243).
    expect(seq.steps[0]!.runnerStep.independentPostMatchesSimulation).toBe(true);
    expect(seq.steps[1]!.runnerStep.independentPostMatchesSimulation).toBe(true);
  });
});

describe("gate §6 — remaining requires #237 utilization completeness", () => {
  it("refuses remaining from approved financials / attributed rows without completeness cert", () => {
    const grossOnly = publishRemainingCapacity({
      capacityRuleId: "general_debt",
      asOf: "2026-06-30",
      grossCapacityMillions: 680,
      records: [
        {
          usageId: "u1",
          capacityRuleId: "general_debt",
          amountMillions: 25,
          effectiveAsOf: "2026-01-01",
          status: "ACTIVE",
        },
      ],
      completenessCertificate: null,
    });
    expect(grossOnly.status).toBe("GROSS_ONLY");
    expect(grossOnly.supportsRemainingClaim).toBe(false);
    expect(grossOnly.remainingCapacityMillions).toBeNull();
    expect(grossOnly.verified.publicationLabel).toBe("GROSS_CONTRACTUAL");

    const supported = publishRemainingCapacity({
      capacityRuleId: "general_debt",
      asOf: "2026-06-30",
      grossCapacityMillions: 680,
      records: [
        {
          usageId: "u1",
          capacityRuleId: "general_debt",
          amountMillions: 25,
          effectiveAsOf: "2026-01-01",
          status: "ACTIVE",
        },
      ],
      completenessCertificate: {
        capacityRuleId: "general_debt",
        asOf: "2026-06-30",
        kind: "VERIFIED_COMPLETE",
        approvalState: "APPROVED",
        sourceLabel: "counsel utilization schedule",
      },
    });
    expect(supported.status).toBe("REMAINING_SUPPORTED");
    expect(supported.remainingCapacityMillions).toBe(655);
    expect(supported.verified.mayPublishAvailable).toBe(true);

    // Mixed currency attributed rows → remaining refused (#237).
    const mixedFx = publishRemainingCapacity({
      capacityRuleId: "general_debt",
      asOf: "2026-06-30",
      grossCapacityMillions: 680,
      currency: "USD",
      records: [
        {
          usageId: "u-usd",
          capacityRuleId: "general_debt",
          amountMillions: 10,
          effectiveAsOf: "2026-01-01",
          status: "ACTIVE",
          currency: "USD",
        },
        {
          usageId: "u-eur",
          capacityRuleId: "general_debt",
          amountMillions: 10,
          effectiveAsOf: "2026-01-01",
          status: "ACTIVE",
          currency: "EUR",
        },
      ],
      completenessCertificate: {
        capacityRuleId: "general_debt",
        asOf: "2026-06-30",
        kind: "VERIFIED_COMPLETE",
        approvalState: "APPROVED",
        sourceLabel: "mixed fx schedule",
      },
    });
    expect(mixedFx.supportsRemainingClaim).toBe(false);
    expect(mixedFx.remainingCapacityMillions).toBeNull();
  });
});

describe("gate §5 financial-core chain still holds", () => {
  it("txn2 ratios use txn1 pro forma debt/cash (not stale base)", () => {
    const run = runFinancialCertificateEngine({
      companyId: "gate-seq",
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
      stateId: "gate-seq",
      companyId: "gate-seq",
    });
    expect(built.status).toBe("OK");
    if (built.status !== "OK") return;
    const seq = runSequentialFinancialEffects({
      baseState: built.state,
      baseAuthoritative: true,
      asOfDate: new Date("2026-06-30T12:00:00Z"),
      steps: [
        {
          label: "borrow",
          actions: netDebtIncreasingBorrowActions({ amountMillions: 150, secured: true }),
        },
        { label: "dividend", actions: cashOutflowActions({ amountMillions: 30 }) },
      ],
    });
    expect(seq.steps[1]!.proFormaState.balanceSheetFacts.totalDebtPrincipal.value).toBeCloseTo(
      3258 + 150,
      4,
    );
    expect(seq.reusedStaleMetrics).toBe(false);
    const derived = deriveContractualMetrics({
      statement: run.statement,
      certificate: run.certificate,
    });
    expect(derived.find((d) => d.key === "contractual_ebitda")?.value).toBe(1700);
  });
});
