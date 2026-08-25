import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Headroom",
  description: "Covenant capacity and financial analytics platform",
};

// Every page reads live from Postgres - always render fresh rather than
// serving a build-time snapshot.
export const dynamic = "force-dynamic";

/**
 * Deliberately minimal and company-agnostic (task hard requirement §2 - no
 * company-specific branching/data anywhere in app/**). The rich,
 * company-scoped header (name/ticker/leverage) lives in
 * app/[companyId]/layout.tsx, generically fetched for whichever company the
 * route names - this root layout never fetches or names a specific company.
 * The legacy Coherent-only pages (app/position, app/simulate, app/ledger,
 * app/docs, app/feeds) still render under this same minimal shell; they
 * predate this generalized product IA and are retained, not rebuilt (task's
 * "may retain/refactor rather than blindly delete").
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <div className="site-header-row">
              <div>
                <div className="site-title">Headroom</div>
                <div className="site-subtitle">Covenant capacity and financial analytics platform</div>
              </div>
            </div>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
