import { Card } from "@/components/ui";
import { GlobalBrand } from "@/components/GlobalBrand";
import { requireAdminOrRedirect } from "@/lib/auth/guard";
import { createCompanyAction } from "./actions";

export const metadata = { title: "Headroom — New company" };
export const dynamic = "force-dynamic";

/**
 * Admin-only company provisioning form. In the SaaS model there is no
 * self-serve "create a company" for customers — companies are provisioned
 * by Egzon's team (provision script or this admin form). The page AND its
 * server action both require ADMIN; the page gate alone would not stop a
 * direct action POST.
 */
export default async function NewCompanyPage({ searchParams }: { searchParams: Promise<{ tenantKind?: string }> }) {
  await requireAdminOrRedirect();
  const { tenantKind } = await searchParams;
  const isEvaluation = tenantKind === "EVALUATION";
  return (
    <>
      <GlobalBrand />
      <div className="stack">
        <Card>
        <div className="card-title">{isEvaluation ? "Add an evaluation/test company" : "Connect your company"}</div>
        <div className="card-subtitle">Creates the workspace. Next: upload the credit agreement and financials, review Headroom&apos;s findings, then open the dashboard.</div>
        <form action={createCompanyAction} className="stack" style={{ gap: 10 }}>
          {isEvaluation && <input type="hidden" name="tenantKind" value="EVALUATION" />}
          <div className="field">
            <div className="field-label">Company name</div>
            <div className="field-control">
              <input type="text" name="name" required />
            </div>
          </div>
          <div className="field">
            <div className="field-label">Ticker (optional)</div>
            <div className="field-control">
              <input type="text" name="ticker" />
            </div>
          </div>
          <div className="field">
            <div className="field-label">CIK (optional)</div>
            <div className="field-control">
              <input type="text" name="cik" />
            </div>
          </div>
          <div className="field">
            <div className="field-label">Currency</div>
            <div className="field-control">
              <input type="text" name="currency" defaultValue="USD" />
            </div>
          </div>
          <button type="submit" className="button-primary" style={{ width: "fit-content" }}>
            {isEvaluation ? "Create evaluation company" : "Create company & start onboarding"}
          </button>
        </form>
        </Card>
      </div>
    </>
  );
}
