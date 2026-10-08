/**
 * E2E false-permission closure for ordinary aggregate ceilings (ADV-FP-01 / ADV-FP-02).
 *
 * Labeling is covered by shared-capacity-false-permission.test.ts. This suite drives
 * scripted discovery → compile → certify → Phase-4 REQUIRE → capacity / simulation and
 * proves an ordinary aggregate monetary ceiling cannot become an executable shared pool.
 *
 * Zero paid provider calls. Issuer-agnostic synthetic text only.
 */
import { describe, expect, it } from "vitest";
import { certifyDiscoveredCovenantPackage } from "../../../lib/contract-model/covenant-map";
import { certifiedMapToVerifiedExecutionPackage } from "../../../lib/contract-model/phase3-certification/phase4-adapter";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  type VerifiedExecutionPackage,
} from "../../../lib/contract-model/verified-execution";
import { buildCapacityGraph, evaluateCapacityState } from "../../../lib/contract-model/runtime/capacity";
import { EMPTY_RESOLVER } from "../../../lib/contract-model/runtime/input-resolver";
import { sharedNodeId } from "../../../lib/contract-model/runtime/capacity/graph";
import * as tx from "../runtime/transaction/helpers";
import { AS_OF, CO, INST, MONEY, resetIds, rule, sharedCap, usage, onRule, amountString } from "../runtime/capacity/helpers";
import { beforeEach } from "vitest";
import {
  buildPackageFrom,
  deps,
  fakeClient,
  idsFor,
  money,
  DOCS,
  CA,
  GOLDEN_AGREEMENT,
  type ScriptedInventory,
} from "./golden-harness";

beforeEach(resetIds);

const FACTS = [tx.figure("fig-1", "1000")];
const inputsFor = (p: VerifiedExecutionPackage) => tx.resolverFor(FACTS, [...(p.definitions ?? [])], [...p.rules]);

/** ADV-FP style: single affirmative basket — ordinary aggregate ceiling, no shared-pool language. */
const SINGLE_BASKET = [
  "SECTION 7.04 Investments . The Borrower shall not make any Investment, except:",
  "",
  "(a) Investments in an aggregate amount not to exceed $25,000,000 at any time outstanding.",
  "",
].join("\n");

/** ADV-FP-01 style: ceiling text without an affirmative permission verb in the same sentence. */
const CEILING_ONLY = [
  "SECTION 7.04 Investments . Investments in an aggregate amount not to exceed $25,000,000 incurred by the Borrower.",
  "",
].join("\n");

/** Genuine multi-permission shared pool (cross-clause relationship language). */
const POOL_SENTENCE =
  "The aggregate amount of Investments made in reliance on clauses (a) and (b) together shall not exceed $10,000,000.";
const SHARED_TWO = [
  "SECTION 7.04 Investments . The Borrower shall not make any Investment, except:",
  "",
  "(a) Investments in joint ventures in an aggregate amount not to exceed $20,000,000 at any time outstanding; and",
  "",
  "(b) other Investments in an aggregate amount not to exceed $30,000,000 at any time outstanding.",
  "",
  POOL_SENTENCE,
  "",
].join("\n");

/** Cross-document style: shared language cites another section (relationship retained; pool quantified once). */
const CROSS_SECTION_POOL =
  "Restricted Payments in an aggregate amount, together with Investments made pursuant to Section 7.06, not to exceed $15,000,000.";
const CROSS_DOC = [
  "SECTION 7.05 Restricted Payments . The Borrower shall not make any Restricted Payment, except:",
  "",
  `(a) ${CROSS_SECTION_POOL}`,
  "",
].join("\n");

const docWith = (section: string) =>
  DOCS.map((d) => (d.documentId === CA ? { ...d, text: GOLDEN_AGREEMENT.replace("SECTION 7.02 Liens .", section + "SECTION 7.02 Liens .") } : d));

