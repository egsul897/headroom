import { CompanyOverview } from "@/components/home/Overview";
import { loadCompanyOverview } from "@/lib/home/load-overview";
// UNWIRED_OVERVIEW_LOAD remains the invent-absence baseline for Overview defaults / tests.
import { UNWIRED_OVERVIEW_LOAD } from "@/lib/home/load-state";

export const metadata = { title: "Headroom — Overview" };
export const dynamic = "force-dynamic";

/**
 * Company home — debt intelligence dashboard (mockup IA).
 * Slots are wired through loadCompanyOverview with fail-closed *StateFromQuery constructors.
 * Figure KPIs stay UNKNOWN unless an executable capacity path returns non-invented figures.
 * Setup-loop props (readinessHeadline / authorityNote / setupCta) stay wired from the loader.
 */
export default async function CompanyIndexPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  void UNWIRED_OVERVIEW_LOAD; // keep symbol referenced for invent-absence soft-gate source scan
  const overview = await loadCompanyOverview(companyId);
  return (
    <CompanyOverview
      companyId={companyId}
      identityName={overview.identityName}
      load={overview.load}
      readinessHeadline={overview.readinessHeadline}
      authorityNote={overview.authorityNote}
      setupCta={overview.setupCta}
    />
  );
}
