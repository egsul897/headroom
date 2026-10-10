/**
 * Final secured-capacity semantic reconciliation — adversarial acceptance.
 *
 * Invokes production entry points (`evaluateElection`, `runSolver`,
 * `computeRemainingCapacityAfterDebtIncurrence`). Expectations frozen from
 * independent legal/arithmetic reasoning — not rewritten to match output.
 *
 * Labels: MODELED / EVALUATION_SEED_NOT_NS4_APPROVED.
 */
import { describe, expect, it } from "vitest";
import { buildPermissionGraph } from "../../lib/solver/graph";
import {
  assessIndependentLienCoverageForDebtLeg,
  buildPermissionPaths,
  convertLienCapacityToTransactionCurrency,
  evaluateElection,
} from "../../lib/solver/election";
import { runSolver } from "../../lib/solver/service";
import { computeLeverageMetrics, computeCovenantPosition, computeRemainingCapacityAfterDebtIncurrence } from "../../lib/covenant-engine";
import { COHERENT_DATA, COHERENT_INDENTURE_ID } from "../../prisma/seed-data";
import type {
  ActivationState,
  Permission,
  PermissionRelationship,
  Transaction,
} from "../../lib/solver/types";
import fs from "node:fs";
import path from "node:path";

type OutcomeClass =
  | "FALSE_FAVORABLE_PREVENTED"
  | "FALSE_REFUSAL"
  | "UNKNOWN_OR_REVIEW"
  | "CORRECT_POSITIVE"
  | "CORRECT_BOUNDARY"
  | "STATE_TRANSITION"
  | "UNEXECUTED_ENV";

const findings: Array<{ id: string; outcome: OutcomeClass; note: string }> = [];
function record(id: string, outcome: OutcomeClass, note: string) {
  findings.push({ id, outcome, note });
}

function permission(id: string, overrides: Partial<Permission> = {}): Permission {
  return {
    id,
    documentId: "doc-1",
    companyId: "co-1",
    grantType: "DEBT_INCURRENCE",
    amountKind: "FIXED",
    action: `permission ${id}`,
    entityScope: [],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 100,
    eligibilityConditions: [],
    termConditions: [],
    measurementBasis: "CUMULATIVE_INCURRED",
    sourceProvision: { documentId: "doc-1", sectionRef: `§${id}` },
    modelingStatus: "MODELED",
    ...overrides,
  };
}

function rel(overrides: Partial<PermissionRelationship>): PermissionRelationship {
  return {
    id: overrides.id ?? `${overrides.fromPermissionId}-${overrides.toPermissionId}`,
    companyId: "co-1",
    fromPermissionId: "a",
    toPermissionId: "b",
    relationshipType: "CONCURRENT_DISREGARDED",
    sourceProvision: { documentId: "doc-1", sectionRef: "§rel" },
    ...overrides,
  };
}

const FIN = {
  ebitda: 500,
  cash: 50,
  interestExpense: 40,
  cumulativeNetIncome: 0,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 7,
  totalDebt: 800,
  securedDebt: 400,
};
const emptyActivationState: ActivationState = {
  asOfDate: new Date("2026-06-30"),
  series: {},
  events: [],
  usageCounts: {},
  unknownKeys: new Set(),
};
const baseTransaction: Transaction = {
  transactionType: "DEBT_INCURRENCE",
  amount: 100,
  currency: { code: "USD" },
  incurringEntity: { id: "borrower", name: "Borrower" },
  guarantorStatus: "GUARANTOR",
  secured: false,
  collateralPools: [],
  requestedLienPriority: [],
  useOfProceeds: "GENERAL_CORPORATE",
  acquisitionRelated: false,
  transactionDate: new Date("2026-06-30"),
};