const invSingle: ScriptedInventory = {
  "7.04": [
    { excerpt: "The Borrower shall not make any Investment, except:", role: "PROHIBITION", materiality: "CRITICAL", proposition: "investment prohibition" },
    {
      excerpt: "(a) Investments in an aggregate amount not to exceed $25,000,000 at any time outstanding.",
      role: "PERMISSION",
      materiality: "CRITICAL",
      proposition: "single basket $25,000,000",
    },
  ],
};

const invCeilingOnly: ScriptedInventory = {
  "7.04": [
    {
      excerpt: "Investments in an aggregate amount not to exceed $25,000,000 incurred by the Borrower.",
      role: "PROHIBITION",
      materiality: "CRITICAL",
      proposition: "aggregate ceiling without affirmative permission",
    },
  ],
};

const invShared: ScriptedInventory = {
  "7.04": [
    { excerpt: "The Borrower shall not make any Investment, except:", role: "PROHIBITION", materiality: "CRITICAL", proposition: "investment prohibition" },
    {
      excerpt: "(a) Investments in joint ventures in an aggregate amount not to exceed $20,000,000 at any time outstanding;",
      role: "PERMISSION",
      materiality: "CRITICAL",
      proposition: "JV basket $20,000,000",
    },
    {
      excerpt: "(b) other Investments in an aggregate amount not to exceed $30,000,000 at any time outstanding",
      role: "PERMISSION",
      materiality: "CRITICAL",
      proposition: "general basket $30,000,000",
    },
    { excerpt: POOL_SENTENCE, role: "SHARED_CAP", materiality: "CRITICAL", proposition: "shared pool $10,000,000 across (a) and (b)" },
  ],
};

const invCross: ScriptedInventory = {
  "7.05": [
    { excerpt: "The Borrower shall not make any Restricted Payment, except:", role: "PROHIBITION", materiality: "CRITICAL", proposition: "RP prohibition" },
    {
      excerpt: CROSS_SECTION_POOL,
      role: "SHARED_CAP",
      materiality: "CRITICAL",
      proposition: "shared amount with Section 7.06",
    },
  ],
};

function submissionSingleBasket(user: string): unknown {
  const prohibition = idsFor(user, "shall not make any Investment");
  const a = idsFor(user, "$25,000,000");
  return {
    rules: [
      {
        localRef: "r0",
        sourceSectionRef: "7.04",
        covenantFamily: "INVESTMENTS",
        ruleType: "PROHIBITION",
        posture: "PROHIBITION",
        action: "MAKE_INVESTMENT",
        entityScope: ["BORROWER"],
        capacityExpression: null,
        conditions: [],
        exceptions: [
          {
            description: "clause (a)",
            permissionRef: "rA",
            citation: "7.04(a)",
            excerpt: "(a) Investments in an aggregate amount",
            inventoryItemIds: a,
          },
        ],
        dependsOn: [],
        sufficiency: "COMPLETE",
        citation: "7.04",
        excerpt: "The Borrower shall not make any Investment",
        inventoryItemIds: prohibition,
      },
      {
        localRef: "rA",
        sourceSectionRef: "7.04(a)",
        covenantFamily: "INVESTMENTS",
        ruleType: "QUANTITATIVE_PERMISSION",
        posture: "PERMISSION",
        action: "MAKE_INVESTMENT",
        entityScope: ["BORROWER"],
        capacityExpression: { ...money(25_000_000, a, "not to exceed $25,000,000 at any time outstanding"), citation: "7.04(a)" },
        conditions: [],
        exceptions: [],
        dependsOn: [],
        sufficiency: "COMPLETE",
        citation: "7.04(a)",
        excerpt: "(a) Investments in an aggregate amount not to exceed $25,000,000",
        inventoryItemIds: a,
      },
    ],
    definitions: [],
    sharedCapacities: [],
    irExtensionCandidates: [],
    overallNotes: [],
  };
}

