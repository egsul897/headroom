"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OnboardingStatus } from "@prisma/client";
import { ArrowRight, Bell, Gauge, House, Menu, MessageSquare, Scale, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/home/icons";
import { CompanyIdentityCard } from "@/components/home/CompanyIdentityCard";
import { CommandPalette } from "./CommandPalette";
import {
  activePrimaryKey,
  alertsHref,
  commandPaletteLinks,
  contextTabs,
  isContextTabActive,
  primarySidebarLinks,
  setupPrompt,
} from "./nav-model";

const ICONS: Record<string, LucideIcon> = {
  home: House,
  covenants: Scale,
  capacity: Gauge,
  simulate: ArrowRight,
  ask: MessageSquare,
};

/**
 * Workspace frame: five primary destinations, everything else behind Jump to.
 * Routes and labels are the existing product map. This component does not
 * load company data and does not render a figure.
 */
export function AppShell({
  companyId,
  companyName,
  ticker,
  onboardingStatus,
  children,
  startPaletteOpen = false,
  startDrawerOpen = false,
  pathnameOverride,
  user,
}: {
  companyId: string;
  companyName: string;
  ticker: string | null;
  onboardingStatus: OnboardingStatus;
  children: ReactNode;
  startPaletteOpen?: boolean;
  startDrawerOpen?: boolean;
  pathnameOverride?: string;
  /** Sample illustration only. Production has no signed-in user. */
  user?: { name: string; role: string } | null;
}) {
  const livePath = usePathname() ?? "";
  const pathname = pathnameOverride ?? livePath;
  const [paletteOpen, setPaletteOpen] = useState(startPaletteOpen);
  const [drawerOpen, setDrawerOpen] = useState(startDrawerOpen);
  const links = primarySidebarLinks(companyId, onboardingStatus);
  const palette = commandPaletteLinks(companyId, onboardingStatus);
  const setup = setupPrompt(companyId, onboardingStatus);
  const tabs = contextTabs(pathname, companyId);
  const activeKey = activePrimaryKey(pathname, companyId);
  const alerts = alertsHref(companyId, onboardingStatus);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pathRef = useRef(livePath);
  useEffect(() => {
    if (pathRef.current === livePath) return;
    pathRef.current = livePath;
    setDrawerOpen(false);
    setPaletteOpen(false);
  }, [livePath]);

  return (
    <div className="app-shell">
      <aside className={`app-sidebar${drawerOpen ? " is-open" : ""}`} aria-label="Primary">
        <Link href={`/${companyId}`} className="app-brand">
          <BrandMark />
          <span className="app-brand-word">Headroom</span>
        </Link>
        <nav className="app-nav" aria-label="Company">
          {links.map((link) => {
            const Icon = ICONS[link.key] ?? House;
            const active = link.key === activeKey;
            return (
              <Link
                key={link.key}
                href={link.href}
                className={`app-nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="app-sidebar-foot">
          {setup ? (
            <Link
              href={setup.href}
              className={`app-setup-link${pathname === setup.href || pathname.startsWith(`${setup.href}/`) ? " active" : ""}`}
            >
              {setup.label}
            </Link>
          ) : null}
          <CompanyIdentityCard name={companyName} ticker={ticker} />
          <div className="app-user-card" data-user-card>
            <span className="app-user-mark" aria-hidden="true">
              {user ? user.name.slice(0, 1) : "—"}
            </span>
            <span className="app-company-copy">
              <span className="app-company-name">{user ? user.name : "Signed-in user"}</span>
              <span className="app-company-ticker">{user ? user.role : "Not loaded"}</span>
            </span>
          </div>
          <p className="app-tagline">Clarity. Control. Confidence.</p>
        </div>
      </aside>
      {drawerOpen ? (
        <button type="button" className="app-backdrop" aria-label="Close menu" onClick={() => setDrawerOpen(false)} />
      ) : null}
      <div className="app-main">
        <header className="app-topbar">
          <button type="button" className="app-icon-button app-menu" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
            <Menu size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="app-search"
            onClick={() => setPaletteOpen(true)}
            aria-keyshortcuts="Control+K Meta+K"
          >
            <Search size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>Jump to</span>
            <kbd>⌘K</kbd>
          </button>
          <Link className="app-icon-button" href={alerts} aria-label="Alerts">
            <Bell size={16} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </header>
        {tabs ? (
          <nav className="app-tabs" aria-label="Section">
            {tabs.map((tab) => {
              const active = isContextTabActive(pathname, tab.href);
              return (
                <Link key={tab.key} href={tab.href} className={`app-tab${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
        <div className="app-content stack">{children}</div>
      </div>
      <CommandPalette open={paletteOpen} links={palette} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
