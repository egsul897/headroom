/**
 * PHASE 4B §36 - the input contract is generic.
 *
 * One resolution path serves every fact. Nothing in lib/contract-model/runtime/input/ names a metric,
 * a covenant form, an agreement, a company or a section, and nothing there decides anything from a
 * fact's name. The matrix below proves the behaviour; the scans prove the code.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { RuntimeValue } from "@/lib/contract-model/runtime/types";
import { buildSnapshotGraph, resolveInput, FINANCIAL_INPUT_CONTRACT_VERSION, type FinancialSnapshot, type InputQuery } from "@/lib/contract-model/runtime/input";
import { CO_A, INST_1, identity, input, instrumentScope, money, ratio, snapshot, verbatimPeriod, noPeriod, noAsOf } from "./helpers";

const DIR = "lib/contract-model/runtime/input";
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts"));

const query = (over: Partial<InputQuery> & { key: string }): InputQuery => ({
  companyId: CO_A, instrumentKey: INST_1, inputKind: "METRIC", period: noPeriod(), asOf: noAsOf(), expectedType: "MONEY", ...over,
});

/** Names here are arbitrary test strings. Swapping them changes nothing about the resolution path. */
const MATRIX: { label: string; key: string; value: RuntimeValue; type: "MONEY" | "RATIO"; period: string | null }[] = [
  { label: "A. a money fact, no period", key: "alpha-quantity", value: money("800000000"), type: "MONEY", period: null },
  { label: "B. the same shape under a different name", key: "zeta-quantity", value: money("1024000000"), type: "MONEY", period: null },
  { label: "C. a ratio fact, no period", key: "alpha-proportion", value: ratio("2.5"), type: "RATIO", period: null },
  { label: "D. a money fact under a contract period key", key: "beta-quantity", value: money("125000"), type: "MONEY", period: "the four consecutive fiscal quarters most recently ended" },
  { label: "E. a ratio fact under a different contract period key", key: "beta-proportion", value: ratio("1.25"), type: "RATIO", period: "the fiscal year then ended" },
  { label: "F. a name that looks like another with different whitespace", key: "alpha  quantity", value: money("1"), type: "MONEY", period: null },
  { label: "G. a name that differs only by case", key: "ALPHA-QUANTITY", value: money("2"), type: "MONEY", period: null },
];

describe("anti-enumeration matrix (§36)", () => {
  it.each(MATRIX.map((c) => [c.label, c] as const))("%s resolves through the same path", (_l, c) => {
    const id = identity({ key: c.key, valueType: c.type, currency: c.type === "MONEY" ? "USD" : null, period: c.period === null ? noPeriod() : verbatimPeriod(c.period), scope: instrumentScope(INST_1) });
    const snaps: FinancialSnapshot[] = [snapshot({ snapshotId: "s1", inputs: [input({ identity: id, value: c.value })] })];
    const r = resolveInput({ query: query({ key: c.key, expectedType: c.type, period: id.period }), snapshots: snaps, graph: buildSnapshotGraph(snaps) });
    expect(r.state).toBe("RESOLVED");
    expect(r.contractVersion).toBe(FINANCIAL_INPUT_CONTRACT_VERSION);
    expect(r.provenance!.selectionMethod).toBe("EXACT_IDENTITY");
  });

  it("names that merely look alike are different facts - no normalization, no fuzzy match", () => {
    const wanted = identity({ key: "alpha-quantity" });
    const lookalikes = ["alpha  quantity", "ALPHA-QUANTITY", "alpha-quantity ", "Alpha-Quantity"];
    for (const k of lookalikes) {
      const snaps: FinancialSnapshot[] = [snapshot({ snapshotId: "s1", inputs: [input({ identity: identity({ key: k }), value: money("1") })] })];
      const r = resolveInput({ query: query({ key: wanted.key }), snapshots: snaps, graph: buildSnapshotGraph(snaps) });
      expect(r.state, k).toBe("MISSING");
    }
  });

  it("the whole matrix in one snapshot still resolves each fact to itself", () => {
    const inputs = MATRIX.map((c) => input({
      identity: identity({ key: c.key, valueType: c.type, currency: c.type === "MONEY" ? "USD" : null, period: c.period === null ? noPeriod() : verbatimPeriod(c.period) }),
      value: c.value,
    }));
    const snaps: FinancialSnapshot[] = [snapshot({ snapshotId: "s1", inputs })];
    const graph = buildSnapshotGraph(snaps);
    expect(graph.safe).toBe(true);
    for (const c of MATRIX) {
      const r = resolveInput({ query: query({ key: c.key, expectedType: c.type, period: c.period === null ? noPeriod() : verbatimPeriod(c.period) }), snapshots: snaps, graph });
      expect(r.state, c.label).toBe("RESOLVED");
      expect(r.input!.identity.key, c.label).toBe(c.key);
    }
  });
});