function submissionCeilingOnly(user: string): unknown {
  const ids = idsFor(user, "$25,000,000");
  return {
    rules: [
      {
        localRef: "r0",
        sourceSectionRef: "7.04",
        covenantFamily: "INVESTMENTS",
        ruleType: "QUANTITATIVE_RESTRICTION",
        posture: "PROHIBITION",
        action: "MAKE_INVESTMENT",
        entityScope: ["BORROWER"],
        // Honest model: no free-standing capacity grant from a bare ceiling sentence.
        capacityExpression: null,
        conditions: [],
        exceptions: [],
        dependsOn: [],
        sufficiency: "COMPLETE",
        citation: "7.04",
        excerpt: "Investments in an aggregate amount not to exceed $25,000,000",
        inventoryItemIds: ids,
      },
    ],
    definitions: [],
    sharedCapacities: [],
    irExtensionCandidates: [],
    overallNotes: [],
  };
}

function submissionSharedHonest(user: string): unknown {
  const prohibition = idsFor(user, "shall not make any Investment");
  const a = idsFor(user, "$20,000,000");
  const b = idsFor(user, "$30,000,000");
  const pool = idsFor(user, "together shall not exceed $10,000,000");
  return {
    rules: [
      {
        localRef: "r0",
        sourceSectionRef: "7.04",
        covenantFamily: "INVESTMENTS",
        ruleType: "PROHIBITION",
        posture: "PROHIBITION",
        action: "MAKE_INVESTMENT",
        entityScope: ["BORROWER"],
        capacityExpression: null,
        conditions: [],
        exceptions: [
          { description: "clause (a)", permissionRef: "rA", citation: "7.04(a)", excerpt: "(a) Investments in joint ventures", inventoryItemIds: a },
          { description: "clause (b)", permissionRef: "rB", citation: "7.04(b)", excerpt: "(b) other Investments", inventoryItemIds: b },
        ],
        dependsOn: [],
        sufficiency: "COMPLETE",
        citation: "7.04",
        excerpt: "The Borrower shall not make any Investment",
        inventoryItemIds: prohibition,
      },
      {
        localRef: "rA",
        sourceSectionRef: "7.04(a)",
        covenantFamily: "INVESTMENTS",
        ruleType: "QUANTITATIVE_PERMISSION",
        posture: "PERMISSION",
        action: "MAKE_INVESTMENT",
        entityScope: ["BORROWER"],
        capacityExpression: { ...money(20_000_000, a, "not to exceed $20,000,000 at any time outstanding"), citation: "7.04(a)" },
        conditions: [],
        exceptions: [],
        dependsOn: [],
        sufficiency: "COMPLETE",
        citation: "7.04(a)",
        excerpt: "(a) Investments in joint ventures in an aggregate amount not to exceed $20,000,000",
        inventoryItemIds: a,
      },
      {
        localRef: "rB",
        sourceSectionRef: "7.04(b)",
        covenantFamily: "INVESTMENTS",
        ruleType: "QUANTITATIVE_PERMISSION",
        posture: "PERMISSION",
        action: "MAKE_INVESTMENT",
        entityScope: ["BORROWER"],
        capacityExpression: { ...money(30_000_000, b, "not to exceed $30,000,000 at any time outstanding"), citation: "7.04(b)" },
        conditions: [],
        exceptions: [],
        dependsOn: [],
        sufficiency: "COMPLETE",
        citation: "7.04(b)",
        excerpt: "(b) other Investments in an aggregate amount not to exceed $30,000,000",
        inventoryItemIds: b,
      },
    ],
    definitions: [],
    sharedCapacities: [
      {
        localRef: "cap1",
        description: "aggregate pool across clauses (a) and (b)",
        capExpression: { ...money(10_000_000, pool, "shall not exceed $10,000,000"), citation: "7.04" },
        memberRefs: ["rA", "rB"],
        citation: "7.04",
        excerpt: "clauses (a) and (b) together shall not exceed $10,000,000",
        inventoryItemIds: pool,
      },
    ],
    irExtensionCandidates: [],
    overallNotes: [],
  };
}

