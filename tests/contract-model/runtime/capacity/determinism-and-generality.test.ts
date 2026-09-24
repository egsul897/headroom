/**
 * PHASE 4C §40, §41, §42 - one generic engine, byte-identical under permutation, and complexity
 * that stays linear in the graph rather than quadratic.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import type { FinancialInput } from "@/lib/contract-model/runtime/input/types";
import { AS_OF, CO, INST, MAX, METRIC, MONEY, MUL, PCT, amountString, fact, onRule, resetIds, resolver, rule, sharedCap, snapshot, usage } from "./helpers";

beforeEach(resetIds);

const DIR = "lib/contract-model/runtime/capacity";
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
const nonComment = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const allSrc = nonComment(FILES.map((f) => readFileSync(`${DIR}/${f}`, "utf8")).join("\n"));

describe("determinism under permutation (§41)", () => {
  // The IR is built ONCE. Only the order the objects are supplied in varies, which is exactly what
  // determinism under permutation means: identical content, different array positions.
  resetIds();
  const RULES = [
    rule("rule-a", MAX(MONEY(100), MUL(PCT(0.1), METRIC("metric-alpha")))),
    rule("rule-b", MONEY(200)),
    rule("rule-c", MUL(PCT(0.25), METRIC("metric-beta"))),
  ];
  const POOL = MONEY(400);
  const caps = (memberOrder: string[]) => [sharedCap("pool-s", POOL, memberOrder)];
  const FACTS = [fact("metric-alpha", "500"), fact("metric-beta", "800")];
  const LEDGER = [usage("u1", "10", onRule("rule-a")), usage("u2", "20", onRule("rule-b")), usage("u3", "30", onRule("rule-c"))];

  const hashWith = (opts: { ruleOrder?: number[]; factOrder?: number[]; ledgerOrder?: number[]; memberOrder?: string[] } = {}) => {
    const ordered = (opts.ruleOrder ?? [0, 1, 2]).map((i) => RULES[i]!);
    const fo = (opts.factOrder ?? [0, 1]).map((i) => FACTS[i]!);
    const lo = (opts.ledgerOrder ?? [0, 1, 2]).map((i) => LEDGER[i]!);
    const sharedCaps = caps(opts.memberOrder ?? ["rule-a", "rule-b", "rule-c"]);
    const graph = buildCapacityGraph({ rules: ordered, sharedCapacities: sharedCaps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const inputs = snapshotInputResolver({ snapshots: [snapshot(fo)], companyId: CO, instrumentKey: INST });
    const state = evaluateCapacityState({ graph, rules: ordered, sharedCapacities: sharedCaps, inputs, ledger: lo, asOf: AS_OF });
    return { graphHash: graph.graphHash, stateHash: state.stateHash };
  };

  it("permuted rules, facts, ledger records and shared-cap members all give the same hashes", () => {
    const base = hashWith();
    const permutations = [
      hashWith({ ruleOrder: [2, 0, 1] }),
      hashWith({ ruleOrder: [1, 2, 0] }),
      hashWith({ factOrder: [1, 0] }),
      hashWith({ ledgerOrder: [2, 1, 0] }),
      hashWith({ memberOrder: ["rule-c", "rule-a", "rule-b"] }),
      hashWith({ ruleOrder: [2, 1, 0], factOrder: [1, 0], ledgerOrder: [1, 0, 2], memberOrder: ["rule-b", "rule-c", "rule-a"] }),
    ];
    for (const p of permutations) {
      expect(p.graphHash).toBe(base.graphHash);
      expect(p.stateHash).toBe(base.stateHash);
    }
  });

  it("repeating the same evaluation gives a byte-identical state hash", () => {
    const runs = Array.from({ length: 5 }, () => hashWith().stateHash);
    expect(new Set(runs).size).toBe(1);
  });

  it("the state hash covers meaning, not measurement, so it excludes the complexity counters", () => {
    const graph = buildCapacityGraph({ rules: RULES, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const a = evaluateCapacityState({ graph, rules: RULES, inputs: resolver(FACTS), asOf: AS_OF });
    expect(a.complexity.nodesVisited).toBeGreaterThan(0);
    expect(JSON.stringify({ ...a, complexity: undefined })).not.toContain("nodesVisited");
  });
});

describe("anti-enumeration scans (§40)", () => {
  it("no metric name, covenant form, agreement or section reference appears in the capacity module", () => {
    const forbidden = [
      "EBITDA", "Total Assets", "Interest Expense", "Fixed Charge", "Leverage Ratio", "Net Income",
      "Restricted Payment", "Permitted Lien", "Available Amount", "Builder Basket", "Grower Basket",
      "GREATER_OF", "RATIO_DEBT", "FREE_AND_CLEAR", "GENERAL_DEBT", "RETAINED_EARNINGS_BUILDER", "EBITDA_GROWER",
      "Chewy", "chwy", "6.01", "6.10", "FWRG", "CONMED", "DSGR",
    ];
    for (const f of forbidden) expect(allSrc.includes(f), f).toBe(false);
  });

  it("no company, instrument or rule identifier is hard-coded", () => {
    for (const f of [CO, INST, "ir-fixture-co", "ir-fixture-instrument", "rule-a", "pool-s"]) expect(allSrc.includes(f), f).toBe(false);
  });

  it("no solver, election or optimization entry point exists", () => {
    for (const f of ["maximumTransactionAmount(", "bestBasket", "optimalAllocation", "findPermissionPath", "solveFor", "chooseBasket", "simulateTransaction"]) {
      expect(allSrc.includes(f), f).toBe(false);
    }
  });

  it("no ingestion, parsing or network surface was added", () => {
    for (const f of ["fetch(", "axios", "node-fetch", "xlsx", "pdf", "csv-parse", "papaparse", "openai", "anthropic"]) {
      expect(allSrc.toLowerCase().includes(f.toLowerCase()), f).toBe(false);
    }
    // The single Prisma mention is a type-only import of the EntityClassTag enum, the same one the
    // Phase-3 IR uses. No client is constructed and no query is issued.
    const prismaLines = allSrc.split("\n").filter((l) => /prisma/i.test(l));
    expect(prismaLines).toEqual(['import type { EntityClassTag } from "@prisma/client";']);
    expect(allSrc.includes("PrismaClient")).toBe(false);
  });

  it("unlimited is never a numeric stand-in", () => {
    expect(allSrc.includes("Number.MAX_VALUE")).toBe(false);
    expect(allSrc.includes("Infinity")).toBe(false);
    expect(allSrc.includes("MAX_SAFE_INTEGER")).toBe(false);
  });

  it("the capacity module owns no arithmetic: every operation goes through the Phase-4A layers", () => {
    // Bare arithmetic operators on values would mean a second implementation. Only the unit algebra
    // and the evaluator may compute, and both are imported.
    expect(allSrc.includes('from "../units"')).toBe(true);
    expect(allSrc.includes('from "../evaluate-expression"')).toBe(true);
    for (const f of FILES) {
      const src = nonComment(readFileSync(`${DIR}/${f}`, "utf8"));
      expect(/\.amount\s*[-+*/]\s/.test(src), `${f}: raw arithmetic on an amount`).toBe(false);
      expect(/parseFloat|Number\(/.test(src), `${f}: float conversion`).toBe(false);
    }
  });

  it("the capacity module imports only the trusted IR and its own runtime, never the compiler", () => {
    const imports = FILES.flatMap((f) => [...readFileSync(`${DIR}/${f}`, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!)).filter((i) => i.startsWith("."));
    const outside = [...new Set(imports.filter((i) => !i.startsWith("./")))].sort();
    expect(outside.every((i) => i.startsWith("../") && !i.includes("compiler"))).toBe(true);
    expect(outside).toEqual(["../../ir/types", "../decimal", "../evaluate-expression", "../input/identity", "../input/manifest", "../input/types", "../input/version", "../types", "../units", "../values", "../verification-envelope", "../version"]);
  });

  it("no Phase-3 compiler or IR module imports the capacity layer", () => {
    const offenders = execSync("grep -rln 'runtime/capacity' lib/contract-model/compiler lib/contract-model/ir --include=*.ts || true", { encoding: "utf8" }).split("\n").filter(Boolean);
    expect(offenders).toEqual([]);
  });

  it("renaming every rule, metric and pool changes the names but not the topology or the numbers", () => {
    const mk = (suffix: string) => {
      resetIds();
      const rules = [rule(`r1${suffix}`, MAX(MONEY(100), MUL(PCT(0.1), METRIC(`m1${suffix}`)))), rule(`r2${suffix}`, MONEY(200))];
      const caps = [sharedCap(`p1${suffix}`, MONEY(250), [`r1${suffix}`, `r2${suffix}`])];
      const facts: FinancialInput[] = [fact(`m1${suffix}`, "500")];
      const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
      const state = evaluateCapacityState({ graph, rules, sharedCapacities: caps, inputs: resolver(facts), ledger: [usage(`u1${suffix}`, "40", onRule(`r1${suffix}`))], asOf: AS_OF });
      return { graph, state };
    };
    const a = mk("-alpha");
    const b = mk("-zeta");
    expect(a.graph.nodes.map((n) => n.kind)).toEqual(b.graph.nodes.map((n) => n.kind));
    expect(a.graph.edges.map((e) => e.kind)).toEqual(b.graph.edges.map((e) => e.kind));
    expect(a.state.capacities.map((c) => [c.status, amountString(c.grossCapacity), amountString(c.remaining), amountString(c.effectiveRemaining)]))
      .toEqual(b.state.capacities.map((c) => [c.status, amountString(c.grossCapacity), amountString(c.remaining), amountString(c.effectiveRemaining)]));
    expect(a.graph.graphHash).not.toBe(b.graph.graphHash);
  });
});