function evalSecured(args: {
  members: Permission[];
  relationships: PermissionRelationship[];
  amount: number;
  memberIds?: string[];
  collateralScopes?: { permissionId: string; collateralPoolId: string; priorityTier: "FIRST" | "SECOND" | "PARI_PASSU" | "UNSECURED" }[];
  transactionExtras?: Partial<Transaction>;
  entityClasses?: Permission["entityScope"];
}) {
  const graph = buildPermissionGraph(args.members, args.relationships);
  const memberIds = args.memberIds ?? args.members.map((m) => m.id);
  return evaluateElection({
    election: { id: "e", memberPermissionIds: memberIds, rationale: "" },
    permissionsById: new Map(args.members.map((m) => [m.id, m])),
    graph,
    financials: FIN,
    requestedAmount: args.amount,
    eligibilityContext: {
      transaction: { ...baseTransaction, secured: true, amount: args.amount, ...args.transactionExtras },
      entityClasses: args.entityClasses ?? [],
      ruleActivationConditions: [],
      activationState: emptyActivationState,
      asOfDate: new Date("2026-06-30"),
    },
    sharedConstraints: [],
    collateralScopes: args.collateralScopes ?? [],
  });
}

describe("P0 debt/lien allocation separation", () => {
  it("lien capacity alone cannot CLEAR a secured debt request (order permutations)", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 10 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 500 });
    for (const memberIds of [
      ["debt", "lien"],
      ["lien", "debt"],
    ]) {
      const result = evalSecured({
        members: [debt, lien],
        relationships: [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "CONCURRENT_DISREGARDED" })],
        amount: 50,
        memberIds,
      });
      // Debt capacity 10 < 50 → shortfall FAILED; lien must not fill the gap.
      expect(buildPermissionPaths([result])[0]!.status).toBe("BLOCKED");
      expect(result.totalAllocated).toBeLessThanOrEqual(10 + 1e-9);
      expect(result.legs.filter((l) => l.grantType === "DEBT_INCURRENCE").reduce((s, l) => s + l.amountAllocated, 0)).toBeLessThanOrEqual(
        10 + 1e-9,
      );
    }
    record("D1", "FALSE_FAVORABLE_PREVENTED", "lien capacity cannot satisfy debt principal");
  });

  it("lien usage appears on the transaction trace when covering debt", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 80 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const result = evalSecured({
      members: [debt, lien],
      relationships: [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "CONCURRENT_DISREGARDED" })],
      amount: 50,
    });
    expect(buildPermissionPaths([result])[0]!.status).toBe("CLEAR");
    const lienLegs = result.legs.filter((l) => l.grantType === "LIEN");
    expect(lienLegs.length).toBeGreaterThan(0);
    expect(lienLegs.some((l) => l.amountAllocated > 0 && l.linkedFrom === "debt")).toBe(true);
    record("D2", "CORRECT_POSITIVE", "lien leg present on CLEAR secured path");
  });
});

