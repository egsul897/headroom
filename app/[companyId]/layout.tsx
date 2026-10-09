import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCompanySummary } from "@/lib/dashboard-service";
import { authorizeCompanyAccess } from "@/lib/auth/tenant-boundary";
import { CompanyNav } from "@/components/CompanyNav";
import { CompanyIdentityCard } from "@/components/home/CompanyIdentityCard";
import { BrandMark } from "@/components/home/icons";
import "../home-shell.css";

/**
 * Company shell for Chunk A′. Sidebar: Home, Ask, Deal setup & tools.
 * The company card is the database name. There is no signed-in user, so
 * the user card is omitted. The shell does not render a leverage figure —
 * overview slots stay on Product LOCK empty copy.
 */
export default async function CompanyLayout({ children, params }: { children: ReactNode; params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  // Tenant boundary: a denied or unknown company answers 404 before any company data is read.
  const access = await authorizeCompanyAccess(companyId);
  if (!access.allowed) notFound();
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
