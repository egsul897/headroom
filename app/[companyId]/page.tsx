import { CompanyOverview } from "@/components/home/Overview";

export const metadata = { title: "Headroom — Overview" };

/**
 * Company home. Chunk A′ stops the redirect to Dashboard and renders the
 * overview skeleton. No identity is available, so the greeting stays unnamed.
 * Alert badge stays hidden: this page does not invent an alert count.
 */
export default async function CompanyIndexPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  return <CompanyOverview companyId={companyId} identityName={null} alertCount={0} />;
}
