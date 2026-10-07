import { notFound } from "next/navigation";
import { ToolsIndex } from "@/components/home/ToolsIndex";
import { getCompanySummary } from "@/lib/dashboard-service";

export const metadata = { title: "Headroom — Deal setup & tools" };

/** Hosts links to legacy Dashboard, Simulate, Feeds, Docs, and Ledger. */
export default async function ToolsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = await getCompanySummary(companyId).catch(() => null);
  if (!company) notFound();
  return <ToolsIndex companyId={company.id} onboardingStatus={company.onboardingStatus} />;
}
