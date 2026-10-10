/**
 * P0 shared-capacity double-counting remediation — adversarial matrix + oracle.
 *
 * Proves independent lien coverage cannot manufacture capacity by summing
 * per-permission mins against the same SharedConstraint headroom.
 *
 * Independent oracle below does NOT import the production reservation map;
 * it re-derives expected usable pool from the constraint graph and compares
 * substantive election outcomes (status / maxCapacity / requirement classes).
 */
import { describe, expect, it } from "vitest";
import { buildPermissionGraph } from "../../lib/solver/graph";
import { buildPermissionPaths, evaluateElection } from "../../lib/solver/election";
import type {
  ActivationState,
  Permission,
  PermissionCollateralScope,
  SharedConstraint,
  Transaction,
} from "../../lib/solver/types";

const emptyActivationState: ActivationState = {
  asOfDate: new Date("2026-06-30T12:00:00.000Z"),
  series: {},
  events: [],
  usageCounts: {},
  unknownKeys: new Set(),
};

const FIN = {
  ebitda: 500,
  cash: 50,
  interestExpense: 25,
  cumulativeNetIncome: 100,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 5,
  totalDebt: 800,
  securedDebt: 400,
};

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

function sharedConstraint(
  id: string,
  memberPermissionIds: string[],
  opts: {
    amount: number;
    currentUsage?: number;
    currentUsageAuthoritative?: boolean;
    currentUsageStatus?: SharedConstraint["currentUsageStatus"];
  },
): SharedConstraint {
  return {
    id,
    companyId: "co-1",
    name: id,
    cap: { amount: opts.amount },
    aggregationRule: "NAMED_MEMBER_CLAUSES",
    members: memberPermissionIds.map((permissionId) => ({ permissionId })),
    measurementBasis: "CURRENTLY_OUTSTANDING",
    followsRefinancing: false,
    currentUsage: opts.currentUsage ?? 0,
    currentUsageAuthoritative: opts.currentUsageAuthoritative ?? true,
    currentUsageStatus: opts.currentUsageStatus ?? "COMPUTED",
    sourceProvision: { documentId: "doc-1", sectionRef: `§${id}` },
  };
}

const baseTransaction: Transaction = {
  transactionType: "DEBT_INCURRENCE",
  amount: 100,
  currency: { code: "USD" },
  incurringEntity: { id: "borrower", name: "Borrower" },
  guarantorStatus: "GUARANTOR",
  secured: true,
  collateralPools: [],
  requestedLienPriority: [],
  useOfProceeds: "GENERAL_CORPORATE",
  acquisitionRelated: false,
  transactionDate: new Date("2026-06-30"),
};

function runSecuredElection(args: {
  debt: Permission | Permission[];
  liens: Permission[];
  amount: number;
  sharedConstraints?: SharedConstraint[];
  collateralScopes?: PermissionCollateralScope[];
  entityClasses?: Permission["entityScope"];
  transactionOverrides?: Partial<Transaction>;
  memberOrder?: string[];
}) {
  const debts = Array.isArray(args.debt) ? args.debt : [args.debt];
  const all = [...debts, ...args.liens];
  const memberPermissionIds =
    args.memberOrder ?? all.map((p) => p.id).sort((a, b) => (a < b ? -1 : 1));
  const graph = buildPermissionGraph(all, []);
  const permissionsById = new Map(all.map((p) => [p.id, p]));
  const txn: Transaction = {
    ...baseTransaction,
    amount: args.amount,
    secured: true,
    ...args.transactionOverrides,
  };
  const evaluation = evaluateElection({
    election: { id: "e-shared-cap", memberPermissionIds, rationale: "adversarial" },
    permissionsById,
    graph,
    financials: FIN,
    requestedAmount: args.amount,
    eligibilityContext: {
      transaction: txn,
      entityClasses: args.entityClasses ?? ["BORROWER"],
      ruleActivationConditions: [],
      activationState: emptyActivationState,
      asOfDate: emptyActivationState.asOfDate,
    },
    sharedConstraints: args.sharedConstraints ?? [],
    collateralScopes: args.collateralScopes ?? [],
  });
  const path = buildPermissionPaths([evaluation])[0]!;
  return { evaluation, path };
}

