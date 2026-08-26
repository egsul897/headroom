import Link from "next/link";
import { Card } from "@/components/ui";
import { listCompanies } from "@/lib/dashboard-service";

export const metadata = { title: "Headroom" };
export const dynamic = "force-dynamic";

/**
 * Fresh-start landing (task "RESET ON OPEN" - "opening Headroom starts a
 * fresh session every time. No persisted 'current company,' no
 * auto-resolution into whatever tenant exists"). This page NEVER redirects
 * based on how many companies exist or which one was viewed last - it is a
 * stateless read on every request, always rendering the same choice: load
 * a known company, or connect a new one. There is no session/cookie of any
 * kind establishing a "current company" anywhere in this app; every other
 * page's context comes entirely from its own `[companyId]` URL segment.
 *
 * This product has no real multi-tenant auth yet (see
 * docs/headroom-master-product-architecture.md's own "Known limitations"),
 * so - per explicit instruction from the person operating this instance -
 * this landing surfaces every company that exists, not only CUSTOMER-tenant
 * ones: a real customer deployment with real auth would instead resolve
 * straight to that customer's own workspace and would never show this
 * company-selection screen at all (nor a name-your-eval-companies picker).
 * A "Delete" link sits next to every entry (task: "give me a way to delete
 * a test company entirely, so evaluation mistakes don't persist") - see
 * app/companies/[companyId]/delete/page.tsx for the confirmation step.
 */
export default async function Home() {
  const companies = await listCompanies();
  const customer = companies.filter((c) => c.tenantKind === "CUSTOMER");
  const evaluation = companies.filter((c) => c.tenantKind === "EVALUATION");

  const openHref = (c: (typeof companies)[number]) => (c.onboardingStatus === "ONBOARDING" ? `/${c.id}/onboarding` : `/${c.id}/dashboard`);

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Headroom</div>
        <div className="card-subtitle">Covenant capacity and financial analytics platform. Choose a company to open, or connect a new one - nothing is remembered between visits.</div>
      </Card>

      {customer.length > 0 && (
        <Card>
          <div className="card-title">Your companies</div>
          {customer.map((c) => (
            <div key={c.id} className="row">
              <div>
                <div className="row-label">{c.name}</div>
                {c.ticker && <div className="row-note">{c.ticker}</div>}
              </div>
              <div className="button-row" style={{ marginTop: 0 }}>
                <Link className="button button-primary" href={openHref(c)}>
                  Open
                </Link>
                <Link className="button" href={`/companies/${c.id}/delete`}>
                  Delete
                </Link>
              </div>
            </div>
          ))}
        </Card>
      )}

      {evaluation.length > 0 && (
        <Card>
          <div className="card-title">Evaluation companies</div>
          <div className="card-subtitle">Coherent, Matthews, and any test fixtures - used for regression and evaluation, never shown to a real customer once real authentication exists.</div>
          {evaluation.map((c) => (
            <div key={c.id} className="row">
              <div>
                <div className="row-label">{c.name}</div>
                {c.ticker && <div className="row-note">{c.ticker}</div>}
              </div>
              <div className="button-row" style={{ marginTop: 0 }}>
                <Link className="button button-primary" href={openHref(c)}>
                  Open
                </Link>
                <Link className="button" href={`/companies/${c.id}/delete`}>
                  Delete
                </Link>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div className="card-title">Connect a new company</div>
        <div className="card-subtitle">Upload financing documents and financial data to start a new workspace.</div>
        <Link className="button button-primary" href="/companies/new">
          Connect your company
        </Link>
      </Card>
    </div>
  );
}
