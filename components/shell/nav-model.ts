import type { OnboardingStatus } from "@prisma/client";
import { companyNavItems, type CompanyNavKey } from "@/lib/home/nav";

/**
 * Presentation map for the workspace shell.
 * Labels and hrefs come from companyNavItems(). This file only chooses
 * which of those routes sit in the sidebar, which sit in the command
 * palette, and which share a contextual tab row. It does not add routes
 * the product does not already serve, except Capacity, Certificates,
 * All tools, and Switch company — each of those pages already exists.
 */

export interface ShellLink {
  key: string;
  href: string;
  label: string;
  group: string;
}

const GROUP: Record<CompanyNavKey, string> = {
  home: "Workspace",
  covenants: "Workspace",
  simulate: "Workspace",
  ask: "Workspace",
  documents: "Set up",
  analyze: "Set up",
  review: "Set up",
  onboarding: "Set up",
  position: "Decide",
  audit: "Decide",
  rulebook: "Contract",
  intelligence: "Contract",
  ledger: "Record",
  evidence: "Record",
  alerts: "Record",
};

const CONTRACT_SEGMENTS = ["covenants", "rulebook", "intelligence"] as const;
const CAPACITY_SEGMENTS = ["capacity", "ledger", "certificates"] as const;

export function primarySidebarLinks(companyId: string, status: OnboardingStatus): ShellLink[] {
  const byKey = new Map(companyNavItems(companyId, status).map((item) => [item.key, item]));
  const home = byKey.get("home");
  const covenants = byKey.get("covenants");
  const simulate = byKey.get("simulate");
  const ask = byKey.get("ask");
  if (!home || !covenants || !simulate || !ask) return [];
  return [
    { key: home.key, href: home.href, label: home.label, group: "Workspace" },
    { key: covenants.key, href: covenants.href, label: covenants.label, group: "Workspace" },
    { key: "capacity", href: `/${companyId}/capacity`, label: "Capacity", group: "Workspace" },
    { key: simulate.key, href: simulate.href, label: simulate.label, group: "Workspace" },
    { key: ask.key, href: ask.href, label: ask.label, group: "Workspace" },
  ];
}

/** Shown in the sidebar only while companyNavItems still includes onboarding. */
export function setupPrompt(companyId: string, status: OnboardingStatus): ShellLink | null {
  const item = companyNavItems(companyId, status).find((entry) => entry.key === "onboarding");
  if (!item) return null;
  return { key: item.key, href: item.href, label: "Finish setup", group: "Set up" };
}

export function commandPaletteLinks(companyId: string, status: OnboardingStatus): ShellLink[] {
  const primary = primarySidebarLinks(companyId, status);
  const fromNav = companyNavItems(companyId, status).map((item) => ({
    key: item.key,
    href: item.href,
    label: item.label,
    group: GROUP[item.key],
  }));
  const extras: ShellLink[] = [
    { key: "certificates", href: `/${companyId}/certificates`, label: "Certificates", group: "Record" },
    { key: "tools", href: `/${companyId}/tools`, label: "All tools", group: "Workspace" },
    { key: "switch", href: "/", label: "Switch company", group: "Workspace" },
  ];
  const seen = new Set<string>();
  const ordered: ShellLink[] = [];
  for (const link of [...primary, ...fromNav, ...extras]) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    ordered.push(link);
  }
  return ordered;
}

export function alertsHref(companyId: string, status: OnboardingStatus): string {
  return companyNavItems(companyId, status).find((item) => item.key === "alerts")?.href ?? `/${companyId}/alerts`;
}

function segment(pathname: string, companyId: string): string | null {
  const base = `/${companyId}`;
  if (pathname === base) return "";
  if (!pathname.startsWith(`${base}/`)) return null;
  return pathname.slice(base.length + 1).split("/")[0] ?? "";
}

export function activePrimaryKey(pathname: string, companyId: string): string | null {
  const seg = segment(pathname, companyId);
  if (seg == null) return null;
  if (seg === "") return "home";
  if ((CONTRACT_SEGMENTS as readonly string[]).includes(seg)) return "covenants";
  if ((CAPACITY_SEGMENTS as readonly string[]).includes(seg)) return "capacity";
  if (seg === "simulate" || seg === "ask") return seg;
  return null;
}

export function contextTabs(pathname: string, companyId: string): ShellLink[] | null {
  const seg = segment(pathname, companyId);
  if (seg == null || seg === "") return null;
  const base = `/${companyId}`;
  if ((CONTRACT_SEGMENTS as readonly string[]).includes(seg)) {
    return [
      { key: "covenants", href: `${base}/covenants`, label: "Covenants", group: "Contract" },
      { key: "rulebook", href: `${base}/rulebook`, label: "Rulebook", group: "Contract" },
      { key: "intelligence", href: `${base}/intelligence`, label: "Intelligence", group: "Contract" },
    ];
  }
  if ((CAPACITY_SEGMENTS as readonly string[]).includes(seg)) {
    return [
      { key: "capacity", href: `${base}/capacity`, label: "Capacity", group: "Record" },
      { key: "ledger", href: `${base}/ledger`, label: "Ledger", group: "Record" },
      { key: "certificates", href: `${base}/certificates`, label: "Certificates", group: "Record" },
    ];
  }
  return null;
}

export function isContextTabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
