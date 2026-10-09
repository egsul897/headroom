/**
 * Wire the mockup Overview dashboard to real workspace sources.
 * Uses *StateFromQuery constructors only — never invents $0 / 0% / Healthy without evidence.
 */

import { prisma } from "@/lib/prisma";
import { fmtM } from "@/lib/format";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { loadMonitoringFeed } from "@/lib/product/customer-intelligence/monitoring";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { listReviewerApprovals } from "@/lib/product/customer-intelligence/reviewer-approvals";
import {
  UNWIRED_OVERVIEW_LOAD,
  UNKNOWN_STATE,
  alertStateFromQuery,
  capacitySummaryStateFromQuery,
  covenantsAtRiskStateFromQuery,
  driversStateFromQuery,
  headroomOverTimeStateFromQuery,
  nextTestStateFromQuery,
  statusTableStateFromQuery,
  totalHeadroomStateFromQuery,
  transactionsStateFromLedger,
  utilizationStateFromQuery,
  type OverviewLoad,
  type StatusRow,
} from "@/lib/home/load-state";

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

export async function loadCompanyOverview(companyId: string): Promise<{
  load: OverviewLoad;
  identityName: string | null;
}> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const identityName = company?.name ?? null;

  const load: OverviewLoad = { ...UNWIRED_OVERVIEW_LOAD };

  try {
    const feed = await loadMonitoringFeed(companyId);
    const count = feed.alerts.length;
    load.alerts =
      count === 0
        ? alertStateFromQuery({ queried: true, outcome: "zero" })
        : alertStateFromQuery({ queried: true, outcome: "nonzero", count });

    const riskItems = feed.alerts
      .filter((a) => a.severity === "blocking" || a.severity === "attention")
      .map((a) => a.title)
      .slice(0, 6);
    if (riskItems.length === 0) {
      load.covenantsAtRisk = covenantsAtRiskStateFromQuery({ outcome: "empty" });
    } else if (riskItems.some((t) => /rulebook|capacity|precedence|review/i.test(t))) {
      load.covenantsAtRisk = covenantsAtRiskStateFromQuery({ outcome: "needs_review" });
    } else {
      load.covenantsAtRisk = covenantsAtRiskStateFromQuery({ outcome: "list", items: riskItems });
    }
  } catch {
    load.alerts = UNKNOWN_STATE;
    load.covenantsAtRisk = UNKNOWN_STATE;
  }

  try {
    const entries = await prisma.ledgerEntry.findMany({
      where: { companyId, status: "ACTIVE" },
      orderBy: { date: "desc" },
      take: 8,
    });
    if (entries.length === 0) {
      load.transactions = transactionsStateFromLedger({
        sourceAvailable: true,
        ledgerRead: true,
        outcome: "empty",
      });
    } else {
      const rows = entries.map((e) => {
        const amt = num(e.amount);
        const label = `${e.description} (${e.basket})`;
        const date = e.date.toISOString().slice(0, 10);
        return amt != null ? `${date} · ${label} · ${fmtM(amt)}` : `${date} · ${label}`;
      });
      load.transactions = transactionsStateFromLedger({
        sourceAvailable: true,
        ledgerRead: true,
        outcome: "populated",
        rows,
      });
    }
  } catch {
    load.transactions = UNKNOWN_STATE;
  }

  try {
    const [review, capacity, approvals, snapshot, facilities] = await Promise.all([
      loadCovenantReviewWorkspace(companyId),
      loadCapacityReadiness(companyId),
      listReviewerApprovals(companyId),
      prisma.financialSnapshot.findFirst({ where: { companyId }, orderBy: { asOfDate: "desc" } }),
      prisma.facility.findMany({ where: { companyId }, orderBy: { name: "asc" }, take: 12 }),
    ]);

    // Status table — AI-surfaced covenants; headroom NOT DETERMINABLE without executable path
    const statusRows: StatusRow[] = [];
    for (const cat of review.categories) {
      for (const item of cat.items.slice(0, 3)) {
        if (
          !["FINANCIAL_MAINTENANCE", "DEBT_INCURRENCE", "LIENS_SECURED_DEBT", "RESTRICTED_PAYMENTS_INVESTMENTS"].includes(
            item.category,
          )
        ) {
          continue;
        }
        const decision = approvals.find(
          (a) => a.sourceId === item.sourceId && a.sectionRef === item.sectionRef,
        );
        let status = "Needs review";
        if (decision?.decision === "ACCEPTED" || decision?.decision === "EDITED") status = "Reviewed";
        else if (decision?.decision === "REJECTED") status = "Rejected";
        else if (item.posture === "MAINTENANCE_TEST") status = "Needs review";

        const basket = (item.materialBasketsThresholds ?? [])[0];
        statusRows.push({
          covenant: item.heading || `§${item.sectionRef}`,
          facility: item.documentTitle || item.governingAgreement || "Financing package",
          status,
          headroom: capacity.canEvaluateExecutableCapacity
            ? basket || "See capacity engine"
            : "NOT DETERMINABLE",
          trend: "—",
          nextTest: snapshot?.asOfDate
            ? `As-of ${snapshot.asOfDate.toISOString().slice(0, 10)}`
            : "—",
        });
      }
    }
    load.statusTable =
      statusRows.length === 0
        ? statusTableStateFromQuery({ outcome: review.documentCount === 0 ? "empty" : "empty" })
        : statusTableStateFromQuery({ outcome: "populated", rows: statusRows.slice(0, 8) });

    // Next test — testing period from notes / snapshot date
    const testingHint =
      snapshot?.notes?.match(/Testing period:\s*([^|]+)/i)?.[1]?.trim() ||
      (snapshot ? `Financial as-of ${snapshot.asOfDate.toISOString().slice(0, 10)}` : null);
    load.nextTest = testingHint
      ? nextTestStateFromQuery({ outcome: "populated", rows: [testingHint] })
      : nextTestStateFromQuery({ outcome: "empty" });

    // Drivers — only from persisted snapshot notes / financial facts, not invented deltas
    const driverRows: string[] = [];
    if (snapshot) {
      const ebitda = num(snapshot.ebitda);
      const debt = num(snapshot.totalDebt);
      const cash = num(snapshot.cash);
      if (ebitda != null) driverRows.push(`EBITDA (snapshot) · ${fmtM(ebitda)}`);
      if (debt != null) driverRows.push(`Total debt (snapshot) · ${fmtM(debt)}`);
      if (cash != null) driverRows.push(`Cash (snapshot) · ${fmtM(cash)}`);
    }
    load.drivers =
      driverRows.length === 0
        ? driversStateFromQuery({ outcome: "empty" })
        : driversStateFromQuery({ outcome: "populated", rows: driverRows });

    // Headroom over time — no historical series without a time-series source
    load.headroomOverTime = headroomOverTimeStateFromQuery({ outcome: "empty" });

    // Capacity figures — ONLY when executable path is available
    if (capacity.canEvaluateExecutableCapacity) {
      try {
        const { getCompanyDashboard } = await import("@/lib/dashboard-service");
        const dash = await getCompanyDashboard(companyId);
        const securedRem = num(dash.capacity.secured?.remainingCapacity);
        const unsecRem = num(dash.capacity.unsecured?.remainingCapacity);
        const remParts = [securedRem, unsecRem].filter((n): n is number => n != null && n > 0);
        const totalRem = remParts.length ? remParts.reduce((a, b) => a + b, 0) : null;
        const totalDebt =
          num(dash.financialPosition?.capitalStructure?.grossDebt) ?? num(snapshot?.totalDebt);

        if (totalRem != null && totalRem > 0) {
          load.totalHeadroom = totalHeadroomStateFromQuery({
            outcome: "populated",
            display: `${fmtM(totalRem)} remaining (engine)`,
          });
        } else {
          load.totalHeadroom = totalHeadroomStateFromQuery({ outcome: "empty" });
        }

        if (totalDebt != null && totalDebt > 0 && totalRem != null) {
          const capacityTotal = totalDebt + totalRem;
          const utilPct = (totalDebt / capacityTotal) * 100;
          if (utilPct > 0) {
            load.utilization = utilizationStateFromQuery({
              outcome: "populated",
              display: `${utilPct.toFixed(1)}% · ${fmtM(totalDebt)} used of ${fmtM(capacityTotal)} capacity`,
            });
          } else {
            load.utilization = utilizationStateFromQuery({ outcome: "empty" });
          }
        } else {
          load.utilization = utilizationStateFromQuery({ outcome: "empty" });
        }

        if (facilities.length > 0) {
          const parts = facilities.map((f) => {
            const commit = num(f.commitmentAmount) ?? num(f.originalPrincipal);
            return commit != null && commit > 0 ? `${f.name}: ${fmtM(commit)}` : f.name;
          });
          const display = parts.filter(Boolean).join(" · ");
          load.capacitySummary = display
            ? capacitySummaryStateFromQuery({ outcome: "populated", display })
            : capacitySummaryStateFromQuery({ outcome: "empty" });
        } else {
          load.capacitySummary = capacitySummaryStateFromQuery({ outcome: "empty" });
        }
      } catch {
        load.totalHeadroom = UNKNOWN_STATE;
        load.utilization = UNKNOWN_STATE;
        load.capacitySummary = UNKNOWN_STATE;
      }
    } else {
      // Discovery-only workspaces: keep figure slots UNKNOWN (not fabricated zeros)
      load.totalHeadroom = UNKNOWN_STATE;
      load.utilization = UNKNOWN_STATE;
      load.capacitySummary = UNKNOWN_STATE;
    }

    // Export chrome stays disabled until export query wiring exists (exportChromeTitle lock)
    load.exportState = { kind: "UNKNOWN" };
  } catch {
    // leave remaining slots as UNWIRED defaults
  }

  return { load, identityName };
}
