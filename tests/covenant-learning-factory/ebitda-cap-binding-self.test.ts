/**
 * #432 review fixes. Synthetic clauses written from the grammar only: never text, labels or amounts from a measured
 * sample, the frozen set or a dev-set agreement.
 * - A cap stated inside a line always limits that line, including when its self-reference is a parent path.
 * - The scope window does not reach into other definitions or sections; a cap shared with a clause outside this
 *   definition keeps its stated amount as a ceiling but the room needs the outside usage.
 * - A cap in another currency is never read as US dollars.
 * - End to end: no line stating its own cap ever confirms above it.
 */
import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { computeEbitdaBox, confirmEbitdaItem } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { runCovenantComputation } from "@/lib/contract-model/covenant-computation";
import { nonUsdCurrency } from "@/lib/contract-model/covenant-computation/currency";
import { fakeStore, fin } from "./ebitda-box-fixture";

const M = 1_000_000;
const def = (body: string) => `ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: ${body}
"Default" means any event of default.
`;
const CORE = "(a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense;";
const run = (body: string) => optimizeConsolidatedEbitda("Consolidated EBITDA", def(`${CORE} ${body}`), fin);
type O = ReturnType<typeof run>;
const lines = (o: O, label: string) => o.addBacks.filter((l) => l.label === label);
const line = (o: O, label: string) => lines(o, label)[0]!;

describe("B1: a cap stated inside a line limits that line", () => {
  const nested = (items: string) => run(`plus (d) the sum of (i) non-cash stock-based compensation expense, (ii) costs of plant relocations, (iii) litigation settlement costs, ${items} plus (e) losses on asset sales;`);

  it("a parent-path self-reference ('this clause (d)(vi) and clause (d)(iv) above') binds the stating line", () => {
    const o = nested("(iv) costs of exiting product lines, (v) costs of retooling, (vi) costs of discontinued pilot programs; provided that the aggregate amount included under this clause (d)(vi) and clause (d)(iv) above shall not exceed $6,500,000 for any Test Period;");
    for (const lab of ["(iv)", "(vi)"]) expect(line(o, lab).cap?.amount).toBe(String(6.5 * M));
    expect(line(o, "(v)").cap).toBeNull();
  });

  it("sub-items under the stating line that restart its own enumeration are all bound", () => {
    const o = nested("(iv) costs of exiting product lines, (v) costs of retooling, (vi) (i) warranty reserve true-ups and (ii) costs of discontinued pilot programs; provided that the aggregate amount included under this clause (d)(vi) and clause (d)(iv) above shall not exceed $6,500,000 for any Test Period;");
    const capped = o.addBacks.filter((l) => l.cap?.amount === String(6.5 * M)).map((l) => l.text);
    expect(capped.some((c) => /warranty/.test(c))).toBe(true);
    expect(capped.some((c) => /pilot/.test(c))).toBe(true);
    expect(capped.some((c) => /exiting/.test(c))).toBe(true);
    expect(line(o, "(v)").cap).toBeNull();
  });
});

describe("B1: a deictic reference to an enclosing clause", () => {
  it("'this clause (a)(vi)(y)' written in a split-out sub-item binds the named clause and every line through the stating one", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", def("(a) the sum of (i) provision for taxes based on income, (ii) interest expense, (iii) depreciation and amortization expense, (iv) costs of closing warehouses, (v) fees of outside advisers in connection with any financing and (vi) (x) fees of underwriters, (y) costs of pursuing acquisitions, including (i) diligence expenses, (ii) retention bonuses, (iii) option payouts and (iv) earn-out payments; provided that the aggregate amount included under this clause (a)(vi)(y) shall not exceed $2,200,000, and (z) costs of share offerings, (vii) losses on asset sales; minus (b) non-cash gains;"), fin);
    for (const t of ["diligence", "retention", "option payouts", "earn-out", "underwriters"]) expect(o.addBacks.find((l) => l.text.includes(t))!.cap?.amount, t).toBe("2200000");
    expect(o.addBacks.find((l) => l.text.includes("warehouses"))!.cap).toBeNull();
    expect(o.addBacks.find((l) => l.text.includes("asset sales"))!.cap).toBeNull();
  });
});

