/**
 * Cap binding (grok/ebitda-cap-binding). Synthetic clauses only, written from the mechanism — never from a measured
 * sample agreement. A shared cap binds every clause its sentence names (lists, repeated "clause" words, ranges, compound
 * paths), wherever the sentence sits (inside a line, in a deduction, or in a trailing sentence). A reference that cannot
 * be bound to exactly one clause makes the cap capped-unknown — never uncapped. A cumulative "during the term" cap has
 * no determinable per-period room.
 */
import { describe, expect, it } from "vitest";
import { clauseRefPaths, optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { computeEbitdaBox, confirmEbitdaItem } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";
import { fakeStore } from "./ebitda-box-fixture";

const M = 1_000_000;
const row = (concept: string, v: number) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const fin: IssuerFinancials = { cik: "0000000001", entityName: "T", missing: [], anchor: "2026-06-30", fiscalYear: 2026, values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, RestructuringCharges: 9 * M, ShareBasedCompensation: 7 * M }).map(([c, v]) => row(c, v)) };
const def = (body: string) => `ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: ${body}
"Default" means any event of default.
`;
const CORE = "(a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense;";
const run = (body: string) => optimizeConsolidatedEbitda("Consolidated EBITDA", def(`${CORE} ${body}`), fin);
const line = (o: ReturnType<typeof run>, label: string) => o.addBacks.find((l) => l.label === label)!;
const grp = (o: ReturnType<typeof run>, label: string) => (line(o, label).capGroup ?? []).join(",");

describe("clause-reference grammar", () => {
  it("expands letter, roman and digit ranges and keeps compound paths", () => {
    expect(clauseRefPaths("(d) through (g)").paths.map((p) => p.join(""))).toEqual(["(d)", "(e)", "(f)", "(g)"]);
    expect(clauseRefPaths("(ii)–(iv)").paths.map((p) => p.join(""))).toEqual(["(ii)", "(iii)", "(iv)"]);
    expect(clauseRefPaths("(3) to (5)").paths.map((p) => p.join(""))).toEqual(["(3)", "(4)", "(5)"]);
    expect(clauseRefPaths("(b)(vi), (b)(ix) and clause (b)(xi)").paths.map((p) => p.join(""))).toEqual(["(b)(vi)", "(b)(ix)", "(b)(xi)"]);
    expect(clauseRefPaths("(A) through (D)").paths.map((p) => p.join(""))).toEqual(["(A)", "(B)", "(C)", "(D)"]);
  });
  it("a range readable two ways is kept only when the definition's labels support one reading", () => {
    const romanOnly = (l: string) => ["(i)", "(ii)", "(iii)", "(iv)", "(v)"].includes(l);
    expect(clauseRefPaths("(i) through (v)", romanOnly).paths.map((p) => p.join(""))).toEqual(["(i)", "(ii)", "(iii)", "(iv)", "(v)"]);
    expect(clauseRefPaths("(i) through (v)").unresolvedRanges).toEqual(["(i)–(v)"]);
  });
});

describe("shared caps bind every clause the sentence names", () => {
  it("a range ('clauses (d) through (f)') caps the middle clause too", () => {
    const o = run("plus (d) severance charges; plus (e) integration costs; plus (f) costs of opening new stores; plus (g) non-cash stock-based compensation expense; provided that the aggregate amount added back pursuant to clauses (d) through (f) shall not exceed $5,000,000 for any period.");
    for (const l of ["(d)", "(e)", "(f)"]) expect(grp(o, l)).toBe("(d),(e),(f)");
    expect(line(o, "(e)").cap?.amount).toBe(String(5 * M));
    expect(line(o, "(g)").cap).toBeNull();
  });
  it("a dash range in a trailing sentence binds the named clauses and creates no phantom line", () => {
    const o = run("plus (d) severance charges; plus (e) integration costs; plus (f) costs of opening new stores; plus (g) non-cash stock-based compensation expense. The aggregate amount of add-backs made pursuant to clauses (d)–(f) above shall not exceed $5,000,000 in any Test Period.");
    expect(o.addBacks.filter((l) => l.label === "(f)").length).toBe(1);
    for (const l of ["(d)", "(e)", "(f)"]) expect(line(o, l).cap?.amount).toBe(String(5 * M));
  });
  it("'this clause (d) and clause (e) below, taken together' binds both", () => {
    const o = run("plus (d) severance charges; provided that the aggregate amount added in reliance on this clause (d) and clause (e) below, taken together, shall not exceed $6,000,000 for any period; plus (e) projected cost savings and synergies; plus (f) non-cash stock-based compensation expense.");
    expect(grp(o, "(d)")).toBe("(d),(e)");
    expect(grp(o, "(e)")).toBe("(d),(e)");
  });
  it("a cap written inside a deduction clause still binds the add-backs it names", () => {
    const o = run("plus (d) severance charges; plus (e) integration costs; plus (f) non-cash stock-based compensation expense; minus (g) non-cash gains included in Consolidated Net Income; provided that the aggregate amount added back pursuant to clauses (d) and (e) shall not exceed $4,000,000 in any period.");
    expect(line(o, "(d)").cap?.amount).toBe(String(4 * M));
    expect(grp(o, "(e)")).toBe("(d),(e)");
    expect(line(o, "(f)").cap).toBeNull();
  });
  it("a trailing 'Notwithstanding' sentence after a deduction binds compound references ('(a)(v)')", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", def("(a) the sum of, without duplication, (i) provision for taxes based on income, (ii) interest expense, (iii) depreciation and amortization expense, (iv) non-cash stock-based compensation expense, (v) severance charges, (vi) integration costs and (vii) costs of opening new stores, minus (b) non-cash gains. Notwithstanding the foregoing, the aggregate amount added back pursuant to clauses (a)(v) and (a)(vii) shall not exceed $3,000,000 for any period."), fin);
    expect(grp(o, "(v)")).toBe("(v),(vii)");
    expect(line(o, "(vii)").cap).not.toBeNull();
    expect(line(o, "(vi)").cap).toBeNull();
  });
  it("'clause (d)(i)' where (i) sits inside line (d) bounds (d) (never leaves it uncapped)", () => {
    const o = run("plus (d) (i) severance charges and (ii) relocation costs; plus (e) projected cost savings; plus (f) non-cash stock-based compensation expense; provided that the aggregate amount added back pursuant to clauses (d)(i) and (e) shall not exceed $2,000,000.");
    expect(line(o, "(d)").cap).not.toBeNull();
    expect(grp(o, "(d)")).toBe("(d),(e)");
  });
});

