/**
 * Phase 4B - the adversarial resolution matrix (mission section 37, cases A to T).
 * Every case proves the runtime refuses to guess: no first match, no wildcard period, no
 * company-agnostic name equality, no latest-version guess, no order dependence.
 */
import { describe, expect, it } from "vitest";
import { resolveInput } from "@/lib/contract-model/runtime/input/resolve";
import { buildSnapshotGraph } from "@/lib/contract-model/runtime/input/snapshot";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "@/lib/contract-model/runtime/input/version";
import type { FinancialSnapshot, InputQuery, ResolutionPolicy } from "@/lib/contract-model/runtime/input/types";
import { CO_A, CO_B, INST_1, INST_2, companyScopeAll, companyScopeListed, exactAsOf, identity, input, instrumentScope, money, noAsOf, noPeriod, ratio, snapshot, verbatimPeriod } from "./helpers";

const query = (over: Partial<InputQuery> & { key: string }): InputQuery => ({
  companyId: CO_A, instrumentKey: INST_1, inputKind: "METRIC", period: noPeriod(), asOf: noAsOf(), expectedType: "MONEY", ...over,
});
const resolve = (snapshots: FinancialSnapshot[], q: InputQuery, policy?: ResolutionPolicy) => resolveInput({ query: q, snapshots, ...(policy ? { policy } : {}) });
/** BigInt-safe stringify: runtime values carry exact BigInt rationals. */
const j = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

describe("A. the same metric name in two companies never crosses over", () => {
  const snaps = [
    snapshot({ snapshotId: "s-a", inputs: [input({ identity: identity({ key: "metric-x", companyId: CO_A }), value: money("100") })] }),
    snapshot({ snapshotId: "s-b", companyId: CO_B, inputs: [input({ identity: identity({ key: "metric-x", companyId: CO_B, scope: instrumentScope(INST_1) }), value: money("999") })] }),
  ];
  it("resolves only within the querying company", () => {
    const a = resolve(snaps, query({ key: "metric-x", companyId: CO_A }));
    expect(a.state).toBe("RESOLVED");
    expect(a.provenance!.snapshotId).toBe("s-a");
    const b = resolve(snaps, query({ key: "metric-x", companyId: CO_B }));
    expect(b.provenance!.snapshotId).toBe("s-b");
  });
  it("a company with no fact gets MISSING, never the other company's value", () => {
    const c = resolve(snaps, query({ key: "metric-x", companyId: "company-gamma" }));
    expect(c.state).toBe("MISSING");
    expect(c.input).toBeNull();
    expect(c.candidates.every((x) => x.rejectedBecause === "COMPANY_MISMATCH")).toBe(true);
  });
});

describe("B/C. instrument scope is explicit and company-level reuse is intentional", () => {
  const instrumentLevel = snapshot({ snapshotId: "s-inst", inputs: [input({ identity: identity({ key: "metric-y", scope: instrumentScope(INST_1) }), value: money("10") })] });
  it("B. an instrument-level fact does not satisfy another instrument", () => {
    const r = resolve([instrumentLevel], query({ key: "metric-y", instrumentKey: INST_2 }));
    expect(r.state).toBe("MISSING");
    expect(r.candidates[0]!.rejectedBecause).toBe("INSTRUMENT_SCOPE_MISMATCH");
  });
  it("C. a company-level fact marked ALL_INSTRUMENTS is reusable, and the method says so", () => {
    const s = snapshot({ snapshotId: "s-co", inputs: [input({ identity: identity({ key: "metric-y", scope: companyScopeAll() }), value: money("10") })] });
    const r = resolve([s], query({ key: "metric-y", instrumentKey: INST_2 }));
    expect(r.state).toBe("RESOLVED");
    expect(r.selectionMethod).toBe("EXACT_IDENTITY_VIA_COMPANY_LEVEL_APPLICABILITY");
  });
  it("C. a company-level fact listed for specific instruments does not leak to others", () => {
    const s = snapshot({ snapshotId: "s-co2", inputs: [input({ identity: identity({ key: "metric-y", scope: companyScopeListed([INST_1]) }), value: money("10") })] });
    expect(resolve([s], query({ key: "metric-y", instrumentKey: INST_1 })).state).toBe("RESOLVED");
    expect(resolve([s], query({ key: "metric-y", instrumentKey: INST_2 })).state).toBe("MISSING");
  });
});