describe("B2: scope never reaches outside the definition, and readable caps are kept", () => {
  it("a reference to a clause of another definition is not this definition's clause: the line keeps its own cap", () => {
    const o = run("plus (d) fees paid to outside auditors in connection with any Permitted Acquisition (as described in clause (4) of the definition of Permitted Acquisition), provided that amounts included under this clause (d) shall not exceed $275,000 in any period; plus (e) non-cash stock-based compensation expense; plus (4) amortization of customer lists;");
    expect(line(o, "(d)").cap?.amount).toBe("275000");
    expect(line(o, "(4)").cap).toBeNull();
  });

  it("a Section reference is not a clause of this definition", () => {
    const o = run("plus (d) costs of the inventory write-down required by Section 6.12(f), provided that amounts included under this clause (d) shall not exceed $425,000 for any period; plus (e) non-cash stock-based compensation expense; plus (f) amortization of customer lists;");
    expect(line(o, "(d)").cap?.amount).toBe("425000");
    expect(line(o, "(f)").cap).toBeNull();
  });

  it("a cap shared with a clause outside this definition: stated amount shown as the ceiling, room needs the outside usage", () => {
    const o = run("plus (d) costs of relocating offices; plus (e) non-cash stock-based compensation expense; provided that amounts included under clause (d) above, together with amounts deducted under clause (3) of the definition of Excess Cash Flow, shall not exceed $1,200,000 in any period;");
    const c = line(o, "(d)").cap!;
    expect(c).not.toBeNull();
    expect(c.amount).toBeNull();
    expect(c.note).toMatch(/at most \$1,200,000/);
    expect(line(o, "(e)").cap).toBeNull();
  });
});

describe("reviewer notes: cautious-direction phrasing", () => {
  it("'set forth in clauses', 'paragraphs', 'shall in no event exceed' and comma adverbs bind", () => {
    const a = run("plus (d) costs of renegotiating supply contracts; plus (e) costs of rebranding; plus (f) non-cash stock-based compensation expense; provided that the amounts set forth in clauses (d) and (e) shall in no event exceed $900,000 for any period;");
    for (const lab of ["(d)", "(e)"]) expect(line(a, lab).cap?.amount).toBe("900000");
    const b = run("plus (d) costs of renegotiating supply contracts; plus (e) costs of rebranding; plus (f) non-cash stock-based compensation expense; provided that amounts included under paragraphs (d) and (e) shall not, in the aggregate, exceed $900,000 for any period;");
    for (const lab of ["(d)", "(e)"]) expect(line(b, lab).cap?.amount).toBe("900000");
    expect(line(b, "(f)").cap).toBeNull();
  });

  it("lifetime phrasings are cumulative: no per-period room, stated amount shown as the ceiling", () => {
    for (const span of ["over the life of the Loans", "for all such periods", "from and after the Closing Date", "during the term hereof"]) {
      const o = run(`plus (d) costs of renegotiating supply contracts, provided that amounts included under this clause (d) ${span} shall not exceed $2,400,000; plus (e) non-cash stock-based compensation expense;`);
      const c = line(o, "(d)").cap!;
      expect(c.amount, span).toBeNull();
      expect(c.note, span).toMatch(/cumulative/);
      expect(c.note, span).toMatch(/at most \$2,400,000/);
    }
  });
});

