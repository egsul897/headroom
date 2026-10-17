import { describe, expect, it } from "vitest";
import { computeCovenantPosition, simulateDebtIncurrence, simulateDebtIncurrenceByBasket, type CompanyCovenantData } from "../lib/covenant-engine";
import { COHERENT_DATA } from "../prisma/seed-data";

const IND = "coherent-2029-notes-indenture";
const clone = (d: CompanyCovenantData): CompanyCovenantData => JSON.parse(JSON.stringify(d));
const run = (d: CompanyCovenantData, a: Parameters<typeof simulateDebtIncurrenceByBasket>[2]) => simulateDebtIncurrenceByBasket(d, computeCovenantPosition(d), a);

describe("simulateDebtIncurrenceByBasket: per-basket amounts in one call", () => {
  it("reports capacity used / remaining per basket from the modeled provision", () => {
    const r = run(COHERENT_DATA, [{ kind: "GENERAL", amount: 100, secured: false }, { kind: "RATIO_DEBT", amount: 200, secured: false }]);
    const g = r.baskets.find((b) => b.kind === "GENERAL")!;
    const gd = g.documents.find((d) => d.documentId === IND)!;
    expect(gd.provision?.code).toBe("general_debt");
    expect(gd.capacity).toBe(680);
    expect(gd.used).toBe(100);
    expect(gd.remaining).toBe(580);
    expect(g.status).toBe("clear");
    const rd = r.baskets.find((b) => b.kind === "RATIO_DEBT")!.documents.find((d) => d.documentId === IND)!;
    expect(rd.provision?.code).toBe("ratio_debt_fccr"); // not the RP ratio gate
    expect(rd.remaining).toBeCloseTo(rd.capacity! - 200, 9);
    expect(r.status).toBe("clear");
  });

  it("an unidentified basket is NEEDS_INPUT with no invented capacity; an explicit provision code resolves it", () => {
    const r = run(COHERENT_DATA, [{ kind: "INCREMENTAL", amount: 500, secured: true }]);
    const inc = r.baskets[0]!;
    expect(inc.status).toBe("NEEDS_INPUT");
    expect(inc.documents.every((d) => d.capacity === undefined && d.remaining === undefined)).toBe(true);
    expect(r.status).toBe("NEEDS_INPUT");
    const r2 = run(COHERENT_DATA, [{ kind: "INCREMENTAL", amount: 500, secured: true, provisionCode: "facility_grower" }]);
    const d = r2.baskets[0]!.documents.find((x) => x.documentId === IND)!;
    expect(d.provision?.code).toBe("facility_grower");
    expect(d.remaining).toBe(d.capacity! - 500);
    expect(r2.baskets[0]!.status).toBe("clear");
  });

  it("ambiguous baskets are NEEDS_INPUT and list the candidates", () => {
    const d = clone(COHERENT_DATA);
    const g = d.provisions.find((p) => p.code === "general_debt")!;
    d.provisions.push({ ...g, id: "x2", code: "general_debt_2", basketName: "General debt basket (second)" });
    const b = run(d, [{ kind: "GENERAL", amount: 10, secured: false }]).baskets[0]!;
    expect(b.status).toBe("NEEDS_INPUT");
    expect(b.documents.find((x) => x.documentId === IND)!.reason).toMatch(/general_debt, general_debt_2/);
  });

  it("over-allocating a basket is blocked with negative remaining", () => {
    const r = run(COHERENT_DATA, [{ kind: "GENERAL", amount: 700, secured: false }]);
    const d = r.baskets[0]!.documents.find((x) => x.documentId === IND)!;
    expect(d.status).toBe("blocked");
    expect(d.remaining).toBe(-20);
    expect(r.status).toBe("blocked");
  });

  it("combined ratio impact applies all allocations together; secured tests see only the secured amounts", () => {
    const alloc = [{ kind: "GENERAL" as const, amount: 100, secured: false }, { kind: "RATIO_DEBT" as const, amount: 200, secured: false }, { kind: "INCREMENTAL" as const, amount: 500, secured: true, provisionCode: "facility_grower" }];
    const r = run(COHERENT_DATA, alloc);
    expect(r.totals).toEqual({ amount: 800, secured: 500, unsecured: 300 });
    const pos = computeCovenantPosition(COHERENT_DATA);
    const all = simulateDebtIncurrence(COHERENT_DATA, pos, 800, false);
    const sec = simulateDebtIncurrence(COHERENT_DATA, pos, 500, true);
    expect(r.proForma.totalNetLeverage).toBeCloseTo(all.proForma.totalNetLeverage, 12);
    expect(r.proForma.fixedChargeCoverage).toBeCloseTo(all.proForma.fixedChargeCoverage, 12);
    const f = COHERENT_DATA.financials;
    expect(r.proForma.seniorSecuredNetLeverage).toBeCloseTo((f.securedDebt + 500 - f.cash) / f.ebitda, 12);
    expect(sec.proForma.seniorSecuredNetLeverage).toBeCloseTo(r.proForma.seniorSecuredNetLeverage!, 12);
    const ssnl = r.ratioTests.find((t) => t.provision.code === "mila_secured")!;
    expect(ssnl.applies).toBe(true);
    expect(ssnl.postTransactionRatio).toBeCloseTo(r.proForma.seniorSecuredNetLeverage!, 12);
    const sides = r.documentSides.filter((s) => s.documentId === IND);
    expect(sides.find((s) => s.side === "secured")!.used).toBe(500);
    expect(sides.find((s) => s.side === "unsecured")!.used).toBe(300);
  });

  it("missing EBITDA or rate gives NEEDS_INPUT ratios, never a default", () => {
    const d = clone(COHERENT_DATA);
    d.financials.assumedNewDebtRatePct = 0;
    const r = run(d, [{ kind: "GENERAL", amount: 100, secured: false }]);
    expect(r.proForma.fixedChargeCoverage).toBeNull();
    expect(r.proForma.totalNetLeverage).not.toBeNull();
    expect(r.status).toBe("NEEDS_INPUT");
    const e = clone(COHERENT_DATA);
    e.financials.ebitda = 0;
    const r2 = run(e, [{ kind: "GENERAL", amount: 100, secured: false }]);
    expect(r2.proForma).toMatchObject({ totalNetLeverage: null, seniorSecuredNetLeverage: null, fixedChargeCoverage: null });
    expect(r2.ratioTests).toEqual([]);
    expect(r2.status).toBe("NEEDS_INPUT");
  });

  it("no allocations is NEEDS_INPUT and leaves simulateDebtIncurrence unchanged", () => {
    expect(run(COHERENT_DATA, []).status).toBe("NEEDS_INPUT");
  });
});

