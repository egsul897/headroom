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
  RulebookIcon,
  SimulateIcon,
  ToolsIcon,
} from "@/components/home/icons";
import { companyNavItems, isCompanyNavItemActive, type CompanyNavKey } from "@/lib/home/nav";

const ICONS: Record<CompanyNavKey, () => ReactNode> = {
  home: HomeIcon,
  documents: DocumentsIcon,
  analyze: ToolsIcon,
  review: RulebookIcon,
  covenants: CovenantsIcon,
  rulebook: RulebookIcon,
  intelligence: ToolsIcon,
  position: PositionIcon,
  ledger: LedgerIcon,
  simulate: SimulateIcon,
  audit: EvidenceIcon,
  evidence: EvidenceIcon,
  ask: AskIcon,
  alerts: BellIcon,
  onboarding: OnboardingIcon,
};

/**
 * Institutional company navigation for the Headroom product workspace.
 */
const NAV_GROUP: Partial<Record<CompanyNavKey, string>> = {
  home: "Now",
  documents: "Set up",
  analyze: "Set up",
  review: "Set up",
  onboarding: "Set up",
  position: "Decide",
  simulate: "Decide",
  audit: "Decide",
  covenants: "Contract",
  rulebook: "Contract",
  intelligence: "Contract",
  ledger: "Record",
  evidence: "Record",
  ask: "Record",
  alerts: "Record",
};

export function CompanyNav({ companyId, onboardingStatus }: { companyId: string; onboardingStatus: OnboardingStatus }) {
  const pathname = usePathname() ?? "";
  const items = companyNavItems(companyId, onboardingStatus);
  let previousGroup = "";

  return (
    <nav className="app-nav" aria-label="Company">
      {items.map((item) => {
        const Icon = ICONS[item.key];
        const active = isCompanyNavItemActive(pathname, item, companyId);
        const group = NAV_GROUP[item.key] ?? "";
        const showGroup = group !== "" && group !== previousGroup;
        if (showGroup) previousGroup = group;
        return (
          <span key={item.key} className="app-nav-slot">
            {showGroup ? <span className="app-nav-label">{group}</span> : null}
            <Link href={item.href} className={`app-nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}>
              <Icon />
              <span>{item.label}</span>
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
