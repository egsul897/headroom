import { DashboardClient } from "@/components/DashboardClient";
import { facilitiesQueryFromPosition, maturitiesQueryFromPosition } from "@/lib/dashboard/load-state";
import { loadCovenantOverviewInputs } from "@/lib/covenant-overview-service";

export const metadata = { title: "Headroom — Dashboard" };

/**
 * Company home = financial & covenant dashboard.
 *
 * Loads uploaded financials + debt-agreement rules via existing infrastructure
 * (`loadCovenantOverviewInputs` → `buildCovenantOverview` / covenant-engine).
 * Arithmetic is deterministic engine code; missing inputs stay blank / flagged.
 * No hardcoded demo ratios. No second calculation engine.
 */
export default async function CompanyIndexPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const inputs = await loadCovenantOverviewInputs(companyId);
  const { company, asOfDate, covenantData, financialPosition, solverContext, permissionRows, coverageDeclarations, documentNameById } =
    inputs;

  const facilitiesQuery = facilitiesQueryFromPosition(financialPosition, documentNameById);
  const maturitiesQuery = maturitiesQueryFromPosition(financialPosition);

  return (
    <DashboardClient
      companyName={company.name}
      asOfDate={asOfDate.toISOString()}
      covenantData={covenantData}
      financialPosition={financialPosition}
      solverContext={{
        ...solverContext,
        activationState: {
          ...solverContext.activationState,
          unknownKeysArray: [...solverContext.activationState.unknownKeys],
        },
      }}
      permissionRows={permissionRows}
      coverageDeclarations={coverageDeclarations}
      documentNameEntries={[...documentNameById.entries()]}
      facilitiesQuery={facilitiesQuery}
      maturitiesQuery={maturitiesQuery}
    />
  );
}
