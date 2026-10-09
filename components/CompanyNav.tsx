"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OnboardingStatus } from "@prisma/client";
import {
  AskIcon,
  BellIcon,
  CovenantsIcon,
  DocumentsIcon,
  EvidenceIcon,
  HomeIcon,
  LedgerIcon,
  OnboardingIcon,
  PositionIcon,
  SimulateIcon,
} from "@/components/home/icons";
import { companyNavItems, isCompanyNavItemActive, type CompanyNavKey } from "@/lib/home/nav";

const ICONS: Record<CompanyNavKey, () => ReactNode> = {
  home: HomeIcon,
  documents: DocumentsIcon,
  covenants: CovenantsIcon,
  position: PositionIcon,
  ledger: LedgerIcon,
  simulate: SimulateIcon,
  evidence: EvidenceIcon,
  ask: AskIcon,
  alerts: BellIcon,
  onboarding: OnboardingIcon,
};

/**
 * Institutional company navigation for the Headroom product workspace.
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
