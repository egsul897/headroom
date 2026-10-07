import { notFound } from "next/navigation";
import { AskShell } from "@/components/ask/AskShell";
import { resolveAskShell } from "@/lib/ask/shell-runner";
import { getCompanySummary } from "@/lib/dashboard-service";

export const metadata = { title: "Headroom — Ask" };

/** Secondary interrogation route. The shell resolves to an empty case and does not answer. */
export default async function AskPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = await getCompanySummary(companyId).catch(() => null);
  if (!company) notFound();
  const initial = resolveAskShell({ companyId: company.id });
  return <AskShell companyId={company.id} initial={initial} />;
}
