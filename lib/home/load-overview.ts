/**
 * Company home overview loader — wires invent-absence slots to authoritative queries.
 *
 * Wired now:
 * - identity (company name)
 * - transactions (ACTIVE LedgerEntry)
 * - totalHeadroom / utilization / capacitySummary / statusTable / covenantsAtRisk
 *   from covenant overview + capacity engines when readiness allows
 *
 * Unwired (stay UNKNOWN): alerts, nextTest, drivers, headroomOverTime, export
 *
 * Figure authority: LEGACY_ENGINE / NOT_CERTIFIED_4E until North-Star 4A–4E product paths replace it.
 * IMPLEMENTED ≠ CERTIFIED.
 */

import { prisma } from "@/lib/prisma";
import { getCompanyDashboard, getCompanySummary } from "@/lib/dashboard-service";
import { getCovenantOverview, type OverviewRow } from "@/lib/covenant-overview-service";
import { fmtM, fmtX } from "@/lib/format";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import {
  UNWIRED_OVERVIEW_LOAD,
  capacitySummaryStateFromQuery,
  covenantsAtRiskStateFromQuery,
  statusTableStateFromQuery,
  totalHeadroomStateFromQuery,
  transactionsStateFromLedger,
  utilizationStateFromQuery,
  type OverviewLoad,
  type StatusRow,
} from "@/lib/home/load-state";

export interface CompanyOverviewBundle {
  companyId: string;
  identityName: string | null;
  load: OverviewLoad;
  readinessHeadline: string;
  authorityNote: string;
}

function formatLedgerRow(entry: {
  date: Date;
  description: string;
  amount: { toNumber(): number } | number;
  direction: string;
  basket: string;
}): string {
  const amount = typeof entry.amount === "number" ? entry.amount : entry.amount.toNumber();
  const date = entry.date.toISOString().slice(0, 10);
  return `${entry.description} (${fmtM(amount)} · ${entry.direction} · ${entry.basket} · ${date})`;
}

/** Primary headroom figure for the mockup KPI — secured remaining when modeled. */
function primaryHeadroomDisplay(secured?: number, unsecured?: number): string | null {
  if (secured !== undefined && Number.isFinite(secured) && secured > 0) {
    return fmtM(secured);
  }
  if (unsecured !== undefined && Number.isFinite(unsecured) && unsecured > 0) {
    return fmtM(unsecured);
  }
  return null;
}

function utilizationDisplay(used: number, capacity: number): string | null {
  if (!(capacity > 0) || !(used >= 0) || !Number.isFinite(used) || !Number.isFinite(capacity)) {
    return null;
  }
  const pct = (used / capacity) * 100;
  if (!(pct > 0)) return null;
  return `${pct.toFixed(1)}% · ${fmtM(used)} used of ${fmtM(capacity)} capacity`;
}

type RatioHealth = "Healthy" | "Moderate" | "At Risk";

function ratioHealth(row: Extract<OverviewRow, { kind: "RATIO" }>): RatioHealth | null {
  if (row.status !== "MODELED" || row.currentRatio === null || row.ratioHeadroom === null) return null;
  if (!Number.isFinite(row.ratioLimit) || row.ratioLimit <= 0) return null;
  if (row.ratioHeadroom <= 0) return "At Risk";
  const cushion = row.ratioHeadroom / row.ratioLimit;
  if (cushion < 0.15) return "Moderate";
  return "Healthy";
}

function collectRatioRows(overview: Awaited<ReturnType<typeof getCovenantOverview>>): Extract<OverviewRow, { kind: "RATIO" }>[] {
  const preferred = overview.covenantFamilies.find((f) => f.family === "FINANCIAL_COVENANTS")?.rows ?? [];
  const fromFinancial = preferred.filter((r): r is Extract<OverviewRow, { kind: "RATIO" }> => r.kind === "RATIO" && r.status === "MODELED");
  if (fromFinancial.length > 0) return fromFinancial;

  const all: Extract<OverviewRow, { kind: "RATIO" }>[] = [];
  for (const fam of overview.covenantFamilies) {
    for (const row of fam.rows) {
      if (row.kind === "RATIO" && row.status === "MODELED") all.push(row);
    }
  }
  return all;
}

