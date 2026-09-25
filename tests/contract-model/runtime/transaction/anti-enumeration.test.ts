/**
 * PHASE 4D §37, §42, §43 - the engine is generic, owns no solver behaviour and ingests nothing.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { RESERVED_EFFECT_KINDS, SUPPORTED_EFFECT_KINDS } from "@/lib/contract-model/runtime/transaction/types";
import {
  MONEY, adjustFigure, amountOf, cash, consume, figure, nodeOf, proposal, provision, resetIds,
  route, simulate, usage, onProvision, world,
} from "./helpers";

const DIR = "lib/contract-model/runtime/transaction";
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts")).sort();
const raw = FILES.map((f) => readFileSync(`${DIR}/${f}`, "utf8")).join("\n");
const nonComment = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const src = nonComment(raw);

beforeEach(resetIds);

describe("§37 transaction labels are metadata, never behaviour", () => {
  it("no covenant form, metric name, agreement or section reference appears in the module", () => {
    const forbidden = [
      "EBITDA", "Total Assets", "Interest Expense", "Fixed Charge", "Leverage Ratio", "Net Income",
      "Restricted Payment", "Permitted Lien", "Available Amount", "Builder Basket", "Grower Basket",
      "Dividend", "Acquisition", "Incremental", "Ratio Debt", "Permitted Investment",
      "GREATER_OF", "RATIO_DEBT", "FREE_AND_CLEAR", "GENERAL_DEBT",
      "Chewy", "chwy", "6.01", "6.10", "FWRG", "CONMED", "DSGR",
    ];
    for (const f of forbidden) expect(src.includes(f), f).toBe(false);
  });

  it("no branch reads the transaction's category or label", () => {
    // Both fields exist for the reader. If either ever reached a comparison, a transaction called
    // one thing would behave differently from the same effects called another.
    for (const pattern of [/\.category\s*===/, /\.label\s*===/, /\.category\s*!==/, /\.label\s*!==/, /switch\s*\(\s*\w+\.category/, /switch\s*\(\s*\w+\.label/]) {
      expect(pattern.test(src), String(pattern)).toBe(false);
    }
  });

  it("the same effects described two different ways behave identically", () => {
    const w = world({ rules: [provision("p-a", MONEY(100))], ledger: [usage("u1", "20", onProvision("p-a"))] });
    const path = route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] });
    const shape = (category: string | null, label: string | null) => {
      const r = simulate(w, proposal("tx", [consume("e1", nodeOf("p-a"), cash("30"))], { category, label }), path);
      return {
        simulationStatus: r.simulationStatus, selectedPathResult: r.selectedPathResult,
        available: amountOf(r.capacityEffects[0]!.availableAmount),
        postUsage: amountOf(r.postState!.capacities[0]!.usage),
        proposed: r.ledgerEffects.proposed.map((p) => [p.record.usageId, p.record.amount.amount]),
        steps: r.trace.map((t) => [t.name, t.status]),
        limitations: r.limitations.map((l) => l.code),
      };
    };
    expect(shape("one stated category", "one wording")).toEqual(shape("an entirely different category", "another wording"));
    expect(shape(null, null)).toEqual(shape("a stated category", "a stated label"));
  });

  it("no effect handler is selected by a transaction-form name: the vocabulary is the typed effect kinds", () => {
    expect([...SUPPORTED_EFFECT_KINDS].sort()).toEqual(["ACTIVATE_EVENT", "APPLY_RECLASSIFICATION", "CHANGE_METRIC", "CONSUME_CAPACITY", "DEACTIVATE_EVENT", "RESTORE_CAPACITY", "SUPERSEDE_LEDGER_USAGE"]);
    for (const [kind, reason] of Object.entries(RESERVED_EFFECT_KINDS)) {
      expect(reason.length).toBeGreaterThan(40);
      expect(SUPPORTED_EFFECT_KINDS.includes(kind as never)).toBe(false);
    }
  });

  it("a reserved effect is refused explicitly, never silently ignored", () => {
    const w = world({ rules: [provision("p-a", MONEY(100))] });
    const r = simulate(w, proposal("tx", [{ effectId: "e1", kind: "CHANGE_BALANCE" } as never]), route({}));
    expect(r.simulationStatus).toBe("UNSUPPORTED");
    expect(r.limitations.map((l) => l.code)).toContain("UNSUPPORTED_TRANSACTION_EFFECT");
    expect(r.effects[0]!.supported).toBe(false);
    expect(r.effects[0]!.reason).toContain("Phase 4B models a financial fact");
  });
});

describe("§42 no Phase-4E solver behaviour", () => {
  it("no path selection, allocation search, ordering, scoring or maximisation entry point exists", () => {
    const forbidden = [
      "maximumTransactionAmount(", "bestBasket", "bestPath", "optimalAllocation", "findPermissionPath",
      "solveFor", "chooseBasket", "rankPaths", "scorePath", "candidateSearch", "allocationSolver",
      "capacityOptimizer", "binarySearch", "optimal", "maximize", "minimize", "cheapest",
    ];
    // The `notComputed` block names what this phase refuses to do, so it is excluded from the scan
    // of behaviour: a negative declaration is the opposite of an entry point.
    const behaviour = src.split("\n").filter((l) => !/NOT_COMPUTED_IN_PHASE_4D|notComputed|maximumTransactionAmount:|alternativePathComparison:/.test(l)).join("\n");
    for (const f of forbidden) expect(behaviour.toLowerCase().includes(f.toLowerCase()), f).toBe(false);
  });

  it("every result states what it deliberately does not compute", () => {
    const w = world({ rules: [provision("p-a", MONEY(100))] });
    const r = simulate(w, proposal("tx", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.notComputed).toEqual({
      pathSelection: "NOT_COMPUTED_IN_PHASE_4D",
      maximumTransactionAmount: "NOT_COMPUTED_IN_PHASE_4D",
      allocationAcrossCapacities: "NOT_COMPUTED_IN_PHASE_4D",
      alternativePathComparison: "NOT_COMPUTED_IN_PHASE_4D",
      accountingTreatment: "NOT_COMPUTED_IN_PHASE_4D",
      currencyConversion: "NOT_COMPUTED_IN_PHASE_4D",
    });
  });

  it("two independently specified simulations are returned independently, never compared or ordered", () => {
    const w = world({ rules: [provision("p-a", MONEY(100)), provision("p-b", MONEY(500))] });
    const a = simulate(w, proposal("tx-a", [consume("e1", nodeOf("p-a"), cash("50"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    const b = simulate(w, proposal("tx-b", [consume("e1", nodeOf("p-b"), cash("50"))]), route({ capacityNodeIds: [nodeOf("p-b")], ruleIds: ["p-b"] }));
    for (const r of [a, b]) {
      expect(r.selectedPathResult).toBe("SATISFIED");
      // Everything except the `notComputed` block, which exists precisely to say these are absent.
      const body = JSON.stringify({ ...r, notComputed: undefined });
      for (const word of ["preferred", "recommend", "alternative", "ranking", "optimal", "better than"]) {
        expect(body.toLowerCase(), word).not.toContain(word);
      }
    }
    // Nothing in either result refers to the other.
    expect(JSON.stringify(a)).not.toContain("tx-b");
    expect(JSON.stringify(b)).not.toContain("tx-a");
  });

  it("an amount that does not fit is never reduced to one that does", () => {
    const w = world({ rules: [provision("p-a", MONEY(100))] });
    const r = simulate(w, proposal("tx", [consume("e1", nodeOf("p-a"), cash("140"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.capacityEffects[0]!.attemptedAmount).toEqual({ type: "MONEY", amount: "140", currency: "USD" });
    expect(r.ledgerEffects.proposed.every((p) => p.record.amount.amount === "140")).toBe(true);
    expect(r.postState).toBeNull();
  });
});

describe("§29 / §43 no persistence and no ingestion", () => {
  it("no database, filesystem, network or parsing surface exists in the module", () => {
    for (const f of ["fetch(", "axios", "node-fetch", "xlsx", "pdf", "csv-parse", "papaparse", "openai", "anthropic", "PrismaClient", "node:fs", "writeFile", "readFile", "prisma."]) {
      expect(src.toLowerCase().includes(f.toLowerCase()), f).toBe(false);
    }
    const prismaLines = src.split("\n").filter((l) => /prisma/i.test(l));
    expect(prismaLines).toEqual(['import type { EntityClassTag } from "@prisma/client";']);
  });

  it("the module owns no arithmetic: every operation goes through the Phase-4A layers", () => {
    expect(src.includes('from "../units"')).toBe(true);
    for (const f of FILES) {
      const body = nonComment(readFileSync(`${DIR}/${f}`, "utf8"));
      expect(/\.amount\s*[-+*/]\s/.test(body), `${f}: raw arithmetic on an amount`).toBe(false);
      expect(/parseFloat|Number\(/.test(body), `${f}: float conversion`).toBe(false);
    }
    expect(src.includes("Infinity")).toBe(false);
    expect(src.includes("Number.MAX_VALUE")).toBe(false);
    expect(src.includes("NaN")).toBe(false);
  });

  it("the module imports only the trusted IR and its own runtime, never the compiler", () => {
    const imports = FILES.flatMap((f) => [...readFileSync(`${DIR}/${f}`, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!)).filter((i) => i.startsWith("."));
    const outside = [...new Set(imports.filter((i) => !i.startsWith("./")))].sort();
    expect(outside.every((i) => i.startsWith("../") && !i.includes("compiler"))).toBe(true);
    expect(outside).toEqual([
      "../../ir/types", "../capacity/graph", "../capacity/reclassification", "../capacity/state",
      "../capacity/types", "../capacity/version", "../decimal", "../evaluate-expression",
      "../input/identity", "../input/manifest", "../input/types", "../input/version", "../types",
      "../units", "../values", "../verification-gate", "../version",
    ]);
  });

  it("no earlier phase imports the transaction layer, so the dependency runs one way only", () => {
    const offenders = execSync("grep -rln 'runtime/transaction' lib/contract-model/compiler lib/contract-model/ir lib/contract-model/runtime/capacity lib/contract-model/runtime/input || true", { encoding: "utf8" }).split("\n").filter(Boolean);
    expect(offenders).toEqual([]);
  });

  it("no financial fact is inferred: an adjustment only ever comes from an explicit effect", () => {
    const w = world({ rules: [provision("p-a", MONEY(100))], facts: [figure("fig-1", "1000")] });
    const withNothing = simulate(w, proposal("tx", [consume("e1", nodeOf("p-a"), cash("20"))], { category: "a category that might suggest a balance moves" }), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(withNothing.financialEffects).toEqual([]);
    expect(withNothing.simulationInputView.adjustments).toEqual([]);
    const withOne = simulate(w, proposal("tx", [consume("e1", nodeOf("p-a"), cash("20")), adjustFigure("e0", "fig-1", "DELTA", cash("5"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(withOne.financialEffects.map((f) => [f.metricKey, f.state])).toEqual([["fig-1", "APPLIED"]]);
  });
});
