import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { listCompanies, getCompanySummary } from "@/lib/dashboard-service";
import { CompanyNav } from "@/components/CompanyNav";

/**
 * The company-scoped shell for the generalized product IA - fetches
 * whichever company the `[companyId]` route segment names (no hardcoded
 * company id anywhere in this file) and renders it identically regardless of
 * which company that is. 404s for an unknown companyId rather than
 * fabricating a page.
 */
export default async function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [company, allCompanies] = await Promise.all([getCompanySummary(companyId).catch(() => null), listCompanies()]);
  if (!company) notFound();

  return (
    <div className="stack">
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="site-header-row" style={{ marginBottom: 0 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>
              {company.name}
              {company.ticker ? ` (${company.ticker})` : ""}
            </div>
            <div className="company-switcher">
              {allCompanies.map((c) => (
                <Link key={c.id} href={c.onboardingStatus === "ONBOARDING" ? `/${c.id}/onboarding` : `/${c.id}/overview`} className={c.id === companyId ? "active" : ""}>
                  {c.name}
                  {c.onboardingStatus !== "ACTIVE" ? " *" : ""}
                </Link>
              ))}
              <Link href="/companies/new">+ New</Link>
            </div>
          </div>
        </div>
        <CompanyNav companyId={companyId} onboardingStatus={company.onboardingStatus} />
      </div>
      {children}
    </div>
  );
}
