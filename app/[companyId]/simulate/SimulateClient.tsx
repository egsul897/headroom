"use client";

import { useMemo, useState } from "react";
import { Banner, Card, Chip, LegalReviewBadge, WarningList, type ChipTone } from "@/components/ui";
import { runScenarioWithInputs, type ScenarioInputs } from "@/lib/scenario-runner";
import { fmtM, fmtX } from "@/lib/format";
import type { FacilityDraft, ScenarioAction } from "@/lib/financial-core/types";
import type { PerDocumentDebtResult } from "@/lib/covenant-engine";
import type { ScenarioResult } from "@/lib/financial-core/types";

type ActionKind = "DEBT_ISSUANCE" | "DRAW_REVOLVER" | "DEBT_REPAYMENT" | "REFINANCING" | "ACQUISITION";

const ACTION_LABELS: Record<ActionKind, string> = {
  DEBT_ISSUANCE: "New debt issuance",
  DRAW_REVOLVER: "Draw revolver",
  DEBT_REPAYMENT: "Debt repayment",
  REFINANCING: "Refinancing",
  ACQUISITION: "Acquisition",
};

function contractualTone(status: string): ChipTone {
  if (status === "clear") return "pass";
  if (status === "blocked") return "trip";
  if (status === "review_required") return "tight";
  return "idle";
}

function contractualLabel(status: string): string {
  switch (status) {
    case "clear":
      return "CLEAR";
    case "blocked":
      return "BLOCKED";
    case "review_required":
      return "REVIEW REQUIRED";
    default:
      return "NOT EVALUATED";
  }
}