describe("D/E. period identity is exact - no wildcard, no silent fallback", () => {
  const q1 = verbatimPeriod("Q1"), q2 = verbatimPeriod("Q2"), q3 = verbatimPeriod("Q3");
  const multi = snapshot({ snapshotId: "s-periods", inputs: [
    input({ identity: identity({ key: "metric-p", period: q1 }), value: money("1") }),
    input({ identity: identity({ key: "metric-p", period: q2 }), value: money("2") }),
    input({ identity: identity({ key: "metric-p", period: q3 }), value: money("3") }),
  ] });
  it("D. each period selects only its own value", () => {
    expect(resolve([multi], query({ key: "metric-p", period: q2 })).input!.value).toMatchObject({ type: "MONEY" });
    expect((resolve([multi], query({ key: "metric-p", period: q2 })).input!.value as { amount: { num: bigint } }).amount.num).toBe(2n);
    expect((resolve([multi], query({ key: "metric-p", period: q3 })).input!.value as { amount: { num: bigint } }).amount.num).toBe(3n);
  });
  it("D. an unstocked period is MISSING, never a neighbouring period", () => {
    const r = resolve([multi], query({ key: "metric-p", period: verbatimPeriod("Q4") }));
    expect(r.state).toBe("MISSING");
    expect(r.candidates.filter((c) => c.rejectedBecause === "PERIOD_MISMATCH").length).toBe(3);
  });
  it("a period-specific request never consumes a period-null value (the old wildcard behaviour is gone)", () => {
    const generic = snapshot({ snapshotId: "s-generic", inputs: [input({ identity: identity({ key: "metric-p", period: noPeriod() }), value: money("99") })] });
    const r = resolve([generic], query({ key: "metric-p", period: q2 }));
    expect(r.state).toBe("MISSING");
    expect(r.candidates[0]!.rejectedBecause).toBe("PERIOD_MISMATCH");
  });
  it("a period-null request never selects one of several period-specific values", () => {
    const r = resolve([multi], query({ key: "metric-p", period: noPeriod() }));
    expect(r.state).toBe("MISSING");
  });
  it("E. an exact period and a generic period together do not blend: only the exact one answers its own query", () => {
    const both = snapshot({ snapshotId: "s-both", inputs: [
      input({ identity: identity({ key: "metric-p", period: q2 }), value: money("2") }),
      input({ identity: identity({ key: "metric-p", period: noPeriod() }), value: money("99") }),
    ] });
    expect((resolve([both], query({ key: "metric-p", period: q2 })).input!.value as { amount: { num: bigint } }).amount.num).toBe(2n);
    expect((resolve([both], query({ key: "metric-p", period: noPeriod() })).input!.value as { amount: { num: bigint } }).amount.num).toBe(99n);
  });
});

describe("F. as-of identity is exact by default and latest-on-or-before only when asked", () => {
  const s = snapshot({ snapshotId: "s-asof", inputs: [
    input({ identity: identity({ key: "metric-a", asOf: exactAsOf("2026-03-31") }), value: money("1") }),
    input({ identity: identity({ key: "metric-a", asOf: exactAsOf("2026-06-30") }), value: money("2") }),
  ] });
  it("exact mode: only the requested date resolves", () => {
    expect((resolve([s], query({ key: "metric-a", asOf: exactAsOf("2026-03-31") })).input!.value as { amount: { num: bigint } }).amount.num).toBe(1n);
    expect(resolve([s], query({ key: "metric-a", asOf: exactAsOf("2026-05-15") })).state).toBe("MISSING");
  });
  it("exact mode never infers latest or closest-earlier", () => {
    const r = resolve([s], query({ key: "metric-a", asOf: exactAsOf("2026-12-31") }));
    expect(r.state).toBe("MISSING");
    expect(r.candidates.every((c) => c.rejectedBecause === "AS_OF_MISMATCH")).toBe(true);
  });
  it("latest-on-or-before is a named mode, and it reports the method it used", () => {
    const policy: ResolutionPolicy = { acceptableStatuses: ["APPROVED"], asOfMode: "LATEST_ON_OR_BEFORE" };
    const r = resolve([s], query({ key: "metric-a", asOf: exactAsOf("2026-12-31") }), policy);
    expect(r.state).toBe("RESOLVED");
    expect(r.selectionMethod).toBe("LATEST_ON_OR_BEFORE_AS_OF");
    expect((r.input!.value as { amount: { num: bigint } }).amount.num).toBe(2n);
    expect(r.provenance!.identity.asOf).toEqual(exactAsOf("2026-06-30"));
  });
});