function submissionCrossSection(user: string): unknown {
  const prohibition = idsFor(user, "shall not make any Restricted Payment");
  const a = idsFor(user, "$15,000,000");
  return {
    rules: [
      {
        localRef: "r0",
        sourceSectionRef: "7.05",
        covenantFamily: "RESTRICTED_PAYMENTS",
        ruleType: "PROHIBITION",
        posture: "PROHIBITION",
        action: "MAKE_RESTRICTED_PAYMENT",
        entityScope: ["BORROWER"],
        capacityExpression: null,
        conditions: [],
        exceptions: [
          {
            description: "clause (a)",
            permissionRef: "rA",
            citation: "7.05(a)",
            excerpt: "Restricted Payments in an aggregate amount",
            inventoryItemIds: a,
          },
        ],
        dependsOn: [],
        sufficiency: "COMPLETE",
        citation: "7.05",
        excerpt: "The Borrower shall not make any Restricted Payment",
        inventoryItemIds: prohibition,
      },
      {
        localRef: "rA",
        sourceSectionRef: "7.05(a)",
        covenantFamily: "RESTRICTED_PAYMENTS",
        ruleType: "QUANTITATIVE_PERMISSION",
        posture: "PERMISSION",
        action: "MAKE_RESTRICTED_PAYMENT",
        entityScope: ["BORROWER"],
        capacityExpression: { ...money(15_000_000, a, "not to exceed $15,000,000"), citation: "7.05(a)" },
        conditions: [],
        exceptions: [],
        dependsOn: [
          {
            relationshipType: "SHARES_CAPACITY_WITH",
            targetRef: "Section 7.06",
            description: "amounts under Section 7.06 count against the same aggregate — provision outside this submission",
          },
        ],
        sufficiency: "COMPLETE",
        citation: "7.05(a)",
        excerpt: CROSS_SECTION_POOL,
        inventoryItemIds: a,
      },
    ],
    definitions: [],
    sharedCapacities: [
      {
        localRef: "cap1",
        description: "shared amount with Investments under Section 7.06",
        capExpression: { ...money(15_000_000, a, "not to exceed $15,000,000"), citation: "7.05(a)" },
        memberRefs: ["rA"],
        citation: "7.05(a)",
        excerpt: CROSS_SECTION_POOL,
        inventoryItemIds: a,
      },
    ],
    irExtensionCandidates: [],
    overallNotes: [],
  };
}

const spec704 = (): [string, ["INVESTMENTS"], "GENERAL_PROHIBITION", string] => [
  "7.04",
  ["INVESTMENTS"],
  "GENERAL_PROHIBITION",
  "investment covenant",
];
const spec705 = (): [string, ["RESTRICTED_PAYMENTS"], "GENERAL_PROHIBITION", string] => [
  "7.05",
  ["RESTRICTED_PAYMENTS"],
  "GENERAL_PROHIBITION",
  "restricted payments",
];

