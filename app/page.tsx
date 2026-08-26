import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui";
import { listCustomerCompanies } from "@/lib/dashboard-service";

export const metadata = { title: "Headroom" };
// Vercel deployment fix: this page queries Prisma directly with no dynamic
// route segment above it, so without this Next.js attempts to prerender it
// at build time - requiring a reachable database during `next build`, which
// Vercel's build machine has no path to. Forces per-request rendering
// instead (runtime still requires a real, reachable DATABASE_URL - this does
// not substitute for database hosting).
export const dynamic = "force-dynamic";

/**
 * The customer-facing root (docs/headroom-master-product-architecture.md
 * §B/§E - "the user should never need to select a company from a list
 * because the workspace already establishes context"). This is a workspace
 * RESOLVER, not a company picker: it only ever looks at CUSTOMER-tenant
 * companies (never Coherent/Matthews/synthetic/evaluation fixtures - those
 * live at /admin) and decides what a customer sees next.
 *
 * There is no authentication/session layer in this product yet - a real
 * deployment would resolve "which workspace does this logged-in user belong
 * to" from the authenticated session, never by counting rows. Until that
 * exists, this page approximates it honestly: the ONE existing
 * CUSTOMER-tenant company is that workspace. This is a deliberate, narrow
 * placeholder for real per-user tenant resolution, not a claim that
 * multi-tenant auth is built - see docs/headroom-master-product-architecture.md's
 * own "Known limitations" section.
 */
export default async function Home() {
  const customers = await listCustomerCompanies();

  if (customers.length === 1) {
    const c = customers[0]!;
    redirect(c.onboardingStatus === "ONBOARDING" ? `/${c.id}/onboarding` : `/${c.id}/dashboard`);
  }

  if (customers.length === 0) {
    return (
      <div className="stack">
        <Card>
          <div className="card-title">Welcome to Headroom</div>
          <div className="card-subtitle">Headroom is your financial and contractual command center. Connect your company to get started — Headroom will gather your financing documents and financial position, then open your dashboard.</div>
          <Link className="button button-primary" href="/companies/new">
            Connect your company
          </Link>
        </Card>
      </div>
    );
  }

  // More than one CUSTOMER-tenant workspace exists and there is no session to
  // disambiguate which one this visitor belongs to - shown in customer
  // language, never as a developer "select a company" picker.
  return (
    <div className="stack">
      <Card>
        <div className="card-title">Your organizations</div>
        <div className="card-subtitle">Choose a workspace to continue.</div>
        {customers.map((c) => (
          <div key={c.id} className="row">
            <div className="row-label">{c.name}</div>
            <Link className="button button-primary" href={c.onboardingStatus === "ONBOARDING" ? `/${c.id}/onboarding` : `/${c.id}/dashboard`}>
              Open
            </Link>
          </div>
        ))}
      </Card>
    </div>
  );
}
