// @ts-nocheck -- reviewer brute-force harness copied verbatim (untyped)
import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { solveCapLp } from "@/lib/covenant-learning-factory/xbrl/cap-lp";

// Reviewer brute-force cases (c890c84a review, caps2/caps3), copied verbatim: the optimizer's claims must never exceed
// the true maximum (integer brute force), must satisfy every cap, and must hit the true maximum on the listed layouts.
const M=1_000_000;
const fin=(x: any): any=>({cik:"0000000001",entityName:"T",missing:[],anchor:"2026-06-30",values:Object.entries({NetIncomeLoss:100*M,IncomeTaxExpenseBenefit:20*M,InterestExpense:30*M,DepreciationDepletionAndAmortization:50*M,...x}).map(([concept,v])=>({metric:"item",concept,periodType:"TTM",periodStart:"2025-07-01",periodEnd:"2026-06-30",value:String(v),unit:"USD",accession:"x",form:"10-Q",filed:"2026-08-01",derivation:"t"})),borrowerInputs:[]});
const H=`"Consolidated Net Income" means the net income of the Borrower. "Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, to the extent deducted in determining Consolidated Net Income, (a) interest expense, (b) income tax expense, (c) depreciation and amortization, `;
const F=`. "Default" means any event.`;
const X={RestructuringCharges:95*M,BusinessCombinationAcquisitionRelatedCosts:40*M,SeveranceCosts1:30*M,ShareBasedCompensation:20*M};
// brute-force true max over integer $M: items with evid, caps as [members, amount]
function brute(items:[string,number][],caps:[string[],number][]){let best=0;const n=items.length;const rec=(i:number,acc:Record<string,number>,s:number)=>{if(i===n){if(s>best)best=s;return;}const [k,v]=items[i];for(let x=v;x>=0;x--){const a={...acc,[k]:x};if(caps.every(([m,c])=>m.reduce((t,l)=>t+(a[l]??0),0)<=c)){rec(i+1,a,s+x);}}};rec(0,{},0);return best;}
type Case=[string,string,[string,number][],[string[],number][]];
const R="restructuring charges",A="acquisition-related costs",V="severance costs",K="non-cash stock-based compensation expense";
const p=(a:string[],n:string)=>`the aggregate amount added back pursuant to clauses ${a.map(x=>`(${x})`).join(" and ")} shall not exceed $${n}`;
const cases:Case[]=[
 ["A own first",`(d) ${A} in an aggregate amount not to exceed $10,000,000, (e) ${R}; provided that ${p(["d","e"],"100,000,000")}`,[["d",40],["e",95]],[[["d"],10],[["d","e"],100]]],
 ["B three",`(d) ${A} in an aggregate amount not to exceed $10,000,000, (e) ${R}, (f) ${V}; provided that the aggregate amount added back pursuant to clauses (d), (e) and (f) shall not exceed $100,000,000`,[["d",40],["e",95],["f",30]],[[["d"],10],[["d","e","f"],100]]],
 ["C own last",`(d) ${R}, (e) ${A} in an aggregate amount not to exceed $10,000,000; provided that ${p(["d","e"],"100,000,000")}`,[["d",95],["e",40]],[[["e"],10],[["d","e"],100]]],
 ["D shared first",`(d) the aggregate amount of add-backs pursuant to clauses (e) and (f) below, which shall not exceed $100,000,000, (e) ${R}, (f) ${A} in an aggregate amount not to exceed $10,000,000`,[["e",95],["f",40]],[[["f"],10],[["e","f"],100]]],
 ["E nested",`(d) ${A} in an aggregate amount not to exceed $10,000,000, (e) ${R}; provided that ${p(["d","e"],"20,000,000")}`,[["d",40],["e",95]],[[["d"],10],[["d","e"],20]]],
 ["F overlap",`(d) ${A}, (e) ${R}, (f) ${V}; provided that ${p(["d","e"],"100,000,000")} and ${p(["e","f"],"50,000,000")}`,[["d",40],["e",95],["f",30]],[[["d","e"],100],[["e","f"],50]]],
 ["G chain3",`(d) ${A}, (e) ${R}, (f) ${V}, (g) ${K}; provided that ${p(["d","e"],"50,000,000")}, ${p(["e","f"],"50,000,000")} and ${p(["f","g"],"50,000,000")}`,[["d",40],["e",95],["f",30],["g",20]],[[["d","e"],50],[["e","f"],50],[["f","g"],50]]],
 ["H pct shared 10% (before)",`(d) ${A}, (e) ${R}; provided that the aggregate amount added back pursuant to clauses (d) and (e) shall not exceed 10% of Consolidated EBITDA for such period (calculated before giving effect to such add-backs)`,[["d",40],["e",95]],[[["d","e"],20]]],
 ["I self-ref",`(d) ${R}; provided that the aggregate amount added back pursuant to this clause (d) shall not exceed $10,000,000, (e) ${A}`,[["d",95],["e",40]],[[["d"],10]]],
 ["J subclause cap",`(d) (x) ${R} and (y) ${A}; provided that the amount added back pursuant to this clause (y) shall not exceed $10,000,000, (e) ${V}`,[["dx",95],["dy",40],["e",30]],[[["dy"],10]]],
 ["J2 subclause+whole",`(d) (x) ${R} and (y) ${A}, in an aggregate amount not to exceed $50,000,000, and the amount added back pursuant to this clause (y) shall not exceed $10,000,000, (e) ${V}`,[["dx",95],["dy",40],["e",30]],[[["dx","dy"],50],[["dy"],10]]],
 ["K caps>filed",`(d) ${A} in an aggregate amount not to exceed $500,000,000, (e) ${R}; provided that ${p(["d","e"],"1,000,000,000")}`,[["d",40],["e",95]],[[["d"],500],[["d","e"],1000]]],
 ["M trap D-style",`(d) the aggregate amount of add-backs pursuant to clauses (f) and (g) below, which shall not exceed $10,000,000, (e) the aggregate amount of add-backs pursuant to clauses (f) and (h) below, which shall not exceed $10,000,000, (f) ${R}, (g) ${A} in an aggregate amount not to exceed $100,000,000, (h) ${V} in an aggregate amount not to exceed $100,000,000`,[["f",95],["g",40],["h",30]],[[["f","g"],10],[["f","h"],10]]],
 ["M2 trap no own",`(d) the aggregate amount of add-backs pursuant to clauses (f) and (g) below, which shall not exceed $10,000,000, (e) the aggregate amount of add-backs pursuant to clauses (f) and (h) below, which shall not exceed $10,000,000, (f) ${R}, (g) ${A}, (h) ${V}`,[["f",95],["g",40],["h",30]],[[["f","g"],10],[["f","h"],10]]],
 ["L greedy-trap",`(d) ${R}, (e) ${A} in an aggregate amount not to exceed $100,000,000, (f) ${V} in an aggregate amount not to exceed $100,000,000; provided that ${p(["d","e"],"10,000,000")} and ${p(["d","f"],"10,000,000")}`,[["d",95],["e",40],["f",30]],[[["d","e"],10],[["d","f"],10],[["e"],100],[["f"],100]]],
 ["L2 trap 1-cap",`(d) ${R}; provided that ${p(["d","e"],"10,000,000")} and ${p(["d","f"],"10,000,000")}, (e) ${A}, (f) ${V}`,[["d",95],["e",40],["f",30]],[[["d","e"],10],[["d","f"],10]]],
];

