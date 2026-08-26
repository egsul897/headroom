import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { GlobalBrand } from "@/components/GlobalBrand";
import { listCompanies } from "@/lib/dashboard-service";

export const metadata = { title: "Headroom — Admin" };
// Same Vercel build-time-prerender fix as app/page.tsx - see that file's own
// comment.
export const dynamic = "force-dynamic";

/**
 * Internal/admin/development mode (docs/headroom-master-product-architecture.md
 * §D - "preserve Coherent, Matthews and synthetic/evaluation companies... move
 * company switching to admin/internal/development mode"). This is the ONLY
 * place in the product that enumerates every tenant regardless of kind and
 * offers "+ New" company creation - none of it belongs on the
 * customer-facing root (app/page.tsx). The legacy Coherent-only pages this
 * used to link to (app/position, app/simulate, app/docs, app/ledger,
 * app/feeds) were removed (task "UNIVERSAL HEADROOM PRODUCT EXPERIENCE" §4
 * generalization audit - PRODUCTION_RISK: hardcoded to Coherent via omitted
 * companyId args, fully superseded by app/[companyId]/*).
 *
 * Admin safety mitigation (task §31, docs/contract-model-foundation-phase-b.md §31):
 * this route is unlinked from any customer-facing surface, but "unlinked" is
 * not a real safeguard against a direct request in production - a small,
 * safe, fail-closed gate that needs no new auth infrastructure. On Vercel
 * (`process.env.VERCEL`), the page requires `?token=<ADMIN_ACCESS_TOKEN>` to
 * match a real value configured in the Vercel dashboard; with no
 * ADMIN_ACCESS_TOKEN configured at all (the default, until an operator sets
 * one), production access is completely disabled (404, never a login
 * prompt that would itself confirm the route exists) rather than left open.
 * Local dev (VERCEL unset) is unaffected - this is not a login system, only
 * a stopgap for "do not leave an openly reachable customer-list surface in
 * production if a small safe mitigation exists" until real admin auth ships.
 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (process.env.VERCEL) {
    const { token } = await searchParams;
    const required = process.env.ADMIN_ACCESS_TOKEN;
    if (!required || token !== required) notFound();
  }

  const companies = await listCompanies();
  const customer = companies.filter((c) => c.tenantKind === "CUSTOMER");
  const evaluation = companies.filter((c) => c.tenantKind === "EVALUATION");

  return (
    <>
    <GlobalBrand />
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
    </div>
    </>
  );
}