describe("complexity diagnostics (§42)", () => {
  const sized = (n: number) => {
    resetIds();
    const rules = Array.from({ length: n }, (_, i) => rule(`rule-${String(i).padStart(4, "0")}`, MONEY(100)));
    const caps = [sharedCap("pool-s", MONEY(100000), rules.map((r) => r.ruleId))];
    const ledger = rules.map((r, i) => usage(`u-${String(i).padStart(4, "0")}`, "1", onRule(r.ruleId)));
    const graph = buildCapacityGraph({ rules, sharedCapacities: caps, companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const state = evaluateCapacityState({ graph, rules, sharedCapacities: caps, inputs: EMPTY_RESOLVER, ledger, asOf: AS_OF });
    return { n, nodes: graph.nodes.length, edges: graph.edges.length, ...state.complexity };
  };

  it("counters are reported and grow with the graph, not with its square", () => {
    const a = sized(10), b = sized(20), c = sized(40);
    for (const m of [a, b, c]) {
      expect(m.nodesVisited).toBeGreaterThan(0);
      expect(m.expressionsEvaluated).toBeGreaterThan(0);
      expect(m.ledgerEntriesConsidered).toBe(m.n);
    }
    // Expression evaluations are one per capacity-bearing node plus one per pool: linear.
    expect(a.expressionsEvaluated).toBe(11);
    expect(b.expressionsEvaluated).toBe(21);
    expect(c.expressionsEvaluated).toBe(41);
    // One visit per capacity-bearing node plus one per pool: exactly n + 1, never n squared.
    expect([a.nodesVisited, b.nodesVisited, c.nodesVisited]).toEqual([a.n + 1, b.n + 1, c.n + 1]);
  });

  // REMEDIATED (R13, audit F8). The original assertion was `ledgerEntriesApplied === 2n`: each
  // row applied once for its capacity and once again when the pool re-read the member. That
  // encoded the double scan the audit measured (each of those reads also walked the whole
  // ledger). Selection is now indexed by path and memoized per (path, currency): every row is
  // examined once and applied once, and the pool's re-read is a cache hit. The counters below
  // are exact, not thresholds.
  it("ledger selection is indexed per capacity and memoized, so every row is examined and applied exactly once", () => {
    const a = sized(10), c = sized(40);
    expect(a.ledgerEntriesApplied).toBe(10);
    expect(c.ledgerEntriesApplied).toBe(40);
    expect(a.ledgerEntriesExamined).toBe(10);
    expect(c.ledgerEntriesExamined).toBe(40);
    // The pool re-reads each member's usage through the memo, never through the ledger.
    expect(a.cacheHits).toBeGreaterThanOrEqual(10);
    expect(c.cacheHits).toBeGreaterThanOrEqual(40);
    // Member edges are consulted once per member, not once per member per capacity.
    expect(a.edgesVisited).toBe(10);
    expect(c.edgesVisited).toBe(40);
  });
});
