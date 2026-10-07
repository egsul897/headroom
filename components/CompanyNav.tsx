"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OnboardingStatus } from "@prisma/client";
import { AskIcon, HomeIcon, OnboardingIcon, ToolsIcon } from "@/components/home/icons";
import { companyNavItems, isCompanyNavItemActive, type CompanyNavKey } from "@/lib/home/nav";

const ICONS: Record<CompanyNavKey, () => ReactNode> = {
  home: HomeIcon,
  ask: AskIcon,
  tools: ToolsIcon,
  onboarding: OnboardingIcon,
};

/**
 * Company shell navigation for Chunk A′.
 * Home is primary. Ask is the secondary interrogation route.
 * Deal setup & tools is the door to legacy Dashboard, Simulate, Feeds, Docs, and Ledger.
 * Reports and Settings are omitted — they are not real pages.
 * Onboarding stays only while that company still has setup work.
 */
export function CompanyNav({ companyId, onboardingStatus }: { companyId: string; onboardingStatus: OnboardingStatus }) {
  const pathname = usePathname() ?? "";
  const items = companyNavItems(companyId, onboardingStatus);

  return (
    <nav className="app-nav" aria-label="Company">
      {items.map((item) => {
        const Icon = ICONS[item.key];
        const active = isCompanyNavItemActive(pathname, item, companyId);
        return (
          <Link key={item.key} href={item.href} className={`app-nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
