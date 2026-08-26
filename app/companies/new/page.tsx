import { Card } from "@/components/ui";
import { GlobalBrand } from "@/components/GlobalBrand";
import { createCompanyAction } from "./actions";

export const metadata = { title: "Headroom — New company" };
export const dynamic = "force-dynamic";

/**
 * Onboarding wizard step 0 (docs/company-onboarding-v1-implementation.md,
 * deliverable 8): the ONLY way a company enters Headroom without an
 * engineer writing a company-specific population script. Creates a Company
 * row with onboardingStatus: ONBOARDING and hands off to
 * /[companyId]/onboarding.
 *
 * One shared form serves two real callers (docs/headroom-master-product-architecture.md
 * §B/§D): a real customer's first-time "Connect your company" workspace
 * provisioning (no ?tenantKind - defaults to CUSTOMER, Company.tenantKind's
 * own schema default), and /admin's "+ New" link for creating another
 * EVALUATION-tenant fixture (?tenantKind=EVALUATION). The tenantKind is
 * carried as a plain hidden field rather than forked into two pages/actions.
 */
export default async function NewCompanyPage({ searchParams }: { searchParams: Promise<{ tenantKind?: string }> }) {
  const { tenantKind } = await searchParams;
  const isEvaluation = tenantKind === "EVALUATION";
  return (
    <>
      <GlobalBrand />
      <div className="stack">
        <Card>
        <div className="card-title">{isEvaluation ? "Add an evaluation/test company" : "Connect your company"}</div>
        <div className="card-subtitle">This creates the company record and starts the onboarding wizard — document upload, extraction, review, financials, and activation all happen on the next screens.</div>
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
