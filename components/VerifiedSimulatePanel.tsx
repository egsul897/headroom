import { Banner, Card, Chip } from "@/components/ui";
import type { summarizeVerifiedSimulate } from "@/lib/product/unified-position/certified-simulate-bridge";

type VerifiedSummary = ReturnType<typeof summarizeVerifiedSimulate>;

/**
 * Read-only verified-path status for Simulate / Ask.
 * Does not rebuild SimulateClient — surfaces precise blockers when VEP/NS-4/4C gates fail,
 * and labels executable verified outcomes when they exist.
 */
export function VerifiedSimulatePanel({
  summary,
  evaluationDate,
}: {
  summary: VerifiedSummary;
  evaluationDate?: string | null;
}) {
  return (
    <Card>
      <div className="card-title">Verified transaction path</div>
      <div className="card-subtitle">
        Phase 4A–4D under REQUIRE · NS-4 cutoff · Phase 4C ledger · VerifiedExecutionPackage. Never bypassed.
        {evaluationDate ? ` Evaluation date: ${evaluationDate}.` : ""}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <div className="row-label">Status</div>
        <div className="row-value">
          <Chip tone={summary.executable ? "pass" : "tight"}>
            {summary.executable ? "EXECUTABLE" : "NOT EXECUTABLE"}
          </Chip>
        </div>
      </div>
      <div className="row">
        <div className="row-label">Capacity</div>
        <div className="row-value">{summary.capacityOutcome ?? "—"}</div>
      </div>
      <div className="row">
        <div className="row-label">Simulation</div>
        <div className="row-value">{summary.simulationOutcome ?? "—"}</div>
      </div>
      <div className="row">
        <div className="row-label">Path candidates</div>
        <div className="row-value">{summary.pathCandidateCount}</div>
      </div>
      {!summary.executable && (
        <Banner tone="amber">
          Verified execution unavailable. Precise blockers:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {summary.blockers.length > 0 ? (
              summary.blockers.map((b) => <li key={b}>{b}</li>)
            ) : (
              <li>See authority note</li>
            )}
          </ul>
          LEGACY_ENGINE analysis below remains labeled and does not claim CERTIFIED / Phase 4E.
        </Banner>
      )}
      {summary.executable && (
        <Banner tone="amber">
          Verified pre/post simulation executed for path {summary.selectedPathId ?? "—"}. Hypothetical —
          does not post to the ledger.
        </Banner>
      )}
      <div className="row-note" style={{ marginTop: 8 }}>
        {summary.authorityNote}
      </div>
    </Card>
  );
}
