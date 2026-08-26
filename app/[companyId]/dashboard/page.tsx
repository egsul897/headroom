import { Card, LegalReviewBadge } from "@/components/ui";
import { CovenantOverviewView } from "@/components/CovenantOverview";
import { getCompanyDashboard } from "@/lib/dashboard-service";
import { getCovenantOverview } from "@/lib/covenant-overview-service";
import { fmtDate, fmtM } from "@/lib/format";

export const metadata = { title: "Headroom — Dashboard" };

/**
 * CFO dashboard - the customer's product home (docs/headroom-master-product-architecture.md,
 * "the main landing page is officially Dashboard, never Overview"). Restored
 * to the dense, one-screen covenant-position experience
 * (docs/full-covenant-overview-restoration.md): `getCovenantOverview`
 * (lib/covenant-overview-service.ts) supplies headline metrics, headline
 * secured/unsecured capacity with its binding document/section, and every
 * modeled covenant family/basket/ratio row with inline citations and
 * formulas - `getCompanyDashboard` (lib/dashboard-service.ts) still supplies
 * near-term maturities and the legal-review summary, which
 * getCovenantOverview does not duplicate. This component performs no
 * calculation, no `preMax - amount` subtraction, and no company-name
 * branching (identical for any companyId the route names) - see both
 * services' own header comments for where every number actually comes from.
 */
export default async function DashboardPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [dash, overview] = await Promise.all([getCompanyDashboard(companyId), getCovenantOverview(companyId)]);
  const { financialPosition: fp, legalReview } = dash;

  return (
    <div className="stack">
      <CovenantOverviewView overview={overview} />

      <Card>
        <div className="card-title">Near-term maturities</div>
        {fp.maturities.nextMaturity ? (
          <div className="row">
            <div>
              <div className="row-label">{fp.maturities.nextMaturity.facilityName}</div>
              <div className="row-note">next maturity, {fmtDate(fp.maturities.nextMaturity.date)}</div>
            </div>
            <div className="row-value">{fmtM(fp.maturities.nextMaturity.principal)}</div>
          </div>
        ) : (
          <div className="row-note">No dated maturities on record.</div>
        )}
        <div className="row">
          <div className="row-label">Due within 12 months</div>
          <div className="row-value">{fmtM(fp.maturities.dueWithin12Months)}</div>
        </div>
        <div className="row">
          <div className="row-label">Due within 24 months</div>
          <div className="row-value">{fmtM(fp.maturities.dueWithin24Months)}</div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Due within 36 months</div>
          <div className="row-value">{fmtM(fp.maturities.dueWithin36Months)}</div>
        </div>
      </Card>

      <Card>
        <div className="card-title">Legal review</div>
        <div className="row">
          <div className="row-label">Golden questions verified</div>
          <div className="row-value">
            {legalReview.goldenTestsVerified} / {legalReview.goldenTestsTotal}
          </div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Permissions verified</div>
          <div className="row-value">
            {legalReview.permissionsVerified} / {legalReview.permissionsTotal}
          </div>
        </div>
        {legalReview.goldenTestsVerified > 0 && (
          <div style={{ marginTop: 10 }}>
            <LegalReviewBadge status="VERIFIED" context="golden legal conclusions for this company" />
          </div>
        )}
      </Card>
    </div>
  );
}
