import Link from "next/link";
import { Card } from "@/components/ui";
import { listCompanies } from "@/lib/dashboard-service";

export const metadata = { title: "Headroom — Admin" };
// Same Vercel build-time-prerender fix as app/page.tsx - see that file's own
// comment.
export const dynamic = "force-dynamic";

/**
 * Internal/admin/development mode (docs/headroom-master-product-architecture.md
 * §D - "preserve Coherent, Matthews and synthetic/evaluation companies... move
 * company switching to admin/internal/development mode"). This is the ONLY
 * place in the product that enumerates every tenant regardless of kind, links
 * to the legacy Coherent-only pages, and offers "+ New" company creation -
 * none of it belongs on the customer-facing root (app/page.tsx). No auth
 * gate exists yet (see that file's own "known limitations" note); this route
 * is unlinked from any customer-facing surface, which is this phase's
 * honest interim posture.
 */
export default async function AdminPage() {
  const companies = await listCompanies();
  const customer = companies.filter((c) => c.tenantKind === "CUSTOMER");
  const evaluation = companies.filter((c) => c.tenantKind === "EVALUATION");

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Admin / internal mode</div>
        <div className="card-subtitle">Every tenant in this Headroom instance, regardless of kind. Not linked from any customer-facing page.</div>
      </Card>

      <Card>
        <div className="card-title">Customer workspaces</div>
        {customer.length === 0 && <div className="row-note">None yet.</div>}
        {customer.map((c) => (
          <div key={c.id} className="row">
            <div>
              <div className="row-label">{c.name}</div>
              {c.ticker && <div className="row-note">{c.ticker}</div>}
              {c.onboardingStatus !== "ACTIVE" && <div className="row-note">{c.onboardingStatus === "ONBOARDING" ? "Onboarding in progress" : "Active with limitations"}</div>}
            </div>
            <Link className="button button-primary" href={c.onboardingStatus === "ONBOARDING" ? `/${c.id}/onboarding` : `/${c.id}/dashboard`}>
              {c.onboardingStatus === "ONBOARDING" ? "Continue onboarding" : "Open"}
            </Link>
          </div>
        ))}
        <div className="button-row" style={{ marginTop: 10 }}>
          <Link className="button" href="/companies/new">
            + New customer workspace
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Evaluation / regression companies</div>
        <div className="card-subtitle">Coherent, Matthews, and synthetic/test fixtures — used for regression, evaluation, and architecture validation. Never shown to a real customer.</div>
        {evaluation.map((c) => (
          <div key={c.id} className="row">
            <div>
              <div className="row-label">{c.name}</div>
              {c.ticker && <div className="row-note">{c.ticker}</div>}
              {c.onboardingStatus !== "ACTIVE" && <div className="row-note">{c.onboardingStatus === "ONBOARDING" ? "Onboarding in progress" : "Active with limitations"}</div>}
            </div>
            <Link className="button button-primary" href={c.onboardingStatus === "ONBOARDING" ? `/${c.id}/onboarding` : `/${c.id}/dashboard`}>
              {c.onboardingStatus === "ONBOARDING" ? "Continue onboarding" : "Open"}
            </Link>
          </div>
        ))}
        <div className="button-row" style={{ marginTop: 10 }}>
          <Link className="button" href="/companies/new?tenantKind=EVALUATION">
            + New evaluation company
          </Link>
        </div>
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
