// @ts-nocheck -- reviewer fuzz harness (fed5b643 review, /tmp/hrrev-scr/fuzz.mts) copied verbatim (untyped)
import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { solveCapLp } from "@/lib/covenant-learning-factory/xbrl/cap-lp";
const M=1_000_000;
const fin=(x:any)=>({cik:"0000000001",entityName:"T",missing:[],anchor:"2026-06-30",values:Object.entries({NetIncomeLoss:100*M,IncomeTaxExpenseBenefit:20*M,InterestExpense:30*M,DepreciationDepletionAndAmortization:50*M,...x}).map(([concept,v])=>({metric:"item",concept,periodType:"TTM",periodStart:"2025-07-01",periodEnd:"2026-06-30",value:String(v),unit:"USD",accession:"x",form:"10-Q",filed:"2026-08-01",derivation:"t"})),borrowerInputs:[]});
const H=`"Consolidated Net Income" means the net income of the Borrower. "Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, to the extent deducted in determining Consolidated Net Income, (a) interest expense, (b) income tax expense, (c) depreciation and amortization, `;
const X={RestructuringCharges:95*M,BusinessCombinationAcquisitionRelatedCosts:40*M,SeveranceCosts1:30*M,ShareBasedCompensation:20*M};
const ITEMS=[["restructuring charges",95],["acquisition-related costs",40],["severance costs",30],["non-cash stock-based compensation expense",20]] as const;
let seed=0; const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;}; const ri=(a:number,b:number)=>a+Math.floor(rnd()*(b-a+1));
const money=(n:number)=>`$${(n*M).toLocaleString("en-US")}`;
const lab=(i:number)=>`(${"defg"[i]})`;
function brute(u:number[],caps:[number[],number][]){const n=u.length;let best=0;const rec=(i:number,x:number[],s:number)=>{ if(i===n-1){let v=u[i];for(const [m,c] of caps) if(m.includes(i)) v=Math.min(v,c-m.filter(j=>j!==i).reduce((t,j)=>t+x[j],0)); if(v<0)return; if(s+v>best)best=s+v;return;} for(let v=u[i];v>=0;v--){x[i]=v; if(caps.every(([m,c])=>m.filter(j=>j<=i).reduce((t,j)=>t+x[j],0)<=c)) rec(i+1,x,s+v);} x[i]=0;}; rec(0,Array(n).fill(0),0); return best;}
const pv=(m:number[],amt:number)=>`the aggregate amount added back pursuant to clauses ${m.map(lab).join(" and ")} shall not exceed ${money(amt)}`;

function fuzz(s0: number, N: number) {
  seed = s0;
let over=0,badlab=0,supover=0,maxN=0,eq=0,fails:string[]=[];
for(let t=0;t<N;t++){
  const n=ri(2,4); const perm=[0,1,2,3].sort(()=>rnd()-0.5).slice(0,n);
  const u=perm.map(p=>ITEMS[p][1]); const caps:[number[],number][]=[];
  const own=perm.map(()=> rnd()<0.35 ? 5*ri(1,24) : 0);
  own.forEach((a,i)=>{ if(a) caps.push([[i],a]); });
  const ns=ri(0,3); const shared:[number[],number][]=[];
  for(let k=0;k<ns;k++){ const m=[...Array(n).keys()].filter(()=>rnd()<0.6); if(m.length<2) continue; shared.push([m,5*ri(1,30)]); }
  caps.push(...shared);
  const place=ri(0,2); // 0: all provisos at end; 1: each proviso inside a random member clause; 2: D-style leading clauses
  let clauses=perm.map((p,i)=>`${ITEMS[p][0]}${own[i]?` in an aggregate amount not to exceed ${money(own[i])}`:""}`);
  let text:string;
  if(place===2){ // leading cap-only clauses shift labels
    const L=shared.length; const lb=(i:number)=>`(${"defghijk"[i]})`;
    const pre=shared.map(([m,a])=>`the aggregate amount of add-backs pursuant to clauses ${m.map(j=>lb(j+L)).join(" and ")} below, which shall not exceed ${money(a)}`);
    text=[...pre,...clauses].map((c,i)=>`${lb(i)} ${c}`).join(", ");
  } else if(place===1){ const extra:string[][]=perm.map(()=>[]); for(const [m,a] of shared) extra[m[ri(0,m.length-1)]].push(pv(m,a)); text=clauses.map((c,i)=>`${lab(i)} ${c}${extra[i].length?`; provided that ${extra[i].join(" and ")}`:""}`).join(", ");
  } else text=clauses.map((c,i)=>`${lab(i)} ${c}`).join(", ")+(shared.length?`; provided that ${shared.map(([m,a])=>pv(m,a)).join(" and ")}`:"");
  const o:any=optimizeConsolidatedEbitda("Consolidated EBITDA",H+text+`. "Default" means any event.`,fin(X));
  const tr=(200+brute(u,caps))*M; const mx=o.maximum==null?null:BigInt(o.maximum); const sp=o.supported==null?null:BigInt(o.supported);
  if(mx!=null){maxN++; if(mx>BigInt(tr)){over++;fails.push(`OVER t${t} max ${Number(mx)/M} true ${tr/M} :: ${text}`);} if(mx===BigInt(tr))eq++;}
  if(o.status==="MAXIMIZED" && mx!==BigInt(tr)){badlab++;fails.push(`BADLABEL t${t} ${Number(mx)/M} vs ${tr/M} :: ${text}`);}
  if(sp!=null && sp>BigInt(tr)){supover++;fails.push(`SUPOVER t${t} sup ${Number(sp)/M} true ${tr/M} place${place} :: ${text}`);}
}
  return { over, badlab, supover, maxN, eq, fails };
}