/**
 * Independent oracle: greedy reservation over a synthetic constraint graph.
 * Deterministic by sorting lien ids. Never overstates shared-pool capacity.
 */
function oracleIndependentLienPool(args: {
  liens: { id: string; standalone: number; constraintIds: string[] }[];
  constraints: { id: string; remaining: number }[];
}): number {
  const remaining = new Map(args.constraints.map((c) => [c.id, c.remaining]));
  let pool = 0;
  const liens = [...args.liens].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const lien of liens) {
    let contrib = Math.max(0, lien.standalone);
    for (const cid of lien.constraintIds) {
      contrib = Math.min(contrib, Math.max(0, remaining.get(cid) ?? 0));
    }
    for (const cid of lien.constraintIds) {
      remaining.set(cid, Math.max(0, (remaining.get(cid) ?? 0) - contrib));
    }
    pool += contrib;
  }
  return pool;
}

describe("P0 shared-capacity double-counting remediation", () => {
  it("Case A: two $100m liens share one $100m constraint; $150m txn is not CLEAR", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", thresholdValue: 100 });
    const shared = sharedConstraint("S", ["lien-a", "lien-b"], { amount: 100 });

    // Defect fingerprint: naive sum would claim $200m lien coverage.
    const naiveDoubleCount = Math.min(100, 100) + Math.min(100, 100);
    expect(naiveDoubleCount).toBe(200);
    expect(naiveDoubleCount).toBeGreaterThan(150);

    const oracle = oracleIndependentLienPool({
      liens: [
        { id: "lien-a", standalone: 100, constraintIds: ["S"] },
        { id: "lien-b", standalone: 100, constraintIds: ["S"] },
      ],
      constraints: [{ id: "S", remaining: 100 }],
    });
    expect(oracle).toBe(100);
    expect(oracle).toBeLessThan(150);

    const { path, evaluation } = runSecuredElection({
      debt,
      liens: [lienA, lienB],
      amount: 150,
      sharedConstraints: [shared],
    });
    expect(path.status).not.toBe("CLEAR");
    expect(path.status).toBe("BLOCKED");
    expect(
      evaluation.requirements.some(
        (r) =>
          r.class === "LIEN_PERMISSION" &&
          r.status === "FAILED" &&
          /independent lien|coverage remaining|insufficient/i.test(r.detail),
      ),
    ).toBe(true);
    // maxCapacity must not exceed shared remaining (Invariant A / Case Q).
    expect(evaluation.maxCapacity ?? 0).toBeLessThanOrEqual(100 + 1e-6);
  });

  it("Case B: same shared $100m pool; $100m txn CLEAR when all other gates satisfied", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", thresholdValue: 100 });
    const shared = sharedConstraint("S", ["lien-a", "lien-b"], { amount: 100 });

    const { path, evaluation } = runSecuredElection({
      debt,
      liens: [lienA, lienB],
      amount: 100,
      sharedConstraints: [shared],
    });
    expect(path.status).toBe("CLEAR");
    expect(evaluation.requirements.every((r) => r.status === "SATISFIED")).toBe(true);
    expect(
      evaluation.requirements.some((r) => r.class === "LIEN_PERMISSION" && r.status === "SATISFIED"),
    ).toBe(true);
    expect(
      evaluation.requirements.some((r) => r.class === "DEBT_PERMISSION" && r.status === "SATISFIED"),
    ).toBe(true);
  });

  it("Case C: two genuinely independent $100m lien baskets; $150m may CLEAR (additive)", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", thresholdValue: 100 });
    // No shared constraint — Invariant B.
    const oracle = oracleIndependentLienPool({
      liens: [
        { id: "lien-a", standalone: 100, constraintIds: [] },
        { id: "lien-b", standalone: 100, constraintIds: [] },
      ],
      constraints: [],
    });
    expect(oracle).toBe(200);

    const { path, evaluation } = runSecuredElection({
      debt,
      liens: [lienA, lienB],
      amount: 150,
      sharedConstraints: [],
    });
    expect(path.status).toBe("CLEAR");
    expect(evaluation.maxCapacity ?? 0).toBeGreaterThanOrEqual(150);
  });

  it("Case D: three permissions share one constraint — no capacity multiplication", () => {
    const debt = permission("debt", { thresholdValue: 500 });
    const liens = ["lien-a", "lien-b", "lien-c"].map((id) =>
      permission(id, { grantType: "LIEN", thresholdValue: 100 }),
    );
    const shared = sharedConstraint("S", ["lien-a", "lien-b", "lien-c"], { amount: 100 });
    const oracle = oracleIndependentLienPool({
      liens: liens.map((l) => ({ id: l.id, standalone: 100, constraintIds: ["S"] })),
      constraints: [{ id: "S", remaining: 100 }],
    });
    expect(oracle).toBe(100);

    const { path, evaluation } = runSecuredElection({
      debt,
      liens,
      amount: 150,
      sharedConstraints: [shared],
    });
    expect(path.status).not.toBe("CLEAR");
    expect(evaluation.maxCapacity ?? 0).toBeLessThanOrEqual(100 + 1e-6);

    const { path: atCap } = runSecuredElection({
      debt,
      liens,
      amount: 100,
      sharedConstraints: [shared],
    });
    expect(atCap.status).toBe("CLEAR");
  });

  it("Case E: partially overlapping constraints — every binding constraint respected", () => {
    const debt = permission("debt", { thresholdValue: 500 });
    const lienA = permission("lien-a", { grantType: "LIEN", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", thresholdValue: 100 });
    const lienC = permission("lien-c", { grantType: "LIEN", thresholdValue: 100 });
    // A→S1, B→S2, C→S1∩S2. Each pool remaining $60.
    const s1 = sharedConstraint("S1", ["lien-a", "lien-c"], { amount: 60 });
    const s2 = sharedConstraint("S2", ["lien-b", "lien-c"], { amount: 60 });
    const oracle = oracleIndependentLienPool({
      liens: [
        { id: "lien-a", standalone: 100, constraintIds: ["S1"] },
        { id: "lien-b", standalone: 100, constraintIds: ["S2"] },
        { id: "lien-c", standalone: 100, constraintIds: ["S1", "S2"] },
      ],
      constraints: [
        { id: "S1", remaining: 60 },
        { id: "S2", remaining: 60 },
      ],
    });
    // Greedy by id: A takes 60 from S1, B takes 60 from S2, C gets 0 → 120.
    expect(oracle).toBe(120);

    const { path: over } = runSecuredElection({
      debt,
      liens: [lienA, lienB, lienC],
      amount: 150,
      sharedConstraints: [s1, s2],
    });
    expect(over.status).not.toBe("CLEAR");

    const { path: ok } = runSecuredElection({
      debt,
      liens: [lienA, lienB, lienC],
      amount: 120,
      sharedConstraints: [s1, s2],
    });
    expect(ok.status).toBe("CLEAR");
  });

  it("Case F: one permission binds multiple constraints — all constraints respected", () => {
    const debt = permission("debt", { thresholdValue: 500 });
    const lien = permission("lien-multi", { grantType: "LIEN", thresholdValue: 100 });
    const s1 = sharedConstraint("S1", ["lien-multi"], { amount: 80 });
    const s2 = sharedConstraint("S2", ["lien-multi"], { amount: 50 });
    const oracle = oracleIndependentLienPool({
      liens: [{ id: "lien-multi", standalone: 100, constraintIds: ["S1", "S2"] }],
      constraints: [
        { id: "S1", remaining: 80 },
        { id: "S2", remaining: 50 },
      ],
    });
    expect(oracle).toBe(50);

    const { path: over } = runSecuredElection({
      debt,
      liens: [lien],
      amount: 60,
      sharedConstraints: [s1, s2],
    });
    expect(over.status).not.toBe("CLEAR");

    const { path: ok } = runSecuredElection({
      debt,
      liens: [lien],
      amount: 50,
      sharedConstraints: [s1, s2],
    });
    expect(ok.status).toBe("CLEAR");
  });

  it("Case G: shared capacity already partially utilized — only verified remaining counted", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", thresholdValue: 100 });
    const shared = sharedConstraint("S", ["lien-a", "lien-b"], {
      amount: 100,
      currentUsage: 40,
    });
    expect(100 - 40).toBe(60);

    const { path: over } = runSecuredElection({
      debt,
      liens: [lienA, lienB],
      amount: 70,
      sharedConstraints: [shared],
    });
    expect(over.status).not.toBe("CLEAR");

    const { path: ok } = runSecuredElection({
      debt,
      liens: [lienA, lienB],
      amount: 60,
      sharedConstraints: [shared],
    });
    expect(ok.status).toBe("CLEAR");
  });

  it("Case H: shared capacity unquantified — fail closed", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lien = permission("lien", { grantType: "LIEN", thresholdValue: 100 });
    const shared = sharedConstraint("S-unquantified", ["lien"], { amount: 100 });
    // Non-finite cap amount is unquantified — must not be treated as available.
    shared.cap = { amount: Number.NaN };

    const { path, evaluation } = runSecuredElection({
      debt,
      liens: [lien],
      amount: 50,
      sharedConstraints: [shared],
    });
    expect(path.status).not.toBe("CLEAR");
    expect(
      evaluation.requirements.some(
        (r) =>
          r.class === "LIEN_PERMISSION" &&
          r.status === "UNKNOWN" &&
          /unquantified/i.test(r.detail),
      ),
    ).toBe(true);
  });

  it("Case I: missing shared-constraint identity — no favorable inference", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lien = permission("lien", { grantType: "LIEN", thresholdValue: 100 });
    const shared = sharedConstraint("S", ["lien"], { amount: 100 });
    shared.id = "   ";

    const { path, evaluation } = runSecuredElection({
      debt,
      liens: [lien],
      amount: 50,
      sharedConstraints: [shared],
    });
    expect(path.status).not.toBe("CLEAR");
    expect(
      evaluation.requirements.some(
        (r) =>
          r.class === "LIEN_PERMISSION" &&
          r.status === "UNKNOWN" &&
          /missing identity/i.test(r.detail),
      ),
    ).toBe(true);
  });

  it("Case J: different currencies without authorized conversion — fail closed", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lien = permission("lien", {
      grantType: "LIEN",
      thresholdValue: 100,
      params: { currency: "EUR" } as unknown as Permission["params"],
    });
    const { path, evaluation } = runSecuredElection({
      debt,
      liens: [lien],
      amount: 50,
      sharedConstraints: [],
    });
    expect(path.status).not.toBe("CLEAR");
    expect(
      evaluation.requirements.some(
        (r) =>
          r.class === "LIEN_PERMISSION" &&
          r.status === "UNKNOWN" &&
          /currency mismatch/i.test(r.detail),
      ),
    ).toBe(true);
  });

  it("Case K: insufficient debt capacity despite sufficient lien capacity — not CLEAR", () => {
    const debt = permission("debt", { thresholdValue: 40 });
    const lien = permission("lien", { grantType: "LIEN", thresholdValue: 200 });
    const { path, evaluation } = runSecuredElection({
      debt,
      liens: [lien],
      amount: 100,
      sharedConstraints: [],
    });
    expect(path.status).not.toBe("CLEAR");
    expect(
      evaluation.requirements.some(
        (r) => r.class === "DEBT_PERMISSION" && r.status === "FAILED",
      ),
    ).toBe(true);
  });

  it("Case L: sufficient debt capacity but insufficient lien capacity — not CLEAR", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lien = permission("lien", { grantType: "LIEN", thresholdValue: 40 });
    const { path, evaluation } = runSecuredElection({
      debt,
      liens: [lien],
      amount: 100,
      sharedConstraints: [],
    });
    expect(path.status).not.toBe("CLEAR");
    expect(
      evaluation.requirements.some(
        (r) => r.class === "LIEN_PERMISSION" && r.status === "FAILED",
      ),
    ).toBe(true);
  });

  it("Case M: incompatible collateral / priority — not CLEAR", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lien = permission("lien", { grantType: "LIEN", thresholdValue: 200 });
    const { path, evaluation } = runSecuredElection({
      debt,
      liens: [lien],
      amount: 50,
      sharedConstraints: [],
      collateralScopes: [
        { permissionId: "lien", collateralPoolId: "pool-a", priorityTier: "SECOND" },
      ],
      transactionOverrides: {
        collateralPools: [{ id: "pool-a", name: "Pool A" }],
        requestedLienPriority: [{ poolId: "pool-a", priorityTier: "FIRST" }],
      },
    });
    expect(path.status).not.toBe("CLEAR");
    expect(
      evaluation.requirements.some(
        (r) =>
          (r.class === "LIEN_PERMISSION" || r.class === "PRIORITY_CONDITION") &&
          r.status === "FAILED",
      ),
    ).toBe(true);
  });

  it("Case N: failed legal condition — not CLEAR", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lien = permission("lien", {
      grantType: "LIEN",
      thresholdValue: 200,
      eligibilityConditions: [
        {
          id: "unsecured-only",
          description: "Lien basket limited to unsecured debt only",
          kind: "TRANSACTION_SECURITY_SCOPE",
          allowedSecurity: "UNSECURED_ONLY",
        },
      ],
    });
    const { path, evaluation } = runSecuredElection({
      debt,
      liens: [lien],
      amount: 50,
      sharedConstraints: [],
    });
    expect(path.status).not.toBe("CLEAR");
    expect(evaluation.requirements.some((r) => r.status === "FAILED")).toBe(true);
  });

  it("Case O: identical inputs replay identically (deterministic)", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", thresholdValue: 100 });
    const shared = sharedConstraint("S", ["lien-a", "lien-b"], { amount: 100 });
    const runs = Array.from({ length: 5 }, () =>
      runSecuredElection({
        debt,
        liens: [lienA, lienB],
        amount: 150,
        sharedConstraints: [shared],
      }),
    );
    const sig = (r: ReturnType<typeof runSecuredElection>) =>
      JSON.stringify({
        status: r.path.status,
        max: r.evaluation.maxCapacity,
        reqs: r.evaluation.requirements.map((x) => ({
          c: x.class,
          s: x.status,
          d: x.detail,
          p: x.scope.permissionId,
        })),
      });
    for (let i = 1; i < runs.length; i++) {
      expect(sig(runs[i]!)).toBe(sig(runs[0]!));
    }
  });

  it("Case P: member input order does not produce a favorable order-dependent result", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", thresholdValue: 100 });
    const shared = sharedConstraint("S", ["lien-a", "lien-b"], { amount: 100 });

    const forward = runSecuredElection({
      debt,
      liens: [lienA, lienB],
      amount: 150,
      sharedConstraints: [shared],
      memberOrder: ["debt", "lien-a", "lien-b"],
    });
    const reverse = runSecuredElection({
      debt,
      liens: [lienB, lienA],
      amount: 150,
      sharedConstraints: [shared],
      memberOrder: ["lien-b", "lien-a", "debt"],
    });
    expect(forward.path.status).not.toBe("CLEAR");
    expect(reverse.path.status).not.toBe("CLEAR");
    expect(forward.path.status).toBe(reverse.path.status);
    expect(forward.evaluation.maxCapacity).toBe(reverse.evaluation.maxCapacity);
  });

  it("Case Q: maxCapacity with overlapping liens is not inflated", () => {
    const debt = permission("debt", { thresholdValue: 500 });
    const lienA = permission("lien-a", { grantType: "LIEN", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", thresholdValue: 100 });
    const shared = sharedConstraint("S", ["lien-a", "lien-b"], { amount: 100 });

    const { evaluation } = runSecuredElection({
      debt,
      liens: [lienA, lienB],
      amount: 0,
      sharedConstraints: [shared],
    });
    // Amount-independent secured max must not claim $200 from a $100 shared pool.
    expect(evaluation.maxCapacity ?? 0).toBeLessThanOrEqual(100 + 1e-6);
    expect(evaluation.maxCapacity ?? 0).toBeGreaterThan(0);
  });

  it("Case R: existing valid secured transaction does not false-regress", () => {
    const debt = permission("debt", { thresholdValue: 80 });
    const lien = permission("lien", { grantType: "LIEN", thresholdValue: 80 });
    const { path, evaluation } = runSecuredElection({
      debt,
      liens: [lien],
      amount: 50,
      sharedConstraints: [],
    });
    expect(path.status).toBe("CLEAR");
    expect(evaluation.requirements.every((r) => r.status === "SATISFIED")).toBe(true);
  });

  it("property: shared-pool consumption never exceeds verified remaining across random topologies", () => {
    // Systematically generated (seeded), not a flaky fuzzer.
    const seedStream = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
      };
    };

    for (let trial = 0; trial < 40; trial++) {
      const rnd = seedStream(0xc0ffee ^ trial);
      const poolRemaining = Math.floor(rnd() * 90) + 10; // 10..99
      const nLiens = Math.floor(rnd() * 4) + 2; // 2..5
      const liens: Permission[] = [];
      for (let i = 0; i < nLiens; i++) {
        const standalone = Math.floor(rnd() * 100) + 1;
        liens.push(
          permission(`lien-${trial}-${i}`, {
            grantType: "LIEN",
            thresholdValue: standalone,
          }),
        );
      }
      const debtCap = Math.floor(rnd() * 200) + 50;
      const debt = permission(`debt-${trial}`, { thresholdValue: debtCap });
      const shared = sharedConstraint(
        `S-${trial}`,
        liens.map((l) => l.id),
        { amount: poolRemaining, currentUsage: 0 },
      );
      const amount = Math.floor(rnd() * 200) + 1;
      const { path, evaluation } = runSecuredElection({
        debt,
        liens,
        amount,
        sharedConstraints: [shared],
      });

      const oracle = oracleIndependentLienPool({
        liens: liens.map((l) => ({
          id: l.id,
          standalone: l.thresholdValue,
          constraintIds: [`S-${trial}`],
        })),
        constraints: [{ id: `S-${trial}`, remaining: poolRemaining }],
      });
      expect(oracle).toBeLessThanOrEqual(poolRemaining + 1e-9);

      if (amount > oracle + 1e-9 && amount <= debtCap + 1e-9) {
        // Debt can absorb the request; lien shared pool cannot — must not CLEAR.
        expect(path.status).not.toBe("CLEAR");
      }
      if (evaluation.maxCapacity != null) {
        expect(evaluation.maxCapacity).toBeLessThanOrEqual(Math.min(debtCap, poolRemaining) + 1e-6);
      }
    }
  });

  it("independent oracle: overlapping capacity graphs match production substantive bounds", () => {
    // Distinct constraint IDs with overlap — not merely identical shared IDs.
    type GraphCase = {
      name: string;
      liens: { id: string; standalone: number; constraintIds: string[] }[];
      constraints: { id: string; remaining: number }[];
      amount: number;
      expectClear: boolean;
    };
    const graphs: GraphCase[] = [
      {
        name: "identical-share",
        liens: [
          { id: "a", standalone: 100, constraintIds: ["P"] },
          { id: "b", standalone: 100, constraintIds: ["P"] },
        ],
        constraints: [{ id: "P", remaining: 100 }],
        amount: 150,
        expectClear: false,
      },
      {
        name: "disjoint",
        liens: [
          { id: "a", standalone: 100, constraintIds: ["P1"] },
          { id: "b", standalone: 100, constraintIds: ["P2"] },
        ],
        constraints: [
          { id: "P1", remaining: 100 },
          { id: "P2", remaining: 100 },
        ],
        amount: 150,
        expectClear: true,
      },
      {
        name: "chain-overlap",
        liens: [
          { id: "a", standalone: 70, constraintIds: ["P1", "P2"] },
          { id: "b", standalone: 70, constraintIds: ["P2", "P3"] },
          { id: "c", standalone: 70, constraintIds: ["P3"] },
        ],
        constraints: [
          { id: "P1", remaining: 50 },
          { id: "P2", remaining: 60 },
          { id: "P3", remaining: 40 },
        ],
        amount: 200,
        expectClear: false,
      },
    ];

    for (const g of graphs) {
      const oracle = oracleIndependentLienPool({
        liens: g.liens,
        constraints: g.constraints,
      });
      // Oracle must never exceed any single binding pool's remaining for
      // contributions that touch that pool (Invariant A per constraint).
      for (const c of g.constraints) {
        const rem = new Map(g.constraints.map((x) => [x.id, x.remaining]));
        let attributedToC = 0;
        for (const lien of [...g.liens].sort((a, b) => (a.id < b.id ? -1 : 1))) {
          let contrib = Math.max(0, lien.standalone);
          for (const cid of lien.constraintIds) {
            contrib = Math.min(contrib, Math.max(0, rem.get(cid) ?? 0));
          }
          for (const cid of lien.constraintIds) {
            rem.set(cid, Math.max(0, (rem.get(cid) ?? 0) - contrib));
          }
          if (lien.constraintIds.includes(c.id)) attributedToC += contrib;
        }
        expect(attributedToC).toBeLessThanOrEqual(c.remaining + 1e-9);
      }

      const debt = permission("debt", { thresholdValue: 1000 });
      const lienPerms = g.liens.map((l) =>
        permission(l.id, { grantType: "LIEN", thresholdValue: l.standalone }),
      );
      const sharedConstraints = g.constraints.map((c) =>
        sharedConstraint(
          c.id,
          g.liens.filter((l) => l.constraintIds.includes(c.id)).map((l) => l.id),
          { amount: c.remaining },
        ),
      );
      const { path, evaluation } = runSecuredElection({
        debt,
        liens: lienPerms,
        amount: g.amount,
        sharedConstraints,
      });
      if (g.expectClear) {
        expect(path.status, g.name).toBe("CLEAR");
      } else {
        expect(path.status, g.name).not.toBe("CLEAR");
      }
      expect(evaluation.maxCapacity ?? 0, g.name).toBeLessThanOrEqual(oracle + 1e-6);
    }
  });

  it("Invariant D: debt allocation does not consume lien-only shared pool merely by transaction amount", () => {
    // Debt is NOT a member of the lien shared constraint. $80 debt allocation
    // must not reduce the $100 lien pool to $20 before coverage is measured.
    const debt = permission("debt", { thresholdValue: 200 });
    const lien = permission("lien", { grantType: "LIEN", thresholdValue: 100 });
    const shared = sharedConstraint("lien-only-pool", ["lien"], { amount: 100 });
    const { path } = runSecuredElection({
      debt,
      liens: [lien],
      amount: 80,
      sharedConstraints: [shared],
    });
    expect(path.status).toBe("CLEAR");
  });
});