describe("simulateDebtIncurrenceByBasket: reviewer notes at aff86f7b", () => {
  it("a provision drawn by two baskets shares one capacity", () => {
    const r = run(COHERENT_DATA, [{ kind: "GENERAL", amount: 400, secured: false }, { kind: "INCREMENTAL", amount: 400, secured: false, provisionCode: "general_debt" }]);
    for (const b of r.baskets) {
      const d = b.documents.find((x) => x.documentId === IND)!;
      expect(d.capacity).toBe(680);
      expect(d.provisionUsed).toBe(800);
      expect(d.remaining).toBe(-120);
      expect(d.status).toBe("blocked");
      expect(d.sharedWith).toEqual([b.kind === "GENERAL" ? "INCREMENTAL" : "GENERAL"]);
    }
    expect(r.status).toBe("blocked");
  });

  it("NaN / negative allocations are reported as input errors and make the result NEEDS_INPUT, never silently dropped", () => {
    for (const bad of [Number.NaN, -10, Number.POSITIVE_INFINITY]) {
      const r = run(COHERENT_DATA, [{ kind: "GENERAL", amount: 100, secured: false }, { kind: "RATIO_DEBT", amount: bad, secured: false }]);
      expect(r.invalidAllocations).toEqual([{ index: 1, reason: expect.stringMatching(/RATIO_DEBT amount/) }]);
      expect(r.status).toBe("NEEDS_INPUT");
      expect(r.baskets.find((b) => b.kind === "RATIO_DEBT")!.status).toBe("NEEDS_INPUT");
      expect(r.totals.amount).toBe(100);
    }
  });

  it("a greater-of basket with a missing dollar floor is AT_LEAST its % leg (bound passed through), never a default floor", () => {
    const d = clone(COHERENT_DATA);
    const g = d.provisions.find((p) => p.code === "general_debt")!;
    g.thresholdValue = null as unknown as number;
    const pctLeg = g.params!.pctEbitda! * d.financials.ebitda;
    const within = run(d, [{ kind: "GENERAL", amount: Math.floor(pctLeg) - 1, secured: false }]);
    const w = within.baskets[0]!.documents.find((x) => x.documentId === IND)!;
    expect(w).toMatchObject({ bound: "AT_LEAST", capacity: pctLeg, status: "clear" });
    expect(within.baskets[0]!.bound).toBe("AT_LEAST");
    const over = run(d, [{ kind: "GENERAL", amount: pctLeg + 1, secured: false }]);
    const o = over.baskets[0]!.documents.find((x) => x.documentId === IND)!;
    expect(o.status).toBe("NEEDS_INPUT");
    expect(o.remaining).toBeCloseTo(-1, 9);
  });

  it("modeled figures carry bound EXACT", () => {
    const d = run(COHERENT_DATA, [{ kind: "GENERAL", amount: 1, secured: false }]).baskets[0]!.documents.find((x) => x.documentId === IND)!;
    expect(d.bound).toBe("EXACT");
  });
});
