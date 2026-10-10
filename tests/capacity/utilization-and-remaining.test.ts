/**
 * Agent 3 — utilization resolver + verified remaining + product consistency.
 * Independent expected answers; never invents zero from empty ledger.
 */
import { describe, expect, it } from "vitest";
import {
  assertProductCapacityConsistency,
  buildSharedProductCapacityViews,
  computeVerifiedRemaining,
  evidenceFromAttributedLedger,
  resolveUtilization,
} from "@/lib/capacity";
import { adaptLegacyCovenantProvision } from "@/lib/contract-model/ir/legacy-adapter";
import { buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { CovenantProvisionInput } from "@/lib/covenant-engine";
import type { FinancialInput } from "@/lib/contract-model/runtime/input/types";
import type { RuntimeValue } from "@/lib/contract-model/runtime/types";
import {
  FACILITY,
  ORG,
  WHEN,
  adjustFigure,
  amountOf,
  cash,
  figure,
  nodeOf,
  proposal,
  provision,
  route,
  simulate,
  world,
} from "@/tests/contract-model/runtime/transaction/helpers";
import type { IRExpression } from "@/lib/contract-model/ir/types";
import { MAX, METRIC, MONEY, MUL, NUM, SUB } from "@/tests/contract-model/runtime/capacity/helpers";

const AS_OF_D = "2026-06-30";

describe("utilization resolver — never invent zero", () => {
  it("empty evidence without certificate → UNKNOWN, supportsRemainingClaim false", () => {
    const r = resolveUtilization({
      capacityRuleId: "rule-flat",
      asOf: AS_OF_D,
      records: [],
    });
    expect(r.knowledge).toBe("UNKNOWN");
    expect(r.supportsRemainingClaim).toBe(false);
    expect(r.attributedAmount).toBeNull();
    expect(r.blockers.some((b) => /empty ledger/i.test(b))).toBe(true);
  });

  it("verified empty certificate → VERIFIED_ZERO", () => {
    const r = resolveUtilization({
      capacityRuleId: "rule-flat",
      asOf: AS_OF_D,
      records: [],
      allowSyntheticRemaining: true,
      completenessCertificate: {
        capacityRuleId: "rule-flat",
        asOf: AS_OF_D,
        approvalState: "APPROVED",
        sourceLabel: "approved-empty-path-cert",
        kind: "VERIFIED_EMPTY",
        authenticity: "SYNTHETIC_LABELED",
      },
    });
    expect(r.knowledge).toBe("VERIFIED_ZERO");
    expect(r.supportsRemainingClaim).toBe(true);
    expect(r.productionAuthoritative).toBe(false);
    expect(r.attributedAmount).toBe(0);
  });

  it("approved attributed records alone do NOT support remaining (completeness required)", () => {
    const r = resolveUtilization({
      capacityRuleId: "rule-flat",
      asOf: AS_OF_D,
      records: [
        evidenceFromAttributedLedger({
          usageId: "u1",
          amount: 25,
          currency: "USD",
          effectiveAsOf: "2026-01-15",
          capacityRuleId: "rule-flat",
          status: "ACTIVE",
          approvalState: "APPROVED",
          sourceLabel: "synthetic-demo-ledger",
          authenticity: "SYNTHETIC_LABELED",
        }),
      ],
    });
    expect(r.knowledge).toBe("KNOWN_ATTRIBUTED");
    expect(r.attributedAmount).toBe(25);
    expect(r.supportsRemainingClaim).toBe(false);
    expect(r.completenessCertified).toBe(false);
    expect(r.blockers.some((b) => /completeness/i.test(b))).toBe(true);
  });

  it("attributed usage + VERIFIED_COMPLETE certificate → remaining claim supported", () => {
    const r = resolveUtilization({
      capacityRuleId: "rule-flat",
      asOf: AS_OF_D,
      records: [
        evidenceFromAttributedLedger({
          usageId: "u1",
          amount: 25,
          currency: "USD",
          effectiveAsOf: "2026-01-15",
          capacityRuleId: "rule-flat",
          status: "ACTIVE",
          approvalState: "APPROVED",
          sourceLabel: "synthetic-demo-ledger",
          authenticity: "SYNTHETIC_LABELED",
        }),
      ],
      allowSyntheticRemaining: true,
      completenessCertificate: {
        capacityRuleId: "rule-flat",
        asOf: AS_OF_D,
        approvalState: "APPROVED",
        sourceLabel: "SYNTHETIC_LABELED completeness cert",
        kind: "VERIFIED_COMPLETE",
        authenticity: "SYNTHETIC_LABELED",
      },
    });
    expect(r.knowledge).toBe("KNOWN_ATTRIBUTED");
    expect(r.attributedAmount).toBe(25);
    expect(r.supportsRemainingClaim).toBe(true);
    expect(r.completenessCertified).toBe(true);
    expect(r.productionAuthoritative).toBe(false);
  });

  it("unattributed legacy basket → UNATTRIBUTED_LEGACY_BASKET", () => {
    const r = resolveUtilization({
      capacityRuleId: "perm-1",
      asOf: AS_OF_D,
      records: [],
      unattributedLegacyBasketPresent: true,
    });
    expect(r.knowledge).toBe("UNATTRIBUTED_LEGACY_BASKET");
    expect(r.supportsRemainingClaim).toBe(false);
  });

  it("superseded-only without certificate → SUPERSEDED_EXCLUDED", () => {
    const r = resolveUtilization({
      capacityRuleId: "rule-flat",
      asOf: AS_OF_D,
      records: [
        evidenceFromAttributedLedger({
          usageId: "u-old",
          amount: 10,
          currency: "USD",
          effectiveAsOf: "2025-01-01",
          capacityRuleId: "rule-flat",
          status: "SUPERSEDED",
          approvalState: "APPROVED",
          sourceLabel: "superseded-row",
          authenticity: "SYNTHETIC_LABELED",
          kind: "SUPERSEDED",
        }),
      ],
    });
    expect(r.knowledge).toBe("SUPERSEDED_EXCLUDED");
    expect(r.supportsRemainingClaim).toBe(false);
  });
});

describe("verified remaining — A8-01 unsafe favorable guard", () => {
  it("gross known + unknown util → GROSS_ONLY, never AVAILABLE", () => {
    const v = computeVerifiedRemaining({
      gross: {
        amount: 100,
        gateSatisfied: true,
        modeled: true,
        capacityRuleId: "r1",
      },
      utilization: { capacityRuleId: "r1", asOf: AS_OF_D, records: [] },
    });
    expect(v.remainingStatus).toBe("GROSS_ONLY");
    expect(v.publicationLabel).toBe("GROSS_CONTRACTUAL");
    expect(v.mayPublishAvailable).toBe(false);
    expect(v.supportedRemaining).toBeNull();
    expect(v.grossCapacity).toBe(100);
  });

  it("failed gate cannot publish AVAILABLE", () => {
    const v = computeVerifiedRemaining({
      gross: {
        amount: 0,
        gateSatisfied: false,
        modeled: true,
        capacityRuleId: "gate-1",
      },
      utilization: {
        capacityRuleId: "gate-1",
        asOf: AS_OF_D,
        records: [],
        verifiedEmptyCertificate: {
          capacityRuleId: "gate-1",
          asOf: AS_OF_D,
          approvalState: "APPROVED",
          sourceLabel: "cert",
        },
      },
    });
    expect(v.remainingStatus).toBe("GATE_FAILED");
    expect(v.publicationLabel).toBe("REVIEW_REQUIRED");
    expect(v.mayPublishAvailable).toBe(false);
  });

  it("gross − attributed = supported remaining only with completeness certificate (labeled synthetic)", () => {
    const gross = 100;
    const used = 35;
    const expectedRemaining = 65;
    const withoutCompleteness = computeVerifiedRemaining({
      gross: {
        amount: gross,
        gateSatisfied: true,
        modeled: true,
        capacityRuleId: "basket-a",
      },
      utilization: {
        capacityRuleId: "basket-a",
        asOf: AS_OF_D,
        records: [
          evidenceFromAttributedLedger({
            usageId: "syn-u1",
            amount: used,
            currency: "USD",
            effectiveAsOf: "2026-03-01",
            capacityRuleId: "basket-a",
            status: "ACTIVE",
            approvalState: "APPROVED",
            sourceLabel: "SYNTHETIC_LABELED fixture — not authentic Neon history",
            authenticity: "SYNTHETIC_LABELED",
          }),
        ],
      },
      sourceCitations: ["§6.01(a) synthetic demo"],
    });
    expect(withoutCompleteness.supportedRemaining).toBeNull();
    expect(withoutCompleteness.mayPublishAvailable).toBe(false);
    expect(withoutCompleteness.remainingStatus).toBe("GROSS_ONLY");

    const v = computeVerifiedRemaining({
      gross: {
        amount: gross,
        gateSatisfied: true,
        modeled: true,
        capacityRuleId: "basket-a",
      },
      utilization: {
        capacityRuleId: "basket-a",
        asOf: AS_OF_D,
        records: [
          evidenceFromAttributedLedger({
            usageId: "syn-u1",
            amount: used,
            currency: "USD",
            effectiveAsOf: "2026-03-01",
            capacityRuleId: "basket-a",
            status: "ACTIVE",
            approvalState: "APPROVED",
            sourceLabel: "SYNTHETIC_LABELED fixture — not authentic Neon history",
            authenticity: "SYNTHETIC_LABELED",
          }),
        ],
        allowSyntheticRemaining: true,
        completenessCertificate: {
          capacityRuleId: "basket-a",
          asOf: AS_OF_D,
          approvalState: "APPROVED",
          sourceLabel: "SYNTHETIC_LABELED VERIFIED_COMPLETE certificate",
          kind: "VERIFIED_COMPLETE",
          authenticity: "SYNTHETIC_LABELED",
        },
      },
      sourceCitations: ["§6.01(a) synthetic demo"],
      allowSyntheticRemaining: true,
    });
    expect(v.supportedRemaining).toBe(expectedRemaining);
    expect(v.knownUtilization).toBe(used);
    expect(v.grossCapacity).toBe(gross);
    expect(v.mayPublishAvailable).toBe(true);
    expect(v.publicationLabel).toBe("AVAILABLE");
    expect(v.utilization.recordsApplied[0]?.authenticity).toBe("SYNTHETIC_LABELED");
  });
});

describe("Position / Simulate / Ask consistency", () => {
  it("three surfaces share one verified result — no parallel engine", () => {
    const views = buildSharedProductCapacityViews({
      gross: {
        amount: 80,
        gateSatisfied: true,
        modeled: true,
        capacityRuleId: "shared-rule",
      },
      utilization: {
        capacityRuleId: "shared-rule",
        asOf: AS_OF_D,
        records: [
          evidenceFromAttributedLedger({
            usageId: "u",
            amount: 20,
            currency: "USD",
            effectiveAsOf: "2026-02-01",
            capacityRuleId: "shared-rule",
            status: "ACTIVE",
            approvalState: "APPROVED",
            sourceLabel: "synthetic",
            authenticity: "SYNTHETIC_LABELED",
          }),
        ],
        allowSyntheticRemaining: true,
        completenessCertificate: {
          capacityRuleId: "shared-rule",
          asOf: AS_OF_D,
          approvalState: "APPROVED",
          sourceLabel: "SYNTHETIC_LABELED VERIFIED_COMPLETE",
          kind: "VERIFIED_COMPLETE",
          authenticity: "SYNTHETIC_LABELED",
        },
      },
      governingConditions: ["Payment Conditions satisfied"],
      crossDocumentConstraints: ["Shared RP pool with Investments"],
      sourceCitations: ["§6.01", "§6.04"],
      allowSyntheticRemaining: true,
    });
    expect(views.POSITION.supportedRemainingCapacity).toBe(60);
    expect(views.SIMULATE.supportedRemainingCapacity).toBe(60);
    expect(views.ASK.supportedRemainingCapacity).toBe(60);
    expect(assertProductCapacityConsistency(views)).toEqual({ ok: true });
    expect(views.POSITION.grossCapacity).toBe(80);
    expect(views.POSITION.knownUtilization).toBe(20);
    expect(views.POSITION.unknownUtilization).toBe(false);
    expect(views.POSITION.governingConditions).toContain("Payment Conditions satisfied");
    expect(views.POSITION.crossDocumentConstraints.length).toBe(1);
    expect(views.POSITION.sourceCitations).toContain("§6.01");
  });
});

describe("Phase 4C adapter coverage — ratio/builder", () => {
  function money(amount: string): RuntimeValue {
    return {
      type: "MONEY",
      amount: rationalFromString(amount),
      currency: "USD",
      lineage: { exprId: null, inputKeys: [] },
    };
  }
  function factM(
    companyId: string,
    instrumentKey: string,
    key: string,
    amount: number,
    asOf: string,
  ): FinancialInput {
    return {
      identity: {
        companyId,
        scope: { kind: "INSTRUMENT_LEVEL", instrumentKey },
        inputKind: "METRIC",
        key,
        identityStrength: "CONTRACT_NAME_ONLY",
        period: { kind: "NOT_PERIOD_SPECIFIC" },
        asOf: { kind: "EXACT_DATE", isoDate: asOf },
        valueType: "MONEY",
        currency: "USD",
      },
      value: money(String(amount)),
      sourceVersion: "test",
    };
  }

  it("LEVERAGE_RATIO_ROOM Phase-4C matches independent max(0, 4.5×EBITDA − netDebt)", () => {
    const provision: CovenantProvisionInput = {
      id: "lev",
      documentId: "d",
      code: "lev-room",
      basketName: "Ratio debt",
      sectionRef: "6.01(q)",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 4.5,
      params: { debtBasis: "total" },
    };
    const companyId = "co-lev";
    const instrumentKey = "inst";
    const adapted = adaptLegacyCovenantProvision(provision, companyId, instrumentKey);
    expect(adapted.rule).not.toBeNull();
    expect(adapted.rule?.sufficiency).toBe("PARTIAL");
    const ruleComplete = {
      ...adapted.rule!,
      sufficiency: "COMPLETE" as const,
      sufficiencyReasons: [...adapted.rule!.sufficiencyReasons, "test-only lift"],
    };
    const ebitda = 200;
    const totalDebt = 500;
    const cashAmt = 50;
    const independent = Math.max(0, 4.5 * ebitda - (totalDebt - cashAmt));
    const asOf = AS_OF_D;
    const inputs = [
      factM(companyId, instrumentKey, "EBITDA", ebitda, asOf),
      factM(companyId, instrumentKey, "Total Debt", totalDebt, asOf),
      factM(companyId, instrumentKey, "Cash", cashAmt, asOf),
    ];
    const graph = buildCapacityGraph({ rules: [ruleComplete], companyId, instrumentKey, asOf });
    const inputsResolver = snapshotInputResolver({
      snapshots: [
        {
          snapshotId: "s1",
          version: "1",
          companyId,
          asOf,
          reportingPeriod: null,
          status: "APPROVED",
          supersedesSnapshotId: null,
          provenance: { source: "test", sourceVersion: "1" },
          review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
          inputs,
        },
      ],
      definitions: [],
      rules: [ruleComplete],
      companyId,
      instrumentKey,
    });
    const state = evaluateCapacityState({
      graph,
      rules: [ruleComplete],
      inputs: inputsResolver,
      ledger: [],
      asOf,
    });
    const entry = state.capacities[0]!;
    const amt =
      entry.remaining.kind === "AMOUNT" && entry.remaining.value.type === "MONEY"
        ? Number(entry.remaining.value.amount)
        : entry.provisional?.remaining.kind === "AMOUNT" &&
            entry.provisional.remaining.value.type === "MONEY"
          ? Number(entry.provisional.remaining.value.amount)
          : NaN;
    expect(amt).toBe(independent);
  });

  it("BUILDER_BASKET Phase-4C matches independent starter+CNI+equity", () => {
    const provisionIn: CovenantProvisionInput = {
      id: "b",
      documentId: "d",
      code: "aa",
      basketName: "Available Amount",
      sectionRef: "1.01",
      formulaType: "BUILDER_BASKET",
      thresholdValue: 50,
      params: { pctEbitda: 0.25, cniSharePct: 0.5, includeEquityProceeds: true },
    };
    const companyId = "co-b";
    const instrumentKey = "inst";
    const adapted = adaptLegacyCovenantProvision(provisionIn, companyId, instrumentKey);
    expect(adapted.rule?.capacityExpression?.kind).toBe("ADD");
    const ruleComplete = {
      ...adapted.rule!,
      sufficiency: "COMPLETE" as const,
      sufficiencyReasons: [...adapted.rule!.sufficiencyReasons, "test-only lift"],
    };
    const ebitda = 400;
    const cni = 80;
    const equity = 10;
    const independent = Math.max(50, 0.25 * ebitda) + 0.5 * Math.max(0, cni) + equity;
    const asOf = AS_OF_D;
    const inputs = [
      factM(companyId, instrumentKey, "EBITDA", ebitda, asOf),
      factM(companyId, instrumentKey, "Cumulative Net Income", cni, asOf),
      factM(companyId, instrumentKey, "Equity Proceeds Since Issue", equity, asOf),
    ];
    const graph = buildCapacityGraph({ rules: [ruleComplete], companyId, instrumentKey, asOf });
    const inputsResolver = snapshotInputResolver({
      snapshots: [
        {
          snapshotId: "s1",
          version: "1",
          companyId,
          asOf,
          reportingPeriod: null,
          status: "APPROVED",
          supersedesSnapshotId: null,
          provenance: { source: "test", sourceVersion: "1" },
          review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
          inputs,
        },
      ],
      definitions: [],
      rules: [ruleComplete],
      companyId,
      instrumentKey,
    });
    const state = evaluateCapacityState({
      graph,
      rules: [ruleComplete],
      inputs: inputsResolver,
      ledger: [],
      asOf,
    });
    const entry = state.capacities[0]!;
    const amt =
      entry.remaining.kind === "AMOUNT" && entry.remaining.value.type === "MONEY"
        ? Number(entry.remaining.value.amount)
        : entry.provisional?.remaining.kind === "AMOUNT" &&
            entry.provisional.remaining.value.type === "MONEY"
          ? Number(entry.provisional.remaining.value.amount)
          : NaN;
    expect(amt).toBe(independent);
  });
});

describe("financial chaining — leverage overlay", () => {
  it("debt DELTA reduces subsequent ratio-room capacity on the same approved snapshot", () => {
    // IR: MAX(0, 4.5×EBITDA − (Total Debt − Cash))
    // EBITDA=100, Debt=200, Cash=0 → room=250; +50 debt → 200
    const ebitda = 100;
    const totalDebt = 200;
    const cashAmt = 0;
    const multiple = 4.5;
    const beforeExpected = Math.max(0, multiple * ebitda - (totalDebt - cashAmt));
    const delta = 50;
    const afterExpected = Math.max(0, multiple * ebitda - (totalDebt + delta - cashAmt));

    const walk = (e: IRExpression): IRExpression => {
      if (e.kind === "METRIC_REFERENCE") {
        return { ...e, companyId: ORG, instrumentKey: FACILITY };
      }
      if (e.kind === "MAX" || e.kind === "MULTIPLY" || e.kind === "ADD" || e.kind === "MIN" || e.kind === "SUM") {
        return { ...e, operands: e.operands.map(walk) };
      }
      if (e.kind === "SUBTRACT") {
        return { ...e, left: walk(e.left), right: walk(e.right) };
      }
      return e;
    };
    const capacityExpr = walk(
      MAX(
        MONEY(0),
        SUB(
          MUL(NUM(multiple), METRIC("EBITDA")),
          SUB(METRIC("Total Debt"), METRIC("Cash")),
        ),
      ),
    );

    const r = provision("lev-chain", capacityExpr);
    const w = world({
      rules: [r],
      facts: [
        figure("EBITDA", String(ebitda)),
        figure("Total Debt", String(totalDebt)),
        figure("Cash", String(cashAmt)),
      ],
    });
    expect(amountOf(w.state.capacities[0]!.grossCapacity)).toBe(String(beforeExpected));

    const sim = simulate(
      w,
      proposal("tx-lev-chain", [adjustFigure("e0", "Total Debt", "DELTA", cash(String(delta)))]),
      route({ capacityNodeIds: [nodeOf("lev-chain")], ruleIds: ["lev-chain"] }),
    );
    expect(sim.postState).not.toBeNull();
    const afterGross = amountOf(sim.postState!.capacities[0]!.grossCapacity);
    expect(afterGross).toBe(String(afterExpected));
    expect(Number(afterGross)).toBe(beforeExpected - delta);

    // Base snapshot / pre-state unchanged
    expect(amountOf(w.state.capacities[0]!.grossCapacity)).toBe(String(beforeExpected));
    expect(WHEN).toBe(AS_OF_D);
  });
});
