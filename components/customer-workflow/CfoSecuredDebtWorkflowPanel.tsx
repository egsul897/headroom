import { Card, Chip } from "@/components/ui";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { CfoSecuredDebtAuditDownload } from "@/components/customer-workflow/CfoSecuredDebtAuditDownload";
import type { CfoSecuredDebtProductEntry } from "@/lib/customer-workflow/cfo-secured-debt-entry";

function resultTone(
  result: string | null,
): "pass" | "idle" | "tight" {
  if (result === "PERMITTED") return "pass";
  if (result === "NOT_PERMITTED" || result === "UNSUPPORTED") return "tight";
  return "idle";
}

/**
 * Canonical product surface for the Matthews $50M secured-debt workflow.
 * Eight mission outputs + downloadable audit trail. Modeled results are labeled
 * as not CERTIFIED_4E. Verified remaining stays null; certified sim unavailable.
 */
export function CfoSecuredDebtWorkflowPanel({
  entry,
}: {
  entry: CfoSecuredDebtProductEntry;
}) {
  if (!entry.routeEligible || !entry.workflow || !entry.outputs) {
    return null;
  }

  const w = entry.workflow;
  const o = entry.outputs;

  return (
    <Card data-testid="cfo-secured-debt-workflow-panel">
      <div className="card-title">CFO secured-debt workflow — Matthews $50M</div>
      <div className="card-subtitle" style={{ marginTop: 4 }}>
        Authentic package orchestrator (vertical slice · VE bridge · path enum · verified
        simulate · modeled SSNL). Not a second engine.{" "}
        <strong>Modeled outcomes are not certified legal determinations.</strong>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <div className="row-label">Ask</div>
        <div className="row-value">{w.ask}</div>
      </div>
      <div className="row">
        <div className="row-label">Package</div>
        <div className="row-value">
          {w.package.key} · {w.package.authenticity} · as-of {w.package.asOf}
        </div>
      </div>
      <div className="row">
        <div className="row-label">Result</div>
        <div className="row-value" data-testid="cfo-secured-debt-result">
          <Chip tone={resultTone(entry.result)}>{entry.result}</Chip>{" "}
          <Chip tone="idle">{entry.resultAuthority}</Chip>
        </div>
      </div>
      <div className="row-note" data-testid="cfo-secured-debt-authority-label">
        {entry.resultAuthorityLabel}
      </div>
      <div className="row-note">{w.resultRationale}</div>

      <div className="row" style={{ marginTop: 8 }}>
        <div className="row-label">Verified remaining</div>
        <div className="row-value">
          <Chip tone="tight">null</Chip>{" "}
          <span className="row-note">completeness absent · trusted issuer BLOCKED</span>
        </div>
      </div>
      <div className="row">
        <div className="row-label">Certified simulation</div>
        <div className="row-value">
          <Chip tone="tight">unavailable</Chip>{" "}
          <span className="row-note">
            path {o.pathAndSimulation?.pathEnumerationAuthority ?? "—"} · executable=
            {String(o.pathAndSimulation?.verifiedSimulateExecutable ?? false)}
          </span>
        </div>
      </div>

      {/* 1. Applicable covenants + citations */}
      <div className="card-subtitle" style={{ marginTop: 14 }}>
        1. Applicable covenants &amp; source citations
      </div>
      {(o.applicableCovenants ?? []).map((c) => (
        <div key={c.code} className="row-note">
          · <strong>{c.code}</strong> — {c.sourceCitation} · modeled={c.modeledCapacityMm ?? "n/a"} mm ·
          remaining=null · {c.authorityStatus}
        </div>
      ))}

      {/* 2. Operative / amendment */}
      <div className="card-subtitle" style={{ marginTop: 12 }}>
        2. Operative document &amp; amendment state
      </div>
      <div className="row-note">
        Status: {o.operativeAndAmendmentState?.operativeStateStatus}
      </div>
      {(o.operativeAndAmendmentState?.documents ?? []).map((d) => (
        <div key={d.id} className="row-note">
          · {d.name} ({d.accession}) — {d.role}
        </div>
      ))}
      {(o.operativeAndAmendmentState?.amendmentNotes ?? []).slice(0, 3).map((n, i) => (
        <div key={i} className="row-note">
          · {n}
        </div>
      ))}

      {/* 3. Baskets / ratios */}
      <div className="card-subtitle" style={{ marginTop: 12 }}>
        3. Debt baskets &amp; ratio conditions
      </div>
      {(o.debtBasketsAndRatioConditions ?? []).map((b) => (
        <div key={b.code} className="row-note">
          · {b.code} [{b.kind}] — {b.condition} · modeled room={b.modeledRoomMm ?? "n/a"} · remaining
          published=null
        </div>
      ))}

      {/* 4. Financial provenance */}
      <div className="card-subtitle" style={{ marginTop: 12 }}>
        4. Financial inputs &amp; provenance
      </div>
      <div className="row-note">
        NS-4 APPROVED present:{" "}
        <Chip tone="tight">{String(o.approvedFinancialInputs?.ns4ApprovedPresent ?? false)}</Chip>
      </div>
      <div className="row-note">{o.approvedFinancialInputs?.fixtureProvenance}</div>
      <div className="row-note">{o.approvedFinancialInputs?.note}</div>

      {/* 5. Utilization */}
      <div className="card-subtitle" style={{ marginTop: 12 }}>
        5. Utilization &amp; remaining-capacity status
      </div>
      <div className="row-note">
        Completeness certificate:{" "}
        {String(o.utilizationAndRemaining?.completenessCertificatePresent)} · supports remaining:{" "}
        {String(o.utilizationAndRemaining?.supportsRemainingClaim)} · verified remaining: null ·
        production handoff refused: {String(o.utilizationAndRemaining?.productionHandoffRefused)}
      </div>

      {/* 6. Path + simulation */}
      <div className="card-subtitle" style={{ marginTop: 12 }}>
        6. Path enumeration &amp; verified simulation
      </div>
      <div className="row-note">
        Authority: {o.pathAndSimulation?.pathEnumerationAuthority} · paths:{" "}
        {o.pathAndSimulation?.pathCount} · selected:{" "}
        {o.pathAndSimulation?.selectedPathId ?? "none"} · modeled scenario:{" "}
        {o.pathAndSimulation?.modeledScenarioOverall ?? "—"}
      </div>
      {(o.pathAndSimulation?.refusalSummary ?? []).slice(0, 4).map((r, i) => (
        <div key={i} className="row-note">
          · refusal: {r}
        </div>
      ))}

      {/* 7. Result (already above) + 8. Audit */}
      <div className="card-subtitle" style={{ marginTop: 12 }}>
        7–8. Defensible result &amp; exportable audit trail
      </div>
      <div className="row" style={{ marginTop: 4 }}>
        <div className="row-label">Evidence blockers</div>
        <div className="row-value" data-testid="cfo-secured-debt-blockers">
          {entry.evidenceBlockers.length}
        </div>
      </div>
      {entry.evidenceBlockers.slice(0, 8).map((b, i) => (
        <div key={i} className="row-note">
          · <StatusChip code="NEEDS_INPUT" compact /> {b}
        </div>
      ))}
      {entry.auditExportJson && entry.auditExportFilename && (
        <div className="button-row" style={{ marginTop: 12 }} data-testid="cfo-secured-debt-audit-download">
          <CfoSecuredDebtAuditDownload
            json={entry.auditExportJson}
            filename={entry.auditExportFilename}
          />
        </div>
      )}
    </Card>
  );
}
