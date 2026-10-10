import { DashboardClient } from "@/components/DashboardClient";
import { facilitiesQueryFromPosition, maturitiesQueryFromPosition } from "@/lib/dashboard/load-state";
import { loadCovenantOverviewInputs } from "@/lib/covenant-overview-service";

export const metadata = { title: "Headroom — Dashboard" };

/**
 * The Dashboard tab (task "MAKE THE UI MATCH THE PROTOTYPE EXACTLY" -
 * reference/headroom-coherent.jsx's "Position" tab, renamed to Dashboard
 * per the task's explicit instruction). Server component's ENTIRE job is
 * loading real data and normalizing it into plain, serializable props for
 * `DashboardClient` (components/DashboardClient.tsx) - every number is
 * still computed by the real engine (lib/covenant-engine.ts, unmodified),
 * called from `buildCovenantOverview` (lib/covenant-overview-builder.ts),
 * client-side for live editable-financials reflow with zero server
 * round-trip. This file performs no calculation of its own.
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
    />
  );
}
