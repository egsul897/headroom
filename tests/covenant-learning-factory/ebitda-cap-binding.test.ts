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
    expect(clauseRefPaths("(c)(ii), (c)(v) and clause (c)(viii)").paths.map((p) => p.join(""))).toEqual(["(c)(ii)", "(c)(v)", "(c)(viii)"]);
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
  it("a deictic self-reference joined with a later clause binds the stating line and the later one", () => {
    const o = run("plus (g) costs of consolidating warehouses; plus (h) lease termination payments, provided that amounts included under this clause (h) and clause (j) below, collectively, shall not exceed $2,750,000 in any Test Period; plus (i) amortization of deferred financing fees; plus (j) expected synergies from acquisitions.");
    expect(grp(o, "(h)")).toBe("(h),(j)");
    expect(grp(o, "(j)")).toBe("(h),(j)");
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

describe("cap verb with an adverbial between 'not' and 'exceed'", () => {
  it("'shall not in the aggregate exceed $3,000,000 in any fiscal year' caps the line at $3,000,000", () => {
    const o = run("plus (d) restructuring charges; provided that amounts added back pursuant to this clause (d) shall not in the aggregate exceed $3,000,000 in any fiscal year; plus (e) non-cash stock-based compensation expense.");
    expect(line(o, "(d)").cap?.amount).toBe(String(3 * M));
    expect(line(o, "(d)").claimed).toBe(String(3 * M));
    expect(line(o, "(e)").cap).toBeFalsy();
  });
  it("'shall not cumulatively exceed 10% of Consolidated EBITDA for any Test Period' is a per-period percentage cap", () => {
    const o = run("plus (d) restructuring charges; provided, further, that the aggregate amount added back pursuant to this clause (d) (excluding one-time integration costs) shall not cumulatively exceed 10% of Consolidated EBITDA for any Test Period; plus (e) non-cash stock-based compensation expense.");
    const d = line(o, "(d)");
    expect(d.cap).toBeTruthy();
    expect(d.note ?? "").not.toMatch(/cumulative/);
  });
  it("'shall not cumulatively exceed $2,000,000' with no period is cumulative (no per-period room)", () => {
    const o = run("plus (d) severance charges; provided that the aggregate amount added back pursuant to this clause (d) shall not cumulatively exceed $2,000,000; plus (e) non-cash stock-based compensation expense.");
    const d = line(o, "(d)");
    expect(d.cap?.amount).toBeNull();
    expect(d.note).toMatch(/cumulative/);
  });
});

describe("reference resolution: self-references, headings, ambiguity, letter case, measure clauses", () => {
  const nested = (items: string) =>
    optimizeConsolidatedEbitda("Consolidated EBITDA", def(`(a) Consolidated Net Income for such period, plus (b) without duplication, (i) provision for taxes based on income; (ii) interest expense; (iii) depreciation and amortization expense; ${items} minus (c) non-cash gains;`), fin);

  it("'this clause (b)(iv)' written in line (iv) under (b) is the stating line's own cap, with its amount", () => {
    const o = nested("(iv) severance charges, provided that the amount added back pursuant to this clause (b)(iv) shall not exceed $2,000,000 for such period; (v) non-cash stock-based compensation expense;");
    const l = line(o, "(iv)");
    expect(l.cap?.amount).toBe("2000000");
    expect(l.cap?.note ?? "").not.toMatch(/unresolved/);
    expect(line(o, "(v)").cap).toBeNull();
  });

  it("a parenthetical naming the parent clause only to define the cap's measure is not the cap's scope", () => {
    const o = nested("(iv) costs of system conversions, provided that the amount included under this clause (iv) shall not exceed 7.5% of Consolidated EBITDA (calculated before any amounts included under this clause (b)) and such amount shall not exceed $3,250,000 in such period; (v) fees paid to outside consultants, provided that the aggregate amount included under this clause (v) shall not exceed $1,750,000 in such period;");
    expect(line(o, "(iv)").cap?.note ?? "").not.toMatch(/unresolved/);
    expect(o.needsInput.join(" ")).not.toMatch(/\(b\) not/);
    expect(line(o, "(v)").cap?.amount).toBe("1750000");
    for (const lab of ["(i)", "(ii)", "(iii)"]) expect(line(o, lab).cap).toBeNull();
  });

  it("a reference to a heading-only enumerator binds every line under it", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", `ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower determined on a consolidated basis in accordance with GAAP.
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (1) provision for taxes based on income; plus (2) interest expense; plus (3) depreciation and amortization expense; plus (4) unusual or non-recurring items; plus (5) (m) (P) costs of closing call centres, (Q) data migration expenses and (R) recruiting fees, provided that the aggregate amount included under this clause (m) for any period shall not exceed $1,850,000, and (n) (P) retention payments and (Q) moving costs of employees; plus (6) non-cash stock-based compensation expense.
"Default" means any event of default.
`, fin);
    // (m) is folded into item (5): the cap limits that part of (5); whichever way the heading is segmented, the lines
    // under (m) are never left uncapped and the cap never reaches a neighbouring item.
    const underM = o.addBacks.filter((a) => a.label === "(5)" || /^\([P-R]\)$/.test(a.label));
    expect(underM.length).toBeGreaterThan(0);
    for (const a of underM) expect(a.cap?.text ?? "").toContain("1,850,000");
    expect(line(o, "(6)").cap).toBeNull();
    expect(line(o, "(4)").cap).toBeNull();
  });

  it("an ambiguous reference never leaves a named clause uncapped and blocks MAXIMIZED", () => {
    const o = run("plus (d) (i) restructuring charges and (ii) integration costs; plus (e) (i) severance charges and (ii) relocation expenses; plus (f) costs of opening new facilities; provided that the aggregate amount added back pursuant to clauses (f) and (ii) shall not exceed $5,000,000;");
    const twos = o.addBacks.filter((a) => a.label === "(ii)");
    if (twos.length > 1) for (const t of twos) { expect(t.cap).not.toBeNull(); expect(t.claimed).toBe("0"); }
    expect(line(o, "(f)").cap).not.toBeNull();
    expect(o.status).not.toBe("MAXIMIZED");
  });

  it("a mixed-case path names the upper-case sub-item, never the same lower-case letter at the top level", () => {
    const o = run("plus (d) (B) write-offs of capitalized software and (C) expected benefits of supplier renegotiations; plus (e) earn-out payments; provided that the aggregate amount included under clauses (d)(C) and (e) shall not exceed 12.5% of Consolidated EBITDA;");
    expect(line(o, "(c)").cap).toBeNull();
    expect(line(o, "(e)").cap).not.toBeNull();
  });
});
