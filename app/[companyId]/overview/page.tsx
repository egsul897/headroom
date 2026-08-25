import { Card, LegalReviewBadge, WarningList } from "@/components/ui";
import { getCompanyDashboard } from "@/lib/dashboard-service";
import { fmtDate, fmtM, fmtMaxCapacity, fmtMetric, maxCapacityDetail } from "@/lib/format";

export const metadata = { title: "Headroom — Overview" };

/**
 * CFO dashboard (product IA §Overview). Every number is read straight off
 * `getCompanyDashboard`'s already-computed objects (lib/dashboard-service.ts,
 * itself a thin composition over lib/financial-core/** and
 * lib/covenant-engine.ts) - this component performs no calculation, no
 * `preMax - amount` subtraction, and no company-name branching (identical
 * for any companyId the route names).
 */
export default async function OverviewPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const dash = await getCompanyDashboard(companyId);
  const { financialPosition: fp, capacity, legalReview } = dash;

  return (
    <div className="stack">
      <WarningList warnings={fp.warnings} />

      <Card>
        <div className="card-title">Position as of {fmtDate(dash.asOfDate)}</div>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-tile-value">{fmtM(fp.liquidity.cash.value)}</div>
            <div className="stat-tile-label">Cash</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{fp.liquidity.totalLiquidity === null ? "Review required" : fmtM(fp.liquidity.totalLiquidity)}</div>
            <div className="stat-tile-label">Total liquidity</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{fmtM(fp.capitalStructure.grossDebt)}</div>
            <div className="stat-tile-label">Gross debt</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{fmtM(fp.capitalStructure.netDebt)}</div>
            <div className="stat-tile-label">Net debt</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{fmtM(fp.capitalStructure.securedDebt)}</div>
            <div className="stat-tile-label">Secured debt</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{fmtM(fp.interest.totalAnnualizedCashInterest)}</div>
            <div className="stat-tile-label">Annualized cash interest</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{fmtMetric(fp.metrics.genericGrossLeverage)}</div>
            <div className="stat-tile-label">Gross leverage</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{fmtMetric(fp.metrics.genericNetLeverage)}</div>
            <div className="stat-tile-label">Net leverage</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{fmtMetric(fp.metrics.genericSecuredLeverage)}</div>
            <div className="stat-tile-label">Secured leverage</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{fmtMetric(fp.metrics.genericInterestCoverage)}</div>
            <div className="stat-tile-label">Interest coverage</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{fmtMetric(fp.metrics.ebitdaMarginPct)}</div>
            <div className="stat-tile-label">EBITDA margin</div>
          </div>
        </div>
      </Card>

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
        <div className="card-title">Covenant / headroom summary</div>
        <div className="row">
          <div>
            <div className="row-label">Maximum secured capacity</div>
            {maxCapacityDetail(capacity.secured.binding?.maximumCapacity) && (
              <div className="row-note">{maxCapacityDetail(capacity.secured.binding?.maximumCapacity)}</div>
            )}
          </div>
          <div className="row-value">{capacity.secured.remainingCapacity !== undefined ? fmtM(capacity.secured.remainingCapacity) : fmtMaxCapacity(capacity.secured.binding?.maximumCapacity)}</div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div>
            <div className="row-label">Maximum unsecured capacity</div>
            {maxCapacityDetail(capacity.unsecured.binding?.maximumCapacity) && (
              <div className="row-note">{maxCapacityDetail(capacity.unsecured.binding?.maximumCapacity)}</div>
            )}
          </div>
          <div className="row-value">
            {capacity.unsecured.remainingCapacity !== undefined ? fmtM(capacity.unsecured.remainingCapacity) : fmtMaxCapacity(capacity.unsecured.binding?.maximumCapacity)}
          </div>
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
