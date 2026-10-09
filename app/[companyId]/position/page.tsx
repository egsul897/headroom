import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { getCompanyDashboard } from "@/lib/dashboard-service";
import { fmtM } from "@/lib/format";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import { listConmedCovenantExplorerRows } from "@/lib/product/conmed-demo/covenant-catalog";

export const metadata = { title: "Headroom — Position" };

/**
 * Position — debt / covenant capacity workspace.
 * Uses the shared capacity engine via getCompanyDashboard. Never hardcodes issuer arithmetic.
 * For CONMED demo (no capacity formulas / financials), shows honest unresolved state.
 */
export default async function PositionPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const isConmed = companyId === CONMED_DEMO_COMPANY_ID;

  if (isConmed) {
    const rows = listConmedCovenantExplorerRows();
    const needsInputs = rows.filter((r) =>
      ["NEEDS_FINANCIAL_INPUTS", "RATIO_GATED_UNRESOLVED"].includes(r.capacityStatus),
    ).length;
    const structureOnly = rows.length - needsInputs;

    return (
      <div className="stack">
        <Card>
          <div className="card-title">Position</div>
          <div className="card-subtitle">
            CONMED authentic package — capacity is <strong>not determinable</strong> in this workspace.
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <div className="row-label">Numeric capacity</div>
            <div className="row-value">
              <Chip tone="tight">NOT DETERMINABLE</Chip>
            </div>
          </div>
          <div className="row">
            <div className="row-label">Why</div>
            <div className="row-value">
              No approved financial snapshot, utilization ledger, or capacity IR is loaded. Basket ceilings and ratio gates are visible in Covenants as source-backed structure only.
            </div>
          </div>
          <div className="row">
            <div className="row-label">Covenant rows</div>
            <div className="row-value">
              {rows.length} explored · {needsInputs} need financial inputs · {structureOnly} structure/prohibition
            </div>
          </div>
          <div className="row" style={{ borderBottom: "none" }}>
            <div className="row-label">Utilized capacity</div>
            <div className="row-value">
              <Chip tone="tight">UNKNOWN</Chip> — not defaulted to zero
            </div>
          </div>
          <div className="button-row" style={{ marginTop: 12 }}>
            <Link className="button button-primary" href={`/${companyId}/covenants`}>
              Explore covenants
            </Link>
            <Link className="button" href={`/${companyId}/simulate`}>
              Open simulate
            </Link>
            <Link className="button" href={`/${companyId}/documents`}>
              Documents
            </Link>
          </div>
        </Card>

        <Card>
          <div className="card-title">Debt instruments (package facts)</div>
          <div className="card-subtitle">From authentic source — not a live facility register.</div>
          <div className="row">
            <div className="row-label">Base facility</div>
            <div className="row-value">Eighth A&R Credit Agreement (Doc A) — JPMorgan agent</div>
          </div>
          <div className="row">
            <div className="row-label">Incremental</div>
            <div className="row-value">$450,000,000 Term A-2 via Doc D (source-backed; not modeled as drawable capacity here)</div>
          </div>
          <div className="row" style={{ borderBottom: "none" }}>
            <div className="row-label">Guarantee / collateral</div>
            <div className="row-value">Doc B — reaffirmed in Doc D</div>
          </div>
        </Card>
      </div>
    );
  }

  // Engine-backed companies (e.g. Coherent): reuse dashboard client / capacity.
  const dash = await getCompanyDashboard(companyId);
  const secured = dash.capacity.secured.remainingCapacity;
  const unsecured = dash.capacity.unsecured.remainingCapacity;

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Position</div>
        <div className="card-subtitle">
          Evaluated by the shared capacity engine — not hardcoded arithmetic.
        </div>
        <div className="row">
          <div className="row-label">Secured remaining</div>
          <div className="row-value">
            {secured !== undefined ? fmtM(secured) : <Chip tone="tight">Not evaluated</Chip>}
          </div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Unsecured remaining</div>
          <div className="row-value">
            {unsecured !== undefined ? fmtM(unsecured) : <Chip tone="tight">Not evaluated</Chip>}
          </div>
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button button-primary" href={`/${companyId}/dashboard`}>
            Open full position dashboard
          </Link>
          <Link className="button" href={`/${companyId}/capacity`}>
            Capacity detail
          </Link>
          <Link className="button" href={`/${companyId}/simulate`}>
            Simulate
          </Link>
        </div>
      </Card>
    </div>
  );
}
