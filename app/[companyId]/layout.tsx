import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCompanySummary } from "@/lib/dashboard-service";
import { getLiveTotalNetLeverage } from "@/lib/covenant-overview-service";
import { CompanyNav } from "@/components/CompanyNav";
import { fmtX } from "@/lib/format";

/**
 * The company-scoped shell (task "MAKE THE UI MATCH THE PROTOTYPE EXACTLY" -
 * "sticky header with company name and live total net leverage -> tab row
 * -> dense single-scroll content"). Fetches whichever company the
 * `[companyId]` route segment names (no hardcoded company id anywhere in
 * this file) and renders it identically regardless of which company that
 * is - 404s for an unknown companyId rather than fabricating a page.
 *
 * `.site-header`/`.site-title`/`.site-subtitle`/`.site-metric*` are the
 * SAME CSS classes the prototype's own header structure maps onto
 * (app/globals.css, already exactly matching the prototype's inline
 * styles) - this file supplies the real data those classes render.
 */
export default async function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const company = await getCompanySummary(companyId).catch(() => null);
  if (!company) notFound();

  const tnl = company.onboardingStatus === "ONBOARDING" ? null : await getLiveTotalNetLeverage(companyId).catch(() => null);

  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-header-row">
            <div>
              <div className="site-title">
                <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
                  Headroom
                </Link>
              </div>
              <div className="site-subtitle">
                {company.name}
                {company.ticker ? ` (${company.ticker})` : ""}
              </div>
            </div>
            {tnl !== null && (
              <div className="site-metric">
                <div className="site-metric-value">{fmtX(tnl)}</div>
                <div className="site-metric-label">total net leverage</div>
              </div>
            )}
          </div>
          <CompanyNav companyId={companyId} onboardingStatus={company.onboardingStatus} />
        </div>
      </header>
      <div className="stack">{children}</div>
    </>
  );
}
