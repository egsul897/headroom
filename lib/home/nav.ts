import type { OnboardingStatus } from "@prisma/client";

/** Legacy product pages still reachable from Deal setup & tools. */
export const LEGACY_TOOLS = [
  { segment: "dashboard", label: "Legacy dashboard", note: "Prior covenant dashboard layout." },
  { segment: "docs", label: "Legacy docs", note: "Coherent defined-term browse." },
  { segment: "feeds", label: "Feeds", note: "Feed queue." },
  { segment: "capacity", label: "Capacity detail", note: "Engine capacity breakdown." },
  { segment: "capital-structure", label: "Capital structure", note: "Facilities view." },
  { segment: "tools", label: "All tools", note: "Full tools index." },
] as const;

export type LegacyToolSegment = (typeof LEGACY_TOOLS)[number]["segment"];

export type CompanyNavKey =
  | "home"
  | "documents"
  | "covenants"
  | "position"
  | "ledger"
  | "simulate"
  | "evidence"
  | "ask"
  | "onboarding";

export interface CompanyNavItem {
  key: CompanyNavKey;
  href: string;
  label: string;
}

/** ACTIVE (and ACTIVE_WITH_LIMITATIONS) open the overview. ONBOARDING stays on the wizard. */
export function companyOpenHref(company: { id: string; onboardingStatus: OnboardingStatus }): string {
  if (company.onboardingStatus === "ONBOARDING") return `/${company.id}/onboarding`;
  return `/${company.id}`;
}

/**
 * Institutional product navigation — Documents / Covenants / Position / Ledger / Simulate / Evidence.
 * Ask remains available; onboarding only while setup is incomplete.
 */
export function companyNavItems(companyId: string, onboardingStatus: OnboardingStatus): CompanyNavItem[] {
  const items: CompanyNavItem[] = [
    { key: "home", href: `/${companyId}`, label: "Overview" },
    { key: "documents", href: `/${companyId}/documents`, label: "Documents" },
    { key: "covenants", href: `/${companyId}/covenants`, label: "Covenants" },
    { key: "position", href: `/${companyId}/position`, label: "Position" },
    { key: "ledger", href: `/${companyId}/ledger`, label: "Ledger" },
    { key: "simulate", href: `/${companyId}/simulate`, label: "Simulate" },
    { key: "evidence", href: `/${companyId}/evidence`, label: "Evidence" },
    { key: "ask", href: `/${companyId}/ask`, label: "Ask" },
  ];
  if (onboardingStatus === "ONBOARDING" || onboardingStatus === "ACTIVE_WITH_LIMITATIONS") {
    items.push({ key: "onboarding", href: `/${companyId}/onboarding`, label: "Onboarding" });
  }
  return items;
}

export function isCompanyNavItemActive(pathname: string, item: CompanyNavItem, companyId: string): boolean {
  if (item.key === "home") return pathname === `/${companyId}`;
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  // Position aliases the legacy dashboard route for deep links.
  if (item.key === "position") {
    const dash = `/${companyId}/dashboard`;
    if (pathname === dash || pathname.startsWith(`${dash}/`)) return true;
  }
  if (item.key === "evidence") {
    const review = `/${companyId}/onboarding/review`;
    if (pathname === review || pathname.startsWith(`${review}/`)) return true;
  }
  return false;
}
