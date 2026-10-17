import { Card, Chip } from "@/components/ui";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import type { CrossDomainTransactionEvaluation } from "@/lib/product/cross-domain-transaction";
import { mapSimulateStatusToCustomerStatus } from "@/lib/customer-workflow/status-contract";

function supportTone(
  support: "EXECUTABLE" | "PARTIAL" | "EVIDENCE_BLOCKED" | "UNSUPPORTED" | "NOT_IMPLEMENTED",
): "pass" | "idle" | "tight" {
  if (support === "EXECUTABLE") return "pass";
  if (support === "PARTIAL") return "idle";
  return "tight";
}

/**
 * Server-rendered cross-domain acquisition evaluation on Simulate.
 * Each condition reports its own status, source provision, input identity,
 * and missing requirements. PARTIAL/UNSUPPORTED are never shown as fully clear.
 */
export function CrossDomainSimulatePanel({
  evaluation,
}: {
  evaluation: CrossDomainTransactionEvaluation;
}) {
  const overallCustomer = mapSimulateStatusToCustomerStatus(evaluation.overallStatus);

  return (
    <Card>
      <div className="card-title">Cross-domain — secured debt-funded acquisition</div>
      <div className="card-subtitle" style={{ marginTop: 4 }}>
        Same company-state and approved financial identity as Position. Gross ≠ modeled ≠ verified
        remaining. Verified remaining only via canonical utilization authority.
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <div className="row-label">Scenario</div>
        <div className="row-value">{evaluation.scenario.label}</div>
      </div>
      <div className="row">
        <div className="row-label">Overall</div>
        <div className="row-value">
          <StatusChip code={overallCustomer} />{" "}
          <Chip tone="idle">{evaluation.version}</Chip>
        </div>
      </div>
      <div className="row">
        <div className="row-label">Financial identity</div>
        <div className="row-value">
          {evaluation.financialIdentityValid ? (
            <Chip tone="pass">MATCH</Chip>
          ) : (
            <Chip tone="tight">MISMATCH — sims invalidated</Chip>
          )}{" "}
          <span className="row-note">
            {evaluation.approvedFinancialIdentity
              ? `${evaluation.approvedFinancialIdentity.companyId} · asOf ${evaluation.approvedFinancialIdentity.asOf} · fp ${evaluation.approvedFinancialIdentity.inputFingerprint.slice(0, 24)}…`
              : "—"}
          </span>
        </div>
      </div>
      <div className="row">
        <div className="row-label">Pro forma TNL / SSNL / coverage</div>
        <div className="row-value">
          {evaluation.proForma.totalNetLeverage?.toFixed(2) ?? "n/a"}x /{" "}
          {evaluation.proForma.seniorSecuredNetLeverage?.toFixed(2) ?? "n/a"}x /{" "}
          {evaluation.proForma.interestCoverage?.toFixed(2) ?? "n/a"}x
        </div>
      </div>

      <div className="card-subtitle" style={{ marginTop: 12 }}>
        Per-condition evaluation
      </div>
      {evaluation.domains.map((d, i) => (
        <div
          key={`${d.domain}-${i}`}
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: "1px solid var(--line)",
          }}
        >
          <div className="row">
            <div className="row-label">{d.domain}</div>
            <div className="row-value">
              <Chip tone={supportTone(d.support)}>{d.support}</Chip>{" "}
              <Chip
                tone={
                  d.status === "blocked"
                    ? "tight"
                    : d.status === "clear"
                      ? "pass"
                      : "idle"
                }
              >
                {d.status}
              </Chip>
            </div>
          </div>
          <div className="row-note">{d.summary}</div>
          <div className="row-note">
            Source provision: {d.sourceProvision ?? "—"}
          </div>
          <div className="row-note">
            Input identity: company={d.inputIdentity.companyId}
            {d.inputIdentity.documentId ? ` · doc=${d.inputIdentity.documentId}` : ""}
            {d.inputIdentity.provisionId ? ` · prov=${d.inputIdentity.provisionId}` : ""}
            {d.inputIdentity.periodKey ? ` · period=${d.inputIdentity.periodKey}` : ""}
            {" · asOf="}
            {d.inputIdentity.asOf}
          </div>
          <div className="row-note">
            Gross:{" "}
            {d.grossCapacityMillions != null ? `$${d.grossCapacityMillions.toFixed(1)}M` : "—"}
            {" · Modeled remaining: "}
            {d.modeledRemainingMillions != null
              ? `$${d.modeledRemainingMillions.toFixed(1)}M`
              : "—"}
            {" · Verified remaining: "}
            {d.verifiedRemainingMillions != null
              ? `$${d.verifiedRemainingMillions.toFixed(1)}M`
              : "null"}
          </div>
          {d.verifiedRemainingRefusalReason && (
            <div className="row-note">Verified refusal: {d.verifiedRemainingRefusalReason}</div>
          )}
          {d.missingInputs.length > 0 && (
            <div className="row-note">
              Missing: {d.missingInputs.join("; ")}
            </div>
          )}
          {d.citations.length > 0 && (
            <div className="row-note">Citations: {d.citations.slice(0, 4).join(" · ")}</div>
          )}
        </div>
      ))}

      <div className="card-subtitle" style={{ marginTop: 12 }}>
        Package limitations
      </div>
      {evaluation.packageLimitations.map((l, i) => (
        <div key={i} className="row-note">
          · {l}
        </div>
      ))}
      <div className="row-note" style={{ marginTop: 8 }}>
        {evaluation.authorityNote}
      </div>
    </Card>
  );
}
