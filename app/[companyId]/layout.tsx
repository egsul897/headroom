import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getCompanySummary } from "@/lib/dashboard-service";
import { AppShell } from "@/components/shell/AppShell";
import { requireTenantOrRedirect } from "@/lib/auth/guard";
import "../home-shell.css";
import "../ux-features.css";

/**
 * Company shell. The company card is the database name. The shell does not
 * render a leverage figure.
 *
 * SaaS tenant gate: this layout wraps the ENTIRE /[companyId] subtree, so
 * every company page (dashboard, covenants, capacity, simulate, documents,
 * …) is authenticated + tenant-scoped. The gate runs BEFORE any company
 * data is read, so an unauthenticated or cross-tenant request never
 * reaches tenant data and never learns whether the tenant exists.
 */
export default async function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  await requireTenantOrRedirect(companyId);
  const company = await getCompanySummary(companyId).catch(() => null);
  if (!company) notFound();

  return (
    <AppShell companyId={companyId} companyName={company.name} ticker={company.ticker} onboardingStatus={company.onboardingStatus}>
      {children}
    </AppShell>
  );
}