describe("ADV-FP aggregate alone cannot create executable shared capacity (E2E)", () => {
  it("ADV-FP-02: single ordinary aggregate basket → no IRSharedCapacity, Phase-4 has zero shared pools", async () => {
    const { pkg } = buildPackageFrom({ docs: docWith(SINGLE_BASKET), candidateSpecs: [spec704()] });
    const run = await certifyDiscoveredCovenantPackage(pkg, deps(fakeClient(submissionSingleBasket), invSingle));
    const r = run.results[0]!;
    expect(r.compilation!.sharedCapacities).toEqual([]);
    expect(r.snapshot!.units.every((u) => u.kind !== "SHARED_CAPACITY")).toBe(true);
    expect(run.map.edges.filter((e) => e.edgeType === "RULE_USES_SHARED_CAPACITY")).toEqual([]);
    expect(r.certification!.status).toBe("CERTIFIED");
    const adapted = certifiedMapToVerifiedExecutionPackage([
      { certification: r.certification!, verifiedPackage: r.verifiedPackage! },
    ]);
    expect(adapted.outcome).toBe("DERIVED");
    if (adapted.outcome !== "DERIVED") throw new Error("unreachable");
    expect(adapted.package.sharedCapacities ?? []).toEqual([]);
    const out = evaluateVerifiedCapacity({ package: adapted.package, inputs: inputsFor(adapted.package), asOf: tx.WHEN });
    expect(out.outcome).toBe("EXECUTED");
    if (out.outcome !== "EXECUTED") throw new Error("unreachable");
    expect(out.state.sharedConstraints).toEqual([]);
    expect(out.graph.nodes.every((n) => n.kind !== "SHARED_CAPACITY")).toBe(true);
    const perm = adapted.package.rules.find((ruleRow) => ruleRow.sourceSectionRef === "7.04(a)")!;
    const sim = simulateVerifiedTransaction({
      package: adapted.package,
      inputs: inputsFor(adapted.package),
      asOf: tx.WHEN,
      transaction: tx.proposal("tx-1", [], { companyId: adapted.package.companyId, instrumentKey: adapted.package.instrumentKey }),
      selectedPath: tx.route({ ruleIds: [perm.ruleId] }),
    });
    expect(sim.outcome).toBe("EXECUTED");
    if (sim.outcome !== "EXECUTED") throw new Error("unreachable");
    // Simulation runs on a package with zero shared pools — no shared constraint node is introduced.
    expect(adapted.package.sharedCapacities ?? []).toEqual([]);
    expect(out.graph.nodes.filter((n) => n.kind === "SHARED_CAPACITY")).toEqual([]);
  });

  it("ADV-FP-01: ceiling-only aggregate text → no shared pool and no permission capacity grant", async () => {
    const { pkg } = buildPackageFrom({ docs: docWith(CEILING_ONLY), candidateSpecs: [spec704()] });
    const run = await certifyDiscoveredCovenantPackage(pkg, deps(fakeClient(submissionCeilingOnly), invCeilingOnly));
    const r = run.results[0]!;
    expect(r.compilation!.sharedCapacities).toEqual([]);
    expect(r.compilation!.rules.every((ruleRow) => ruleRow.capacityExpression == null)).toBe(true);
    expect(run.map.nodes.every((n) => n.kind !== "SHARED_CAPACITY")).toBe(true);
  });
});

