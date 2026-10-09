/**
 * Company home overview loader — wires invent-absence slots to authoritative queries.
 *
 * Wired now:
 * - identity (company name)
 * - transactions (ACTIVE LedgerEntry)
 * - totalHeadroom / utilization / capacitySummary / statusTable when capacity readiness
 *   says the legacy covenant engine can evaluate without inventing inputs
 *
 * Unwired (stay UNKNOWN): alerts, covenantsAtRisk, nextTest, drivers, headroomOverTime, export
 *
 * Figure authority: LEGACY_ENGINE / NOT_CERTIFIED_4E until North-Star 4A–4E product paths replace it.
 * IMPLEMENTED ≠ CERTIFIED.
 */

import { prisma } from "@/lib/prisma";
import { getCompanyDashboard, getCompanySummary } from "@/lib/dashboard-service";
import { fmtM, fmtX } from "@/lib/format";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import {
  UNWIRED_OVERVIEW_LOAD,
  capacitySummaryStateFromQuery,
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

function headroomDisplay(secured?: number, unsecured?: number): string | null {
  const parts: string[] = [];
  if (secured !== undefined && Number.isFinite(secured) && secured > 0) {
    parts.push(`${fmtM(secured)} secured`);
  }
  if (unsecured !== undefined && Number.isFinite(unsecured) && unsecured > 0) {
    parts.push(`${fmtM(unsecured)} unsecured`);
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

function utilizationDisplay(used: number, capacity: number): string | null {
  if (!(capacity > 0) || !(used >= 0) || !Number.isFinite(used) || !Number.isFinite(capacity)) {
    return null;
  }
  const pct = (used / capacity) * 100;
  if (!(pct > 0)) return null;
  return `${pct.toFixed(1)}% — ${fmtM(used)} used of ${fmtM(capacity)} capacity`;
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
    const dashboard = await getCompanyDashboard(companyId);
    const securedRem = dashboard.capacity.secured.remainingCapacity;
    const unsecuredRem = dashboard.capacity.unsecured.remainingCapacity;
    const headroom = headroomDisplay(securedRem, unsecuredRem);
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
            display: `${fmtM(commitmentTotal)} total — ${facilityParts.join(" · ")}`,
          })
        : capacitySummaryStateFromQuery({ outcome: "failed" });

    const rows: StatusRow[] = [];
    const metrics = dashboard.financialPosition.metrics;
    if (metrics.genericNetLeverage.value != null && Number.isFinite(metrics.genericNetLeverage.value)) {
      rows.push({
        covenant: "Generic net leverage (not covenant-defined)",
        facility: "Financial position",
        status: "Informational",
        headroom: fmtX(metrics.genericNetLeverage.value),
        trend: "—",
        nextTest: dashboard.asOfDate.toISOString().slice(0, 10),
      });
    }

    for (const doc of dashboard.capacity.secured.perDocument) {
      const rem = doc.remainingCapacity;
      let status: string;
      if (rem === undefined) {
        status = doc.method === "NOT_DETERMINABLE" ? "Not determinable" : "Needs review";
      } else if (rem > 0) {
        status = "Within capacity";
      } else {
        status = "At capacity";
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

    load.statusTable =
      rows.length > 0
        ? statusTableStateFromQuery({ outcome: "populated", rows })
        : statusTableStateFromQuery({ outcome: "empty" });
  } catch {
    load.totalHeadroom = totalHeadroomStateFromQuery({ outcome: "failed" });
    load.utilization = utilizationStateFromQuery({ outcome: "failed" });
    load.capacitySummary = capacitySummaryStateFromQuery({ outcome: "failed" });
    load.statusTable = statusTableStateFromQuery({ outcome: "failed" });
  }

  return { companyId, identityName, load, readinessHeadline, authorityNote };
}