describe("production scans (§36)", () => {
  const nonComment = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  const allSrc = nonComment(FILES.map((f) => readFileSync(`${DIR}/${f}`, "utf8")).join("\n"));

  it("no metric name, covenant form, agreement or section reference appears in the input contract", () => {
    const forbidden = [
      "EBITDA", "Total Assets", "Interest Expense", "Fixed Charge", "Leverage Ratio", "Net Income",
      "Restricted Payment", "Indebtedness", "Permitted Lien", "Available Amount", "Builder Basket",
      "GREATER_OF", "RATIO_DEBT", "FREE_AND_CLEAR", "GENERAL_DEBT",
      "Chewy", "chwy", "6.01", "6.10", "FWRG", "CONMED", "DSGR",
    ];
    for (const f of forbidden) expect(allSrc.includes(f), f).toBe(false);
  });

  it("no company or instrument identifier is hard-coded", () => {
    for (const f of [CO_A, INST_1, "ir-fixture-co", "ir-fixture-instrument"]) expect(allSrc.includes(f), f).toBe(false);
  });

  it("no fact is selected by array position, first match or a truthy-name fallback", () => {
    // The resolution path is where a financial fact is chosen. Nothing there may scan for a first
    // hit, index a candidate list, or treat a null selector as "anything".
    for (const f of ["resolve.ts", "snapshot.ts", "snapshot-resolver.ts", "identity.ts"]) {
      const src = nonComment(readFileSync(`${DIR}/${f}`, "utf8"));
      expect(/\.find\s*\(/.test(src), `${f}: .find(`).toBe(false);
      expect(/candidates\s*\[\s*0\s*\]/.test(src), `${f}: candidates[0]`).toBe(false);
      expect(/===\s*null\s*\|\|.*===\s*null/.test(src), `${f}: null-wildcard match`).toBe(false);
    }
  });

  it("the manifest's Phase-3 lookups are unique-or-refuse, never a first match", () => {
    // manifest.ts does use .find, but only to merge records that already share a full identity
    // tuple. Every lookup that could pick between competing Phase-3 objects is a filter whose
    // multi-match branch refuses to expand - proved behaviourally in the manifest suite.
    const src = nonComment(readFileSync(`${DIR}/manifest.ts`, "utf8"));
    const finds = [...src.matchAll(/(\w+)\.find\s*\(/g)].map((m) => m[1]!);
    expect(finds).toEqual(["merged"]);
    expect(src.includes("ambiguousExpansions.push")).toBe(true);
  });

  it("the input contract imports only the trusted IR types and its own runtime, never the compiler", () => {
    const imports = FILES.flatMap((f) => [...readFileSync(`${DIR}/${f}`, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!)).filter((i) => i.startsWith("."));
    const outside = [...new Set(imports.filter((i) => !i.startsWith("./")))].sort();
    expect(outside).toEqual(["../../ir/types", "../types", "../version"]);
    expect(imports.some((i) => i.includes("compiler"))).toBe(false);
  });

  it("no Phase-3 compiler or IR module imports the Phase-4B input contract", () => {
    const offenders = execSync("grep -rln 'runtime/input' lib/contract-model/compiler lib/contract-model/ir --include=*.ts || true", { encoding: "utf8" }).split("\n").filter(Boolean);
    expect(offenders).toEqual([]);
  });

  it("no ingestion, parsing or network surface was added", () => {
    for (const f of ["fetch(", "axios", "node-fetch", "xlsx", "pdf", "csv-parse", "papaparse", "prisma", "openai", "anthropic"]) {
      expect(allSrc.toLowerCase().includes(f.toLowerCase()), f).toBe(false);
    }
  });
});
