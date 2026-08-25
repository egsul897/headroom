import { Card } from "@/components/ui";
import { createCompanyAction } from "./actions";

export const metadata = { title: "Headroom — New company" };
export const dynamic = "force-dynamic";

/**
 * Onboarding wizard step 0 (docs/company-onboarding-v1-implementation.md,
 * deliverable 8): the ONLY way a company enters Headroom without an
 * engineer writing a company-specific population script. Creates a Company
 * row with onboardingStatus: ONBOARDING and hands off to
 * /[companyId]/onboarding.
 */
export default function NewCompanyPage() {
  return (
    <div className="stack">
      <Card>
        <div className="card-title">Add a new company</div>
        <div className="card-subtitle">This creates the company record and starts the onboarding wizard — document upload, extraction, review, financials, and activation all happen on the next screens.</div>
        <form action={createCompanyAction} className="stack" style={{ gap: 10 }}>
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
            Create company &amp; start onboarding
          </button>
        </form>
      </Card>
    </div>
  );
}
