import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Card } from "@/components/ui";
import { GlobalBrand } from "@/components/GlobalBrand";
import { PROTECTED_COMPANY_IDS } from "@/lib/coherent";
import { listCompanies } from "@/lib/dashboard-service";
import { companyOpenHref } from "@/lib/home/nav";
import { authOptions } from "@/lib/auth/options";
import { onboardingStatusLabel } from "@/lib/status-labels";

export const metadata = { title: "Headroom" };
export const dynamic = "force-dynamic";

/**
 * SaaS root: there is no public company chooser in the authenticated
 * product. A signed-in user goes straight to THEIR company's dashboard
 * (their account is bound to exactly one company). An unsigned visitor
 * goes to /login.
 *
 * The old founder/dev test-company chooser survives ONLY behind the
 * explicit dev flag HEADROOM_DEV_CHOOSER=1 and only outside production
 * (NODE_ENV !== "production"). It is never reachable in the production
 * authenticated path, and it never lists companies to a signed-in
 * customer — the dev chooser is for local evaluation work only.
 */
export default async function Home() {
  const devChooser =
    process.env.HEADROOM_DEV_CHOOSER === "1" && process.env.NODE_ENV !== "production";
  if (!devChooser) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.companyId) redirect("/login");
    redirect(`/${session.user.companyId}/dashboard`);
  }

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
          <div className="card-subtitle">
            DEV ONLY — founder/dev test-company chooser (HEADROOM_DEV_CHOOSER=1, non-production). Not part of the customer product.
          </div>
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
