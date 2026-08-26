"use client";

import { useEffect, useMemo, useState } from "react";
import { Banner, Card, Chip, LegalReviewBadge, WarningList, type ChipTone } from "@/components/ui";
import { runScenarioWithInputs, type ScenarioInputs } from "@/lib/scenario-runner";
import { fmtM, fmtX } from "@/lib/format";
import type { FacilityDraft, ScenarioAction } from "@/lib/financial-core/types";
import type { PerDocumentDebtResult } from "@/lib/covenant-engine";
import type { ScenarioResult } from "@/lib/financial-core/types";

/**
 * Slider + direct numeric entry, wired to the SAME state value (task hard
 * requirement, docs/headroom-master-product-architecture.md §26 - "Use BOTH
 * slider + direct numeric entry... never fake client-side arithmetic merely
 * to animate UI"). `max` is a generous fixed ceiling in the same style the
 * original single-company prototype (app/simulate/SimulateClient.tsx) used,
 * not derived from a specific facility's principal - this client component
 * only ever receives facility identity fields (id/name/type) from the
 * server, never their Decimal-typed amount fields (see this file's own
 * ScenarioInputs import - lib/financial-core/types' Facility carries Prisma
 * Decimal fields that do not survive the server->client boundary as usable
 * numbers), so a fixed, honest range is the correct choice here, not a
 * fragile derived one.
 */
function SliderField({ label, value, onChange, max, step = 5, suffix = "M" }: { label: string; value: number; onChange: (n: number) => void; max: number; step?: number; suffix?: string }) {
  return (
    <div className="field">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="field-label">{label}</span>
        <span className="mono" style={{ fontSize: 18, fontWeight: 600 }}>
          {suffix === "%" ? `${value}%` : fmtM(value)}
        </span>
      </div>
      <input type="range" min={0} max={max} step={step} value={Math.min(value, max)} onChange={(e) => onChange(Number(e.target.value))} />
      <input className="field-control" style={{ marginTop: 6 }} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

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

  // Live recompute (docs/headroom-master-product-architecture.md §26 - "Slider
  // movement modifies the real structured scenario" / §29 "ADJUST -> Headroom
  // recomputes"): re-runs the SAME pure, client-side, non-mutating
  // `runScenarioWithInputs` call every time `action` changes, with no
  // fetch/server action/DB call of any kind - identical computation to the
  // original explicit-button flow, just triggered automatically.
  useEffect(() => {
    if (!action) {
      setResult(undefined);
      setInfeasibleReason(undefined);
      return;
    }
    try {
      setInfeasibleReason(undefined);
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
  }, [action, inputs]);

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

        <SliderField label={kind === "ACQUISITION" ? "New debt funding" : "Amount"} value={amount} onChange={setAmount} max={kind === "ACQUISITION" ? 2000 : 3000} step={25} />

        {kind === "ACQUISITION" && (
          <>
            <SliderField label="Cash consideration" value={cashConsideration} onChange={setCashConsideration} max={2000} step={25} />
            <SliderField label="Acquired EBITDA" value={acquiredEbitda} onChange={setAcquiredEbitda} max={500} step={5} />
            <SliderField label="Synergy EBITDA" value={synergyEbitda} onChange={setSynergyEbitda} max={200} step={5} />
          </>
        )}

        {(kind === "DEBT_ISSUANCE" || kind === "REFINANCING" || kind === "ACQUISITION") && <SliderField label="Coupon" value={couponPct} onChange={setCouponPct} max={20} step={0.25} suffix="%" />}

        <div className="row-note" style={{ marginTop: 4 }}>{action ? "Recalculates automatically as you adjust the transaction." : "Choose a facility to model this scenario."}</div>

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
