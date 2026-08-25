"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OnboardingStatus } from "@prisma/client";

const PRODUCT_TABS: { segment: string; label: string }[] = [
  { segment: "overview", label: "Overview" },
  { segment: "capital-structure", label: "Capital Structure" },
  { segment: "capacity", label: "Capacity" },
  { segment: "simulate", label: "Simulate" },
  { segment: "documents", label: "Documents" },
];

const ONBOARDING_TAB = { segment: "onboarding", label: "Onboarding" };

/**
 * Product-page tabs work identically for any ACTIVE/ACTIVE_WITH_LIMITATIONS
 * company (task hard requirement - no company-specific branching); a
 * company still ONBOARDING has no financial/covenant data for those pages
 * to render yet, so only the Onboarding tab is shown until it's live -
 * this is a lifecycle gate on `onboardingStatus`, not a per-company special
 * case.
 */
export function CompanyNav({ companyId, onboardingStatus }: { companyId: string; onboardingStatus: OnboardingStatus }) {
  const pathname = usePathname();
  const tabs = onboardingStatus === "ONBOARDING" ? [ONBOARDING_TAB] : [...PRODUCT_TABS, ONBOARDING_TAB];
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
