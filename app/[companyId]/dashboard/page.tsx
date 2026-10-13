import { DashboardClient } from "@/components/DashboardClient";
import { facilitiesQueryFromPosition, maturitiesQueryFromPosition } from "@/lib/dashboard/load-state";
import { loadCovenantOverviewInputs } from "@/lib/covenant-overview-service";
import { loadContractualMetricsForDashboard } from "@/lib/product/contractual-metrics/service";
import { toContractualMetricsView } from "@/lib/product/contractual-metrics/serialize";

export const metadata = { title: "Headroom — Dashboard" };

/**
 * The Dashboard tab. Loads covenant overview inputs and definition-executed
 * contractual metrics (Phase 4A). Capacity numbers still come from the real
 * covenant engine via DashboardClient → buildCovenantOverview.
 *
 * Contractual metrics are read-only on GET/render — never persist to Neon or
 * customer DBs from this path. Provisional reconstructions are labeled at display.
 */
export default async function DashboardPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
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

  return (
    <DashboardClient
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
      contractualMetrics={contractualMetrics}
    />
  );
}
