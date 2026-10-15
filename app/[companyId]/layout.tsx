import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCompanySummary } from "@/lib/dashboard-service";
import { CompanyNav } from "@/components/CompanyNav";
import { CompanyIdentityCard } from "@/components/home/CompanyIdentityCard";
import { BrandMark } from "@/components/home/icons";
import { requireTenantOrRedirect } from "@/lib/auth/guard";
import "../home-shell.css";

/**
 * Company shell for Chunk A′. Sidebar: Home, Ask, Deal setup & tools.
 * The company card is the database name. There is no signed-in user, so
 * the user card is omitted. The shell does not render a leverage figure —
 * overview slots stay on Product LOCK empty copy.
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
    <div className="app-shell">
      <aside className="app-sidebar">
        <Link href="/" className="app-brand">
          <BrandMark />
          <span className="app-brand-word">headroom</span>
        </Link>
        <CompanyNav companyId={companyId} onboardingStatus={company.onboardingStatus} />
        <div className="app-sidebar-foot">
          <CompanyIdentityCard name={company.name} ticker={company.ticker} />
          <p className="app-tagline">Clarity. Control. Confidence.</p>
        </div>
      </aside>
      <div className="app-content stack">{children}</div>
    </div>
  );
}
