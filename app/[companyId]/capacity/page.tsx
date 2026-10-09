import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { getCompanyDashboard } from "@/lib/dashboard-service";
import { fmtM, maxCapacityDetail } from "@/lib/format";
import type { PerDocumentRemainingCapacity } from "@/lib/covenant-engine";
import { FinancialIdentityError } from "@/lib/financial-identity";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";

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
            Binding:{" "}
            {d.bindingConstraint
              .map((c) => `${c.documentId} ${c.sectionRef}${c.permissionId ? ` (${c.permissionId})` : ""}`)
              .join("; ")}
          </div>
        )}
        {maxCapacityDetail(d.maximumCapacity) && <div className="row-note">{maxCapacityDetail(d.maximumCapacity)}</div>}
      </div>
      <div className="row-value">{d.remainingCapacity !== undefined ? fmtM(d.remainingCapacity) : "Not evaluated"}</div>
    </div>
  );
}

function ReadinessBanner({
  companyId,
  readiness,
}: {
  companyId: string;
  readiness: Awaited<ReturnType<typeof loadCapacityReadiness>>;
}) {
  return (
    <Card>
      <div className="card-title">Capacity determination status</div>
      <div className="card-subtitle">{readiness.headline}</div>
      <div className="row" style={{ marginTop: 8 }}>
        <div className="row-label">Status</div>
        <div className="row-value">
          <Chip tone={readiness.canEvaluateExecutableCapacity ? "pass" : "tight"}>{readiness.status}</Chip>
        </div>
      </div>
      <div className="row-note" style={{ marginTop: 8 }}>
        Analyzed documents: {readiness.analyzedDocumentCount} · Summaries: {readiness.summaryCount} · Permissions:{" "}
        {readiness.permissionCount} · Provisions: {readiness.provisionCount} · Financial snapshot:{" "}
        {readiness.hasFinancialSnapshot ? "yes" : "no"}
      </div>
      {readiness.blockers.map((b, i) => (
        <div key={i} className="row-note">
          • {b}
        </div>
      ))}
      <div className="row-note" style={{ marginTop: 8 }}>
        {readiness.guidance}
      </div>
      <div className="button-row" style={{ marginTop: 12 }}>
        <Link className="button" href={`/${companyId}/covenants`}>
          Covenant review
        </Link>
        <Link className="button" href={`/${companyId}/ask`}>
          Ask Headroom
        </Link>
        <Link className="button" href={`/${companyId}/onboarding/documents`}>
          Upload documents
        </Link>
      </div>
    </Card>
  );
}

/**
 * Capacity/Headroom page. Shows engine figures only when an executable rulebook
 * and financial snapshot exist. Otherwise fail-closed: never invents $0 or Unlimited.
 */
export default async function CapacityPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const readiness = await loadCapacityReadiness(companyId);

  if (!readiness.canEvaluateExecutableCapacity) {
    return (
      <div className="stack">
        <ReadinessBanner companyId={companyId} readiness={readiness} />
        <Card>
          <div className="card-title">Secured / unsecured debt capacity</div>
          <div className="card-subtitle">
            <Chip tone="tight">NOT DETERMINABLE</Chip> — no executable capacity evaluation for this workspace.
          </div>
          <div className="row-note" style={{ marginTop: 8 }}>
            Discovery-level covenant summaries (if any) explain restrictions and baskets in text; they do not establish
            remaining contractual headroom. Required for a supported capacity figure: (1) operative amendment resolution,
            (2) approved executable rulebook, (3) approved financial snapshot, (4) ledger utilization where baskets are
            usage-tracked.
          </div>
        </Card>
      </div>
    );
  }

  let dash: Awaited<ReturnType<typeof getCompanyDashboard>>;
  try {
    dash = await getCompanyDashboard(companyId);
  } catch (err) {
    if (err instanceof FinancialIdentityError) {
      return (
        <div className="stack">
          <ReadinessBanner
            companyId={companyId}
            readiness={{
              ...readiness,
              canEvaluateExecutableCapacity: false,
              status: "NO_FINANCIAL_SNAPSHOT",
              headline: "Financial identity unresolved — capacity cannot be evaluated without inventing inputs.",
              blockers: [...readiness.blockers, err.message],
            }}
          />
          <Card>
            <div className="card-subtitle">
              <Chip tone="tight">NOT DETERMINABLE</Chip> — {err.message}
            </div>
          </Card>
        </div>
      );
    }
    throw err;
  }

  const { capacity } = dash;

  return (
    <div className="stack">
      <ReadinessBanner companyId={companyId} readiness={readiness} />

      <Card>
        <div className="card-title">Secured debt capacity</div>
        <div className="card-subtitle">
          Overall:{" "}
          {capacity.secured.remainingCapacity !== undefined ? fmtM(capacity.secured.remainingCapacity) : "Not evaluated"}{" "}
          {capacity.secured.binding && <Chip tone="navy">binding: {capacity.secured.binding.documentName}</Chip>}
        </div>
        {capacity.secured.perDocument.map((d) => (
          <DocumentCapacityRow key={d.documentId} d={d} />
        ))}
      </Card>

      <Card>
        <div className="card-title">Unsecured debt capacity</div>
        <div className="card-subtitle">
          Overall:{" "}
          {capacity.unsecured.remainingCapacity !== undefined
            ? fmtM(capacity.unsecured.remainingCapacity)
            : "Not evaluated"}{" "}
          {capacity.unsecured.binding && <Chip tone="navy">binding: {capacity.unsecured.binding.documentName}</Chip>}
        </div>
        {capacity.unsecured.perDocument.map((d) => (
          <DocumentCapacityRow key={d.documentId} d={d} />
        ))}
      </Card>

      <Card>
        <div className="card-title">How to read this page</div>
        <div className="row-note">
          &ldquo;Maximum capacity&rdquo; is the document/side&apos;s own request-amount-independent ceiling, recomputed
          fresh (never a stored figure minus an amount). &ldquo;Not evaluated&rdquo; means the engine has no governing
          configuration to test against for this side — it is never rendered as $0 or Unlimited. See Simulate for a
          specific hypothetical transaction&apos;s full contractual result and explainability trace.
        </div>
      </Card>
    </div>
  );
}
