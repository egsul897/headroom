import { CompanyOverview } from "@/components/home/Overview";
import { UNWIRED_OVERVIEW_LOAD } from "@/lib/home/load-state";

export const metadata = { title: "Headroom — Overview" };

/**
 * Company home. Overview sources are unwired, so every slot is UNKNOWN.
 * This page does not pass a numeric alert count.
 */
export default async function CompanyIndexPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return <CompanyOverview companyId={companyId} identityName={null} load={UNWIRED_OVERVIEW_LOAD} />;
}