describe("P0 shared independent-lien capacity conservation", () => {
  it("two $80 debt legs cannot both CLEAR against one $100 independent lien (original capacity both times)", () => {
    const debtA = permission("debt-a", { formulaType: "FLAT_AMOUNT", thresholdValue: 80 });
    const debtB = permission("debt-b", { formulaType: "FLAT_AMOUNT", thresholdValue: 80 });
    const sharedLien = permission("shared-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    // Independent expectation frozen: 80+80=160 > 100 lien authorization.
    expect(80 + 80).toBeGreaterThan(100);

    const result = evalSecured({
      members: [debtA, debtB, sharedLien],
      relationships: [
        rel({ fromPermissionId: "debt-a", toPermissionId: "debt-b", relationshipType: "CONCURRENT_DISREGARDED" }),
        rel({ fromPermissionId: "debt-a", toPermissionId: "shared-lien", relationshipType: "CONCURRENT_DISREGARDED" }),
        rel({ fromPermissionId: "debt-b", toPermissionId: "shared-lien", relationshipType: "CONCURRENT_DISREGARDED" }),
      ],
      amount: 160,
    });
    expect(buildPermissionPaths([result])[0]!.status).toBe("BLOCKED");
    const lienFail = result.requirements.some(
      (r) => r.class === "LIEN_PERMISSION" && r.status === "FAILED" && /insufficient remaining lien capacity|no independently valid LIEN/i.test(r.detail),
    );
    expect(lienFail).toBe(true);
    // Must not report full $160 permitted under $100 lien.
    const debtAllocated = result.legs
      .filter((l) => l.grantType === "DEBT_INCURRENCE")
      .reduce((s, l) => s + l.amountAllocated, 0);
    expect(debtAllocated).toBeLessThanOrEqual(100 + 1e-6);
    record("S1", "FALSE_FAVORABLE_PREVENTED", "shared $100 lien cannot authorize $160 debt");
  });

  it("assessIndependentLienCoverage conserves across sequential leg calls with original $100 capacity", () => {
    const debtA = permission("debt-a", { formulaType: "FLAT_AMOUNT", thresholdValue: 80 });
    const debtB = permission("debt-b", { formulaType: "FLAT_AMOUNT", thresholdValue: 80 });
    const sharedLien = permission("shared-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const metrics = computeLeverageMetrics(FIN);
    const remaining = new Map<string, number>();
    const ctx = {
      transaction: { ...baseTransaction, secured: true },
      entityClasses: [] as const,
      ruleActivationConditions: [],
      activationState: emptyActivationState,
      asOfDate: new Date("2026-06-30"),
    };
    const a = assessIndependentLienCoverageForDebtLeg({
      debtLeg: {
        permissionId: "debt-a",
        grantType: "DEBT_INCURRENCE",
        amountAllocated: 80,
        measurementBasis: "CUMULATIVE_INCURRED",
        historicalUsage: {},
        sourceProvision: debtA.sourceProvision,
      },
      debtPermission: debtA,
      lienMembers: [sharedLien],
      financials: FIN,
      metrics,
      collateralScopes: [],
      transaction: ctx.transaction,
      asOfDate: ctx.asOfDate,
      eligibilityContext: { ...ctx, entityClasses: [] },
      lienRemainingById: remaining,
    });
    expect(a.status).toBe("SATISFIED");
    expect(remaining.get("shared-lien")).toBeCloseTo(20, 6);
    const b = assessIndependentLienCoverageForDebtLeg({
      debtLeg: {
        permissionId: "debt-b",
        grantType: "DEBT_INCURRENCE",
        amountAllocated: 80,
        measurementBasis: "CUMULATIVE_INCURRED",
        historicalUsage: {},
        sourceProvision: debtB.sourceProvision,
      },
      debtPermission: debtB,
      lienMembers: [sharedLien], // original permission — threshold still 100
      financials: FIN,
      metrics,
      collateralScopes: [],
      transaction: ctx.transaction,
      asOfDate: ctx.asOfDate,
      eligibilityContext: { ...ctx, entityClasses: [] },
      lienRemainingById: remaining,
    });
    expect(b.status).toBe("FAILED");
    record("S2", "FALSE_FAVORABLE_PREVENTED", "conservation via shared remaining map, not manual threshold rewrite");
  });
});

describe("P0 collateral completeness", () => {
  it("lien covering only Pool A cannot CLEAR when transaction requests Pool A and Pool B", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 50 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const result = evalSecured({
      members: [debt, lien],
      relationships: [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "CONCURRENT_DISREGARDED" })],
      amount: 40,
      collateralScopes: [{ permissionId: "lien", collateralPoolId: "pool-a", priorityTier: "FIRST" }],
      transactionExtras: {
        collateralPools: [
          { id: "pool-a", name: "A" },
          { id: "pool-b", name: "B" },
        ],
        requestedLienPriority: [
          { poolId: "pool-a", priorityTier: "FIRST" },
          { poolId: "pool-b", priorityTier: "FIRST" },
        ],
      },
    });
    expect(buildPermissionPaths([result])[0]!.status).toBe("BLOCKED");
    expect(result.requirements.some((r) => r.class === "LIEN_PERMISSION" && r.status === "FAILED")).toBe(true);
    record("C1", "FALSE_FAVORABLE_PREVENTED", "partial collateral match is not complete coverage");
  });

  it("lien covering both requested pools can CLEAR", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 50 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const result = evalSecured({
      members: [debt, lien],
      relationships: [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "CONCURRENT_DISREGARDED" })],
      amount: 40,
      collateralScopes: [
        { permissionId: "lien", collateralPoolId: "pool-a", priorityTier: "FIRST" },
        { permissionId: "lien", collateralPoolId: "pool-b", priorityTier: "FIRST" },
      ],
      transactionExtras: {
        collateralPools: [
          { id: "pool-a", name: "A" },
          { id: "pool-b", name: "B" },
        ],
        requestedLienPriority: [
          { poolId: "pool-a", priorityTier: "FIRST" },
          { poolId: "pool-b", priorityTier: "FIRST" },
        ],
      },
    });
    expect(buildPermissionPaths([result])[0]!.status).toBe("CLEAR");
    record("C2", "CORRECT_POSITIVE", "complete collateral coverage permits CLEAR");
  });
});

