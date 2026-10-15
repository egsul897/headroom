import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getCompanySummary } from "@/lib/dashboard-service";
import { AppShell } from "@/components/shell/AppShell";
import "../home-shell.css";

/**
 * Company shell. The company card is the database name. There is no
 * signed-in user, so the user card is omitted. The shell does not render
 * a leverage figure — overview slots stay on Product LOCK empty copy.
 */
export default async function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = await getCompanySummary(companyId).catch(() => null);
  if (!company) notFound();

  return (
    <AppShell companyId={companyId} companyName={company.name} ticker={company.ticker} onboardingStatus={company.onboardingStatus}>
      {children}
    </AppShell>
  );
}
