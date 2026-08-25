import Link from "next/link";
import { Card } from "@/components/ui";
import { listCompanies } from "@/lib/dashboard-service";

export const metadata = { title: "Headroom — Companies" };

/**
 * The company-selector landing page (task's "smallest generalized mechanism
 * to choose between them") - lists every Company row from the database, with
 * zero hardcoded company name/id. Whichever companies exist show up here.
 */
export default async function Home() {
  const companies = await listCompanies();
  return (
    <div className="stack">
      <Card>
        <div className="card-title">Companies</div>
        <div className="card-subtitle">Select a company to open its dashboard.</div>
        {companies.map((c) => (
          <div key={c.id} className="row">
            <div>
              <div className="row-label">{c.name}</div>
              {c.ticker && <div className="row-note">{c.ticker}</div>}
            </div>
            <Link className="button button-primary" href={`/${c.id}/overview`}>
              Open
            </Link>
          </div>
        ))}
      </Card>
      <Card>
        <div className="card-title">Legacy views (Coherent only)</div>
        <div className="card-subtitle">Pre-existing pages, retained for reference.</div>
        <div className="button-row">
          <Link className="button" href="/position">
            Position
          </Link>
          <Link className="button" href="/simulate">
            Simulate
          </Link>
          <Link className="button" href="/docs">
            Docs
          </Link>
          <Link className="button" href="/ledger">
            Ledger
          </Link>
          <Link className="button" href="/feeds">
            Feeds
          </Link>
        </div>
      </Card>
    </div>
  );
}