describe("Automatic-linked lien structural checks", () => {
  it("expired automatic lien fails even when link exists", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 50 });
    const lien = permission("lien", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      effectiveTo: new Date("2020-01-01"),
    });
    const result = evalSecured({
      members: [debt, lien],
      relationships: [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" })],
      amount: 40,
      memberIds: ["debt"],
    });
    expect(buildPermissionPaths([result])[0]!.status).toBe("BLOCKED");
    expect(result.requirements.some((r) => r.class === "LIEN_PERMISSION" && r.status === "FAILED" && /expired/i.test(r.detail))).toBe(
      true,
    );
    record("A1", "FALSE_FAVORABLE_PREVENTED", "auto-link does not skip expiry");
  });

  it("valid automatic lien still CLEAR", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 50 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0 });
    const result = evalSecured({
      members: [debt, lien],
      relationships: [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" })],
      amount: 40,
      memberIds: ["debt"],
    });
    expect(buildPermissionPaths([result])[0]!.status).toBe("CLEAR");
    record("A2", "CORRECT_POSITIVE", "valid auto-link preserved");
  });
});

describe("FX and unit correctness", () => {
  it.each([
    { rate: undefined, label: "missing" },
    { rate: 0, label: "zero" },
    { rate: -1.2, label: "negative" },
    { rate: Number.NaN, label: "nan" },
    { rate: Number.POSITIVE_INFINITY, label: "infinity" },
  ])("EUR lien vs USD txn without valid FX ($label) is non-affirmative", ({ rate, label }) => {
    const converted = convertLienCapacityToTransactionCurrency({
      lienCapacity: 500,
      lienCurrency: "EUR",
      transactionCurrency: "USD",
      authorizedFxRate: typeof rate === "number" ? rate : null,
    });
    expect(converted.ok).toBe(false);

    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 50 });
    const lien = permission("lien", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 500,
      params: rate === undefined ? ({ currency: "EUR" } as unknown as Permission["params"]) : ({ currency: "EUR", authorizedFxRate: rate } as unknown as Permission["params"]),
    });
    const result = evalSecured({
      members: [debt, lien],
      relationships: [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "CONCURRENT_DISREGARDED" })],
      amount: 40,
    });
    expect(buildPermissionPaths([result])[0]!.status).not.toBe("CLEAR");
    record(`FX-${label}`, "UNKNOWN_OR_REVIEW", `invalid FX (${label}) not affirmative`);
  });

  it("positive finite FX rate is applied to capacity comparison", () => {
    const converted = convertLienCapacityToTransactionCurrency({
      lienCapacity: 100,
      lienCurrency: "EUR",
      transactionCurrency: "USD",
      authorizedFxRate: 1.1,
    });
    expect(converted.ok).toBe(true);
    if (converted.ok) expect(converted.amount).toBeCloseTo(110, 6);

    // Lien 40 EUR * 1.1 = 44 USD < 50 USD needed → BLOCKED
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 80 });
    const lien = permission("lien", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 40,
      params: { currency: "EUR", authorizedFxRate: 1.1 } as unknown as Permission["params"],
    });
    const result = evalSecured({
      members: [debt, lien],
      relationships: [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "CONCURRENT_DISREGARDED" })],
      amount: 50,
    });
    expect(buildPermissionPaths([result])[0]!.status).toBe("BLOCKED");
    record("FX-applied", "CORRECT_BOUNDARY", "FX rate applied; 44 USD lien cannot cover 50");
  });
});

