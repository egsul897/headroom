"use client";

import { useMemo, useState } from "react";
import { Card, WarningList } from "@/components/ui";
import { CovenantFamiliesView } from "@/components/CovenantOverview";
import { buildCovenantOverview, type CoverageDeclarationInput, type PermissionRowInput } from "@/lib/covenant-overview-builder";
import type { CompanyCovenantData, FormulaParams, SolverNativeCompanyContext } from "@/lib/covenant-engine";
import type { FinancialPosition } from "@/lib/financial-core/types";
import { fmtDate, fmtM } from "@/lib/format";

/**
 * The Dashboard tab (task "MAKE THE UI MATCH THE PROTOTYPE EXACTLY" -
 * reference/headroom-coherent.jsx's "Position" tab, renamed). Client
 * component so the "LTM financials" card can reflow the navy capacity band
 * and every basket row LIVE as the person edits an input - exactly the
 * prototype's own `useMemo` pattern, just calling the real engine
 * (`buildCovenantOverview`, lib/covenant-overview-builder.ts - a pure
 * function with zero DB/Prisma access) instead of reimplementing formulas
 * (task hard requirement §34 - "No calculation in React"). Every number
 * still comes from `evaluateProvision`/`describeFormula`/
 * `computeRemainingCapacityAfterDebtIncurrence`/`buildDebtRatioTests`
 * (lib/covenant-engine.ts, unmodified) - editing an input only changes
 * which real financial snapshot those functions are called against.
 */

type FinancialsInput = CompanyCovenantData["financials"];

interface SerializableSolverContext extends Omit<SolverNativeCompanyContext, "activationState"> {
  activationState: Omit<SolverNativeCompanyContext["activationState"], "unknownKeys"> & { unknownKeysArray: string[] };
}

export interface DashboardClientProps {
  companyName: string;
  asOfDate: string; // ISO
  covenantData: CompanyCovenantData;
  financialPosition: FinancialPosition;
  solverContext: SerializableSolverContext;
  permissionRows: PermissionRowInput[];
  coverageDeclarations: CoverageDeclarationInput[];
  documentNameEntries: [string, string][];
  capitalStructure: { name: string; secured: boolean; documentName: string | null; amount: number }[];
  maturities: { nextMaturityLabel: string | null; nextMaturityDate: string | null; nextMaturityAmount: number | null; dueWithin12: number; dueWithin24: number; dueWithin36: number };
}

const FIELD_DEFS: { key: keyof FinancialsInput; label: string; suffix: string }[] = [
  { key: "ebitda", label: "Consolidated EBITDA (covenant, est.)", suffix: "$M" },
  { key: "cash", label: "Unrestricted cash", suffix: "$M" },
  { key: "interestExpense", label: "Interest expense (LTM)", suffix: "$M" },
  { key: "cumulativeNetIncome", label: "Cumulative net income since issue", suffix: "$M" },
  { key: "equityProceedsSinceIssue", label: "Equity proceeds since issue", suffix: "$M" },
  { key: "assumedNewDebtRatePct", label: "Assumed new-debt coupon", suffix: "%" },
];

function NumField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (n: number) => void; suffix: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="field-control mono" type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
      <span className="row-note">{suffix}</span>
    </label>
  );
}

function restrictedPaymentsHeadline(families: ReturnType<typeof buildCovenantOverview>["covenantFamilies"]): { display: string; note?: string } {
  const rp = families.find((f) => f.family === "RESTRICTED_PAYMENTS");
  if (!rp || rp.rows.length === 0) return { display: "Not tested" };
  const gateRow = rp.rows.find((r) => r.kind === "RATIO");
  if (gateRow && gateRow.kind === "RATIO" && gateRow.status === "MODELED" && gateRow.bindingState === "AVAILABLE") {
    return { display: "Open", note: "ratio prong satisfied" };
  }
  const capacityRows = rp.rows.filter((r): r is Extract<(typeof rp.rows)[number], { kind: "CAPACITY" }> => r.kind === "CAPACITY");
  if (capacityRows.some((r) => r.status === "REVIEW_REQUIRED")) return { display: "Review required" };
  if (capacityRows.length === 0) return { display: "Not tested" };
  const finiteRows = capacityRows.filter((r) => r.status === "MODELED" && r.currentCapacity !== null);
  if (finiteRows.length === 0) return { display: "Not tested" };
  const sum = finiteRows.reduce((s, r) => s + (r.currentCapacity ?? 0), 0);
  return { display: fmtM(sum) };
}

