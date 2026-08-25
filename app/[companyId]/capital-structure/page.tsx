import { Card, WarningList } from "@/components/ui";
import { getCompanyDashboard } from "@/lib/dashboard-service";
import { fmtDate, fmtM } from "@/lib/format";

export const metadata = { title: "Headroom — Capital Structure" };

/**
 * Facilities/instruments table (product IA §Capital Structure) - must
 * gracefully render companies with structurally different capital
 * structures (Matthews' first-lien/second-lien split vs Coherent's term
 * loans + notes) through the SAME table, driven entirely by whatever
 * `CapitalStructureSummary.facilities` actually contains for this company.
 * No per-instrument-name or per-company branching.
 */
export default async function CapitalStructurePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const dash = await getCompanyDashboard(companyId);
  const { financialPosition: fp } = dash;
  const rateByFacility = new Map(fp.interest.perInstrument.map((i) => [i.facilityId, i]));

  return (
    <div className="stack">
      <WarningList warnings={fp.warnings.filter((w) => w.category === "STALE_INPUT" || w.category === "DISPUTED_FACT")} />
      <Card>
        <div className="card-title">Facilities / instruments</div>
        <div className="card-subtitle">
          Weighted-average rate: {fp.capitalStructure.weightedAverageInterestRatePct !== null ? `${fp.capitalStructure.weightedAverageInterestRatePct.toFixed(2)}%` : "not evaluable (see per-instrument rows)"} · Fixed{" "}
          {fp.capitalStructure.fixedPct !== null ? `${fp.capitalStructure.fixedPct.toFixed(0)}%` : "n/a"} / Floating {fp.capitalStructure.floatingPct !== null ? `${fp.capitalStructure.floatingPct.toFixed(0)}%` : "n/a"}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Type</th>
                <th>Outstanding</th>
                <th>Commitment</th>
                <th>Rate</th>
                <th>Maturity</th>
                <th>Secured</th>
                <th>Collateral pool</th>
                <th>Governing document</th>
              </tr>
            </thead>
            <tbody>
              {fp.capitalStructure.facilities.map(({ facility, outstandingPrincipal }) => {
                const rate = rateByFacility.get(facility.id);
                return (
                  <tr key={facility.id}>
                    <td>{facility.name}</td>
                    <td>{facility.facilityType}</td>
                    <td className="mono">{fmtM(outstandingPrincipal)}</td>
                    <td className="mono">{facility.commitmentAmount !== undefined ? fmtM(facility.commitmentAmount) : "—"}</td>
                    <td className="mono">{rate && typeof rate.effectiveRatePct === "number" ? `${rate.effectiveRatePct.toFixed(2)}%` : rate?.status === "MISSING_BENCHMARK_ASSUMPTION" ? "Missing input" : "—"}</td>
                    <td>{facility.maturityDate ? fmtDate(facility.maturityDate) : "Not on record"}</td>
                    <td>{facility.secured ? "Secured" : "Unsecured"}</td>
                    <td>{facility.collateralPoolIds.length > 0 ? facility.collateralPoolIds.join(", ") : "—"}</td>
                    <td>{facility.governingDocumentId ?? "Not attributed"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="card-title">Totals</div>
        <div className="row">
          <div className="row-label">Gross debt</div>
          <div className="row-value">{fmtM(fp.capitalStructure.grossDebt)}</div>
        </div>
        <div className="row">
          <div className="row-label">Net debt</div>
          <div className="row-value">{fmtM(fp.capitalStructure.netDebt)}</div>
        </div>
        <div className="row">
          <div className="row-label">Secured debt</div>
          <div className="row-value">{fmtM(fp.capitalStructure.securedDebt)}</div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Unsecured debt</div>
          <div className="row-value">{fmtM(fp.capitalStructure.unsecuredDebt)}</div>
        </div>
      </Card>
    </div>
  );
}
