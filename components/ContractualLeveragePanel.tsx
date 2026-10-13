"use client";

import { Card } from "@/components/ui";
import { fmtM } from "@/lib/format";
import { recalculateWithFinancials } from "@/lib/product/contractual-leverage/calculate";
import type {
  ContractualLeverageResult,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
} from "@/lib/product/contractual-leverage/types";

export interface ContractualLeveragePanelProps {
  requests: LeverageCalculationRequest[];
  financials: LeverageFinancialInputs;
}

function statusTone(status: ContractualLeverageResult["status"]): string {
  switch (status) {
    case "COMPUTED":
      return "modeled";
    case "MISSING_INPUTS":
    case "MISSING_DEFINITIONS":
      return "review";
    default:
      return "unmodeled";
  }
}

function ResultCard({ result }: { result: ContractualLeverageResult }) {
  return (
    <div className="covenant-row" data-leverage-status={result.status} style={{ display: "block", padding: "12px 0", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <div className="row-label" style={{ fontWeight: 600 }}>
            {result.name}
          </div>
          <div className="row-note">
            {result.documentName ? `${result.documentName} · ` : ""}
            {result.sectionRef}
          </div>
        </div>
        <div className={`row-value tone-${statusTone(result.status)}`}>
          {result.status === "COMPUTED" && result.currentRatio != null
            ? `${result.currentRatio.toFixed(2)}x`
            : result.status.replace(/_/g, " ")}
        </div>
      </div>

      {result.formulaDisplay ? (
        <div className="covenant-cell-formula" style={{ marginTop: 8 }}>
          Formula: {result.formulaDisplay}
          {result.threshold != null ? ` ≤ ${result.threshold.toFixed(2)}x` : ""}
        </div>
      ) : null}

      {result.status === "COMPUTED" ? (
        <div className="row-note" style={{ marginTop: 6 }}>
          {result.threshold != null ? `Limit ${result.threshold.toFixed(2)}x` : "No threshold"}
          {result.ratioHeadroom != null ? ` · ratio headroom ${result.ratioHeadroom.toFixed(2)}x` : ""}
          {result.debtHeadroomMillions != null
            ? ` · debt headroom ${fmtM(result.debtHeadroomMillions)}`
            : ""}
        </div>
      ) : null}

      {result.inputs.length > 0 ? (
        <ul className="row-note" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {result.inputs.map((input) => (
            <li key={input.key}>
              {input.label}:{" "}
              {input.status === "RESOLVED" && input.valueMillions != null ? fmtM(input.valueMillions) : "MISSING"}
            </li>
          ))}
        </ul>
      ) : null}

      {result.citations.length > 0 ? (
        <div className="row-note" style={{ marginTop: 6 }}>
          Citations: {result.citations.join("; ")}
        </div>
      ) : null}

      {result.missingRequirements.length > 0 ? (
        <div className="row-note" style={{ marginTop: 6, color: "var(--danger, #b45309)" }}>
          Missing: {result.missingRequirements.join("; ")}
        </div>
      ) : null}

      {result.limitations.length > 0 ? (
        <div className="row-note" style={{ marginTop: 6 }}>
          Limitations: {result.limitations.join(" ")}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Universal contractual leverage panel — same component for every company.
 * Recalculates from request packages + current financial inputs (no company branches).
 */
export function ContractualLeveragePanel({ requests, financials }: ContractualLeveragePanelProps) {
  const results =
    requests.length > 0
      ? requests.map((req) => recalculateWithFinancials(req, financials))
      : [
          {
            status: "MISSING_DEFINITIONS" as const,
            name: "Contractual leverage",
            sectionRef: "—",
            documentName: null,
            debtBasis: null,
            formulaDisplay: null,
            citations: [],
            limitations: [],
            inputs: [],
            missingRequirements: ["No leverage-ratio calculation packages loaded for this company"],
            currentRatio: null,
            threshold: null,
            ratioHeadroom: null,
            debtHeadroomMillions: null,
            runtimeStatus: null,
          },
        ];

  return (
    <Card>
      <div className="card-title">Contractual leverage ratios</div>
      <div className="card-subtitle">
        Source-backed ratio computation from operative EBITDA and debt-metric definitions. Missing critical
        inputs are listed — values are never invented.
      </div>
      <div data-slot="contractual-leverage">
        {results.map((result, i) => (
          <ResultCard key={`${result.sectionRef}-${i}`} result={result} />
        ))}
      </div>
    </Card>
  );
}
