/**
 * SEC XBRL companyfacts → Headroom financial inputs (general, no per-issuer logic, no AI).
 *
 * Fetch: data.sec.gov companyfacts / companyconcept with an identifying User-Agent (SEC_EDGAR_USER_AGENT, fail closed)
 * and a ≤ 5 req/s limiter. Extraction: 10-K / 10-Q facts only (amendments included), deduped per period by latest
 * filing. Balance-sheet items are the latest instant; flows are trailing twelve months:
 *   FY fact ending at E, else  FY(ending at YTD start) + YTD(ending E) − prior-year YTD (same length, one year earlier).
 * Anything that cannot be derived exactly is absent (callers treat it as NEEDS_INPUT); nothing is defaulted.
 */
import { resolveSecUserAgentFromEnv } from "../../edgar-historical-backfill/sec-identity";

export interface XbrlFact { start?: string; end: string; val: number; accn: string; fy?: number; fp?: string; form: string; filed: string; frame?: string }
export interface CompanyFacts { cik: number; entityName: string; facts: Record<string, Record<string, { units: Record<string, XbrlFact[]> }>> }

export type HeadroomInput =
  | "netIncome" | "interestExpense" | "incomeTaxes" | "depreciationAmortization" | "operatingIncome" | "revenue"
  | "totalAssets" | "cash" | "totalDebt" | "longTermDebtNoncurrent" | "debtCurrent" | "reportedEbitdaBase"
  /** Cash, cash equivalents and short-term investments at the balance-sheet instant. */
  | "cashAndShortTermInvestments"
  /** Balance-sheet equity and its tangible adjustments at the balance-sheet instant. */
  | "equity" | "equityInclNci" | "goodwill" | "intangiblesExGoodwill"
  /** Unamortized debt premium at the balance-sheet instant (carrying amount above principal). */
  | "debtPremium"
  /** A definition line-item concept (concept column names it). */
  | "item";

/** us-gaap concepts that EBITDA / interest-expense definition line items can map to. */
export const ITEM_CONCEPTS = [
  "ShareBasedCompensation", "AllocatedShareBasedCompensationExpense", "AssetImpairmentCharges", "GoodwillImpairmentLoss",
  "ImpairmentOfIntangibleAssetsExcludingGoodwill", "ImpairmentOfIntangibleAssetsIndefinitelivedExcludingGoodwill", "RestructuringCharges",
  "GainsLossesOnExtinguishmentOfDebt", "AmortizationOfIntangibleAssets", "Depreciation", "InvestmentIncomeInterest", "InterestIncomeOther",
  "InterestCostsCapitalized", "AmortizationOfDebtDiscountPremium", "AmortizationOfFinancingCosts", "InterestExpense", "InterestExpenseNonoperating",
  "InterestExpenseDebt", "InterestAndDebtExpense", "IncomeTaxExpenseBenefit", "NetIncomeLoss", "ProfitLoss", "OperatingIncomeLoss",
  "DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet",
  "IncomeLossFromEquityMethodInvestments", "IncomeLossFromEquityMethodInvestmentsNetOfDividendsOrDistributions", "GainLossOnDispositionOfAssets", "GainLossOnSaleOfPropertyPlantEquipment", "GainLossOnDispositionOfAssets1",
  // Common Consolidated EBITDA add-backs with no other home (EBITDA optimizer evidence).
  "BusinessCombinationAcquisitionRelatedCosts", "BusinessCombinationIntegrationRelatedCosts", "SeveranceCosts1",
  // Signed two-sided EBITDA lines (FX transaction gain/loss, noncontrolling-interest share): exact TTM only.
  "ForeignCurrencyTransactionGainLossBeforeTax", "NetIncomeLossAttributableToNoncontrollingInterest",
] as const;

export interface FinancialValue {
  metric: HeadroomInput;
  /** us-gaap concept, or "a+b" / "a+b-c" for composites. */
  concept: string;
  periodType: "INSTANT" | "FY" | "TTM";
  periodStart: string | null;
  periodEnd: string;
  /** Exact USD integer string (XBRL facts are whole dollars). */
  value: string;
  unit: "USD";
  /** Source accession(s); derived rows join them with the derivation operators. */
  accession: string;
  form: string;
  filed: string;
  derivation: string;
}

/**
 * A figure the borrower supplies for an item public filings do not carry (e.g. non-recurring gains from a compliance
 * certificate). Optional; never defaulted. key: "CNI:<CATEGORY>" / "CNI:<clause label>" for a net-income exclusion
 * (value = the amount of that item included in net income: gains positive, losses negative) or "ADDBACK:<CATEGORY>" /
 * "ADDBACK:<clause label>" for an EBITDA add-back (value = the charge, positive). source must name the document.
 */
