import type { ReactNode } from "react";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { getCompany, getDocuments, getPosition } from "@/lib/coherent";
import { fmtX } from "@/lib/format";

export const metadata = {
  title: "Headroom",
  description: "Covenant capacity engine",
};

// Every page reads live from Postgres (financials, ledger, provisions) and the
// Ledger tab writes to it - always render fresh rather than serving a
// build-time snapshot.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [company, { position }, documents] = await Promise.all([getCompany(), getPosition(), getDocuments()]);

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header-inner">
            <div className="site-header-row">
              <div>
                <div className="site-title">Headroom</div>
                <div className="site-subtitle">
                  {company.name} ({company.ticker}) · {documents.map((d) => d.name).join(" + ")}
                </div>
              </div>
              <div className="site-metric">
                <div className="site-metric-value">{fmtX(position.metrics.totalNetLeverage)}</div>
                <div className="site-metric-label">total net leverage</div>
              </div>
            </div>
            <Nav />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
