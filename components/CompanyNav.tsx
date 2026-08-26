"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OnboardingStatus } from "@prisma/client";

// Exactly the prototype's 5 tabs (reference/headroom-coherent.jsx - task
// "MAKE THE UI MATCH THE PROTOTYPE EXACTLY"), in the prototype's own order.
// The prototype's own tab was named "Position" - renamed to "Dashboard"
// everywhere per the task's explicit instruction, including this route
// segment (this app's Dashboard route already existed under this name from
// an earlier phase - the prototype's Position tab's content now lives
// there). Capital Structure/Capacity (their content is folded into
// Dashboard's own covenant overview) and the onboarding-only Sources/Review
// steps are intentionally not part of this steady-state 5-tab row.
const PRODUCT_TABS: { segment: string; label: string }[] = [
  { segment: "feeds", label: "Feeds" },
  { segment: "dashboard", label: "Dashboard" },
  { segment: "simulate", label: "Simulate" },
  { segment: "docs", label: "Docs" },
  { segment: "ledger", label: "Ledger" },
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