describe("reviewer note: a sub-clause list continues its parent path", () => {
  const body = (ref: string) => `plus (d) the sum of (i) non-cash stock-based compensation expense, (ii) (A) costs of plant consolidations, (B) costs of new product launches and (C) losses on hedging terminations; provided that the aggregate amount added back pursuant to ${ref} for any Test Period, when taken together with amounts added back pursuant to clause (e), shall not exceed 15% of Consolidated EBITDA for such period; plus (e) projected cost synergies; plus (f) the sum of (i) losses on early extinguishment of debt, (ii) (A) severance costs, (B) office relocation costs and (C) fees paid to the agent;`;
  for (const ref of ["clauses (d)(ii)(A) and (B)", "clauses (A) and (B) of this clause (ii)"]) {
    it(`'${ref}' reads as (ii)(A) + (ii)(B), not every (A)/(B) in the definition`, () => {
      const o = run(body(ref));
      const capped = o.addBacks.filter((l) => l.cap).map((l) => l.text);
      expect(capped.some((c) => /plant consolidations/.test(c))).toBe(true);
      expect(capped.some((c) => /product launches/.test(c))).toBe(true);
      expect(capped.some((c) => /synergies/.test(c))).toBe(true);
      expect(capped.some((c) => /hedging|severance|office relocation|extinguishment|fees paid/.test(c))).toBe(false);
      for (const l of o.addBacks.filter((x) => x.cap)) expect(l.cap!.note).not.toMatch(/unresolved/);
    });
  }
});

describe("currency: a non-USD cap is never read as US dollars", () => {
  it("detects non-USD amount markers and leaves US dollars alone", () => {
    expect(nonUsdCurrency("the Dollar Equivalent of A$40.0 million")).toBe("A$");
    expect(nonUsdCurrency("€12,500,000 in the aggregate")).toBe("€");
    expect(nonUsdCurrency("GBP 8,000,000")).toBe("GBP");
    expect(nonUsdCurrency("18 million pounds sterling")).toMatch(/pounds/);
    expect(nonUsdCurrency("US$15,000,000")).toBeNull();
    expect(nonUsdCurrency("$15,000,000")).toBeNull();
  });
  it("a basket stated in another currency is held, not computed in USD", () => {
    const pkg = { packageKey: "p", companyId: "c", instrumentKey: "i", asOf: "2026-10-15", documents: [{ documentId: "d", text: "" }], baskets: [] as unknown[] };
    const text = "Liens securing obligations of Foreign Subsidiaries in an aggregate amount not to exceed the Dollar Equivalent of NZ$30.0 million at any time outstanding";
    pkg.documents[0]!.text = text;
    pkg.baskets = [{ stableKey: "b", sectionRef: "7.01(t)", covenantFamily: "LIENS", documentId: "d", operativeText: text }];
    const b = runCovenantComputation(pkg as never, { createdAt: "1970-01-01T00:00:00.000Z" } as never).baskets[0]!;
    expect(b.capStatus).toBe("NEEDS_INPUT");
    expect(b.capCanonical).toBeNull();
    expect(b.capCurrency).not.toBe("USD");
    expect(b.missingInputs.join(" ")).toMatch(/NZ\$ to USD/);
  });
  it("an EBITDA add-back cap in another currency is capped-unknown, never a USD amount", () => {
    const o = run("plus (d) costs of closing overseas branches, provided that amounts included under this clause (d) shall not exceed €3,000,000 for any period; plus (e) non-cash stock-based compensation expense;");
    const c = line(o, "(d)").cap!;
    expect(c).not.toBeNull();
    expect(c.amount).toBeNull();
  });
});

