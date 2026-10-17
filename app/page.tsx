import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Card } from "@/components/ui";
import { GlobalBrand } from "@/components/GlobalBrand";
import { PROTECTED_COMPANY_IDS } from "@/lib/coherent";
import { listCompanies } from "@/lib/dashboard-service";
import { companyOpenHref } from "@/lib/home/nav";
import { authOptions } from "@/lib/auth/options";

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
    <>
      <GlobalBrand />
      <div className="stack">
        <Card>
          <div className="card-subtitle">
            DEV ONLY — founder/dev test-company chooser (HEADROOM_DEV_CHOOSER=1, non-production). Not part of the customer product.
          </div>
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
                  {PROTECTED_COMPANY_IDS.has(c.id) ? (
                    <span className="chip chip-tight" title="Protected golden-regression company - cannot be deleted from this instance.">
                      Protected
                    </span>
                  ) : (
                    <Link className="button" href={`/companies/${c.id}/delete`}>
                      Delete
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}

        <Card>
          <div className="card-title">Connect a new company</div>
          <div className="card-subtitle">
            Create a workspace, upload debt documents and financials, review what Headroom extracted, then open the dashboard.
          </div>
          <Link className="button button-primary" href="/companies/new">
            Connect your company
          </Link>
        </Card>

        <Card>
          <div className="card-title">Research corpus</div>
          <div className="card-subtitle">
            Issuer-disjoint financing precedents persisted in Neon. Not operative authority for any company workspace.
          </div>
          <Link className="button" href="/research/corpus">
            Browse corpus
          </Link>
        </Card>
      </div>
    </>
  );
}
