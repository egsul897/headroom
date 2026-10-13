import { DashboardClient } from "@/components/DashboardClient";
import { facilitiesQueryFromPosition, maturitiesQueryFromPosition } from "@/lib/dashboard/load-state";
import { loadNs4DashboardFinancialState } from "@/lib/dashboard/ns4-financial-panel";
import { loadCovenantOverviewInputs } from "@/lib/covenant-overview-service";
import { loadContractualMetricsForDashboard } from "@/lib/product/contractual-metrics/service";
import { toContractualMetricsView } from "@/lib/product/contractual-metrics/serialize";

export const metadata = { title: "Headroom — Dashboard" };

/**
 * Dashboard GET/render — read-only loads only.
 *
 * - NS-4 APPROVED financial band via `loadNs4DashboardFinancialState` (Neon read).
 * - Provisional contractual metrics via `loadContractualMetricsForDashboard`
 *   (in-memory definition execution; never persists).
 * Capacity numbers still come from the real covenant engine via DashboardClient.
 * Provisional reconstructions are labeled at display and never replace APPROVED headlines.
 */
export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams?: Promise<{ evaluationDate?: string }>;
}) {
  const { companyId } = await params;
  const sp = searchParams ? await searchParams : {};
  const evaluationDate =
    typeof sp.evaluationDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.evaluationDate)
      ? sp.evaluationDate
      : undefined;

  // Overview load first — invent-absence: mint facilities/maturities queries only
  // after this returns. NS-4 band is a separate Neon read (fail-closed).
  const inputs = await loadCovenantOverviewInputs(companyId);
  const {
    company,
    asOfDate,
    covenantData,
    financialPosition,
    solverContext,
    permissionRows,
    coverageDeclarations,
    documentNameById,
    attributedUtilizationSerialized,
  } = inputs;

  // Read-only compute — no SemanticTruthRecord / ExternalInputRecord / certificate writes.
  const contractualBundle = await loadContractualMetricsForDashboard(companyId);
  const contractualMetrics = toContractualMetricsView(contractualBundle);

  // Verified-empty maturities/facilities are minted only after this load returned.
  // A throw never reaches these constructors, so a failed load cannot paint absence.
  const facilitiesQuery = facilitiesQueryFromPosition(financialPosition, documentNameById);
  const maturitiesQuery = maturitiesQueryFromPosition(financialPosition);

  const ns4Financial = await loadNs4DashboardFinancialState({ companyId, evaluationDate });

  return (
    <DashboardClient
      companyId={companyId}
      companyName={company.name}
      asOfDate={asOfDate.toISOString()}
      covenantData={covenantData}
      financialPosition={financialPosition}
      solverContext={{ ...solverContext, activationState: { ...solverContext.activationState, unknownKeysArray: [...solverContext.activationState.unknownKeys] } }}
      permissionRows={permissionRows}
      coverageDeclarations={coverageDeclarations}
      documentNameEntries={[...documentNameById.entries()]}
      facilitiesQuery={facilitiesQuery}
      maturitiesQuery={maturitiesQuery}
      attributedUtilizationSerialized={attributedUtilizationSerialized}
      ns4Financial={ns4Financial}
      contractualMetrics={contractualMetrics}
    />
  );
}
