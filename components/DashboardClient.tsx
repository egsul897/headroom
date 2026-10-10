"use client";

import { useMemo, useState } from "react";
import { Card, WarningList } from "@/components/ui";
import { AttentionList, CovenantFamiliesView } from "@/components/CovenantOverview";
import { buildCovenantOverview, type CoverageDeclarationInput, type PermissionRowInput } from "@/lib/covenant-overview-builder";
import {
  deserializeAttributedUtilization,
  type AttributedUtilizationSerialized,
} from "@/lib/product/unified-position/attributed-utilization";
import { resolveDashboardCopy } from "@/lib/dashboard/copy";
import {
  maturitiesStateFromQuery,
  presentFacilities,
  presentMaturities,
  facilitiesStateFromQuery,
  type FacilitiesLoadState,
  type FacilitiesQuery,
  type MaturitiesLoadState,
  type MaturitiesQuery,
} from "@/lib/dashboard/load-state";
import type { CompanyCovenantData, SolverNativeCompanyContext } from "@/lib/covenant-engine";
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
  /**
   * Serializable load outcomes. Verified-empty copy is minted in the client
   * from these outcomes only. UNKNOWN / failed / not-loaded never become
   * "no facilities" or "no dated maturities".
   */
  facilitiesQuery: FacilitiesQuery;
  maturitiesQuery: MaturitiesQuery;
  /** Phase 4C attributed utilization (serializable). Absent ⇒ all rows NOT_TRACKED. */
  attributedUtilizationSerialized?: AttributedUtilizationSerialized | null;
}

/** Required LTM fields edited on the dashboard card (optional grower inputs like totalAssets stay out of this editor). */
type EditableFinancialKey = Exclude<keyof FinancialsInput, "totalAssets" | "totalDebt" | "securedDebt">;

const FIELD_DEFS: { key: EditableFinancialKey; label: string; suffix: string }[] = [
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

function DueWindows({ dueWithin12, dueWithin24, dueWithin36 }: { dueWithin12: number; dueWithin24: number; dueWithin36: number }) {
  return (
    <>
      <div className="row">
        <div className="row-label">Due within 12 months</div>
        <div className="row-value">{fmtM(dueWithin12)}</div>
      </div>
      <div className="row">
        <div className="row-label">Due within 24 months</div>
        <div className="row-value">{fmtM(dueWithin24)}</div>
      </div>
      <div className="row" style={{ borderBottom: "none" }}>
        <div className="row-label">Due within 36 months</div>
        <div className="row-value">{fmtM(dueWithin36)}</div>
      </div>
    </>
  );
}

function MaturitiesSection({ query }: { query: MaturitiesQuery }) {
  const presented: MaturitiesLoadState = presentMaturities(maturitiesStateFromQuery(query));
  const copy = resolveDashboardCopy("maturities", presented);
  return (
    <Card>
      <div className="card-title">Near-term maturities</div>
      <div data-slot="maturities" data-load-kind={presented.kind}>
        {presented.kind === "VERIFIED_POPULATED" ? (
          <>
            <div className="row">
              <div>
                <div className="row-label">{presented.nextMaturityLabel}</div>
                <div className="row-note">next maturity{presented.nextMaturityDate ? `, ${presented.nextMaturityDate}` : ""}</div>
              </div>
              <div className="row-value">{fmtM(presented.nextMaturityAmount)}</div>
            </div>
            <DueWindows dueWithin12={presented.dueWithin12} dueWithin24={presented.dueWithin24} dueWithin36={presented.dueWithin36} />
          </>
        ) : presented.kind === "VERIFIED_EMPTY" ? (
          <>
            <div className="row-note">{copy.detail}</div>
            <DueWindows dueWithin12={presented.dueWithin12} dueWithin24={presented.dueWithin24} dueWithin36={presented.dueWithin36} />
          </>
        ) : (
          <div className="row-note">{copy.detail}</div>
        )}
      </div>
    </Card>
  );
}

function FacilitiesSection({ query }: { query: FacilitiesQuery }) {
  const presented: FacilitiesLoadState = presentFacilities(facilitiesStateFromQuery(query));
  const copy = resolveDashboardCopy("facilities", presented);
  return (
    <Card>
      <div className="card-title">Capital structure</div>
      <div data-slot="facilities" data-load-kind={presented.kind}>
        {presented.kind === "VERIFIED_POPULATED" ? (
          <>
            {presented.facilities.map((facility, i) => (
              <div key={i} className="row">
                <div>
                  <div className="row-label">{facility.name}</div>
                  <div className="row-note">
                    {facility.secured ? "secured" : "unsecured"}
                    {facility.documentName ? ` · ${facility.documentName}` : ""}
                  </div>
                </div>
                <div className="row-value">{fmtM(facility.amount)}</div>
              </div>
            ))}
            <div className="row" style={{ borderBottom: "none" }}>
              <div className="row-label" style={{ fontWeight: 600 }}>
                Total principal
              </div>
              <div className="row-value">{fmtM(presented.facilities.reduce((sum, facility) => sum + facility.amount, 0))}</div>
            </div>
          </>
        ) : (
          <div className="row-note">{copy.detail}</div>
        )}
      </div>
    </Card>
  );
}

export function DashboardClient(props: DashboardClientProps) {
  const { companyName, covenantData, financialPosition, solverContext, permissionRows, coverageDeclarations } = props;
  const documentNameById = useMemo(() => new Map(props.documentNameEntries), [props.documentNameEntries]);

  const [financials, setFinancials] = useState<FinancialsInput>(covenantData.financials);

  const attributedUtilization = useMemo(
    () => deserializeAttributedUtilization(props.attributedUtilizationSerialized ?? null),
    [props.attributedUtilizationSerialized],
  );

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
      attributedUtilization,
    });
  }, [financials, covenantData, financialPosition, solverContext, permissionRows, coverageDeclarations, documentNameById, props.asOfDate, attributedUtilization]);

  const rpHeadline = restrictedPaymentsHeadline(overview.covenantFamilies);

  return (
    <div className="stack">
      <WarningList warnings={overview.warnings} />

      {/* 1. Headline financial position (task "UNIVERSAL HEADROOM PRODUCT EXPERIENCE" §10 - business answer first). */}
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

      {/* 2. Headline capacity (§12). */}
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

      {/* 3. Needs attention (§13). */}
      <AttentionList items={overview.attentionItems} />

      {/* 4-5. Covenant family summaries + detailed rows (§14-21). */}
      <CovenantFamiliesView families={overview.covenantFamilies} />

      <MaturitiesSection query={props.maturitiesQuery} />

      <FacilitiesSection query={props.facilitiesQuery} />
    </div>
  );
}
