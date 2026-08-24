"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string }[] = [
  { href: "/feeds", label: "Feeds" },
  { href: "/position", label: "Position" },
  { href: "/simulate", label: "Simulate" },
  { href: "/docs", label: "Docs" },
  { href: "/ledger", label: "Ledger" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={`nav-link ${pathname === tab.href ? "active" : ""}`}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
