"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { segment: string; label: string }[] = [
  { segment: "overview", label: "Overview" },
  { segment: "capital-structure", label: "Capital Structure" },
  { segment: "capacity", label: "Capacity" },
  { segment: "simulate", label: "Simulate" },
  { segment: "documents", label: "Documents" },
];

export function CompanyNav({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {TABS.map((tab) => {
        const href = `/${companyId}/${tab.segment}`;
        return (
          <Link key={tab.segment} href={href} className={`nav-link ${pathname === href ? "active" : ""}`}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
