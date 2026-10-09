/**
 * AI-populated debt intelligence dashboard — real persisted sources only.
 * Fail-closed on invented capacity; AI interpretations shown for counsel review.
 */

import { prisma } from "@/lib/prisma";
import { fmtM } from "@/lib/format";
import { LEDGER_BASKET_LABELS } from "@/prisma/seed-data";
import { loadCovenantReviewWorkspace } from "./covenant-review";
import { loadCapacityReadiness } from "./capacity-readiness";
import { loadRulebookReadiness } from "./rulebook-readiness";
import { loadMonitoringFeed } from "./monitoring";
import { listReviewerApprovals, type ReviewerApproval } from "./reviewer-approvals";
import type { CovenantSummaryItem } from "../covenant-intelligence/summarize";
import { loadDashboardOverlay } from "../covenant-intelligence-loop/store";
import {
  computeLeverageMetrics,
  evaluateProvision,
  type FormulaParams,
  type FormulaType,
} from "@/lib/covenant-engine";
import {
  analyzeMultiPathTransaction,
  type MultiPathAnalysis,
} from "./multi-path-analysis";

export type MetricNumericStatus =
  | "COMPUTED"
  | "CONDITIONAL"
  | "MISSING_FINANCIALS"
  | "MISSING_RULEBOOK"
  | "AI_SURFACED";

export interface DashboardDrilldown {
  metricId: string;
  title: string;
  module: "CAPITAL" | "RATIOS" | "BASKETS" | "MONITORING" | "TRANSACTIONS";
  governingAgreement: string | null;
  sectionCitation: string | null;
  definitions: Array<{ term: string; excerpt: string }>;
  contractualFormula: string | null;
  financialInputs: Array<{ label: string; value: string | null; required: boolean }>;
  historicalUtilization: Array<{ date: string; description: string; amount: string; basket: string }>;
  conditions: string[];
  exceptions: string[];
  relatedCovenants: string[];
  aiInterpretation: string | null;
  alternatives: string[];
  assumptions: string[];
  reviewerCorrections: Array<{ decision: string; note?: string; at: string; plainEnglish?: string }>;
  calculationHistory: string[];
  missingInputs: string[];
  hrefs: Array<{ label: string; href: string }>;
}

