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
  | "position"
  | "covenants"
  | "capacity"
  | "simulate"
  | "ledger"
  | "documents"
  | "ask"
  | "evidence"
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
 * Dashboard IA aligned to product mockup:
 * Dashboard · Position · Covenants · Capacity · Simulations · Transactions · Documents · Ask
 */
export function companyNavItems(companyId: string, onboardingStatus: OnboardingStatus): CompanyNavItem[] {
  const items: CompanyNavItem[] = [
    { key: "home", href: `/${companyId}`, label: "Dashboard" },
    { key: "position", href: `/${companyId}/position`, label: "Position" },
    { key: "covenants", href: `/${companyId}/covenants`, label: "Covenants" },
    { key: "capacity", href: `/${companyId}/capacity`, label: "Capacity" },
    { key: "simulate", href: `/${companyId}/simulate`, label: "Simulations" },
    { key: "ledger", href: `/${companyId}/ledger`, label: "Transactions" },
    { key: "documents", href: `/${companyId}/documents`, label: "Documents" },
    { key: "ask", href: `/${companyId}/ask`, label: "Ask" },
    { key: "evidence", href: `/${companyId}/evidence`, label: "Evidence" },
  ];
  if (onboardingStatus === "ONBOARDING" || onboardingStatus === "ACTIVE_WITH_LIMITATIONS") {
    items.push({ key: "onboarding", href: `/${companyId}/onboarding`, label: "Onboarding" });
  }
  return items;
}

export function isCompanyNavItemActive(pathname: string, item: CompanyNavItem, companyId: string): boolean {
  if (item.key === "home") return pathname === `/${companyId}`;
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
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
