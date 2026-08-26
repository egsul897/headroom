"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OnboardingStatus } from "@prisma/client";

// Order matches docs/headroom-master-product-architecture.md's official
// customer navigation. Covenants and Obligations are not yet real,
// independently-navigable pages (their data currently lives inside
// Dashboard/Capacity) - they are deliberately omitted rather than added as
// empty/fake pages (task hard requirement: never fake product completeness).
const PRODUCT_TABS: { segment: string; label: string }[] = [
  { segment: "dashboard", label: "Dashboard" },
  { segment: "capital-structure", label: "Capital Structure" },
  { segment: "capacity", label: "Capacity" },
  { segment: "simulate", label: "Simulate" },
  { segment: "documents", label: "Documents" },
  { segment: "onboarding/sources", label: "Sources" },
  { segment: "onboarding/review", label: "Review" },
];

const ONBOARDING_TAB = { segment: "onboarding", label: "Onboarding" };

/**
 * Product-page tabs work identically for any ACTIVE/ACTIVE_WITH_LIMITATIONS
 * company (task hard requirement - no company-specific branching); a
 * company still ONBOARDING has no financial/covenant data for those pages
 * to render yet, so only the Onboarding tab is shown until it's live -
 * this is a lifecycle gate on `onboardingStatus`, not a per-company special
 * case. "Onboarding" itself is internal/setup language (docs/headroom-master-
 * product-architecture.md §38 - remove engineering language from customer
 * surfaces) so it drops out of the nav entirely once a company reaches
 * ACTIVE; ACTIVE_WITH_LIMITATIONS keeps it, since that company still has
 * open onboarding work worth surfacing.
 */
export function CompanyNav({ companyId, onboardingStatus }: { companyId: string; onboardingStatus: OnboardingStatus }) {
  const pathname = usePathname();
  const tabs = onboardingStatus === "ONBOARDING" ? [ONBOARDING_TAB] : onboardingStatus === "ACTIVE_WITH_LIMITATIONS" ? [...PRODUCT_TABS, ONBOARDING_TAB] : PRODUCT_TABS;
  return (
    <nav className="nav">
      {tabs.map((tab) => {
        const href = `/${companyId}/${tab.segment}`;
        return (
          <Link key={tab.segment} href={href} className={`nav-link ${pathname === href || pathname?.startsWith(`${href}/`) ? "active" : ""}`}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