describe("E2E guard: no line stating its own cap ever confirms above that cap", () => {
  const variants = [
    "plus (d) costs of opening distribution centres, provided that amounts included under this clause (d) shall not exceed $1,300,000 for any period;",
    "plus (d) costs of opening distribution centres, provided that in no event shall amounts included under this clause (d) exceed $1,300,000 for any period;",
    "plus (d) costs of opening distribution centres, provided that amounts included under this clause (d) shall not, in the aggregate, exceed $1,300,000 for any period;",
    "plus (d) costs of opening distribution centres, in an aggregate amount not to exceed $1,300,000 for any period;",
    "plus (d) the sum of (i) costs of opening distribution centres and (ii) costs of closing showrooms, provided that the aggregate amount included under this clause (d)(i) shall not exceed $1,300,000 for any period;",
  ];
  for (const [k, v] of variants.entries()) {
    it(`variant ${k + 1}: confirming $500M counts at most the $1.3M cap`, async () => {
      const a = { sourceId: `self-cap-${k}`, text: def(`${CORE} ${v} plus (e) non-cash stock-based compensation expense;`), issuerCik: "1", financials: fin };
      const item = computeEbitdaBox(a).items.find((i) => /distribution centres/.test(i.clause))!;
      expect(item, "line found").toBeTruthy();
      expect(item.cap?.amount).toBe(String(1.3 * M));
      const out = await confirmEbitdaItem(fakeStore(), { companyId: "c", documentId: "d" }, a, { inputKey: item.inputKey, value: String(500 * M), source: "management accounts", confirmedBy: "cfo@x" });
      if (out.ok) {
        const after = out.box.items.find((i) => i.inputKey === item.inputKey)!;
        expect(BigInt(after.counted)).toBeLessThanOrEqual(BigInt(1.3 * M));
      } else expect(out.status).toBe(422);
    });
  }
  // A trailing cap that names other clauses and refers to its own line without a label ("this clause", "the foregoing
  // amounts", "such amounts", "hereunder") limits the stating line too.
  const shared = [
    "provided that the aggregate amount included under clauses (d) and (e) and under this clause shall not exceed $6,000,000 for any period;",
    "provided that the foregoing amounts, together with amounts included under clauses (d) and (e), shall not exceed $6,000,000 for any period;",
    "provided that such amounts and amounts included under clauses (d) and (e) shall not exceed $6,000,000 for any period;",
    "provided that amounts included hereunder and under clauses (d) and (e) shall not exceed $6,000,000 for any period;",
    "provided that the amounts described in clauses (d) and (e) and in this clause shall not exceed $6,000,000 for any period;",
  ];
  for (const [k, v] of shared.entries()) {
    it(`shared wording ${k + 1}: the stating line (f) never confirms above the $6M cap`, async () => {
      const body = `${CORE} plus (d) costs of consolidating plants; plus (e) costs of exiting leases; plus (f) costs of opening distribution centres, ${v} plus (g) non-cash stock-based compensation expense;`;
      const o = run(`plus (d) costs of consolidating plants; plus (e) costs of exiting leases; plus (f) costs of opening distribution centres, ${v} plus (g) non-cash stock-based compensation expense;`);
      for (const lab of ["(d)", "(e)", "(f)"]) expect(line(o, lab).cap?.amount, lab).toBe(String(6 * M));
      expect(line(o, "(g)").cap).toBeNull();
      const a = { sourceId: `shared-cap-${k}`, text: def(body), issuerCik: "1", financials: fin };
      const item = computeEbitdaBox(a).items.find((i) => /distribution centres/.test(i.clause))!;
      const out = await confirmEbitdaItem(fakeStore(), { companyId: "c", documentId: "d" }, a, { inputKey: item.inputKey, value: String(500 * M), source: "management accounts", confirmedBy: "cfo@x" });
      if (out.ok) expect(BigInt(out.box.items.find((i) => i.inputKey === item.inputKey)!.counted)).toBeLessThanOrEqual(BigInt(6 * M));
      else expect(out.status).toBe(422);
    });
  }
  it("within the cap, the confirmed figure is counted exactly (the guard is not vacuous)", async () => {
    const a = { sourceId: "self-cap-in", text: def(`${CORE} ${variants[0]} plus (e) non-cash stock-based compensation expense;`), issuerCik: "1", financials: fin };
    const item = computeEbitdaBox(a).items.find((i) => /distribution centres/.test(i.clause))!;
    const out = await confirmEbitdaItem(fakeStore(), { companyId: "c", documentId: "d" }, a, { inputKey: item.inputKey, value: String(0.8 * M), source: "management accounts", confirmedBy: "cfo@x" });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.box.items.find((i) => i.inputKey === item.inputKey)!.counted).toBe(String(0.8 * M));
  });
});
