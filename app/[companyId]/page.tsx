import { CompanyOverview } from "@/components/home/Overview";
import { loadCompanyOverview } from "@/lib/home/load-overview";

export const metadata = { title: "Headroom — Dashboard" };

/**
 * Company home dashboard. Slots load from authoritative queries via
 * `loadCompanyOverview` — invent-absence when unwired or not determinable.
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