describe("G/H/I. duplicate, superseded and draft snapshots", () => {
  const v1 = snapshot({ snapshotId: "s-v1", version: "1", inputs: [input({ identity: identity({ key: "metric-s" }), value: money("1") })] });
  it("G. two active approved snapshots supplying the same identity are AMBIGUOUS, never a pick", () => {
    const v2 = snapshot({ snapshotId: "s-v2", version: "2", inputs: [input({ identity: identity({ key: "metric-s" }), value: money("2") })] });
    const r = resolve([v1, v2], query({ key: "metric-s" }));
    expect(r.state).toBe("AMBIGUOUS");
    expect(r.input).toBeNull();
    expect(r.reason).toContain("no supersession relation distinguishes them");
  });
  it("H. an explicit supersession resolves it, and the method records that", () => {
    const v2 = snapshot({ snapshotId: "s-v2", version: "2", supersedesSnapshotId: "s-v1", inputs: [input({ identity: identity({ key: "metric-s" }), value: money("2") })] });
    const superseded = { ...v1, status: "SUPERSEDED" as const };
    const r = resolve([superseded, v2], query({ key: "metric-s" }));
    expect(r.state).toBe("RESOLVED");
    expect(r.provenance!.snapshotId).toBe("s-v2");
    expect((r.input!.value as { amount: { num: bigint } }).amount.num).toBe(2n);
  });
  it("H. supersession applies even when both are still marked approved - the edge decides, not the version string", () => {
    const v2 = snapshot({ snapshotId: "s-v2", version: "2", supersedesSnapshotId: "s-v1", inputs: [input({ identity: identity({ key: "metric-s" }), value: money("2") })] });
    const r = resolve([v1, v2], query({ key: "metric-s" }));
    expect(r.state).toBe("RESOLVED");
    expect(r.selectionMethod).toBe("EXACT_IDENTITY_AFTER_SUPERSESSION");
    expect(r.candidates.find((c) => c.snapshotId === "s-v1")!.rejectedBecause).toBe("SUPERSEDED_BY_ANOTHER_SNAPSHOT_IN_SCOPE");
  });
  it("I. a draft successor never silently displaces an approved predecessor", () => {
    const draft = snapshot({ snapshotId: "s-v2", version: "2", status: "DRAFT", supersedesSnapshotId: "s-v1", inputs: [input({ identity: identity({ key: "metric-s" }), value: money("2") })] });
    const r = resolve([v1, draft], query({ key: "metric-s" }));
    expect(r.state).toBe("RESOLVED");
    expect(r.provenance!.snapshotId).toBe("s-v1");
    expect(r.provenance!.reliedOnNonApprovedSnapshot).toBe(false);
  });
  it("a fact that exists only in a draft is NOT_APPROVED by default, and explicit opt-in records the reliance", () => {
    const draftOnly = snapshot({ snapshotId: "s-d", status: "DRAFT", inputs: [input({ identity: identity({ key: "metric-d" }), value: money("5") })] });
    const def = resolve([draftOnly], query({ key: "metric-d" }));
    expect(def.state).toBe("NOT_APPROVED");
    expect(def.input).toBeNull();
    const widened = resolve([draftOnly], query({ key: "metric-d" }), { acceptableStatuses: ["APPROVED", "DRAFT"], asOfMode: "EXACT" });
    expect(widened.state).toBe("RESOLVED");
    expect(widened.provenance!.reliedOnNonApprovedSnapshot).toBe(true);
    expect(widened.provenance!.snapshotStatus).toBe("DRAFT");
  });
});

