import { DashboardClient } from "@/components/DashboardClient";
import { facilitiesQueryFromPosition, maturitiesQueryFromPosition } from "@/lib/dashboard/load-state";
import { loadNs4DashboardFinancialState } from "@/lib/dashboard/ns4-financial-panel";
import { loadCovenantOverviewInputs } from "@/lib/covenant-overview-service";
import { loadContractualLeverageForCompany } from "@/lib/product/contractual-leverage";

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
 *
 * North-Star financial facts come from Neon NS-4 via
 * `loadNs4DashboardFinancialState` — never from inventing legacy figures.
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
  const leverage = await loadContractualLeverageForCompany(companyId, inputs.asOfDate);
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
      contractualLeverageRequests={leverage.requests}
    />
  );
}