describe("unresolved binding is capped-unknown, never uncapped", () => {
  it("a named clause that does not exist makes the cap undetermined on the clauses it does bind", () => {
    const o = run("plus (d) severance charges; plus (e) non-cash stock-based compensation expense; provided that the aggregate amount added back pursuant to clauses (d) and (q) shall not exceed $2,000,000.");
    const d = line(o, "(d)");
    expect(d.cap).not.toBeNull();
    expect(d.cap?.amount).toBeNull();
    expect(d.claimed).toBe("0");
    expect(d.status).toBe("NEEDS_INPUT");
    expect(o.maximum).toBeNull();
  });
  it("a cap that names only missing clauses is reported, and the result is never MAXIMIZED", () => {
    const o = run("plus (d) non-cash stock-based compensation expense; minus (e) non-cash gains included in Consolidated Net Income; provided that the aggregate amount added back pursuant to clauses (r) and (s) shall not exceed $1,000,000.");
    expect(o.needsInput.some((x) => /names .*\(r\).* not found/.test(x))).toBe(true);
    expect(o.status).toBe("NEEDS_INPUT");
  });
  it("the CFO confirm path refuses an amount on a capped-unknown line (no revenue / base plausibility fallback)", async () => {
    const text = def(`${CORE} plus (d) costs of new systems implementation; plus (e) non-cash stock-based compensation expense; provided that the aggregate amount added back pursuant to clauses (d) and (q) shall not exceed $2,000,000.`);
    const a = { sourceId: "cap-unresolved", text, issuerCik: "1", financials: fin };
    const item = computeEbitdaBox(a).items.find((i) => i.label === "(d)")!;
    expect(item.potentialBasis).toBe("CAP_UNKNOWN");
    const out = await confirmEbitdaItem(fakeStore(), { companyId: "c", documentId: "d" }, a, { inputKey: item.inputKey, value: String(1 * M), source: "management accounts", confirmedBy: "cfo@x" });
    expect(out).toMatchObject({ ok: false, status: 422, code: "CAP_UNRESOLVED" });
  });
});

describe("per-period vs cumulative caps", () => {
  it("'during the term of this Agreement shall not exceed' is cumulative: no per-period room is assumed", () => {
    const o = run("plus (d) severance charges; provided that the aggregate amount added back pursuant to this clause (d) during the term of this Agreement shall not exceed $4,000,000; plus (e) non-cash stock-based compensation expense.");
    const d = line(o, "(d)");
    expect(d.cap?.amount).toBeNull();
    expect(d.claimed).toBe("0");
    expect(d.note).toMatch(/cumulative/);
  });
  it("'$4,000,000 for any period during the term of this Agreement' is a per-period cap", () => {
    const o = run("plus (d) restructuring charges in an aggregate amount not to exceed $4,000,000 for any period during the term of this Agreement; plus (e) non-cash stock-based compensation expense.");
    expect(line(o, "(d)").cap?.amount).toBe(String(4 * M));
    expect(line(o, "(d)").claimed).toBe(String(4 * M));
  });
});

describe("definition lookup: colon convention", () => {
  it("finds a \u201cTerm\u201d: definition and ends it at the next colon-style or means-style term", async () => {
    const { findDefinitionText, findEbitdaMeasureTerm } = await import("../../lib/covenant-learning-factory/xbrl/definition-items");
    const doc = [
      "\u201cCapital Expenditures\u201d: for any period, additions to property.",
      "\u201cConsolidated EBITDA\u201d: for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in computing Consolidated Net Income, (a) interest expense, (b) provision for taxes based on income, (c) depreciation and amortization expense and (d) non-cash charges; provided that the aggregate amount added back pursuant to clause (d) shall not exceed $5,000,000 for any period.",
      "\u201cConsolidated Net Income\u201d: for any period, the net income of the Borrower.",
      "\u201cFixed Charges\u201d means, for any period, cash interest expense.",
    ].join("\n");
    expect(findEbitdaMeasureTerm(doc)).toBe("Consolidated EBITDA");
    const def = findDefinitionText(doc, "Consolidated EBITDA")!;
    expect(def).toMatch(/^"Consolidated EBITDA": for any period/);
    expect(def).toContain("$5,000,000 for any period.");
    expect(def).not.toContain("Consolidated Net Income\": for any period, the net income");
    // a quoted word followed by a colon with no space is not a definition
    expect(findDefinitionText("\u201cAttention\u201d:Treasurer", "Attention")).toBeNull();
  });
});