const run = (k: string) => {
  const [, s, items, caps] = cases.find((c) => c[0] === k)!;
  const o = optimizeConsolidatedEbitda("Consolidated EBITDA", H + s + F, fin(X));
  const cl: Record<string, number> = Object.fromEntries(o.addBacks.filter((a) => !/^\((a|b|c)\)$/.test(a.label)).map((a) => [a.label, Number(a.claimed) / M]));
  return { o, cl, truth: 200 + brute(items, caps), caps };
};

describe("exact joint cap allocation vs brute force", () => {
  for (const [k] of cases) it(`${k}: never above the true maximum, no cap violated`, () => {
    const { o, cl, truth, caps } = run(k);
    expect(Number(o.supported) / M).toBeLessThanOrEqual(truth);
    for (const [m, c] of caps) if (m.every((l) => l.length === 1)) expect(m.reduce((t, l) => t + (cl[`(${l})`] ?? 0), 0)).toBeLessThanOrEqual(c);
    if (o.status === "MAXIMIZED") expect(Number(o.maximum) / M).toBe(truth);
  });
  it.each([["F overlap", 290], ["L2 trap 1-cap", 220], ["L greedy-trap", 220], ["J2 subclause+whole", 280], ["G chain3", 300], ["M trap D-style", 220], ["M2 trap no own", 220]])("%s supports the true maximum %iM", (k, v) => {
    expect(Number(run(k as string).o.supported) / M).toBe(v);
  });
  it.each(["A own first", "B three", "C own last", "D shared first", "E nested", "G chain3", "H pct shared 10% (before)", "L greedy-trap", "L2 trap 1-cap", "M trap D-style", "M2 trap no own"])("%s is MAXIMIZED at the true maximum", (k) => {
    const { o, truth } = run(k);
    expect(o.status).toBe("MAXIMIZED");
    expect(Number(o.maximum) / M).toBe(truth);
  });
  it("G chain: (f) is bound by its caps", () => {
    expect(run("G chain3").o.addBacks.find((a) => a.label === "(f)")!.status).toBe("CAPPED");
  });
  it("J2: the sub-clause cap adds to the whole-clause cap", () => {
    expect(run("J2 subclause+whole").cl["(d)"]).toBe(50);
  });
});

describe("cap LP solver", () => {
  it("odd cycle: fractional optimum is reported as not integral (never claimed as proven)", () => {
    const r = solveCapLp([10n, 10n, 10n], [{ members: [0, 1], amount: 1n }, { members: [1, 2], amount: 1n }, { members: [0, 2], amount: 1n }]);
    expect(r.integral).toBe(false);
    expect(r.exactValue).toEqual({ num: 3n, den: 2n });
  });
  it("greedy trap solved exactly", () => {
    const r = solveCapLp([95n, 40n, 30n], [{ members: [0, 1], amount: 10n }, { members: [0, 2], amount: 10n }]);
    expect(r.integral).toBe(true);
    expect(r.value).toBe(20n);
  });
});
