import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { CapacityClaimRow } from "@/components/customer-workflow/CapacityClaimRow";
import { getCompanyDashboard } from "@/lib/dashboard-service";
import { FinancialIdentityError } from "@/lib/financial-identity";
import { fmtM } from "@/lib/format";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import { runPackageLegalPath } from "@/lib/product/legal-intelligence/run-package-path";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import { buildPositionView } from "@/lib/customer-workflow/position-view";
import { presentCapacityClaim } from "@/lib/customer-workflow/status-contract";

export const metadata = { title: "Headroom — Position" };

/**
 * Position — debt / covenant capacity workspace.
 * Consumes the shared capacity engine + readiness loaders. Never hardcodes
 * issuer arithmetic. Remaining from the legacy path is MODELED / NOT VERIFIED
 * (PR #268 authenticity gates are not merged on main).
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
          <WorkflowJourney companyId={companyId} current="position" />
          <div className="card-subtitle" style={{ marginTop: 8 }}>
            CONMED authentic package — integrated legal path + autonomous challenge. Capacity is{" "}
            <strong>not determinable</strong>.
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <div className="row-label">Numeric capacity</div>
            <div className="row-value">
              <StatusChip code="UNKNOWN" />
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
          <div className="row" style={{ borderBottom: "none" }}>
            <div className="row-label">Utilized capacity</div>
            <div className="row-value">
              <StatusChip code="UNKNOWN" compact /> — not defaulted to zero
            </div>
          </div>
          <div className="button-row" style={{ marginTop: 12 }}>
            <Link className="button button-primary" href={`/${companyId}/covenants`}>
              Explore covenants
            </Link>
            <Link className="button" href={`/${companyId}/simulate`}>
              Open simulate
            </Link>
            <Link className="button" href={`/${companyId}/evidence`}>
              Evidence & review
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

  const [readiness, rulebook] = await Promise.all([
    loadCapacityReadiness(companyId),
    loadRulebookReadiness(companyId),
  ]);

  let dashboard = null;
  let dashboardError: string | null = null;
  try {
    dashboard = await getCompanyDashboard(companyId);
  } catch (err) {
    if (err instanceof FinancialIdentityError) {
      dashboardError =
        err.code === "AMBIGUOUS"
          ? "Financial identity AMBIGUOUS — competing same-date snapshots; capacity withheld."
          : "No authenticated financial snapshot — engine position unavailable (not zero).";
    } else {
      dashboardError = "Position dashboard unavailable — fail closed; no invented figures.";
    }
  }

  const view = buildPositionView({
    companyId,
    dashboard,
    readiness,
    rulebook,
    dashboardError,
  });

  // Legacy package figures at amount=0 are modeled capacity — not verified AVAILABLE,
  // and not re-labeled as GROSS_CONTRACTUAL unless the engine publication says so.
  const securedModeled = presentCapacityClaim({
    claimKind: "REMAINING",
    amountMillions: dashboard?.capacity.secured.packageAuthoritative?.remainingCapacity ?? null,
    remainingIsAuthoritative: false,
    publicationLabel: dashboard?.capacity.secured.packageAuthoritative?.label ?? "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason: "Modeled package capacity not published for secured side.",
  });
  const unsecuredModeled = presentCapacityClaim({
    claimKind: "REMAINING",
    amountMillions: dashboard?.capacity.unsecured.packageAuthoritative?.remainingCapacity ?? null,
    remainingIsAuthoritative: false,
    publicationLabel: dashboard?.capacity.unsecured.packageAuthoritative?.label ?? "NOT_PRODUCTION_AUTHORITATIVE",
    unavailableReason: "Modeled package capacity not published for unsecured side.",
  });
  const grossUnavailable = presentCapacityClaim({
    claimKind: "GROSS_CONTRACTUAL",
    amountMillions: null,
    publicationLabel: "GROSS_CONTRACTUAL",
    unavailableReason:
      "Backend dependency: Position dashboard does not yet expose a separate gross-contractual field distinct from modeled remaining. Until that API exists, gross is shown as unavailable — never invented.",
  });

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Position</div>
        <WorkflowJourney companyId={companyId} current="position" />
        <div className="card-subtitle" style={{ marginTop: 8 }}>
          Debt instruments, applicable permissions, and capacity claims from the shared engine — not hardcoded
          arithmetic. {view.authorityNote}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="row-label">Overall claim status</div>
          <div className="row-value">
            <StatusChip code={view.overallStatus} />
          </div>
        </div>
        <div className="row">
          <div className="row-label">As of</div>
          <div className="row-value">{view.asOfDate ?? "—"}</div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Last verified evidence date</div>
          <div className="row-value">
            {view.lastVerifiedEvidenceDate ?? (
              <StatusChip code="UNKNOWN" compact />
            )}
          </div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {view.overallGuidance}
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button button-primary" href={`/${companyId}/dashboard`}>
            Open full position dashboard
          </Link>
          <Link className="button" href={`/${companyId}/ask`}>
            Ask
          </Link>
          <Link className="button" href={`/${companyId}/simulate`}>
            Simulate
          </Link>
          <Link className="button" href={`/${companyId}/evidence`}>
            Evidence
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Debt instruments</div>
        <div className="card-subtitle">From the shared financial-core capital structure — principal outstanding.</div>
        {view.instruments.length === 0 ? (
          <div className="row-note">
            <StatusChip code="NEEDS_INPUT" compact /> No instruments on an authenticated financial snapshot.
          </div>
        ) : (
          view.instruments.map((inst) => (
            <div className="row" key={inst.id}>
              <div>
                <div className="row-label">{inst.name}</div>
                <div className="row-note">
                  {inst.facilityType} · {inst.secured ? "secured" : "unsecured"}
                  {inst.governingDocumentId ? ` · doc ${inst.governingDocumentId}` : ""}
                </div>
              </div>
              <div className="row-value">
                {inst.amountMillions != null ? fmtM(inst.amountMillions) : "—"}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Applicable covenant permissions</div>
        <div className="row">
          <div className="row-label">Permission rows</div>
          <div className="row-value">{view.permissions.total}</div>
        </div>
        <div className="row">
          <div className="row-label">Counsel-verified (legal review)</div>
          <div className="row-value">{view.permissions.verified}</div>
        </div>
        <div className="row">
          <div className="row-label">Unverified promoted</div>
          <div className="row-value">{view.permissions.unverified}</div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Executable reported (rulebook)</div>
          <div className="row-value">{view.permissions.executableReported}</div>
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/rulebook`}>
            Open verified rulebook
          </Link>
          <Link className="button" href={`/${companyId}/covenants`}>
            Covenant discovery
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Capacity claims by side</div>
        <div className="card-subtitle">
          Gross contractual ≠ remaining available. Legacy modeled figures are MODELED / NOT VERIFIED —
          never labeled AVAILABLE.
        </div>
        <CapacityClaimRow label="Secured — gross contractual" claim={grossUnavailable} />
        <CapacityClaimRow label="Secured — modeled package capacity" claim={securedModeled} />
        <CapacityClaimRow
          label="Secured — remaining (authoritative only when certified)"
          claim={view.sides[0]!.remaining}
          citations={view.sides[0]!.sourceCitations}
        />
        <CapacityClaimRow label="Unsecured — gross contractual" claim={grossUnavailable} />
        <CapacityClaimRow label="Unsecured — modeled package capacity" claim={unsecuredModeled} />
        <CapacityClaimRow
          label="Unsecured — remaining (authoritative only when certified)"
          claim={view.sides[1]!.remaining}
          citations={view.sides[1]!.sourceCitations}
        />
        {view.sides.flatMap((s) => s.methodNotes).slice(0, 6).map((note, i) => (
          <div key={i} className="row-note">
            · {note}
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Missing inputs</div>
        {view.missingInputs.length === 0 ? (
          <div className="row-note">No readiness blockers reported.</div>
        ) : (
          view.missingInputs.map((m, i) => (
            <div key={i} className="row-note">
              · <StatusChip code="NEEDS_INPUT" compact /> {m}
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Review blockers</div>
        {view.reviewBlockers.length === 0 ? (
          <div className="row-note">No open review blockers from rulebook readiness.</div>
        ) : (
          view.reviewBlockers.map((b, i) => (
            <div key={i} className="row-note">
              · <StatusChip code="REVIEW_REQUIRED" compact /> {b}
            </div>
          ))
        )}
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/evidence`}>
            Evidence & review journey
          </Link>
        </div>
      </Card>
    </div>
  );
}