function statusRowsFromOverview(overview: Awaited<ReturnType<typeof getCovenantOverview>>): StatusRow[] {
  const asOf = overview.asOfDate.toISOString().slice(0, 10);
  const rows: StatusRow[] = [];
  const seen = new Set<string>();

  for (const row of collectRatioRows(overview)) {
    const health = ratioHealth(row);
    if (!health) continue;
    const metric = row.name.split(" — ")[0]?.trim() || row.name;
    if (seen.has(metric)) continue;
    seen.add(metric);
    const headroom =
      row.ratioHeadroom !== null && Number.isFinite(row.ratioHeadroom)
        ? `${fmtX(row.currentRatio ?? 0)} / ${fmtX(row.ratioLimit)} · ${fmtX(row.ratioHeadroom)} headroom`
        : fmtX(row.currentRatio ?? 0);
    rows.push({
      covenant: metric,
      facility: row.documentName,
      status: health,
      headroom,
      trend: "—",
      nextTest: asOf,
    });
  }

  // Basket capacity rows that are binding or locked (dollar headroom).
  for (const fam of overview.covenantFamilies) {
    if (fam.family !== "INDEBTEDNESS" && fam.family !== "RESTRICTED_PAYMENTS") continue;
    for (const row of fam.rows) {
      if (row.kind !== "CAPACITY" || row.status !== "MODELED") continue;
      if (row.bindingState !== "BINDING" && !(row.currentCapacity !== null && row.currentCapacity <= 0)) continue;
      const key = `${row.name}:${row.sectionRef}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rem = row.currentCapacity;
      rows.push({
        covenant: row.name,
        facility: row.documentName,
        status: rem !== null && rem <= 0 ? "At Risk" : "Healthy",
        headroom: rem !== null && Number.isFinite(rem) && rem > 0 ? fmtM(rem) : "—",
        trend: "—",
        nextTest: "—",
      });
    }
  }

  return rows;
}

export async function loadCompanyOverview(companyId: string): Promise<CompanyOverviewBundle> {
  const load: OverviewLoad = { ...UNWIRED_OVERVIEW_LOAD };

  const company = await getCompanySummary(companyId).catch(() => null);
  const identityName = company?.name?.trim() ? company.name.trim() : null;

  try {
    const entries = await prisma.ledgerEntry.findMany({
      where: { companyId, status: "ACTIVE" },
      orderBy: { date: "desc" },
      take: 8,
    });
    load.transactions =
      entries.length === 0
        ? transactionsStateFromLedger({ sourceAvailable: true, ledgerRead: true, outcome: "empty" })
        : transactionsStateFromLedger({
            sourceAvailable: true,
            ledgerRead: true,
            outcome: "populated",
            rows: entries.map(formatLedgerRow),
          });
  } catch {
    load.transactions = transactionsStateFromLedger({ sourceAvailable: true, ledgerRead: false });
  }

  const readiness = await loadCapacityReadiness(companyId).catch(() => null);
  const readinessHeadline =
    readiness?.headline ?? "Capacity readiness could not be loaded — figure slots stay blank.";
  const authorityNote =
    readiness?.guidance ??
    "LEGACY_ENGINE capacity ≠ certified Phase 4A–4E. Missing inputs stay blank.";

  if (!readiness?.canEvaluateExecutableCapacity) {
    return { companyId, identityName, load, readinessHeadline, authorityNote };
  }

  try {
    const [dashboard, covenantOverview] = await Promise.all([
      getCompanyDashboard(companyId),
      getCovenantOverview(companyId).catch(() => null),
    ]);

    const securedRem = covenantOverview?.securedCapacity.remainingCapacity ?? dashboard.capacity.secured.remainingCapacity;
    const unsecuredRem = covenantOverview?.unsecuredCapacity.remainingCapacity ?? dashboard.capacity.unsecured.remainingCapacity;
    const headroom = primaryHeadroomDisplay(securedRem, unsecuredRem);
    load.totalHeadroom = headroom
      ? totalHeadroomStateFromQuery({ outcome: "populated", display: headroom })
      : totalHeadroomStateFromQuery({ outcome: "failed" });

    const grossDebt = dashboard.financialPosition.capitalStructure.grossDebt;
    const facilities = await prisma.facility.findMany({ where: { companyId } });
    let commitmentTotal = 0;
    const facilityParts: string[] = [];
    for (const f of facilities) {
      const commitment =
        f.commitmentAmount != null
          ? Number(f.commitmentAmount)
          : f.originalPrincipal != null
            ? Number(f.originalPrincipal)
            : NaN;
      if (Number.isFinite(commitment) && commitment > 0) {
        commitmentTotal += commitment;
        facilityParts.push(`${f.name}: ${fmtM(commitment)}`);
      }
    }

    const util = utilizationDisplay(grossDebt, commitmentTotal);
    load.utilization = util
      ? utilizationStateFromQuery({ outcome: "populated", display: util })
      : utilizationStateFromQuery({ outcome: "failed" });

    load.capacitySummary =
      facilityParts.length > 0 && commitmentTotal > 0
        ? capacitySummaryStateFromQuery({
            outcome: "populated",
            display: `${fmtM(commitmentTotal)} total · ${facilityParts.join(" · ")}`,
          })
        : capacitySummaryStateFromQuery({ outcome: "failed" });

    const rows: StatusRow[] = covenantOverview ? statusRowsFromOverview(covenantOverview) : [];
    if (rows.length === 0) {
      // Fallback: per-document secured capacity (prior wiring).
      for (const doc of dashboard.capacity.secured.perDocument) {
        const rem = doc.remainingCapacity;
        let status: string;
        if (rem === undefined) {
          status = doc.method === "NOT_DETERMINABLE" ? "Not determinable" : "Needs review";
        } else if (rem > 0) {
          status = "Healthy";
        } else {
          status = "At Risk";
        }
        rows.push({
          covenant: `${doc.documentName} (secured debt capacity)`,
          facility: doc.documentName,
          status,
          headroom: rem !== undefined && rem > 0 ? fmtM(rem) : "—",
          trend: "—",
          nextTest: "—",
        });
      }
    }

    load.statusTable =
      rows.length > 0
        ? statusTableStateFromQuery({ outcome: "populated", rows })
        : statusTableStateFromQuery({ outcome: "empty" });

    const atRisk = rows.filter((r) => r.status === "At Risk" || r.status === "Moderate");
    load.covenantsAtRisk =
      atRisk.length === 0
        ? covenantsAtRiskStateFromQuery({ outcome: "empty" })
        : covenantsAtRiskStateFromQuery({
            outcome: "list",
            items: [
              `${atRisk.length}`,
              ...atRisk.map((r) => `${r.covenant} — ${r.status} (${r.headroom})`),
            ],
          });
  } catch {
    load.totalHeadroom = totalHeadroomStateFromQuery({ outcome: "failed" });
    load.utilization = utilizationStateFromQuery({ outcome: "failed" });
    load.capacitySummary = capacitySummaryStateFromQuery({ outcome: "failed" });
    load.statusTable = statusTableStateFromQuery({ outcome: "failed" });
  }

  return { companyId, identityName, load, readinessHeadline, authorityNote };
}
