"use client";

import { Card } from "@/components/ui";
import { fmtM } from "@/lib/format";
import { reflowIndicativeLeverage } from "@/lib/product/contractual-leverage/reflow";
import type {
  ContractualLeverageResult,
  LeverageCalculationRequest,
  LeverageFinancialInputs,
} from "@/lib/product/contractual-leverage/types";

export interface ContractualLeveragePanelProps {
  requests: LeverageCalculationRequest[];
  financials: LeverageFinancialInputs;
  /** Server IR + EBITDA build-up results; shown until the user edits financials. */
  serverResults?: ContractualLeverageResult[];
  /** Snapshot financials from the server load — detects live edits. */
  baselineFinancials?: LeverageFinancialInputs;
}

function statusTone(result: ContractualLeverageResult): string {
  if (result.status !== "COMPUTED") return "review";
  return result.computationAuthority === "CONTRACTUAL_EXECUTABLE" ? "modeled" : "review";
}

function ResultCard({ result }: { result: ContractualLeverageResult }) {
  const indicative = result.computationAuthority === "INDICATIVE";
  return (
    <div
      className="covenant-row"
      data-leverage-status={result.status}
      data-computation-authority={result.computationAuthority}
      data-input-authority={result.inputAuthority}
      style={{ display: "block", padding: "12px 0", borderBottom: "1px solid var(--border, #e5e7eb)" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <div>
          <div className="row-label" style={{ fontWeight: 600 }}>
            {result.name}
          </div>
          <div className="row-note">
            {result.documentName ? `${result.documentName} · ` : ""}
            {result.sectionRef}
            {indicative ? " · INDICATIVE" : " · CONTRACTUAL_EXECUTABLE (ratio math)"}
            {` · eligibility ${result.contractualEligibility}`}
          </div>
        </div>
        <div className={`row-value tone-${statusTone(result)}`}>
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
          {result.ratioHeadroom != null
            ? ` · mathematical ratio headroom ${result.ratioHeadroom.toFixed(2)}x`
            : ""}
          {result.debtHeadroomMillions != null
            ? ` · mathematical dollar room ${fmtM(result.debtHeadroomMillions)}`
            : ""}
        </div>
      ) : null}

      <div className="row-note" style={{ marginTop: 6, fontStyle: "italic" }}>
        {result.capacityDisclaimer}
      </div>

      {result.ebitdaBuildup ? (
        <div className="row-note" style={{ marginTop: 8 }} data-slot="ebitda-buildup">
          <div>
            Consolidated EBITDA build-up ({result.ebitdaBuildup.authority}
            {result.ebitdaBuildup.period ? ` · ${result.ebitdaBuildup.period}` : ""}
            ):{" "}
            {result.ebitdaBuildup.status === "COMPUTED" && result.ebitdaBuildup.valueMillions != null
              ? fmtM(result.ebitdaBuildup.valueMillions)
              : result.ebitdaBuildup.status}
          </div>
          {result.ebitdaBuildup.numericalTrace.length > 0 ? (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {result.ebitdaBuildup.numericalTrace.map((row, i) => (
                <li key={`${row.label}-${i}`}>
                  {row.sign === "=" ? "= " : `${row.sign} `}
                  {row.label}: {fmtM(row.amountMillions)}
                </li>
              ))}
            </ul>
          ) : null}
          {result.ebitdaBuildup.unresolvedComponents.length > 0 ? (
            <div style={{ marginTop: 4, color: "var(--danger, #b45309)" }}>
              Unresolved: {result.ebitdaBuildup.unresolvedComponents.join("; ")}
            </div>
          ) : null}
        </div>
      ) : null}

      {result.inputs.length > 0 ? (
        <ul className="row-note" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
          {result.inputs.map((input) => (
            <li key={input.key}>
              {input.label}:{" "}
              {input.status === "RESOLVED" && input.valueMillions != null ? fmtM(input.valueMillions) : "MISSING"}
              {" "}
              <span>({input.authority})</span>
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
 * Imports only browser-safe calculate/types modules (no Prisma / node:crypto).
 */
function financialsEdited(a: LeverageFinancialInputs | undefined, b: LeverageFinancialInputs): boolean {
  if (!a) return false;
  return a.ebitda !== b.ebitda || a.totalDebt !== b.totalDebt || a.securedDebt !== b.securedDebt || a.cash !== b.cash;
}

export function ContractualLeveragePanel({
  requests,
  financials,
  serverResults,
  baselineFinancials,
}: ContractualLeveragePanelProps) {
  // Prefer server IR + EBITDA build-up until the user edits covenant financials;
  // then browser-safe indicative reflow (no IR runtime / node:crypto).
  const edited = financialsEdited(baselineFinancials, financials);
  const results =
    !edited && serverResults && serverResults.length > 0
      ? serverResults
      : requests.length > 0
        ? requests.map((req) => reflowIndicativeLeverage(req, financials))
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
              inputAuthority: "CALLER_SUPPLIED" as const,
              computationAuthority: "INDICATIVE" as const,
              contractualEligibility: "UNRESOLVED" as const,
              headroomPresentation: "NOT_PRESENTED_AS_CAPACITY" as const,
              capacityDisclaimer:
                "Mathematical ratio / dollar room only — not legally available debt-incurrence capacity without the governing permission, eligibility conditions, and any required pro forma adjustments.",
              ebitdaBuildup: null,
              ns4SnapshotId: null,
            },
          ];

  return (
    <Card>
      <div className="card-title">Contractual leverage ratios</div>
      <div className="card-subtitle">
        Indicative leverage and mathematical ratio headroom from operative definitions until inputs and
        mechanics are sufficiently verified. Never invents missing values; never claims legal incurrence
        capacity from ratio math alone.
      </div>
      <div data-slot="contractual-leverage">
        {results.map((result, i) => (
          <ResultCard key={`${result.sectionRef}-${i}`} result={result} />
        ))}
      </div>
    </Card>
  );
}