describe("reviewer cap fuzz (brute-force truth)", () => {
  it.each([[12345, 300], [777, 1000]])("seed %i × %i: never over the true maximum, never a wrong MAXIMIZED", (s, n) => {
    const r = fuzz(s, n);
    expect(r.fails.slice(0, 3)).toEqual([]);
    expect(r.over + r.badlab + r.supover).toBe(0);
    expect(r.maxN).toBeGreaterThan(0);
  });
});

const D = (tail: string) => `${H}${tail}. "Default" means any event.`;
describe("letter vs roman by sequence", () => {
  it("'(i)' after '(h)' is the next letter (its own clause), not a sub-clause of (h)", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", D("(d) restructuring charges, (e) severance costs, (f) acquisition-related costs, (g) [reserved], (h) [reserved], (i) non-cash stock-based compensation expense, (j) [reserved]"), fin(X));
    expect(o.addBacks.map((l) => l.label)).toContain("(i)");
    expect(o.addBacks.find((l) => l.label === "(h)")!.text).not.toMatch(/stock-based/);
  });
  it("'(i)' followed by '(ii)' stays a roman sub-clause", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", D("(d) restructuring charges, (e) severance costs, (f) acquisition-related costs, (g) [reserved], (h) costs of (i) relocation and (ii) integration, (j) [reserved]"), fin(X));
    expect(o.addBacks.map((l) => l.label)).not.toContain("(i)");
  });
});

describe("compound clause references bind the cap", () => {
  const L = (cap: string) => D(`(d) restructuring charges, (e) [reserved], (f) [reserved], (g) [reserved], (h) [reserved], (i) [reserved], (j) [reserved], (k) [reserved], (l) (x) run-rate cost savings and (y) non-cash stock-based compensation expense; provided that the aggregate amount of adjustments pursuant to this clause (1)(l), together with adjustments pursuant to clauses (1)(k) and (1)(q), shall not exceed ${cap}`);
  it("'this clause (1)(l)' binds (l) and its sub-parts (no split at the inner label)", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", L("in the aggregate $5,000,000"), fin(X));
    const l = o.addBacks.find((x) => x.label === "(l)")!;
    // The cap binds (l) (no split at the inner label). It also names clause (1)(q), which is not in this definition, so
    // the room left for (l) cannot be known: capped by an undetermined amount, never uncapped and never the full $5M
    // (grok/ebitda-cap-binding: an unresolved reference makes the cap capped-unknown).
    expect(l.cap).not.toBeNull();
    expect(l.cap?.amount).toBeNull();
    expect(l.cap?.note ?? l.note).toMatch(/unresolved/);
    expect(l.claimed).toBe("0");
    expect(l.status).toBe("NEEDS_INPUT");
    expect(o.addBacks.some((x) => x.label === "(q)")).toBe(false);
  });
  it("an indeterminate cap is never unlimited: claim 0, NEEDS_INPUT", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", L("the Aggregate Cap for such period"), fin(X));
    const l = o.addBacks.find((x) => x.label === "(l)")!;
    expect(l.claimed).toBe("0");
    expect(l.status).toBe("NEEDS_INPUT");
  });
});

describe("fragments attach to their enclosing clause", () => {
  it("(x)/(y)/(z) after a roman clause belong to it; a later capped clause keeps its own cap", () => {
    const text = D("(i) restructuring charges, (iii) (a) severance costs and (b) acquisition-related costs, (iv) [reserved], (v) [reserved], (vi) [reserved], (vii) any fees related to (x) the notes, (y) any amendment and (z) any commissions and other fees (including any interest expense) related to receivables financing, (viii) [reserved], (ix) [reserved], (x) [reserved], (xi) [reserved], (xii) [reserved], (xiii) [reserved], (xiv) non-cash stock-based compensation expense in an aggregate amount not to exceed $12,500,000");
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin(X));
    const vii = o.addBacks.find((x) => x.label === "(vii)")!;
    expect(vii.text).toMatch(/commissions/);
    expect(vii.concepts.some((c) => /Interest/.test(c.concept))).toBe(false);
    expect(o.addBacks.find((x) => x.label === "(xiv)")!.cap?.amount).toBe(String(12.5 * M));
    expect(o.addBacks.some((x) => x.label === "(z)")).toBe(false);
  });
});

describe("cap LP iteration guard", () => {
  it("throws instead of returning an unproven allocation", () => {
    expect(() => solveCapLp([95n, 40n], [{ members: [0, 1], amount: 10n }], 0)).toThrow(/did not converge/);
  });
});

describe("tracker: indeterminate cap is not 'uncapped'", () => {
  it("a clause under an undeterminable cap is CAP_UNKNOWN", async () => {
    const { trackAddBacks } = await import("@/lib/covenant-learning-factory/xbrl/addback-tracker");
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", D("(d) restructuring charges in an aggregate amount not to exceed the Aggregate Cap for such period"), fin(X));
    const f = trackAddBacks(o, fin(X), null, null).find((x) => x.clause.label === "(d)")!;
    expect(f.potential.basis).toBe("CAP_UNKNOWN");
  });
});