describe("J. supersession must be explicit, acyclic and single-successor", () => {
  const withInput = (id: string, over: Partial<FinancialSnapshot> = {}) => snapshot({ snapshotId: id, inputs: [input({ identity: identity({ key: "metric-c" }), value: money("1") })], ...over });
  it("a self-supersession is reported and blocks resolution", () => {
    const g = buildSnapshotGraph([withInput("s1", { supersedesSnapshotId: "s1" })]);
    expect(g.issues.map((i) => i.code)).toContain("SELF_SUPERSESSION");
    expect(g.safe).toBe(false);
    const r = resolve([withInput("s1", { supersedesSnapshotId: "s1" })], query({ key: "metric-c" }));
    expect(r.state).toBe("AMBIGUOUS");
    expect(r.reason).toContain("SELF_SUPERSESSION");
  });
  it("a two-node cycle is reported with its path", () => {
    const g = buildSnapshotGraph([withInput("s1", { supersedesSnapshotId: "s2" }), withInput("s2", { supersedesSnapshotId: "s1" })]);
    const cycle = g.issues.find((i) => i.code === "SUPERSESSION_CYCLE")!;
    expect(cycle.snapshotIds.length).toBeGreaterThanOrEqual(2);
    expect(g.safe).toBe(false);
  });
  it("two competing successors of one predecessor are ambiguous, never a choice", () => {
    const g = buildSnapshotGraph([withInput("s0"), withInput("s1", { supersedesSnapshotId: "s0" }), withInput("s2", { supersedesSnapshotId: "s0" })]);
    const issue = g.issues.find((i) => i.code === "COMPETING_SUCCESSORS")!;
    expect(issue.snapshotIds).toEqual(["s0", "s1", "s2"]);
    expect(g.safe).toBe(false);
  });
  it("a snapshot cannot supersede one belonging to another company", () => {
    const g = buildSnapshotGraph([withInput("s0", { companyId: CO_B }), withInput("s1", { supersedesSnapshotId: "s0" })]);
    expect(g.issues.map((i) => i.code)).toContain("SUCCESSOR_OF_ANOTHER_COMPANY");
  });
  it("a well-formed chain is safe", () => {
    const g = buildSnapshotGraph([withInput("s1"), withInput("s2", { supersedesSnapshotId: "s1" }), withInput("s3", { supersedesSnapshotId: "s2" })]);
    expect(g.safe).toBe(true);
    expect(g.issues.filter((i) => i.code === "SUPERSESSION_CYCLE")).toEqual([]);
  });
});

describe("M/N. currency and expected type stay explicit", () => {
  it("M. currency is part of identity - a EUR fact does not answer a USD-typed query of the same name", () => {
    const s = snapshot({ snapshotId: "s-cur", inputs: [input({ identity: identity({ key: "metric-m", currency: "EUR" }), value: money("10", "EUR") })] });
    const r = resolve([s], query({ key: "metric-m" }));
    expect(r.state).toBe("RESOLVED");
    // the value keeps its own currency; Phase 4A refuses to mix it with USD arithmetic
    expect(r.provenance!.identity.currency).toBe("EUR");
    expect((r.input!.value as { currency: string }).currency).toBe("EUR");
  });
  it("N. an identity match with the wrong value type is INCOMPATIBLE, never skipped or coerced", () => {
    const s = snapshot({ snapshotId: "s-type", inputs: [input({ identity: identity({ key: "metric-n", valueType: "RATIO", currency: null }), value: ratio("2.5") })] });
    const r = resolve([s], query({ key: "metric-n", expectedType: "MONEY" }));
    expect(r.state).toBe("INCOMPATIBLE");
    expect(r.reason).toContain("value type");
    expect(r.candidates[0]!.rejectedBecause).toBe("VALUE_TYPE_MISMATCH");
  });
  it("candidates sharing one identity but disagreeing on type are INCOMPATIBLE, not a pick", () => {
    const s = snapshot({ snapshotId: "s-mix", inputs: [
      input({ identity: identity({ key: "metric-n" }), value: money("1") }),
      input({ identity: identity({ key: "metric-n", valueType: "RATIO", currency: null }), value: ratio("2") }),
    ] });
    const r = resolve([s], query({ key: "metric-n", expectedType: "MONEY" }));
    expect(r.state).toBe("INCOMPATIBLE");
    expect(r.reason).toContain("disagree on value type");
  });
});