export interface BorrowerInput { key: string; value: string; source: string }
export interface IssuerFinancials { cik: string; entityName: string; values: FinancialValue[]; missing: Array<{ metric: HeadroomInput; reason: string }>; anchor?: string | null; asOf?: string | null; borrowerInputs?: BorrowerInput[] }

/** The borrower input for the first matching key; inputs without a source or with a non-integer value are ignored. */
export function borrowerInput(fin: IssuerFinancials, keys: string[]): BorrowerInput | null {
  for (const k of keys) { const b = fin.borrowerInputs?.find((x) => x.key.toUpperCase() === k.toUpperCase() && x.source.trim().length > 0 && /^-?\d+$/.test(x.value)); if (b) return b; }
  return null;
}

const FLOW_CONCEPTS: Array<[HeadroomInput, string[]]> = [
  ["netIncome", ["NetIncomeLoss", "ProfitLoss"]],
  ["interestExpense", ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestAndDebtExpense"]],
  ["incomeTaxes", ["IncomeTaxExpenseBenefit"]],
  ["depreciationAmortization", ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet"]],
  ["operatingIncome", ["OperatingIncomeLoss"]],
  ["revenue", ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"]],
];
const DA_COMPOSITE = ["Depreciation", "AmortizationOfIntangibleAssets"];
const FORMS = /^10-[KQ](?:\/A)?$/;
const DAY = 86_400_000;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / DAY;

function usd(cf: CompanyFacts, concept: string, asOf?: string | null): XbrlFact[] {
  const rows = cf.facts["us-gaap"]?.[concept]?.units?.USD ?? [];
  const best = new Map<string, XbrlFact>();
  for (const f of rows) {
    if (!FORMS.test(f.form) || !Number.isFinite(f.val)) continue;
    // Test-date matching: only periods ended, and filings made, on or before the test date.
    if (asOf && (f.end > asOf || f.filed > asOf)) continue;
    const k = `${f.start ?? ""}|${f.end}`;
    const prev = best.get(k);
    if (!prev || f.filed > prev.filed) best.set(k, f);
  }
  return [...best.values()];
}

const near = (a: string, b: string, tol: number) => Math.abs(days(a, b)) <= tol;
const isAnnual = (f: XbrlFact) => !!f.start && days(f.start, f.end) >= 350 && days(f.start, f.end) <= 380;
const big = (n: number) => BigInt(Math.round(n));

/** TTM ending exactly at `end` for one concept, or null (never approximated). */
export function ttmAt(facts: XbrlFact[], end: string): { value: bigint; start: string; parts: XbrlFact[]; derivation: string; periodType: "FY" | "TTM" } | null {
  const durations = facts.filter((f) => f.start && f.end === end);
  // Trailing four quarters only: a fiscal-year value from a 10-K, or 10-K FY + 10-Q YTD − prior-year matching YTD.
  const k10 = (f: XbrlFact) => /^10-K/.test(f.form);
  const fy = durations.find((f) => isAnnual(f) && k10(f));
  if (fy) return { value: big(fy.val), start: fy.start!, parts: [fy], derivation: `FY ${fy.start}..${fy.end}`, periodType: "FY" };
  const ytd = durations.filter((f) => days(f.start!, f.end) < 350 && days(f.start!, f.end) >= 80).sort((a, b) => days(b.start!, b.end) - days(a.start!, a.end))[0];
  if (!ytd) return null;
  // The YTD must come from a 10-Q and start the day after the 10-K fiscal year ends.
  if (!/^10-Q/.test(ytd.form)) return null;
  const annual = facts.find((f) => isAnnual(f) && k10(f) && near(f.end, new Date(Date.parse(ytd.start!) - DAY).toISOString().slice(0, 10), 7));
  const len = days(ytd.start!, ytd.end);
  const prior = facts.find((f) => f.start && near(f.end, new Date(Date.parse(ytd.end) - 365 * DAY).toISOString().slice(0, 10), 7) && Math.abs(days(f.start, f.end) - len) <= 10);
  // The prior-year YTD must be the same fiscal window one year earlier: it starts where that fiscal year starts.
  if (!annual || !prior || !near(prior.start!, annual.start!, 3)) return null;
  const start = new Date(Date.parse(ytd.end) - 364 * DAY).toISOString().slice(0, 10);
  return {
    value: big(annual.val) + big(ytd.val) - big(prior.val), start, parts: [annual, ytd, prior], periodType: "TTM",
    derivation: `FY ${annual.start}..${annual.end} + YTD ${ytd.start}..${ytd.end} - YTD ${prior.start}..${prior.end}`,
  };
}

function latestEnd(facts: XbrlFact[], instant: boolean): string | null {
  const ends = facts.filter((f) => (instant ? !f.start : !!f.start)).map((f) => f.end).sort();
  return ends.at(-1) ?? null;
}

const lastFiled = (parts: XbrlFact[]) => parts.reduce((a, b) => (b.filed > a.filed ? b : a));

export function extractFinancials(cf: CompanyFacts, cikPadded: string, opts: { asOf?: string | null } = {}): IssuerFinancials {
  const U = (c: string) => usd(cf, c, opts.asOf);
  const values: FinancialValue[] = [];
  const missing: IssuerFinancials["missing"] = [];
  // One TTM end for every flow: the latest duration end of net income (else revenue), so the EBITDA base is coherent.
  const anchor = latestEnd(U("NetIncomeLoss"), false) ?? latestEnd(U("ProfitLoss"), false) ?? latestEnd(U("Revenues"), false);
  const flow = new Map<HeadroomInput, FinancialValue>();
  const pushFlow = (metric: HeadroomInput, concept: string, t: NonNullable<ReturnType<typeof ttmAt>>) => {
    const lf = lastFiled(t.parts);
    const v: FinancialValue = { metric, concept, periodType: t.periodType, periodStart: t.start, periodEnd: t.parts[t.periodType === "FY" ? 0 : 1]!.end, value: t.value.toString(), unit: "USD",
      accession: t.parts.map((p) => p.accn).join(t.parts.length === 3 ? "|" : ""), form: lf.form, filed: lf.filed, derivation: `${concept}: ${t.derivation}` };
    flow.set(metric, v);
    values.push(v);
  };
  for (const [metric, concepts] of FLOW_CONCEPTS) {
    if (!anchor) { missing.push({ metric, reason: "no 10-K/10-Q duration facts" }); continue; }
    let done = false;
    for (const c of concepts) {
      const t = ttmAt(U(c), anchor);
      if (t) { pushFlow(metric, c, t); done = true; break; }
    }
    if (!done && metric === "depreciationAmortization") {
      const [d, a] = DA_COMPOSITE.map((c) => ttmAt(U(c), anchor));
      if (d && a && d.start === a.start) {
        pushFlow(metric, DA_COMPOSITE.join("+"), { ...d, value: d.value + a.value, parts: [...d.parts, ...a.parts].slice(0, 3), derivation: `(${d.derivation}) + (${a.derivation})` });
        done = true;
      }
    }
    if (!done) missing.push({ metric, reason: `no exact TTM at ${anchor} for ${concepts.join(" / ")}` });
  }
  // Definition line items (EBITDA / interest add-backs and deductions), same TTM end, stored for traceability.
  if (anchor) for (const c of ITEM_CONCEPTS) {
    const t = ttmAt(U(c), anchor);
    if (t) pushFlow("item", c, t);
  }
  // Reported EBITDA base: labeled, never a contract metric.
  const parts = (["netIncome", "interestExpense", "incomeTaxes", "depreciationAmortization"] as const).map((m) => flow.get(m));
  if (parts.every(Boolean)) {
    const [ni, ie, tx, da] = parts as FinancialValue[];
    values.push({ metric: "reportedEbitdaBase", concept: `${ni!.concept}+${ie!.concept}+${tx!.concept}+${da!.concept}`, periodType: ni!.periodType, periodStart: ni!.periodStart, periodEnd: ni!.periodEnd,
      value: (BigInt(ni!.value) + BigInt(ie!.value) + BigInt(tx!.value) + BigInt(da!.value)).toString(), unit: "USD", accession: ni!.accession, form: ni!.form, filed: ni!.filed,
      derivation: "Reported EBITDA base = net income + interest expense + income taxes + D&A (XBRL, TTM). Not covenant EBITDA." });
  } else missing.push({ metric: "reportedEbitdaBase", reason: "a component (net income / interest / taxes / D&A) has no exact TTM" });

  // Balance sheet at the latest Assets instant; every component must share that instant.
  const assets = U("Assets");
  const bs = latestEnd(assets, true);
  const inst = (concept: string) => (bs ? U(concept).find((f) => !f.start && f.end === bs) : undefined);
  const pushInst = (metric: HeadroomInput, concept: string, fs: XbrlFact[]) => {
    const lf = lastFiled(fs);
    values.push({ metric, concept, periodType: "INSTANT", periodStart: null, periodEnd: bs!, value: fs.reduce((s, f) => s + big(f.val), 0n).toString(), unit: "USD",
      accession: [...new Set(fs.map((f) => f.accn))].join("+"), form: lf.form, filed: lf.filed, derivation: `${concept} at ${bs}` });
  };
  const a = inst("Assets");
  if (a) pushInst("totalAssets", "Assets", [a]); else missing.push({ metric: "totalAssets", reason: "no Assets instant" });
  const cash = inst("CashAndCashEquivalentsAtCarryingValue");
  if (cash) pushInst("cash", "CashAndCashEquivalentsAtCarryingValue", [cash]); else missing.push({ metric: "cash", reason: `no CashAndCashEquivalentsAtCarryingValue at ${bs}` });
  const firstInst = (cs: string[]) => { for (const c of cs) { const f = inst(c); if (f) return { c, f }; } return null; };
  const nonCur = firstInst(["LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"]);
  const cur = firstInst(["LongTermDebtCurrent", "DebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"]);
  const ltdTotal = inst("LongTermDebt");
  if (nonCur) pushInst("longTermDebtNoncurrent", nonCur.c, [nonCur.f]);
  if (cur) pushInst("debtCurrent", cur.c, [cur.f]);
  if (nonCur && cur) pushInst("totalDebt", `${nonCur.c}+${cur.c}`, [nonCur.f, cur.f]);
  else if (ltdTotal) pushInst("totalDebt", "LongTermDebt", [ltdTotal]);
  else {
    // No total: the largest single reported borrowing caption is still borrowed money of the group, so it is a lower
    // bound of the total (never a sum: captions can overlap). Lease-inclusive captions are not used.
    const caps = ["DebtInstrumentCarryingAmount", "SeniorNotes", "SeniorLongTermNotes", "JuniorSubordinatedNotes", "JuniorSubordinatedDebentureOwedToUnconsolidatedSubsidiaryTrust", "SubordinatedDebt", "NotesPayable", "NotesPayableToBank", "LongTermNotesPayable", "ConvertibleNotesPayable", "LongTermLineOfCredit", "LineOfCredit", "LinesOfCreditCurrent", "SecuredDebt", "UnsecuredDebt", "OtherNotesPayable", "CommercialPaper", "ShortTermBorrowings"]
      .map((c) => ({ c, f: inst(c) })).filter((x): x is { c: string; f: XbrlFact } => !!x.f && x.f.val > 0).sort((a, b) => b.f.val - a.f.val);
    if (caps[0]) {
      pushInst("totalDebt", caps[0].c, [caps[0].f]);
      values[values.length - 1]!.derivation = `largest single reported borrowing caption ${caps[0].c} at ${bs} (no total-debt tag; lower bound of borrowed money)`;
    } else missing.push({ metric: "totalDebt", reason: `no LongTermDebt, noncurrent + current pair, or borrowing caption at ${bs}` });
  }
  const csti = inst("CashCashEquivalentsAndShortTermInvestments");
  if (csti) pushInst("cashAndShortTermInvestments", "CashCashEquivalentsAndShortTermInvestments", [csti]);
  for (const [metric, concept] of [["equity", "StockholdersEquity"], ["equityInclNci", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], ["goodwill", "Goodwill"], ["intangiblesExGoodwill", "IntangibleAssetsNetExcludingGoodwill"]] as const) {
    const f = inst(concept);
    if (f) pushInst(metric, concept, [f]);
  }
  const prem = inst("DebtInstrumentUnamortizedPremium");
  if (prem) pushInst("debtPremium", "DebtInstrumentUnamortizedPremium", [prem]);
  return { cik: cikPadded, entityName: cf.entityName, values, missing, anchor, asOf: opts.asOf ?? null };
}

// ---------------- fetch ----------------
let last = 0;
async function throttle(minGapMs = 200): Promise<void> {
  const wait = last + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

export async function fetchSecJson<T>(url: string, fetchImpl: typeof fetch = fetch): Promise<T | null> {
  const ua = resolveSecUserAgentFromEnv();
  if (!ua) throw new Error("SEC_EDGAR_USER_AGENT (with a real contact email) is required for data.sec.gov");
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    const res = await fetchImpl(url, { headers: { "User-Agent": ua, Accept: "application/json" } });
    if (res.status === 404) return null;
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`SEC ${res.status} for ${url}`);
    return (await res.json()) as T;
  }
  throw new Error(`SEC retries exhausted for ${url}`);
}

export const pad10 = (cik: string | number) => String(cik).replace(/\D/g, "").padStart(10, "0");
export const companyFactsUrl = (cik: string) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${pad10(cik)}.json`;
export const companyConceptUrl = (cik: string, concept: string) => `https://data.sec.gov/api/xbrl/companyconcept/CIK${pad10(cik)}/us-gaap/${concept}.json`;

export async function fetchIssuerFinancials(cik: string, fetchImpl?: typeof fetch, asOf?: string | null): Promise<IssuerFinancials | null> {
  const cf = await fetchSecJson<CompanyFacts>(companyFactsUrl(cik), fetchImpl);
  return cf ? extractFinancials(cf, pad10(cik), { asOf }) : null;
}
