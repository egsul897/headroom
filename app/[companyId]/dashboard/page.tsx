import { DashboardClient } from "@/components/DashboardClient";
import { loadCovenantOverviewInputs } from "@/lib/covenant-overview-service";
import { fmtDate } from "@/lib/format";

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
  const { company, asOfDate, covenantData, financialPosition, solverContext, permissionRows, coverageDeclarations, documentNameById } = inputs;

  const capitalStructure = financialPosition.capitalStructure.facilities.map((f) => ({
    name: f.facility.name,
    secured: f.facility.secured,
    documentName: f.facility.governingDocumentId ? (documentNameById.get(f.facility.governingDocumentId) ?? null) : null,
    amount: f.outstandingPrincipal,
  }));

  const nextMaturity = financialPosition.maturities.nextMaturity;

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
      capitalStructure={capitalStructure}
      maturities={{
        nextMaturityLabel: nextMaturity?.facilityName ?? null,
        nextMaturityDate: nextMaturity ? fmtDate(nextMaturity.date) : null,
        nextMaturityAmount: nextMaturity?.principal ?? null,
        dueWithin12: financialPosition.maturities.dueWithin12Months,
        dueWithin24: financialPosition.maturities.dueWithin24Months,
        dueWithin36: financialPosition.maturities.dueWithin36Months,
      }}
    />
  );
}