describe("genuine shared capacity remains executable; consumption is not double-counted", () => {
  it("cross-clause together-shall-not-exceed pool CERTIFIES and bounds members once", async () => {
    const { pkg } = buildPackageFrom({ docs: docWith(SHARED_TWO), candidateSpecs: [spec704()] });
    const run = await certifyDiscoveredCovenantPackage(pkg, deps(fakeClient(submissionSharedHonest), invShared));
    const r = run.results[0]!;
    expect(r.certification!.status).toBe("CERTIFIED");
    expect(r.compilation!.sharedCapacities).toHaveLength(1);
    const adapted = certifiedMapToVerifiedExecutionPackage([
      { certification: r.certification!, verifiedPackage: r.verifiedPackage! },
    ]);
    expect(adapted.outcome).toBe("DERIVED");
    if (adapted.outcome !== "DERIVED") throw new Error("unreachable");
    const out = evaluateVerifiedCapacity({ package: adapted.package, inputs: inputsFor(adapted.package), asOf: tx.WHEN });
    expect(out.outcome).toBe("EXECUTED");
    if (out.outcome !== "EXECUTED") throw new Error("unreachable");
    expect(out.state.sharedConstraints).toHaveLength(1);
    const capId = adapted.package.sharedCapacities![0]!.sharedCapId;
    expect(out.graph.nodes.some((n) => n.capacityNodeId === sharedNodeId(capId))).toBe(true);
  });

  it("runtime: two member draws debit the same pool once (no duplicated headroom)", () => {
    const rules = [rule("rule-a", MONEY(100)), rule("rule-b", MONEY(100))];
    const caps = [sharedCap("pool-s", MONEY(150), ["rule-a", "rule-b"])];
    const ledger = [usage("u1", "40", onRule("rule-a")), usage("u2", "30", onRule("rule-b"))];
    const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({
      graph,
      rules,
      sharedCapacities: caps,
      inputs: EMPTY_RESOLVER,
      ledger,
      asOf: AS_OF,
    });
    const pool = state.sharedConstraints.find((s) => s.sharedCapacityId === "pool-s")!;
    expect(amountString(pool.usage)).toBe("70");
    expect(amountString(pool.remaining)).toBe("80");
    // Pool limit was never copied onto members' gross capacity.
    expect(amountString(state.capacities.find((c) => c.ruleId === "rule-a")!.grossCapacity)).toBe("100");
    expect(amountString(state.capacities.find((c) => c.ruleId === "rule-b")!.grossCapacity)).toBe("100");
  });

  it("cross-section shared language: pool is quantified once; cross-doc partner is not silently dropped or duplicated", async () => {
    const { pkg } = buildPackageFrom({ docs: docWith(CROSS_DOC), candidateSpecs: [spec705()] });
    const run = await certifyDiscoveredCovenantPackage(pkg, deps(fakeClient(submissionCrossSection), invCross));
    const r = run.results[0]!;
    expect(r.compilation!.sharedCapacities).toHaveLength(1);
    expect(r.compilation!.sharedCapacities[0]!.memberRuleIds).toHaveLength(1);
    // External Section 7.06 share must surface as an explicit unresolved dependency or retained SHARES edge — never silently omitted into a second freestanding ceiling.
    const member = r.compilation!.rules.find((ruleRow) => ruleRow.sourceSectionRef === "7.05(a)")!;
    const retainedShare = member.dependsOn.some((d) => d.relationshipType === "SHARES_CAPACITY_WITH");
    const unresolvedShare = (r.compilation!.unresolvedIssues ?? []).some(
      (u) => /7\.06|SHARES_CAPACITY|shared/i.test(JSON.stringify(u)),
    );
    expect(retainedShare || unresolvedShare).toBe(true);
    expect(r.compilation!.rules.filter((ruleRow) => ruleRow.capacityExpression?.kind === "MONEY").length).toBeLessThanOrEqual(1);
  });
});

describe("unresolved shared-pool dependencies fail closed", () => {
  it("SHARES_CAPACITY_WITH without a quantified IRSharedCapacity never invents a pool", () => {
    const a = rule("rule-a", MONEY(100), {
      dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRuleId: "rule-b", description: "shares with b" }],
    });
    const b = rule("rule-b", MONEY(100));
    const graph = buildCapacityGraph({
      rules: [a, b],
      sharedCapacities: [],
      companyId: CO,
      instrumentKey: INST,
      asOf: AS_OF,
    });
    expect(graph.nodes.filter((n) => n.kind === "SHARED_CAPACITY")).toEqual([]);
    expect(graph.limitations.some((l) => l.code === "SHARED_CAPACITY_NOT_QUANTIFIED")).toBe(true);
    const state = evaluateCapacityState({
      graph,
      rules: [a, b],
      sharedCapacities: [],
      inputs: EMPTY_RESOLVER,
      ledger: [],
      asOf: AS_OF,
    });
    expect(state.sharedConstraints).toEqual([]);
    // Members with an unquantified share are not authoritative AVAILABLE at full local amount.
    expect(
      state.capacities.every(
        (c) =>
          c.status !== "AVAILABLE" ||
          c.effectiveRemaining.kind === "NOT_DETERMINED" ||
          c.limitations.some((l) => l.code === "SHARED_CAPACITY_NOT_QUANTIFIED"),
      ),
    ).toBe(true);
  });
});
