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
 *
 * Customer-workspace tenancy (docs/headroom-master-product-architecture.md
 * §B): a CUSTOMER-tenant company gets the plain customer shell - its own
 * name, no switcher, no "+ New", nothing naming any other tenant, so it
 * never feels like a shared multi-company database. An EVALUATION-tenant
 * company (Coherent, Matthews, synthetic/test fixtures - reachable only via
 * /admin in the first place) keeps the full switcher across every
 * EVALUATION company, since that IS the point of admin/internal mode.
 */
export default async function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [company, allCompanies] = await Promise.all([getCompanySummary(companyId).catch(() => null), listCompanies()]);
  if (!company) notFound();

  const evaluationCompanies = allCompanies.filter((c) => c.tenantKind === "EVALUATION");

  return (
    <div className="stack">
      <div className="card" style={{ marginBottom: 0 }}>
        <div className="site-header-row" style={{ marginBottom: 0 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>
              {company.name}
              {company.ticker ? ` (${company.ticker})` : ""}
            </div>
            {company.tenantKind === "EVALUATION" && (
              <div className="company-switcher">
                {evaluationCompanies.map((c) => (
                  <Link key={c.id} href={c.onboardingStatus === "ONBOARDING" ? `/${c.id}/onboarding` : `/${c.id}/dashboard`} className={c.id === companyId ? "active" : ""}>
                    {c.name}
                    {c.onboardingStatus !== "ACTIVE" ? " *" : ""}
                  </Link>
                ))}
                <Link href="/companies/new">+ New</Link>
                <Link href="/admin">Admin home</Link>
              </div>
            )}
          </div>
        </div>
        <CompanyNav companyId={companyId} onboardingStatus={company.onboardingStatus} />
      </div>
      {children}
    </div>
  );
}