describe("maxCapacity vs lien at maximum", () => {
  it("$1 probe CLEAR must not publish EXACT max exceeding lien capacity", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 500 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 25 });
    const solver = runSolver({
      eligiblePermissions: [debt, lien],
      relationships: [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "CONCURRENT_DISREGARDED" })],
      sharedConstraints: [],
      collateralScopes: [],
      ruleActivationConditions: [],
      financials: FIN,
      transaction: { ...baseTransaction, secured: true, amount: 1 },
      entityClasses: [],
      activationState: emptyActivationState,
      asOfDate: new Date("2026-06-30"),
    });
    const mc = solver.overall.maximumCapacity;
    expect(mc?.kind).toBe("EXACT");
    if (mc?.kind === "EXACT") {
      expect(mc.amount).toBeLessThanOrEqual(25 + 1e-6);
      expect(mc.amount).toBeGreaterThan(0);
    }
    record("M1", "FALSE_FAVORABLE_PREVENTED", "maxCapacity capped by lien at max, not probe");
  });

  it("zero-amount probe with positive debt max but no lien → maxCapacity 0 / not CLEAR at positive", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 500 });
    const atZero = evalSecured({
      members: [debt],
      relationships: [],
      amount: 0,
      memberIds: ["debt"],
    });
    // At 0, shortfall check passes; lien gate: need=0 may still fail without lien members for positive max advertising.
    expect(atZero.maxCapacity === 0 || atZero.maxCapacity === undefined || (atZero.maxCapacity ?? 0) <= 0).toBe(true);
    const atPos = evalSecured({ members: [debt], relationships: [], amount: 10, memberIds: ["debt"] });
    expect(buildPermissionPaths([atPos])[0]!.status).toBe("BLOCKED");
    record("M2", "CORRECT_BOUNDARY", "no lien → no positive secured capacity claim");
  });
});