export interface DebtIntelligenceDashboard {
  companyId: string;
  headline: string;
  generatedAt: string;
  capitalStructure: {
    numericStatus: MetricNumericStatus;
    asOfDate: string | null;
    aggregates: {
      totalDebt: number | null;
      securedDebt: number | null;
      unsecuredDebt: number | null;
      cash: number | null;
      netDebt: number | null;
      ebitda: number | null;
      interestExpense: number | null;
    };
    instruments: Array<{
      metricId: string;
      name: string;
      kind: string;
      outstanding: number | null;
      commitment: number | null;
      available: number | null;
      secured: boolean | null;
      coupon: string | null;
      maturity: string | null;
      guarantors: string | null;
      drilldown: DashboardDrilldown;
    }>;
    notes: string | null;
  };
  ratios: Array<{
    metricId: string;
    name: string;
    family: string;
    currentValue: string | null;
    threshold: string | null;
    cushion: string | null;
    status: MetricNumericStatus;
    testingDate: string | null;
    drilldown: DashboardDrilldown;
  }>;
  baskets: Array<{
    metricId: string;
    category: string;
    sectionRef: string;
    heading: string;
    contractualCapacity: string | null;
    utilization: string | null;
    remaining: string | null;
    status: MetricNumericStatus;
    reviewDecision: string | null;
    drilldown: DashboardDrilldown;
  }>;
  monitoring: Array<{
    metricId: string;
    severity: string;
    title: string;
    detail: string;
    kind: string;
    drilldown: DashboardDrilldown;
  }>;
  transactions: Array<{
    metricId: string;
    scenario: string;
    summary: string;
    status: MetricNumericStatus;
    askHref: string;
    simulateHref: string;
    drilldown: DashboardDrilldown;
  }>;
  /** Pro forma transaction effects when financials + executable rules exist. */
  proForma: Array<{
    metricId: string;
    scenario: string;
    amountMillions: number;
    secured: boolean;
    status: MetricNumericStatus;
    proFormaTotalLeverage: string | null;
    proFormaSecuredLeverage: string | null;
    proFormaInterestCoverage: string | null;
    basketRemainingAfter: string | null;
    engineCapacityRemaining: string | null;
    notes: string[];
    drilldown: DashboardDrilldown;
  }>;
  /** Multi-path contractual pathway analysis (stacking not assumed). */
  multiPath: MultiPathAnalysis[];
  rulebookStage: string;
  capacityStatus: string;
  amendmentResolution: string;
  documentCount: number;
  interpretedCount: number;
  acceptedCount: number;
  note: string;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v !== null && "toNumber" in v) {
    try {
      const n = (v as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ratioStr(numerator: number | null, denominator: number | null): string | null {
  if (numerator == null || denominator == null) return null;
  if (denominator === 0) return null;
  return `${(numerator / denominator).toFixed(2)}x`;
}

function classifyBasketFamily(category: string, heading: string, text: string): string {
  const hay = `${category} ${heading} ${text}`.toLowerCase();
  if (/incremental|accordion/.test(hay)) return "Incremental facilities";
  if (/restricted payment|dividend|rp\b/.test(hay)) return "Restricted payments";
  if (/investment|acquisition/.test(hay)) return "Investments";
  if (/lien|collateral|secured/.test(hay)) return "Lien baskets";
  if (/asset sale|disposition/.test(hay)) return "Asset sales";
  if (/available amount|builder|cumulative/.test(hay)) return "Available amount / builder";
  if (/shared|aggregate cap/.test(hay)) return "Shared capacity";
  if (/indebtedness|debt|ratio debt/.test(hay)) return "Debt baskets";
  return category || "Other";
}

function buildDrilldown(params: {
  metricId: string;
  title: string;
  module: DashboardDrilldown["module"];
  companyId: string;
  item?: CovenantSummaryItem & { sourceId?: string; documentTitle?: string };
  approvals?: ReviewerApproval[];
  formula?: string | null;
  inputs?: DashboardDrilldown["financialInputs"];
  utilization?: DashboardDrilldown["historicalUtilization"];
  calcHistory?: string[];
  missing?: string[];
}): DashboardDrilldown {
  const item = params.item;
  const approvals = (params.approvals ?? []).filter(
    (a) => a.sectionRef === item?.sectionRef && (!item.sourceId || a.sourceId === item.sourceId),
  );
  return {
    metricId: params.metricId,
    title: params.title,
    module: params.module,
    governingAgreement: item?.governingAgreement ?? item?.documentTitle ?? null,
    sectionCitation: item ? `${item.sourceCitation}` : null,
    definitions: (item?.applicableDefinitions ?? []).slice(0, 8).map((d) => ({
      term: d.term,
      excerpt: (d.excerpt ?? "").slice(0, 220),
    })),
    contractualFormula: params.formula ?? (item?.materialBasketsThresholds ?? [])[0] ?? null,
    financialInputs: params.inputs ?? [],
    historicalUtilization: params.utilization ?? [],
    conditions: item?.conditions?.slice(0, 6) ?? [],
    exceptions: item?.exceptions?.slice(0, 6) ?? [],
    relatedCovenants: [
      ...(item?.crossReferences ?? []).slice(0, 4),
      ...(item?.dependencies ?? []).slice(0, 4),
    ],
    aiInterpretation: item?.plainEnglish ?? null,
    alternatives: item?.alternativeInterpretations ?? item?.analysis?.alternativeInterpretations ?? [],
    assumptions: item?.assumptions ?? item?.analysis?.assumptions ?? [],
    reviewerCorrections: approvals.map((a) => ({
      decision: a.decision,
      note: a.note,
      at: a.reviewedAt,
      plainEnglish: a.editedPlainEnglish,
    })),
    calculationHistory: params.calcHistory ?? [],
    missingInputs: params.missing ?? [],
    hrefs: [
      { label: "Covenant review", href: `/${params.companyId}/covenants` },
      { label: "Lawyer review", href: `/${params.companyId}/rulebook` },
      { label: "Ask Headroom", href: `/${params.companyId}/ask` },
      { label: "Financial inputs", href: `/${params.companyId}/onboarding/financials` },
      { label: "Simulate", href: `/${params.companyId}/simulate` },
      { label: "Capacity", href: `/${params.companyId}/capacity` },
    ],
  };
}

export async function loadDebtIntelligenceDashboard(companyId: string): Promise<DebtIntelligenceDashboard> {
  const [review, capacity, rulebook, feed, approvals, snapshot, facilities, ledger, instruments, financialState] =
    await Promise.all([
      loadCovenantReviewWorkspace(companyId),
      loadCapacityReadiness(companyId),
      loadRulebookReadiness(companyId),
      loadMonitoringFeed(companyId),
      listReviewerApprovals(companyId),
      prisma.financialSnapshot.findFirst({
        where: { companyId },
        orderBy: { asOfDate: "desc" },
        include: { debtTranches: true },
      }),
      prisma.facility.findMany({ where: { companyId }, orderBy: { name: "asc" }, take: 24 }),
      prisma.ledgerEntry.findMany({
        where: { companyId, status: "ACTIVE" },
        orderBy: { date: "desc" },
        take: 40,
      }),
      prisma.debtInstrument.findMany({ where: { companyId }, take: 20 }),
      prisma.financialState.findFirst({
        where: { companyId },
        orderBy: { asOfDate: "desc" },
        select: { balanceSheetFacts: true },
      }),
    ]);

  const approvalByKey = new Map(
    approvals.map((a) => [`${a.sourceId}|${a.sectionRef}`, a]),
  );

  const totalDebt = snapshot ? num(snapshot.totalDebt) : null;
  const securedDebt = snapshot ? num(snapshot.securedDebt) : null;
  const cash = snapshot ? num(snapshot.cash) : null;
  const ebitda = snapshot ? num(snapshot.ebitda) : null;
  const interestExpense = snapshot ? num(snapshot.interestExpense) : null;
  const totalAssets = (() => {
    const facts = financialState?.balanceSheetFacts as { totalAssets?: { value?: unknown } } | null;
    const raw = facts?.totalAssets?.value;
    const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : null;
  })();
  const unsecuredDebt =
    totalDebt != null && securedDebt != null ? Math.max(0, totalDebt - securedDebt) : null;
  const netDebt = totalDebt != null && cash != null ? totalDebt - cash : null;
  const asOfDate = snapshot?.asOfDate?.toISOString().slice(0, 10) ?? null;
  const notesText = snapshot?.notes ?? "";
  const firstLienFromNotes = (() => {
    const m = notesText.match(/First-lien debt \(\$M\):\s*([\d.]+)/i);
    return m ? Number(m[1]) : null;
  })();
  const fixedChargesFromNotes = (() => {
    const m = notesText.match(/Fixed charges \(\$M\):\s*([\d.]+)/i);
    return m ? Number(m[1]) : null;
  })();
  const assumedRate = snapshot ? num(snapshot.assumedNewDebtRatePct) : null;

  const capitalInstruments: DebtIntelligenceDashboard["capitalStructure"]["instruments"] = [];

  if (snapshot?.debtTranches?.length) {
    for (const t of snapshot.debtTranches) {
      const amount = num(t.amount);
      const metricId = `capital:tranche:${t.id}`;
      capitalInstruments.push({
        metricId,
        name: t.name,
        kind: t.secured ? "Secured tranche" : "Unsecured tranche",
        outstanding: amount,
        commitment: null,
        available: null,
        secured: t.secured,
        coupon: null,
        maturity: null,
        guarantors: null,
        drilldown: buildDrilldown({
          metricId,
          title: t.name,
          module: "CAPITAL",
          companyId,
          formula: "Outstanding principal from financial snapshot debt tranche",
          inputs: [
            { label: "Tranche amount", value: amount != null ? fmtM(amount) : null, required: true },
            { label: "Secured", value: t.secured ? "Yes" : "No", required: false },
            { label: "Document", value: t.documentName ?? null, required: false },
          ],
          calcHistory: asOfDate ? [`Snapshot as of ${asOfDate}`] : [],
        }),
      });
    }
  }

  for (const f of facilities) {
    const outstanding = num(f.originalPrincipal);
    const commitment = num(f.commitmentAmount);
    const available =
      commitment != null && outstanding != null ? Math.max(0, commitment - outstanding) : commitment;
    const coupon =
      f.couponType === "FIXED" && f.couponPct != null
        ? `${Number(f.couponPct)}% fixed`
        : f.couponType === "FLOATING" && f.marginBps != null
          ? `${f.referenceRate ?? "ref"} + ${f.marginBps} bps`
          : null;
    const metricId = `capital:facility:${f.id}`;
    capitalInstruments.push({
      metricId,
      name: f.name,
      kind: f.facilityType,
      outstanding,
      commitment,
      available: f.facilityType === "REVOLVER" || f.facilityType === "ABL" ? available : null,
      secured: f.secured,
      coupon,
      maturity: f.maturityDate?.toISOString().slice(0, 10) ?? null,
      guarantors: f.guarantorEntityClasses?.length
        ? f.guarantorEntityClasses.join(", ")
        : null,
      drilldown: buildDrilldown({
        metricId,
        title: f.name,
        module: "CAPITAL",
        companyId,
        formula: `${f.facilityType} facility — commitment / principal from Facility record`,
        inputs: [
          { label: "Outstanding / original principal", value: outstanding != null ? fmtM(outstanding) : null, required: true },
          { label: "Commitment", value: commitment != null ? fmtM(commitment) : null, required: f.facilityType === "REVOLVER" },
          { label: "Available (commitment − drawn)", value: available != null ? fmtM(available) : null, required: false },
          { label: "Maturity", value: f.maturityDate?.toISOString().slice(0, 10) ?? null, required: false },
        ],
        missing: outstanding == null ? ["Facility principal"] : [],
      }),
    });
  }

  for (const di of instruments) {
    if (capitalInstruments.some((x) => x.name === di.name)) continue;
    const metricId = `capital:instrument:${di.id}`;
    capitalInstruments.push({
      metricId,
      name: di.name,
      kind: di.instrumentType ?? "OTHER",
      outstanding: null,
      commitment: null,
      available: null,
      secured: null,
      coupon: null,
      maturity: null,
      guarantors: null,
      drilldown: buildDrilldown({
        metricId,
        title: di.name,
        module: "CAPITAL",
        companyId,
        formula: "Debt instrument extracted from package — amounts not yet bound to snapshot",
        missing: ["Outstanding principal", "Interest rate", "Maturity"],
        inputs: [{ label: "Notes", value: di.notes ?? null, required: false }],
      }),
    });
  }

  const ledgerByBasket = new Map<string, number>();
  for (const e of ledger) {
    const amt = Math.abs(num(e.amount) ?? 0);
    const key = String(e.basket);
    ledgerByBasket.set(key, (ledgerByBasket.get(key) ?? 0) + amt);
  }

  const utilizationRows = ledger.slice(0, 12).map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    description: e.description,
    amount: fmtM(num(e.amount) ?? 0),
    basket: LEDGER_BASKET_LABELS[e.basket as keyof typeof LEDGER_BASKET_LABELS] ?? String(e.basket),
  }));

  // --- Ratios ---
  const ratioDefs: Array<{
    name: string;
    family: string;
    compute: () => string | null;
    formula: string;
    thresholdHint: RegExp;
    missing: string[];
  }> = [
    {
      name: "Total leverage",
      family: "LEVERAGE",
      compute: () => ratioStr(totalDebt, ebitda),
      formula: "Total Debt / Consolidated EBITDA (generic; map to contractual definitions)",
      thresholdHint: /total\s+leverage|consolidated\s+leverage|maximum\s+leverage/i,
      missing: [
        ...(totalDebt == null ? ["Total Debt"] : []),
        ...(ebitda == null ? ["Contractual EBITDA"] : []),
      ],
    },
    {
      name: "Net leverage",
      family: "LEVERAGE",
      compute: () => ratioStr(netDebt, ebitda),
      formula: "Net Debt (Total Debt − Cash) / Consolidated EBITDA",
      thresholdHint: /net\s+leverage|net\s+debt/i,
      missing: [
        ...(netDebt == null ? ["Net Debt (Total Debt and Cash)"] : []),
        ...(ebitda == null ? ["Contractual EBITDA"] : []),
      ],
    },
    {
      name: "Secured leverage",
      family: "LEVERAGE",
      compute: () => ratioStr(securedDebt, ebitda),
      formula: "Secured Debt / Consolidated EBITDA",
      thresholdHint: /secured\s+leverage|senior\s+secured\s+leverage/i,
      missing: [
        ...(securedDebt == null ? ["Secured Debt"] : []),
        ...(ebitda == null ? ["Contractual EBITDA"] : []),
      ],
    },
    {
      name: "First-lien leverage",
      family: "LEVERAGE",
      compute: () => ratioStr(firstLienFromNotes, ebitda),
      formula: "First-Lien Debt / Consolidated EBITDA (uses mapped first-lien input; not assumed = all secured)",
      thresholdHint: /first.?lien\s+leverage/i,
      missing: [
        ...(firstLienFromNotes == null ? ["First-lien debt principal"] : []),
        ...(ebitda == null ? ["Contractual EBITDA"] : []),
      ],
    },
    {
      name: "Interest coverage",
      family: "COVERAGE",
      compute: () => ratioStr(ebitda, interestExpense),
      formula: "Consolidated EBITDA / Interest Expense",
      thresholdHint: /interest\s+coverage|coverage\s+ratio/i,
      missing: [
        ...(ebitda == null ? ["Contractual EBITDA"] : []),
        ...(interestExpense == null ? ["Interest Expense"] : []),
      ],
    },
    {
      name: "Fixed-charge coverage",
      family: "COVERAGE",
      compute: () => ratioStr(ebitda, fixedChargesFromNotes),
      formula: "Consolidated EBITDA / Fixed Charges (contract-defined)",
      thresholdHint: /fixed.?charge\s+coverage|fccr/i,
      missing: [
        ...(ebitda == null ? ["Contractual EBITDA"] : []),
        ...(fixedChargesFromNotes == null ? ["Fixed Charges"] : []),
      ],
    },
    {
      name: "Minimum liquidity",
      family: "LIQUIDITY",
      compute: () => (cash != null ? fmtM(cash) : null),
      formula: "Cash & cash equivalents (and undrawn revolving availability when modeled)",
      thresholdHint: /liquidity|minimum\s+cash/i,
      missing: cash == null ? ["Cash"] : [],
    },
  ];

  const allItems = review.categories.flatMap((c) =>
    c.items.map((item) => ({ ...item, categoryLabel: c.categoryLabel })),
  );

  const ratios: DebtIntelligenceDashboard["ratios"] = ratioDefs.map((rd, idx) => {
    const match = allItems.find((i) =>
      rd.thresholdHint.test(
        `${i.heading} ${i.plainEnglish} ${(i.materialBasketsThresholds ?? []).join(" ")}`,
      ),
    );
    const computed = rd.compute();
    const threshold =
      (match?.materialBasketsThresholds ?? []).find((b) => rd.thresholdHint.test(b) || /ratio|x\b|%/i.test(b)) ??
      (match ? (match.materialBasketsThresholds ?? [])[0] ?? null : null);
    const metricId = `ratio:${idx}:${rd.name.toLowerCase().replace(/\s+/g, "-")}`;
    let status: MetricNumericStatus = "CONDITIONAL";
    if (computed != null) status = "COMPUTED";
    else if (!snapshot) status = "MISSING_FINANCIALS";
    else if (!capacity.canEvaluateExecutableCapacity) status = "MISSING_RULEBOOK";
    else if (match) status = "AI_SURFACED";

    let cushion: string | null = null;
    if (computed && threshold) {
      const thr = threshold.match(/(\d+(?:\.\d+)?)\s*x/i);
      const cur = computed.match(/(\d+(?:\.\d+)?)/);
      if (thr && cur && rd.family === "LEVERAGE") {
        const headroom = Number(thr[1]) - Number(cur[1]);
        cushion = Number.isFinite(headroom) ? `${headroom.toFixed(2)}x to threshold` : null;
      }
    }

    return {
      metricId,
      name: rd.name,
      family: rd.family,
      currentValue: computed,
      threshold,
      cushion,
      status,
      testingDate: asOfDate,
      drilldown: buildDrilldown({
        metricId,
        title: rd.name,
        module: "RATIOS",
        companyId,
        item: match,
        approvals,
        formula: rd.formula,
        inputs: [
          { label: "Total Debt", value: totalDebt != null ? fmtM(totalDebt) : null, required: true },
          { label: "Secured Debt", value: securedDebt != null ? fmtM(securedDebt) : null, required: false },
          { label: "Cash", value: cash != null ? fmtM(cash) : null, required: false },
          { label: "EBITDA", value: ebitda != null ? fmtM(ebitda) : null, required: true },
          { label: "Interest Expense", value: interestExpense != null ? fmtM(interestExpense) : null, required: false },
        ],
        missing: rd.missing,
        calcHistory: [
          computed ? `Computed ${computed} from snapshot ${asOfDate}` : "No supported numerical result yet",
          threshold ? `Contractual threshold signal: ${threshold}` : "No threshold extracted",
        ],
      }),
    };
  });

  // Agreement-specific extras from AI
  for (const item of allItems.filter((i) => i.category === "FINANCIAL_MAINTENANCE").slice(0, 4)) {
    if (ratios.some((r) => r.drilldown.sectionCitation === item.sourceCitation)) continue;
    const metricId = `ratio:ai:${item.sectionRef}`;
    ratios.push({
      metricId,
      name: item.heading || `§${item.sectionRef}`,
      family: "AGREEMENT_SPECIFIC",
      currentValue: null,
      threshold: (item.materialBasketsThresholds ?? [])[0] ?? null,
      cushion: null,
      status: "AI_SURFACED",
      testingDate: asOfDate,
      drilldown: buildDrilldown({
        metricId,
        title: item.heading,
        module: "RATIOS",
        companyId,
        item,
        approvals,
        formula: (item.materialBasketsThresholds ?? [])[0] ?? item.plainEnglish.slice(0, 200),
        missing: snapshot ? ["Executable formula mapping"] : ["Financial snapshot", "Executable formula mapping"],
      }),
    });
  }

  // Counsel-compiled executable Permissions (section-keyed) for remaining capacity.
  const executablePermissions = await prisma.permission.findMany({
    where: { companyId, modelingStatus: "MODELED", OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] },
    take: 80,
  });
  const permissionBySection = new Map<string, (typeof executablePermissions)[number]>();
  for (const p of executablePermissions) {
    if (!permissionBySection.has(p.sectionRef)) permissionBySection.set(p.sectionRef, p);
  }
  const finForEval =
    snapshot && totalDebt != null && ebitda != null
      ? {
          ebitda,
          cash: cash ?? 0,
          interestExpense: interestExpense ?? 0,
          cumulativeNetIncome: num(snapshot.cumulativeNetIncome) ?? 0,
          equityProceedsSinceIssue: num(snapshot.equityProceedsSinceIssue) ?? 0,
          assumedNewDebtRatePct: num(snapshot.assumedNewDebtRatePct) ?? 0,
          totalDebt,
          securedDebt: securedDebt ?? 0,
          ...(totalAssets != null ? { totalAssets } : {}),
        }
      : null;
  const leverageMetrics = finForEval ? computeLeverageMetrics(finForEval) : null;

  // --- Baskets ---
  const baskets: DebtIntelligenceDashboard["baskets"] = [];
  for (const cat of review.categories) {
    for (const item of cat.items) {
      const basketLines = item.materialBasketsThresholds ?? [];
      if (basketLines.length === 0 && (item.conditions ?? []).length === 0) continue;
      if (
        !/basket|except|greater of|incremental|available amount|builder|lien|indebtedness|investment|restricted payment|ratio/i.test(
          `${item.heading} ${item.plainEnglish} ${basketLines.join(" ")}`,
        )
      ) {
        continue;
      }
      const family = classifyBasketFamily(cat.categoryLabel, item.heading, item.plainEnglish);
      const metricId = `basket:${item.sourceId}:${item.sectionRef}`;
      const approval = approvalByKey.get(`${item.sourceId}|${item.sectionRef}`);
      const utilTotal = [...ledgerByBasket.values()].reduce((a, b) => a + b, 0);
      const utilization =
        ledger.length > 0
          ? `${fmtM(utilTotal)} recorded ledger usage (basket mapping may be approximate)`
          : null;
      const matchedPerm = permissionBySection.get(item.sectionRef);
      let remaining: string | null = null;
      let basketStatus: MetricNumericStatus = approval
        ? "AI_SURFACED"
        : capacity.canEvaluateExecutableCapacity
          ? "CONDITIONAL"
          : "MISSING_RULEBOOK";
      const calcExtra: string[] = [];
      if (matchedPerm && finForEval && leverageMetrics && approval) {
        const evaluated = evaluateProvision(
          {
            id: matchedPerm.id,
            documentId: matchedPerm.documentId,
            code: matchedPerm.code ?? matchedPerm.id,
            basketName: matchedPerm.action,
            sectionRef: matchedPerm.sectionRef,
            formulaType: matchedPerm.formulaType as FormulaType,
            thresholdValue: num(matchedPerm.thresholdValue) ?? 0,
            params: (matchedPerm.params ?? {}) as FormulaParams,
          },
          finForEval,
          leverageMetrics,
        );
        if (evaluated.status === "modeled" && evaluated.capacity != null) {
          const used = utilTotal;
          const rem = Math.max(0, evaluated.capacity - used);
          remaining = fmtM(rem);
          basketStatus = "COMPUTED";
          calcExtra.push(
            `Executable Permission ${matchedPerm.code ?? matchedPerm.id}: capacity ${fmtM(evaluated.capacity)} − ledger ${fmtM(used)} = ${fmtM(rem)}`,
          );
        } else {
          basketStatus = "CONDITIONAL";
          calcExtra.push(evaluated.reason ?? "Permission present but evaluation conditional");
        }
      } else if (matchedPerm && approval) {
        basketStatus = "MISSING_FINANCIALS";
        calcExtra.push("Counsel-compiled Permission present — financial snapshot required for remaining capacity");
      } else if (approval) {
        basketStatus = "AI_SURFACED";
        calcExtra.push("Counsel accepted interpretation — awaiting executable compile or financials");
      }
      baskets.push({
        metricId,
        category: family,
        sectionRef: item.sectionRef,
        heading: item.heading,
        contractualCapacity: basketLines[0] ?? null,
        utilization,
        remaining,
        status: basketStatus,
        reviewDecision: approval?.decision ?? null,
        drilldown: buildDrilldown({
          metricId,
          title: `§${item.sectionRef} — ${item.heading}`,
          module: "BASKETS",
          companyId,
          item,
          approvals,
          formula: matchedPerm
            ? `${matchedPerm.formulaType} @ ${num(matchedPerm.thresholdValue)}; ${basketLines.join("; ")}`
            : basketLines.join("; ") || null,
          utilization: utilizationRows,
          missing: [
            ...(matchedPerm ? [] : ["Counsel-reviewed executable Permission"]),
            ...(finForEval ? [] : ["Financial inputs for growers/ratios"]),
            ...(utilization || matchedPerm ? [] : ["Ledger utilization for this basket"]),
          ],
          calcHistory: [
            approval
              ? `Counsel ${approval.decision} ${approval.reviewedAt}`
              : "AI draft — awaiting counsel review",
            ...calcExtra,
            utilization ?? "No ledger utilization attributed",
          ],
        }),
      });
    }
  }

  // --- Monitoring ---
  const monitoring: DebtIntelligenceDashboard["monitoring"] = feed.alerts.slice(0, 16).map((a, i) => {
    const metricId = `monitor:${i}:${a.kind}`;
    return {
      metricId,
      severity: a.severity === "blocking" ? "HIGH" : a.severity === "attention" ? "MEDIUM" : "INFO",
      title: a.title,
      detail: a.detail,
      kind: a.kind,
      drilldown: buildDrilldown({
        metricId,
        title: a.title,
        module: "MONITORING",
        companyId,
        formula: a.kind,
        calcHistory: [a.detail],
        missing: a.kind === "MISSING_FINANCIALS" ? ["Financial snapshot"] : [],
      }),
    };
  });

  // Maturities from facilities
  for (const f of facilities.filter((x) => x.maturityDate)) {
    const metricId = `monitor:maturity:${f.id}`;
    monitoring.push({
      metricId,
      severity: "INFO",
      title: `Maturity: ${f.name}`,
      detail: `Scheduled maturity ${f.maturityDate!.toISOString().slice(0, 10)}`,
      kind: "MATURITY",
      drilldown: buildDrilldown({
        metricId,
        title: `Maturity — ${f.name}`,
        module: "MONITORING",
        companyId,
        inputs: [
          { label: "Maturity date", value: f.maturityDate!.toISOString().slice(0, 10), required: true },
          { label: "Facility type", value: f.facilityType, required: false },
        ],
      }),
    });
  }

  if (review.amendmentCompare.operativeResolution !== "RESOLVED") {
    monitoring.push({
      metricId: "monitor:amendment",
      severity: "MEDIUM",
      title: "Amendment package status",
      detail: `Operative resolution: ${review.amendmentCompare.operativeResolution}`,
      kind: "AMENDMENT",
      drilldown: buildDrilldown({
        metricId: "monitor:amendment",
        title: "Amendment changes",
        module: "MONITORING",
        companyId,
        calcHistory: [review.amendmentCompare.operativeResolution],
        missing:
          review.amendmentCompare.operativeResolution === "UNRESOLVED_PRECEDENCE"
            ? ["Counsel amendment precedence judgment"]
            : [],
      }),
    });
  }

  // --- Transaction intelligence ---
  const transactionScenarios = [
    {
      scenario: "Proposed $100M secured debt",
      ask: "Can we incur $100 million of additional secured debt?",
      cats: /debt|lien|incremental/i,
    },
    {
      scenario: "Proposed $50M restricted payment",
      ask: "What restricted payment capacity exists for a $50 million dividend?",
      cats: /restricted payment|rp\b/i,
    },
    {
      scenario: "Proposed $75M investment / acquisition",
      ask: "Can we make a $75 million investment or acquisition?",
      cats: /investment|acquisition/i,
    },
    {
      scenario: "Refinance secured indebtedness",
      ask: "What refinancing permissions apply to existing secured debt?",
      cats: /refinance|refinancing|indebtedness/i,
    },
    {
      scenario: "Asset sale",
      ask: "What asset sale permissions and proceeds application rules apply?",
      cats: /asset sale|disposition/i,
    },
  ];

  const exerciseOverlay = loadDashboardOverlay(companyId);
  const overlayByScenario = new Map(
    (exerciseOverlay?.transactions ?? []).map((t) => [t.scenario.toLowerCase(), t]),
  );
  const overlayByExercise = new Map(
    (exerciseOverlay?.transactions ?? []).map((t) => [t.exerciseId, t]),
  );

  const transactions: DebtIntelligenceDashboard["transactions"] = transactionScenarios.map((sc, idx) => {
    const hits = allItems.filter((i) =>
      sc.cats.test(`${i.category} ${i.heading} ${i.plainEnglish}`),
    );
    const top = hits[0];
    const overlay =
      overlayByScenario.get(sc.scenario.toLowerCase()) ??
      (idx === 0 ? overlayByExercise.get("debt.secured.100") : undefined) ??
      (idx === 1 ? overlayByExercise.get("rp.dividend.50") : undefined);
    const metricId = overlay?.metricId ?? `txn:${idx}`;
    const status: MetricNumericStatus = overlay
      ? (overlay.status as MetricNumericStatus)
      : top
        ? snapshot
          ? "CONDITIONAL"
          : "MISSING_FINANCIALS"
        : "AI_SURFACED";
    return {
      metricId,
      scenario: sc.scenario,
      summary: overlay
        ? overlay.summary
        : top
          ? `AI matched §${top.sectionRef} (${top.heading}). ${hits.length} related provisions. Pro forma ratios/capacity remain conditional without executable rules.`
          : "No matching AI provisions yet — upload/analyze the financing package or Ask Headroom.",
      status,
      askHref: overlay?.askHref ?? `/${companyId}/ask?q=${encodeURIComponent(sc.ask)}`,
      simulateHref: `/${companyId}/simulate`,
      drilldown: buildDrilldown({
        metricId,
        title: sc.scenario,
        module: "TRANSACTIONS",
        companyId,
        item: top,
        approvals,
        formula: top ? (top.materialBasketsThresholds ?? []).join("; ") : null,
        missing: [
          ...(overlay?.missingInputs ?? []).map((m) => `Exercise input: ${m}`),
          ...(snapshot ? [] : ["Financial snapshot for pro forma ratios"]),
          ...(!capacity.canEvaluateExecutableCapacity
            ? ["Counsel-reviewed executable permissions"]
            : []),
        ],
        calcHistory: [
          ...(overlay
            ? [
                `Intelligence loop ${exerciseOverlay?.runId ?? ""} · ${overlay.outcome}`,
                ...overlay.citations.slice(0, 4).map((c) => `§${c.sectionRef} — ${c.excerpt.slice(0, 120)}`),
                ...(overlay.gaps.length ? [`Gaps: ${overlay.gaps.join(", ")}`] : []),
              ]
            : []),
          ...hits.slice(0, 5).map((h) => `§${h.sectionRef} — ${h.heading}`),
        ],
      }),
    };
  });

  // Append additional exercise-library results not covered by the five default scenarios.
  if (exerciseOverlay?.transactions?.length) {
    const covered = new Set(transactions.map((t) => t.metricId));
    for (const t of exerciseOverlay.transactions) {
      if (covered.has(t.metricId)) continue;
      if (transactions.length >= 16) break;
      transactions.push({
        metricId: t.metricId,
        scenario: t.scenario,
        summary: t.summary,
        status: t.status as MetricNumericStatus,
        askHref: t.askHref,
        simulateHref: `/${companyId}/simulate`,
        drilldown: buildDrilldown({
          metricId: t.metricId,
          title: t.scenario,
          module: "TRANSACTIONS",
          companyId,
          formula: t.analysis.slice(0, 400) || null,
          missing: t.missingInputs.map((m) => `Exercise input: ${m}`),
          calcHistory: [
            `Intelligence loop ${exerciseOverlay.runId} · ${t.outcome}`,
            ...t.citations.slice(0, 5).map((c) => `§${c.sectionRef}`),
          ],
        }),
      });
    }
  }

  const acceptedCount = approvals.filter((a) => a.decision === "ACCEPTED" || a.decision === "EDITED").length;

  // Pro forma $100M secured — uses counsel-compiled basket remaining + leverage math (no invented capacity).
  const proForma: DebtIntelligenceDashboard["proForma"] = [];
  const securedTxnAmount = 100;
  if (finForEval && ebitda != null && ebitda > 0) {
    const pfTotalDebt = finForEval.totalDebt + securedTxnAmount;
    const pfSecured = finForEval.securedDebt + securedTxnAmount;
    const pfInterest = finForEval.interestExpense + securedTxnAmount * ((assumedRate ?? 0) / 100);
    const computedBasket = baskets.find((b) => b.status === "COMPUTED" && b.remaining != null);
    const remainingNum = computedBasket?.remaining
      ? Number(String(computedBasket.remaining).replace(/[$,M]/g, ""))
      : null;
    let engineRemaining: string | null = null;
    let engineNotes: string[] = [];
    if (capacity.canEvaluateExecutableCapacity) {
      try {
        const { getCompanyDashboard } = await import("@/lib/dashboard-service");
        const dash = await getCompanyDashboard(companyId);
        const rem = dash.capacity.secured.remainingCapacity;
        engineRemaining = rem != null && Number.isFinite(rem) ? fmtM(rem) : null;
        const bindingMethod = dash.capacity.secured.binding?.method ?? "NOT_DETERMINABLE";
        engineNotes.push(
          `Engine secured remaining: ${engineRemaining ?? "not determinable"} (${bindingMethod})`,
        );
      } catch (err) {
        engineNotes.push(
          `Engine capacity unavailable: ${err instanceof Error ? err.message.slice(0, 160) : "error"}`,
        );
      }
    }
    const basketOk =
      remainingNum != null ? securedTxnAmount <= remainingNum : null;
    proForma.push({
      metricId: "proforma:secured:100",
      scenario: "Proposed $100M secured debt incurrence",
      amountMillions: securedTxnAmount,
      secured: true,
      status:
        remainingNum != null && capacity.canEvaluateExecutableCapacity
          ? basketOk
            ? "COMPUTED"
            : "CONDITIONAL"
          : snapshot
            ? "CONDITIONAL"
            : "MISSING_FINANCIALS",
      proFormaTotalLeverage: ratioStr(pfTotalDebt, ebitda),
      proFormaSecuredLeverage: ratioStr(pfSecured, ebitda),
      proFormaInterestCoverage: ratioStr(ebitda, pfInterest),
      basketRemainingAfter:
        remainingNum != null ? fmtM(Math.max(0, remainingNum - securedTxnAmount)) : null,
      engineCapacityRemaining: engineRemaining,
      notes: [
        `Pro forma total leverage ${(pfTotalDebt / ebitda).toFixed(2)}x; secured ${(pfSecured / ebitda).toFixed(2)}x`,
        remainingNum != null
          ? `Counsel-compiled basket remaining before txn ${fmtM(remainingNum)} → after ${fmtM(Math.max(0, remainingNum - securedTxnAmount))}`
          : "No COMPUTED counsel basket remaining yet — accept/compile a debt+lien basket",
        ...engineNotes,
        basketOk === false
          ? `$100M exceeds counsel-compiled remaining basket capacity`
          : `$100M tested against counsel-compiled baskets where available`,
      ],
      drilldown: buildDrilldown({
        metricId: "proforma:secured:100",
        title: "Pro forma $100M secured debt",
        module: "TRANSACTIONS",
        companyId,
        formula: "Pro forma Debt/EBITDA after +$100M secured; basket remaining − $100M",
        inputs: [
          { label: "Transaction amount", value: fmtM(securedTxnAmount), required: true },
          { label: "Opening total debt", value: totalDebt != null ? fmtM(totalDebt) : null, required: true },
          { label: "Opening secured debt", value: securedDebt != null ? fmtM(securedDebt) : null, required: true },
          { label: "EBITDA", value: fmtM(ebitda), required: true },
          {
            label: "Assumed new-debt rate",
            value: assumedRate != null ? `${assumedRate}%` : null,
            required: false,
          },
        ],
        missing: [
          ...(remainingNum == null ? ["Counsel-compiled basket remaining"] : []),
          ...(!capacity.canEvaluateExecutableCapacity ? ["Executable capacity path"] : []),
        ],
        calcHistory: [
          `PF total leverage = (${finForEval.totalDebt}+100)/${ebitda}`,
          `PF secured leverage = (${finForEval.securedDebt}+100)/${ebitda}`,
          ...engineNotes,
        ],
      }),
    });
  }

  const compiledForPaths = executablePermissions.map((p) => ({
    id: p.id,
    code: p.code,
    grantType: p.grantType,
    sectionRef: p.sectionRef,
    formulaType: p.formulaType,
    thresholdValue: num(p.thresholdValue) ?? 0,
    params: (p.params ?? null) as FormulaParams | null,
    action: p.action,
    modelingStatus: p.modelingStatus,
  }));

  const multiPath: MultiPathAnalysis[] = [
    analyzeMultiPathTransaction({
      amountMillions: 100,
      kind: "SECURED_DEBT",
      secured: true,
      label: "$100M secured debt incurrence",
      items: allItems,
      approvals,
      permissions: compiledForPaths,
      financials: finForEval,
    }),
    analyzeMultiPathTransaction({
      amountMillions: 75,
      kind: "RESTRICTED_PAYMENT",
      secured: false,
      label: "$75M restricted payment",
      items: allItems,
      approvals,
      permissions: compiledForPaths,
      financials: finForEval,
    }),
    analyzeMultiPathTransaction({
      amountMillions: 150,
      kind: "ACQUISITION",
      secured: true,
      label: "$150M acquisition (debt + investment + lien)",
      items: allItems,
      approvals,
      permissions: compiledForPaths,
      financials: finForEval,
    }),
  ];

  return {
    companyId,
    headline:
      review.documentCount === 0
        ? "Upload a financing package to populate debt intelligence."
        : `AI-populated debt intelligence · ${review.analyzedOkCount}/${review.documentCount} docs · rulebook ${rulebook.stage} · capacity ${capacity.status}`,
    generatedAt: new Date().toISOString(),
    capitalStructure: {
      numericStatus: snapshot ? "COMPUTED" : facilities.length ? "AI_SURFACED" : "MISSING_FINANCIALS",
      asOfDate,
      aggregates: {
        totalDebt,
        securedDebt,
        unsecuredDebt,
        cash,
        netDebt,
        ebitda,
        interestExpense,
      },
      instruments: capitalInstruments,
      notes: snapshot?.notes ?? null,
    },
    ratios,
    baskets: baskets.slice(0, 60),
    monitoring,
    transactions,
    proForma,
    multiPath,
    rulebookStage: rulebook.stage,
    capacityStatus: capacity.status,
    amendmentResolution: review.amendmentCompare.operativeResolution,
    documentCount: review.documentCount,
    interpretedCount: rulebook.interpretedProvisions,
    acceptedCount,
    note: "AI-first dashboard: contractual structures and interpretations populate from workspace documents without external legal verification. Numerical capacity stays fail-closed until counsel-reviewed executable rules and financial inputs exist. Counsel accepts/edits on /rulebook; Ask and Simulate reuse the same analyses. Multi-path analyses enumerate alternative contractual pathways without assuming basket stacking.",
  };
}

/** Lookup a single metric drilldown from a loaded dashboard. */
export function findDashboardMetric(
  dash: DebtIntelligenceDashboard,
  metricId: string,
): DashboardDrilldown | null {
  for (const i of dash.capitalStructure.instruments) {
    if (i.metricId === metricId) return i.drilldown;
  }
  for (const r of dash.ratios) {
    if (r.metricId === metricId) return r.drilldown;
  }
  for (const b of dash.baskets) {
    if (b.metricId === metricId) return b.drilldown;
  }
  for (const m of dash.monitoring) {
    if (m.metricId === metricId) return m.drilldown;
  }
  for (const t of dash.transactions) {
    if (t.metricId === metricId) return t.drilldown;
  }
  for (const p of dash.proForma ?? []) {
    if (p.metricId === metricId) return p.drilldown;
  }
  return null;
}
