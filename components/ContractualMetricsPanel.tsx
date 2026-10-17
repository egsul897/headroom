import type { ContractualMetricsView } from "@/lib/product/contractual-metrics/serialize";
import { Card } from "@/components/ui";

function fmtMetric(m: ContractualMetricsView["metrics"][number]): string {
  if (m.status !== "CALCULATED" || m.valueMillions == null) {
    if (m.status === "NO_PACKAGE") return "Not available for this company";
    if (m.status === "NEEDS_INPUT") return "Needs input";
    if (m.status === "UNSUPPORTED") return "Unsupported";
    return "Review required";
  }
  if (m.unit === "RATIO") return `${m.valueMillions.toFixed(2)}x`;
  return `$${m.valueMillions.toLocaleString(undefined, { maximumFractionDigits: 3 })}M`;
}

export function ContractualMetricsPanel({ view }: { view: ContractualMetricsView | null }) {
  if (!view || view.metrics.length === 0) return null;
  if (view.metrics.every((m) => m.status === "NO_PACKAGE")) {
    return (
      <Card>
        <div className="card-title">Contractual financial metrics</div>
        <div className="card-subtitle">
          No instrument package is registered to execute contractual definitions for this company yet.
          Generic snapshot fields are not shown here as contractual results.
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="card-title">Contractual financial metrics</div>
      <div className="card-subtitle">
        Definition-executed via Phase 4A from operative instrument IR — not generic FinancialSnapshot fields.
        Authority: <strong>provisional</strong> (public-filing reconstruction / modeled certificate inputs) —
        never replaces an approved authoritative headline metric. Unsupported add-backs are listed explicitly.
      </div>

      {view.metrics.map((m) => (
        <div key={m.metricKey} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <div className="row" style={{ borderBottom: "none" }}>
            <div>
              <div className="row-label">{m.displayName}</div>
              <div className="row-note">
                {m.sourceDocumentId} {m.sectionRef} · {m.measurementPeriod || m.asOf}
                {m.definitionExecuted ? " · definition-executed" : ""}
              </div>
            </div>
            <div className={`row-value ${m.status !== "CALCULATED" ? "na" : ""}`}>{fmtMetric(m)}</div>
          </div>
          <div className="row-note" style={{ marginTop: 4 }}>
            Formula: {m.formulaSummary}
          </div>
          {m.lineItems.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {m.lineItems.map((li) => (
                <div className="row" key={li.key} style={{ fontSize: 13 }}>
                  <div>
                    <div className="row-label">{li.label}</div>
                    <div className="row-note">
                      {li.sourceCitation}
                      {li.notes ? ` — ${li.notes}` : ""}
                      {li.role === "UNSUPPORTED" ? " · UNSUPPORTED" : ""}
                    </div>
                  </div>
                  <div className="row-value mono">
                    {li.amountMillions == null ? "—" : `$${li.amountMillions.toLocaleString(undefined, { maximumFractionDigits: 3 })}M`}
                  </div>
                </div>
              ))}
            </div>
          )}
          {m.unsupportedMechanics.length > 0 && (
            <div className="row-note" style={{ marginTop: 6 }}>
              Unsupported / not invoked: {m.unsupportedMechanics.join("; ")}
            </div>
          )}
          {m.missingInputs.length > 0 && (
            <div className="row-note" style={{ marginTop: 4 }}>
              Missing inputs: {m.missingInputs.join(", ")}
            </div>
          )}
          {m.inputsUsed.length > 0 && (
            <div className="row-note" style={{ marginTop: 4 }}>
              Inputs used: {m.inputsUsed.join(", ")}
            </div>
          )}
          <div className="row-note" style={{ marginTop: 4 }}>
            Runtime: {m.evaluationStatus ?? "n/a"} · {m.authorityLabel}
            {m.persistNote ? ` · ${m.persistNote}` : ""}
          </div>
        </div>
      ))}
    </Card>
  );
}
