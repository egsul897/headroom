import type { OnboardingStatus } from "@prisma/client";

/** Legacy product pages that remain reachable from Deal setup & tools. */
export const LEGACY_TOOLS = [
  { segment: "dashboard", label: "Dashboard", note: "Existing covenant dashboard." },
  { segment: "simulate", label: "Simulate", note: "Existing scenario tool." },
  { segment: "feeds", label: "Feeds", note: "Existing feed queue." },
  { segment: "docs", label: "Docs", note: "Existing document view." },
  { segment: "ledger", label: "Ledger", note: "Existing ledger." },
] as const;

export type LegacyToolSegment = (typeof LEGACY_TOOLS)[number]["segment"];

export type CompanyNavKey = "home" | "ask" | "tools" | "onboarding";

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

export function companyNavItems(companyId: string, onboardingStatus: OnboardingStatus): CompanyNavItem[] {
  const items: CompanyNavItem[] = [
    { key: "home", href: `/${companyId}`, label: "Home" },
    { key: "ask", href: `/${companyId}/ask`, label: "Ask" },
    { key: "tools", href: `/${companyId}/tools`, label: "Deal setup & tools" },
  ];
  if (onboardingStatus === "ONBOARDING" || onboardingStatus === "ACTIVE_WITH_LIMITATIONS") {
    items.push({ key: "onboarding", href: `/${companyId}/onboarding`, label: "Onboarding" });
  }
  return items;
}

export function isCompanyNavItemActive(pathname: string, item: CompanyNavItem, companyId: string): boolean {
  if (item.key === "home") return pathname === `/${companyId}`;
  if (item.key === "ask" || item.key === "onboarding") {
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return LEGACY_TOOLS.some((tool) => {
    const href = `/${companyId}/${tool.segment}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });
}