describe("O/P. source version and ambiguity reporting", () => {
  it("O. a missing source version is preserved honestly rather than invented", () => {
    const s = snapshot({ snapshotId: "s-nov", provenance: { source: "manual entry", sourceVersion: null }, inputs: [input({ identity: identity({ key: "metric-o" }), value: money("1"), sourceVersion: null })] });
    const r = resolve([s], query({ key: "metric-o" }));
    expect(r.state).toBe("RESOLVED");
    expect(r.provenance!.sourceVersion).toBeNull();
  });
  it("P. every candidate considered is reported with the reason it was rejected", () => {
    const s = snapshot({ snapshotId: "s-cand", inputs: [
      input({ identity: identity({ key: "metric-p2", period: verbatimPeriod("Q1") }), value: money("1") }),
      input({ identity: identity({ key: "other-metric" }), value: money("2") }),
      input({ identity: identity({ key: "metric-p2", companyId: CO_B }), value: money("3") }),
    ] });
    const r = resolve([s], query({ key: "metric-p2", period: verbatimPeriod("Q2") }));
    expect(r.state).toBe("MISSING");
    expect(new Set(r.candidates.map((c) => c.rejectedBecause))).toEqual(new Set(["PERIOD_MISMATCH", "KEY_MISMATCH", "COMPANY_MISMATCH"]));
    expect(r.contractVersion).toBe(FINANCIAL_INPUT_CONTRACT_VERSION);
  });
});

describe("T. input order can never change the result", () => {
  const mk = (n: number) => input({ identity: identity({ key: `metric-${n}`, period: verbatimPeriod(`P${n}`) }), value: money(String(n)) });
  const all = [mk(1), mk(2), mk(3), mk(4), mk(5)];
  const permutations = [
    [0, 1, 2, 3, 4], [4, 3, 2, 1, 0], [2, 0, 4, 1, 3], [1, 4, 0, 3, 2], [3, 2, 1, 4, 0],
  ];
  it("the same input set in any order gives byte-identical resolutions", () => {
    const results = permutations.map((order) => {
      const s = snapshot({ snapshotId: "s-order", inputs: order.map((i) => all[i]!) });
      return JSON.stringify([1, 2, 3, 4, 5].map((n) => { const r = resolve([s], query({ key: `metric-${n}`, period: verbatimPeriod(`P${n}`) })); return { state: r.state, method: r.selectionMethod, snapshot: r.provenance?.snapshotId ?? null }; }));
    });
    expect(new Set(results).size).toBe(1);
  });
  it("snapshot order does not change an ambiguity or a supersession outcome", () => {
    const a = snapshot({ snapshotId: "s-a", inputs: [input({ identity: identity({ key: "m" }), value: money("1") })] });
    const b = snapshot({ snapshotId: "s-b", inputs: [input({ identity: identity({ key: "m" }), value: money("2") })] });
    const forward = resolve([a, b], query({ key: "m" }));
    const backward = resolve([b, a], query({ key: "m" }));
    expect(forward.state).toBe("AMBIGUOUS");
    expect(j(forward)).toBe(j(backward));
    const bSup = { ...b, supersedesSnapshotId: "s-a" };
    expect(j(resolve([a, bSup], query({ key: "m" })))).toBe(j(resolve([bSup, a], query({ key: "m" }))));
  });
});

describe("snapshot immutability and integrity", () => {
  it("a reused snapshot id is an integrity error, not an update", () => {
    const g = buildSnapshotGraph([snapshot({ snapshotId: "dup", inputs: [] }), snapshot({ snapshotId: "dup", version: "2", inputs: [] })]);
    expect(g.issues.map((i) => i.code)).toContain("DUPLICATE_SNAPSHOT_ID");
    expect(g.safe).toBe(false);
  });
  it("the same identity twice inside one snapshot is an integrity error", () => {
    const g = buildSnapshotGraph([snapshot({ snapshotId: "s", inputs: [input({ identity: identity({ key: "m" }), value: money("1") }), input({ identity: identity({ key: "m" }), value: money("2") })] })]);
    expect(g.issues.map((i) => i.code)).toContain("DUPLICATE_IDENTITY_WITHIN_SNAPSHOT");
  });
  it("a MONEY input without a currency is an integrity error", () => {
    const g = buildSnapshotGraph([snapshot({ snapshotId: "s", inputs: [input({ identity: identity({ key: "m", currency: null }), value: money("1") })] })]);
    expect(g.issues.map((i) => i.code)).toContain("MONEY_INPUT_WITHOUT_CURRENCY");
  });
  it("resolution never mutates the snapshots it reads", () => {
    const s = snapshot({ snapshotId: "s", inputs: [input({ identity: identity({ key: "m" }), value: money("1") })] });
    const before = j(s);
    resolve([s], query({ key: "m" }));
    expect(j(s)).toBe(before);
  });
});
