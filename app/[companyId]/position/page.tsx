import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { getCompanyDashboard } from "@/lib/dashboard-service";
import { fmtM } from "@/lib/format";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import { runPackageLegalPath } from "@/lib/product/legal-intelligence/run-package-path";

export const metadata = { title: "Headroom — Position" };

/**
 * Position — debt / covenant capacity workspace.
 * Uses the shared capacity engine via getCompanyDashboard. Never hardcodes issuer arithmetic.
 * For CONMED demo: integrated legal path + challenge stage (fail-closed).
 */
export default async function PositionPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const isConmed = companyId === CONMED_DEMO_COMPANY_ID;

  if (isConmed) {
    const path = await runPackageLegalPath(CONMED_DEMO_COMPANY_ID);
    const blockers = path.challenges.filter((c) => c.severity === "BLOCKER");
    const facts = path.conclusions.filter((c) => c.kind === "PACKAGE_FACT");

    return (
      <div className="stack">
        <Card>
          <div className="card-title">Position</div>
          <div className="card-subtitle">
            CONMED authentic package — integrated legal path + autonomous challenge. Capacity is{" "}
            <strong>not determinable</strong>.
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <div className="row-label">Numeric capacity</div>
            <div className="row-value">
              <Chip tone="tight">NOT DETERMINABLE</Chip>
            </div>
          </div>
          <div className="row">
            <div className="row-label">Executable conclusions surviving challenge</div>
            <div className="row-value">{path.survivingExecutableConclusions}</div>
          </div>
          <div className="row">
            <div className="row-label">Path</div>
            <div className="row-value" style={{ fontSize: 12 }}>
              {path.pathExecuted.join(" → ")}
            </div>
          </div>
          <div className="row">
            <div className="row-label">Covenant rows examined</div>
            <div className="row-value">
              {path.metrics.covenantRowsExamined} · unresolved {path.metrics.unresolved}
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
          <div className="card-title">Challenge findings (blockers)</div>
          <div className="card-subtitle">
            Autonomous challenge against proposed conclusions — not a research memo.
          </div>
          {blockers.slice(0, 8).map((b) => (
            <div className="row" key={b.id}>
              <div>
                <div className="row-label">{b.category}</div>
                <div className="row-note">{b.statement}</div>
              </div>
              <Chip tone="tight">BLOCKER</Chip>
            </div>
          ))}
        </Card>

        <Card>
          <div className="card-title">Package facts (source-backed)</div>
          <div className="card-subtitle">Not capacity determinations.</div>
          {facts.slice(0, 6).map((f) => (
            <div className="row" key={f.id}>
              <div className="row-note">{f.statement}</div>
            </div>
          ))}
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
