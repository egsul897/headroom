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
  | "analyze"
  | "review"
  | "covenants"
  | "rulebook"
  | "intelligence"
  | "position"
  | "ledger"
  | "simulate"
  | "audit"
  | "evidence"
  | "ask"
  | "alerts"
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
 * Institutional product navigation — CFO journey first:
 * Upload → Analyze → Review → Position → Simulate → Audit.
 * Legacy discovery tools remain available after the journey.
 */
export function companyNavItems(companyId: string, onboardingStatus: OnboardingStatus): CompanyNavItem[] {
  const items: CompanyNavItem[] = [
    { key: "home", href: `/${companyId}`, label: "Overview" },
    { key: "documents", href: `/${companyId}/documents`, label: "Upload" },
    { key: "analyze", href: `/${companyId}/analyze`, label: "Analyze" },
    { key: "review", href: `/${companyId}/review`, label: "Review" },
    { key: "position", href: `/${companyId}/position`, label: "Position" },
    { key: "simulate", href: `/${companyId}/simulate`, label: "Simulate" },
    { key: "audit", href: `/${companyId}/audit`, label: "Audit" },
    { key: "covenants", href: `/${companyId}/covenants`, label: "Covenants" },
    { key: "rulebook", href: `/${companyId}/rulebook`, label: "Rulebook" },
    { key: "intelligence", href: `/${companyId}/intelligence`, label: "Intelligence" },
    { key: "ledger", href: `/${companyId}/ledger`, label: "Ledger" },
    { key: "evidence", href: `/${companyId}/evidence`, label: "Evidence" },
    { key: "ask", href: `/${companyId}/ask`, label: "Ask" },
    { key: "alerts", href: `/${companyId}/alerts`, label: "Alerts" },
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
  if (item.key === "evidence" || item.key === "audit") {
    const review = `/${companyId}/onboarding/review`;
    if (pathname === review || pathname.startsWith(`${review}/`)) return true;
  }
  if (item.key === "review") {
    const rulebook = `/${companyId}/rulebook`;
    if (pathname === rulebook || pathname.startsWith(`${rulebook}/`)) return true;
  }
  return false;
}