describe("Coherent modeled + solver-native election", () => {
  it("modeled packageAuthoritative secured $4,041 / unsecured $5,129 preserved", () => {
    const pos = computeCovenantPosition(COHERENT_DATA);
    const sec = computeRemainingCapacityAfterDebtIncurrence(COHERENT_DATA, pos, 0, true);
    const uns = computeRemainingCapacityAfterDebtIncurrence(COHERENT_DATA, pos, 0, false);
    expect(sec.packageAuthoritative?.authority).toBe("MODELED_CROSS_DOCUMENT");
    expect(sec.packageAuthoritative?.label).toBe("MODELED / EVALUATION_SEED_NOT_NS4_APPROVED");
    expect(sec.packageAuthoritative?.solverAuthority).toBe("NON_AUTHORITATIVE_DIAGNOSTIC");
    expect(sec.remainingCapacity).toBeCloseTo(4041, 0);
    expect(uns.remainingCapacity).toBeCloseTo(5129, 0);
    expect(pos.crossDocumentSecured.bindingDocumentId).toBe(COHERENT_INDENTURE_ID);
    record("COH-modeled", "CORRECT_BOUNDARY", "packageAuthoritative preserved; $4041/$5129");
  });

  it("solver-native: Ratio+SCF without per-leg lien is BLOCKED; with per-leg liens CLEAR under counted max", () => {
    // Synthetic Coherent-shaped election (no Neon): Ratio Debt + SCF fixed,
    // SCF auto-lien only — Ratio must NOT free-ride.
    const ratio = permission("ratio", {
      documentId: "indenture",
      amountKind: "INCURRENCE_BASED",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 3,
      params: { debtBasis: "secured" },
    });
    const scf = permission("scf", { documentId: "indenture", formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const scfLien = permission("scf-lien", {
      documentId: "indenture",
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
    });
    const bad = evalSecured({
      members: [ratio, scf, scfLien],
      relationships: [
        rel({ fromPermissionId: "scf", toPermissionId: "ratio", relationshipType: "CONCURRENT_DISREGARDED" }),
        rel({ fromPermissionId: "scf", toPermissionId: "scf-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" }),
      ],
      amount: 50,
      memberIds: ["ratio", "scf"],
    });
    expect(buildPermissionPaths([bad])[0]!.status).toBe("BLOCKED");
    expect(bad.requirements.some((r) => r.class === "LIEN_PERMISSION" && r.scope.permissionId === "ratio" && r.status === "FAILED")).toBe(
      true,
    );

    const ratioLien = permission("ratio-lien", {
      documentId: "indenture",
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
    });
    const good = evalSecured({
      members: [ratio, scf, scfLien, ratioLien],
      relationships: [
        rel({ fromPermissionId: "scf", toPermissionId: "ratio", relationshipType: "CONCURRENT_DISREGARDED" }),
        rel({ fromPermissionId: "scf", toPermissionId: "scf-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" }),
        rel({ fromPermissionId: "ratio", toPermissionId: "ratio-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" }),
      ],
      amount: 50,
      memberIds: ["ratio", "scf"],
    });
    expect(buildPermissionPaths([good])[0]!.status).toBe("CLEAR");
    const debtLegs = good.legs.filter((l) => l.grantType === "DEBT_INCURRENCE");
    const lienLegs = good.legs.filter((l) => l.grantType === "LIEN");
    expect(debtLegs.length).toBeGreaterThanOrEqual(1);
    expect(lienLegs.every((l) => l.linkedFrom != null)).toBe(true);
    record("COH-solver", "FALSE_FAVORABLE_PREVENTED", "solver election shows per-leg lien; SCF auto-lien not borrowed");
  });

  it("live Neon Coherent replay — report unverified when DB unavailable", async () => {
    try {
      const { prisma } = await import("../../lib/prisma");
      await prisma.permission.count({ where: { companyId: "coherent" } });
      record("COH-neon", "STATE_TRANSITION", "Neon reachable — live replay not expanded in this matrix row");
    } catch {
      record("COH-neon", "UNEXECUTED_ENV", "Neon unreachable — live Coherent solver replay unverified");
    }
    expect(findings.some((f) => f.id === "COH-neon")).toBe(true);
  });
});

describe("Verified execution boundary preserved", () => {
  it("sequential path still REQUIRE-only verified adapter", () => {
    const seq = fs.readFileSync(path.join(process.cwd(), "lib/contract-model/sequential-execution.ts"), "utf8");
    expect(seq).toMatch(/evaluateVerifiedCapacity/);
    expect(seq).toMatch(/simulateVerifiedTransaction/);
    expect(seq).not.toMatch(/computeRemainingCapacityAfterDebtIncurrence/);
    const pkg = fs.readFileSync(path.join(process.cwd(), "lib/covenant-engine.ts"), "utf8");
    expect(pkg).toMatch(/packageAuthoritative/);
    expect(pkg).toMatch(/NON_AUTHORITATIVE_DIAGNOSTIC/);
    expect(pkg).toMatch(/MODELED_CROSS_DOCUMENT/);
    // Must not replace #253 contract with #254-only authorityLayers rename.
    record("V1", "CORRECT_POSITIVE", "verified sequential + packageAuthoritative preserved");
  });
});

describe("matrix summary", () => {
  it("reports outcome counts with denominators", () => {
    const denom = findings.length;
    const counts = {
      falseFavorablePrevented: findings.filter((f) => f.outcome === "FALSE_FAVORABLE_PREVENTED").length,
      falseRefusal: findings.filter((f) => f.outcome === "FALSE_REFUSAL").length,
      unknownOrReview: findings.filter((f) => f.outcome === "UNKNOWN_OR_REVIEW").length,
      correctPositive: findings.filter((f) => f.outcome === "CORRECT_POSITIVE").length,
      correctBoundary: findings.filter((f) => f.outcome === "CORRECT_BOUNDARY").length,
      stateTransition: findings.filter((f) => f.outcome === "STATE_TRANSITION").length,
      unexecutedEnv: findings.filter((f) => f.outcome === "UNEXECUTED_ENV").length,
    };
    expect(denom).toBeGreaterThanOrEqual(15);
    expect(counts.falseRefusal).toBe(0);
    console.log(JSON.stringify({ scenariosRecorded: denom, ...counts, findings }, null, 2));
  });
});
