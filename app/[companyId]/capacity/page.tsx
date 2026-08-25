import { Card, Chip } from "@/components/ui";
import { getCompanyDashboard } from "@/lib/dashboard-service";
import { fmtM, fmtMaxCapacity, maxCapacityDetail } from "@/lib/format";
import type { PerDocumentRemainingCapacity } from "@/lib/covenant-engine";

export const metadata = { title: "Headroom — Capacity" };

function methodLabel(method: PerDocumentRemainingCapacity["method"]): string {
  switch (method) {
    case "SOLVER_NATIVE_RECOMPUTED":
      return "Solver-native (full recomputation)";
    case "LEGACY_DECLARED_MINUS_TESTED_AMOUNT":
      return "Legacy (declared ceiling)";
    case "NOT_DETERMINABLE":
      return "Not determinable";
  }
}

function DocumentCapacityRow({ d }: { d: PerDocumentRemainingCapacity }) {
  return (
    <div className="row" key={d.documentId}>
      <div>
        <div className="row-label">{d.documentName}</div>
        <div className="row-note">
          {methodLabel(d.method)}
          {d.reason ? ` — ${d.reason}` : ""}
        </div>
        {d.bindingConstraint && d.bindingConstraint.length > 0 && (
          <div className="row-note">
            Binding: {d.bindingConstraint.map((c) => `${c.documentId} ${c.sectionRef}${c.permissionId ? ` (${c.permissionId})` : ""}`).join("; ")}
          </div>
        )}
        {maxCapacityDetail(d.maximumCapacity) && <div className="row-note">{maxCapacityDetail(d.maximumCapacity)}</div>}
      </div>
      <div className="row-value">{d.remainingCapacity !== undefined ? fmtM(d.remainingCapacity) : "Not evaluated"}</div>
    </div>
  );
}

/**
 * Capacity/Headroom page (product IA §Capacity). Reads exclusively from
 * `computeRemainingCapacityAfterDebtIncurrence` (via
 * lib/dashboard-service.ts's `getCompanyDashboard`), evaluated at amount=0 -
 * the SAME real post-transaction-recomputation function the Simulate
 * workflow uses, never a `preMax - amount` subtraction in this component
 * (task hard requirement §3). A NOT_DETERMINABLE document/side renders "Not
 * evaluated," never `$0`/"Unlimited" (task hard requirement §5).
 */
export default async function CapacityPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const dash = await getCompanyDashboard(companyId);
  const { capacity } = dash;

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Secured debt capacity</div>
        <div className="card-subtitle">
          Overall: {capacity.secured.remainingCapacity !== undefined ? fmtM(capacity.secured.remainingCapacity) : "Not evaluated"}{" "}
          {capacity.secured.binding && <Chip tone="navy">binding: {capacity.secured.binding.documentName}</Chip>}
        </div>
        {capacity.secured.perDocument.map((d) => (
          <DocumentCapacityRow key={d.documentId} d={d} />
        ))}
      </Card>

      <Card>
        <div className="card-title">Unsecured debt capacity</div>
        <div className="card-subtitle">
          Overall: {capacity.unsecured.remainingCapacity !== undefined ? fmtM(capacity.unsecured.remainingCapacity) : "Not evaluated"}{" "}
          {capacity.unsecured.binding && <Chip tone="navy">binding: {capacity.unsecured.binding.documentName}</Chip>}
        </div>
        {capacity.unsecured.perDocument.map((d) => (
          <DocumentCapacityRow key={d.documentId} d={d} />
        ))}
      </Card>

      <Card>
        <div className="card-title">How to read this page</div>
        <div className="row-note">
          &ldquo;Maximum capacity&rdquo; is the document/side&apos;s own request-amount-independent ceiling, recomputed fresh (never a stored figure minus an amount). &ldquo;Not evaluated&rdquo; means the
          engine has no governing-document configuration to test against for this side - it is never rendered as $0 or Unlimited. See the Simulate page for a specific hypothetical transaction&apos;s full contractual
          result and explainability trace.
        </div>
      </Card>
    </div>
  );
}