export function DashboardClient(props: DashboardClientProps) {
  const { companyName, covenantData, financialPosition, solverContext, permissionRows, coverageDeclarations, capitalStructure, maturities } = props;
  const documentNameById = useMemo(() => new Map(props.documentNameEntries), [props.documentNameEntries]);

  const [financials, setFinancials] = useState<FinancialsInput>(covenantData.financials);

  const overview = useMemo(() => {
    const reconstructedSolverContext: SolverNativeCompanyContext = {
      ...solverContext,
      activationState: { ...solverContext.activationState, unknownKeys: new Set(solverContext.activationState.unknownKeysArray) },
    };
    return buildCovenantOverview({
      asOfDate: new Date(props.asOfDate),
      covenantData: { ...covenantData, financials },
      financialPosition,
      solverContext: reconstructedSolverContext,
      permissionRows,
      coverageDeclarations,
      documentNameById,
    });
  }, [financials, covenantData, financialPosition, solverContext, permissionRows, coverageDeclarations, documentNameById, props.asOfDate]);

  const rpHeadline = restrictedPaymentsHeadline(overview.covenantFamilies);

  return (
    <div className="stack">
      <WarningList warnings={overview.warnings} />

      <div className="summary-band">
        <div className="summary-band-title">Maximum incremental debt — the most {companyName.replace(/ Corp\.?$/, "")} can incur without tripping any governing document</div>
        <div className="summary-band-stats">
          <div>
            <div className="summary-stat-value">{overview.securedCapacity.remainingCapacity !== undefined ? fmtM(overview.securedCapacity.remainingCapacity) : overview.securedCapacity.status === "NOT_MODELED" ? "Not modeled" : "Review required"}</div>
            <div className="summary-stat-label">secured</div>
          </div>
          <div>
            <div className="summary-stat-value">{overview.unsecuredCapacity.remainingCapacity !== undefined ? fmtM(overview.unsecuredCapacity.remainingCapacity) : overview.unsecuredCapacity.status === "NOT_MODELED" ? "Not modeled" : "Review required"}</div>
            <div className="summary-stat-label">unsecured</div>
          </div>
          <div>
            <div className="summary-stat-value">{rpHeadline.display}</div>
            <div className="summary-stat-label">restricted payments{rpHeadline.note ? ` — ${rpHeadline.note}` : ""}</div>
          </div>
        </div>
      </div>

      <Card>
        <div className="card-title">Covenant financial inputs</div>
        <div className="card-subtitle">Drives every capacity number below - edit and the covenant band and basket rows reflow immediately, real-engine-computed. Headline position metrics above (cash/debt/leverage) are sourced separately from your reported financial statements and are not affected by this card.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {FIELD_DEFS.map((f) => (
            <NumField key={f.key} label={f.label} value={financials[f.key]} suffix={f.suffix} onChange={(n) => setFinancials((prev) => ({ ...prev, [f.key]: n }))} />
          ))}
        </div>
      </Card>

      <Card>
        <div className="card-title">Position as of {fmtDate(new Date(props.asOfDate))}</div>
        <div className="headline-metric-strip">
          {overview.headlineMetrics.map((m) => (
            <div className="headline-metric-tile" key={m.key}>
              <div className={`headline-metric-value ${m.value === null ? "na" : ""}`}>{m.value ?? (m.state === "NOT_AVAILABLE" ? "Not available" : "Review required")}</div>
              <div className="headline-metric-label">{m.label}</div>
            </div>
          ))}
        </div>
      </Card>

      <CovenantFamiliesView families={overview.covenantFamilies} />

      <Card>
        <div className="card-title">Near-term maturities</div>
        {maturities.nextMaturityLabel ? (
          <div className="row">
            <div>
              <div className="row-label">{maturities.nextMaturityLabel}</div>
              <div className="row-note">next maturity{maturities.nextMaturityDate ? `, ${maturities.nextMaturityDate}` : ""}</div>
            </div>
            <div className="row-value">{maturities.nextMaturityAmount !== null ? fmtM(maturities.nextMaturityAmount) : "—"}</div>
          </div>
        ) : (
          <div className="row-note">No dated maturities on record.</div>
        )}
        <div className="row">
          <div className="row-label">Due within 12 months</div>
          <div className="row-value">{fmtM(maturities.dueWithin12)}</div>
        </div>
        <div className="row">
          <div className="row-label">Due within 24 months</div>
          <div className="row-value">{fmtM(maturities.dueWithin24)}</div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Due within 36 months</div>
          <div className="row-value">{fmtM(maturities.dueWithin36)}</div>
        </div>
      </Card>

      <Card>
        <div className="card-title">Capital structure</div>
        {capitalStructure.length === 0 && <div className="row-note">No facilities on record.</div>}
        {capitalStructure.map((t, i) => (
          <div key={i} className="row">
            <div>
              <div className="row-label">{t.name}</div>
              <div className="row-note">
                {t.secured ? "secured" : "unsecured"}
                {t.documentName ? ` · ${t.documentName}` : ""}
              </div>
            </div>
            <div className="row-value">{fmtM(t.amount)}</div>
          </div>
        ))}
        {capitalStructure.length > 0 && (
          <div className="row" style={{ borderBottom: "none" }}>
            <div className="row-label" style={{ fontWeight: 600 }}>
              Total principal
            </div>
            <div className="row-value">{fmtM(capitalStructure.reduce((s, t) => s + t.amount, 0))}</div>
          </div>
        )}
      </Card>
    </div>
  );
}
