import { CompanyOverview } from "@/components/home/Overview";
import { loadCompanyOverview } from "@/lib/home/load-overview";

export const metadata = { title: "Headroom — Dashboard" };

/**
 * Company home — mockup overview layout, engine-backed figures.
 *
 * Visual shell is `CompanyOverview` (KPI cards, status table, capacity).
 * Numbers come from `loadCompanyOverview` → covenant overview / capacity
 * engines. Missing inputs stay blank (invent-absence). No demo hardcodes.
 */
export default async function CompanyIndexPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const overview = await loadCompanyOverview(companyId);
  return (
    <CompanyOverview
      companyId={companyId}
      identityName={overview.identityName}
      load={overview.load}
      readinessHeadline={overview.readinessHeadline}
      authorityNote={overview.authorityNote}
    />
  );
}