/** Explainability drill-down for one document's contractual result: transaction -> document -> permissions considered -> constraints -> elections/allocations -> binding constraint -> result (task IA §M). Native <details> so it needs no extra client state. */
function DocumentExplainability({ d }: { d: PerDocumentDebtResult }) {
  const solver = d.solverResult;
  return (
    <details className="trace">
      <summary className="trace-summary">
        <span className="trace-summary-main">
          <span className="row-label">{d.documentName}</span>
          <span className="row-note">{d.solverCoverage?.status ?? "legacy"}</span>
        </span>
        <span className="row-value">
          <Chip tone={contractualTone(d.status)}>{contractualLabel(d.status)}</Chip>
        </span>
      </summary>
      <div className="trace-body">
        <div className="trace-label">Tested amount</div>
        <div>{d.testedAmount !== undefined ? fmtM(d.testedAmount) : "—"}</div>
        {d.reason && (
          <>
            <div className="trace-label" style={{ marginTop: 8 }}>
              Reason
            </div>
            <div>{d.reason}</div>
          </>
        )}
        {d.bindingProvision && (
          <>
            <div className="trace-label" style={{ marginTop: 8 }}>
              Binding provision (selected path)
            </div>
            <div>
              {d.bindingProvision.basketName} <span className="section-ref">{d.bindingProvision.sectionRef}</span>
            </div>
          </>
        )}
        {d.bindingConstraint && d.bindingConstraint.length > 0 && (
          <>
            <div className="trace-label" style={{ marginTop: 8 }}>
              Binding constraint (maximum-capacity ceiling - distinct from the selected path above)
            </div>
            {d.bindingConstraint.map((c, i) => (
              <div key={i}>
                {c.documentId} <span className="section-ref">{c.sectionRef}</span> {c.permissionId ? `(${c.permissionId})` : ""}
              </div>
            ))}
          </>
        )}
        {solver && (
          <>
            <div className="trace-label" style={{ marginTop: 8 }}>
              Permissions considered ({solver.constraintsEvaluated.eligibilityConditions.length} eligibility condition(s) evaluated)
            </div>
            {solver.permissionPathUsed?.legs.map((leg) => (
              <div key={leg.permissionId} className="row-note">
                {leg.permissionId} — {leg.grantType} — allocated {fmtM(leg.amountAllocated)}
                {leg.standaloneCapacity !== undefined ? ` (standalone capacity ${fmtM(leg.standaloneCapacity)})` : ""}
              </div>
            ))}
            {solver.alternatives.length > 0 && (
              <>
                <div className="trace-label" style={{ marginTop: 8 }}>
                  Alternative paths considered and rejected
                </div>
                {solver.alternatives.map((a) => (
                  <div key={a.path.id} className="row-note">
                    {a.path.id} — {a.rejectionReason}
                  </div>
                ))}
              </>
            )}
            {solver.uncertainty.reviewItems.length > 0 && (
              <>
                <div className="trace-label" style={{ marginTop: 8 }}>
                  Review items
                </div>
                {solver.uncertainty.reviewItems.map((r, i) => (
                  <div key={i} className="row-note">
                    [{r.reasonCategory}] {r.description}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </details>
  );
}

export function SimulateClient({ inputs }: { inputs: ScenarioInputs }) {
  const [kind, setKind] = useState<ActionKind>("DEBT_ISSUANCE");
  const [amount, setAmount] = useState(100);
  const [secured, setSecured] = useState(true);
  const [couponPct, setCouponPct] = useState(7);
  const [facilityId, setFacilityId] = useState(inputs.facilities[0]?.id ?? "");
  const [acquiredEbitda, setAcquiredEbitda] = useState(20);
  const [synergyEbitda, setSynergyEbitda] = useState(0);
  const [cashConsideration, setCashConsideration] = useState(10);
  const [result, setResult] = useState<ScenarioResult | undefined>(undefined);
  const [infeasibleReason, setInfeasibleReason] = useState<string | undefined>(undefined);

  const facilityOptions = inputs.facilities;
  const revolvers = facilityOptions.filter((f) => f.facilityType === "REVOLVER");

  const action: ScenarioAction | undefined = useMemo(() => {
    switch (kind) {
      case "DEBT_ISSUANCE": {
        const draft: FacilityDraft = { name: `New ${secured ? "secured" : "unsecured"} facility`, facilityType: "TERM_LOAN", secured, couponType: "FIXED", couponPct };
        return { kind: "DEBT_ISSUANCE", amount, useOfProceeds: "General corporate purposes", facilityDraft: draft };
      }
      case "DRAW_REVOLVER":
        return facilityId ? { kind: "DRAW_REVOLVER", facilityId, amount } : undefined;
      case "DEBT_REPAYMENT":
        return facilityId ? { kind: "DEBT_REPAYMENT", facilityId, amount } : undefined;
      case "REFINANCING": {
        if (!facilityId) return undefined;
        const draft: FacilityDraft = { name: `Refinanced ${secured ? "secured" : "unsecured"} facility`, facilityType: "TERM_LOAN", secured, couponType: "FIXED", couponPct };
        return { kind: "REFINANCING", retiresFacilityId: facilityId, newFacilityDraft: draft, newAmount: amount };
      }
      case "ACQUISITION": {
        const purchasePrice = cashConsideration + amount;
        const draft: FacilityDraft = { name: "Acquisition financing", facilityType: "TERM_LOAN", secured, couponType: "FIXED", couponPct };
        return {
          kind: "ACQUISITION",
          purchasePrice,
          cashConsideration,
          revolverFunding: null,
          newDebtFunding: amount > 0 ? { facilityDraft: draft, amount } : null,
          acquiredEbitda,
          synergyEbitda,
          transactionFees: 0,
        };
      }
    }
  }, [kind, amount, secured, couponPct, facilityId, acquiredEbitda, synergyEbitda, cashConsideration]);

  function run() {
    if (!action) return;
    setInfeasibleReason(undefined);
    try {
      // Pure, client-side, non-mutating: runs directly against the
      // ScenarioInputs already loaded server-side - no fetch/server
      // action/DB call of any kind.
      setResult(runScenarioWithInputs(inputs, [action]));
    } catch (err) {
      // The financial-core scenario engine deliberately throws (fails
      // closed) for an infeasible action - e.g. more cash consideration than
      // is actually on hand (lib/financial-core/scenario.ts's own
      // `requireCash`/`requireFacility` guards). Surface that as a
      // prominent, readable warning rather than an uncaught exception/blank
      // screen (task hard requirement §7).
      setResult(undefined);
      setInfeasibleReason(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Compose a hypothetical transaction</div>
        <div className="field">
          <div className="field-label">Scenario type</div>
          <select className="field-control" value={kind} onChange={(e) => setKind(e.target.value as ActionKind)}>
            {(Object.keys(ACTION_LABELS) as ActionKind[]).map((k) => (
              <option key={k} value={k}>
                {ACTION_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        {(kind === "DEBT_ISSUANCE" || kind === "REFINANCING" || kind === "ACQUISITION") && (
          <div className="field">
            <div className="field-label">Secured</div>
            <select className="field-control" value={secured ? "yes" : "no"} onChange={(e) => setSecured(e.target.value === "yes")}>
              <option value="yes">Secured</option>
              <option value="no">Unsecured</option>
            </select>
          </div>
        )}

        {(kind === "DRAW_REVOLVER" || kind === "DEBT_REPAYMENT" || kind === "REFINANCING") && (
          <div className="field">
            <div className="field-label">Facility</div>
            <select className="field-control" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
              {(kind === "DRAW_REVOLVER" ? revolvers : facilityOptions).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <div className="field-label">{kind === "ACQUISITION" ? "New debt funding ($M)" : "Amount ($M)"}</div>
          <input className="field-control" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </div>

        {kind === "ACQUISITION" && (
          <>
            <div className="field">
              <div className="field-label">Cash consideration ($M)</div>
              <input className="field-control" type="number" value={cashConsideration} onChange={(e) => setCashConsideration(Number(e.target.value))} />
            </div>
            <div className="field">
              <div className="field-label">Acquired EBITDA ($M)</div>
              <input className="field-control" type="number" value={acquiredEbitda} onChange={(e) => setAcquiredEbitda(Number(e.target.value))} />
            </div>
            <div className="field">
              <div className="field-label">Synergy EBITDA ($M)</div>
              <input className="field-control" type="number" value={synergyEbitda} onChange={(e) => setSynergyEbitda(Number(e.target.value))} />
            </div>
          </>
        )}

        {(kind === "DEBT_ISSUANCE" || kind === "REFINANCING" || kind === "ACQUISITION") && (
          <div className="field">
            <div className="field-label">Coupon (%)</div>
            <input className="field-control" type="number" value={couponPct} onChange={(e) => setCouponPct(Number(e.target.value))} />
          </div>
        )}

        <div className="button-row">
          <button type="button" className="button button-primary" onClick={run} disabled={!action}>
            Run scenario
          </button>
        </div>

        {infeasibleReason && <Banner tone="red">This transaction is not feasible as composed: {infeasibleReason}</Banner>}
      </Card>

      {result && (
        <>
          <WarningList warnings={result.warnings.map((w) => ({ category: w.category, description: w.description }))} />

          <Card>
            <div className="card-title">Before → transaction → after</div>
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cash</td>
                  <td className="mono">{fmtM(result.before.position.liquidity.cash.value)}</td>
                  <td className="mono">{fmtM(result.after.position.liquidity.cash.value)}</td>
                  <td className="mono">{fmtM(result.financialImpact.cashDelta)}</td>
                </tr>
                <tr>
                  <td>Gross debt</td>
                  <td className="mono">{fmtM(result.before.position.capitalStructure.grossDebt)}</td>
                  <td className="mono">{fmtM(result.after.position.capitalStructure.grossDebt)}</td>
                  <td className="mono">{fmtM(result.financialImpact.grossDebtDelta)}</td>
                </tr>
                <tr>
                  <td>Net debt</td>
                  <td className="mono">{fmtM(result.before.position.capitalStructure.netDebt)}</td>
                  <td className="mono">{fmtM(result.after.position.capitalStructure.netDebt)}</td>
                  <td className="mono">{fmtM(result.financialImpact.netDebtDelta)}</td>
                </tr>
                <tr>
                  <td>Total liquidity</td>
                  <td className="mono">{result.before.position.liquidity.totalLiquidity !== null ? fmtM(result.before.position.liquidity.totalLiquidity) : "Review required"}</td>
                  <td className="mono">{result.after.position.liquidity.totalLiquidity !== null ? fmtM(result.after.position.liquidity.totalLiquidity) : "Review required"}</td>
                  <td className="mono">{fmtM(result.financialImpact.liquidityDelta)}</td>
                </tr>
                <tr>
                  <td>Gross leverage</td>
                  <td className="mono">{result.before.position.metrics.genericGrossLeverage.value !== null ? fmtX(result.before.position.metrics.genericGrossLeverage.value) : "n/m"}</td>
                  <td className="mono">{result.after.position.metrics.genericGrossLeverage.value !== null ? fmtX(result.after.position.metrics.genericGrossLeverage.value) : "n/m"}</td>
                  <td className="mono">{result.financialImpact.leverageDelta.grossLeverageDelta !== null ? `${result.financialImpact.leverageDelta.grossLeverageDelta >= 0 ? "+" : ""}${result.financialImpact.leverageDelta.grossLeverageDelta.toFixed(2)}x` : "n/m"}</td>
                </tr>
                <tr>
                  <td>Annualized interest</td>
                  <td className="mono">{fmtM(result.before.position.interest.totalAnnualizedCashInterest)}</td>
                  <td className="mono">{fmtM(result.after.position.interest.totalAnnualizedCashInterest)}</td>
                  <td className="mono">{fmtM(result.financialImpact.interestDelta)}</td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Card>
            <div className="card-title">Contractual result</div>
            {result.contractualImpact ? (
              <>
                <div className="row-note" style={{ marginBottom: 10 }}>
                  <Chip tone={contractualTone(result.contractualImpact.overallStatus)}>{contractualLabel(result.contractualImpact.overallStatus)}</Chip>
                  {result.contractualImpact.reviewRequired && <span style={{ marginLeft: 8 }}>Review required before relying on this result.</span>}
                </div>
                {(result.contractualImpact.perDocument as PerDocumentDebtResult[]).map((d) => (
                  <DocumentExplainability key={d.documentId} d={d} />
                ))}
                {result.sourceTrace.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="row-label">Source trace</div>
                    {result.sourceTrace.map((s, i) => (
                      <div key={i} className="row-note">
                        {s.documentId} <span className="section-ref">{s.sectionRef}</span> {s.permissionId ? `(${s.permissionId})` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Banner tone="amber">No contractual test was run for this scenario type (e.g. a pure-cash acquisition or a repayment) - financial analysis above still reflects the full transaction.</Banner>
            )}
          </Card>

          <Card>
            <div className="card-title">Provenance</div>
            <div className="row-note">
              Financial figures above are sourced from this company&apos;s persisted FinancialState/Facility/DebtEvent rows (see the Overview page for staleness/review-state detail). Contractual results are sourced from
              the governing documents&apos; own modeled Permission/CovenantProvision rows.
            </div>
            <div style={{ marginTop: 8 }}>
              <LegalReviewBadge status="VERIFIED" context="governing legal conclusions applied to this transaction, where reviewed" />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
