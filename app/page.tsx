import Link from "next/link";
import { Card } from "@/components/ui";
import { GlobalBrand } from "@/components/GlobalBrand";
import { PROTECTED_COMPANY_IDS } from "@/lib/coherent";
import { listCompanies } from "@/lib/dashboard-service";
import { companyOpenHref } from "@/lib/home/nav";
import { onboardingStatusLabel } from "@/lib/status-labels";

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
 * This is deliberately kept as the founder/dev test-company chooser (task
 * "UNIVERSAL HEADROOM PRODUCT EXPERIENCE" §1 - "keep the landing page that
 * allows us to select among test/evaluation companies... this must remain
 * architecturally separate from the eventual customer experience"); a real
 * customer workspace is a future, auth-gated build, not this page.
 * A "Delete" link sits next to every entry (task: "give me a way to delete
 * a test company entirely, so evaluation mistakes don't persist") - see
 * app/companies/[companyId]/delete/page.tsx for the confirmation step.
 */
export default async function Home() {
  const companies = await listCompanies();
  const customer = companies.filter((c) => c.tenantKind === "CUSTOMER");
  const evaluation = companies.filter((c) => c.tenantKind === "EVALUATION");

  const openHref = companyOpenHref;

  return (
    <div className="chooser page-fade">
      <GlobalBrand />
      <header className="page-head">
        <div>
          <p className="page-kicker">Headroom</p>
          <h1 className="page-question">Which company are you opening?</h1>
          <p className="page-answer">
            A portfolio list, not a blended number. Headroom stays inside the company you open. Nothing is remembered between visits.
          </p>
        </div>
      </header>

      {customer.length > 0 && (
        <Card>
          <div className="card-title">Customer portfolio</div>
          <p className="chooser-note">Companies in the customer tenant. Open one workspace. Coverage is setup status, not a capacity figure.</p>
          <table className="portfolio-table">
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Ticker</th>
                <th scope="col">Coverage</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {customer.map((c) => (
                <tr key={c.id}>
                  <td className="portfolio-name">{c.name}</td>
                  <td>{c.ticker ?? "—"}</td>
                  <td>{onboardingStatusLabel(c.onboardingStatus)}</td>
                  <td>
                    <div className="portfolio-actions">
                      <Link className="button button-quiet" href={`/companies/${c.id}/delete`}>
                        Delete
                      </Link>
                      <Link className="button button-primary" href={openHref(c)}>
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {evaluation.length > 0 && (
        <Card>
          <div className="card-title">Evaluation portfolio</div>
          <p className="chooser-note">
            Coherent, Matthews, and any test fixtures — used for regression and evaluation, never shown to a real customer once real authentication exists.
          </p>
          <table className="portfolio-table">
            <thead>
              <tr>
                <th scope="col">Company</th>
                <th scope="col">Ticker</th>
                <th scope="col">Coverage</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {evaluation.map((c) => (
                <tr key={c.id}>
                  <td className="portfolio-name">{c.name}</td>
                  <td>{c.ticker ?? "—"}</td>
                  <td>{onboardingStatusLabel(c.onboardingStatus)}</td>
                  <td>
                    <div className="portfolio-actions">
                      {PROTECTED_COMPANY_IDS.has(c.id) ? (
                        <span className="status-badge status-badge-attention" title="Protected golden-regression company - cannot be deleted from this instance.">
                          Protected
                        </span>
                      ) : (
                        <Link className="button button-quiet" href={`/companies/${c.id}/delete`}>
                          Delete
                        </Link>
                      )}
                      <Link className="button button-primary" href={openHref(c)}>
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {customer.length === 0 && evaluation.length === 0 ? (
        <Card>
          <div className="card-title">No companies connected</div>
          <p className="chooser-note">This workspace has no companies to open yet. Connect one to begin.</p>
        </Card>
      ) : null}

      <div className="chooser-foot">
        <p className="chooser-note">
          Research precedents are not operative authority for a company workspace.
        </p>
        <div className="chooser-actions">
          <Link className="button button-quiet" href="/research/corpus">
            Browse corpus
          </Link>
          <Link className="button button-primary" href="/companies/new">
            Connect your company
          </Link>
        </div>
      </div>
    </div>
  );
}
