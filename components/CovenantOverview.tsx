import { Card, WarningList } from "@/components/ui";
import { fmtDate, fmtM, fmtMaxCapacity, maxCapacityDetail } from "@/lib/format";
import type { BindingState, CovenantFamilySection, CovenantOverview, OverviewRow, ReviewStateLabel, RowStatus } from "@/lib/covenant-overview-service";

/**
 * Restore the full covenant overview (docs/full-covenant-overview-restoration.md).
 * Pure presentation - every number, status, and label read directly off
 * `CovenantOverview` (lib/covenant-overview-service.ts). No calculation, no
 * company-name branching: this component renders identically for any
 * companyId's data (task hard requirements §34/§35).
 */

const FAMILY_ORDER = [
  "INDEBTEDNESS",
  "LIENS",
  "FINANCIAL_COVENANTS",
  "RESTRICTED_PAYMENTS",
  "INVESTMENTS",
  "ACQUISITIONS",
  "ASSET_SALES",
  "DISPOSITIONS",
  "MANDATORY_PREPAYMENTS",
  "GUARANTEES",
  "GUARANTOR_REQUIREMENTS",
  "COLLATERAL_SECURITY",
  "REPORTING_INFORMATION",
  "FUNDAMENTAL_CHANGES",
  "AFFILIATE_TRANSACTIONS",
  "SALE_LEASEBACKS",
  "SUBSIDIARY_DESIGNATIONS",
  "CHANGE_OF_CONTROL",
  "EVENTS_OF_DEFAULT",
];

function familyLabel(family: string): string {
  return family
    .split("_")
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(" ");
}

function statusLabel(status: RowStatus): string {
  switch (status) {
    case "MODELED":
      return "Modeled";
    case "REVIEW_REQUIRED":
      return "Review required";
    case "NOT_TESTED":
      return "Not tested";
    case "UNMODELED":
      return "Not modeled";
  }
}

function bindingPillClass(state: BindingState): string {
  switch (state) {
    case "BINDING":
      return "status-pill-binding";
    case "AVAILABLE":
      return "status-pill-available";
    case "REVIEW_REQUIRED":
      return "status-pill-review";
    case "UNMODELED":
      return "status-pill-unmodeled";
    case "NOT_EVALUABLE":
      return "status-pill-not-evaluable";
  }
}

function bindingLabel(state: BindingState): string {
  switch (state) {
    case "BINDING":
      return "Binding";
    case "AVAILABLE":
      return "Available";
    case "REVIEW_REQUIRED":
      return "Review required";
    case "UNMODELED":
      return "Not modeled";
    case "NOT_EVALUABLE":
      return "Not evaluable";
  }
}

function reviewLabel(state: ReviewStateLabel): string {
  switch (state) {
    case "VERIFIED":
      return "Verified — legal review";
    case "UNVERIFIED":
      return "Not yet reviewed";
    case "DISPUTED":
      return "Disputed";
    case "NOT_TRACKED":
      return "—";
  }
}

function capacityText(row: Extract<OverviewRow, { kind: "CAPACITY" }>): string {
  if (row.status === "UNMODELED") return "Not modeled";
  if (row.status === "NOT_TESTED") return "Not tested";
  if (row.status === "REVIEW_REQUIRED") return "Review required";
  if (row.capacityUnlimited) return "Unlimited";
  if (row.currentCapacity === null) return "Not evaluable";
  return fmtM(row.currentCapacity);
}

function remainingText(row: Extract<OverviewRow, { kind: "CAPACITY" }>): string {
  if (row.status !== "MODELED") return "—";
  if (row.capacityUnlimited) return "Unlimited";
  if (row.remaining === null) return "Not evaluable";
  return fmtM(row.remaining);
}

function CapacityBar({ row }: { row: Extract<OverviewRow, { kind: "CAPACITY" }> }) {
  if (row.status !== "MODELED" || row.capacityUnlimited || row.currentCapacity === null) return null;
  // Usage is never tracked per-basket today (no ledger entry is attributable
  // to one specific basket) - the bar honestly shows 0% used rather than
  // fabricating a number, per this service's own documented usageState.
  const pct = row.usageState === "TRACKED" && row.utilizationPct !== null ? row.utilizationPct : 0;
  return (
    <div className="util-bar-wrap">
      <div className="util-bar-track">
        <div className="util-bar-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <div className="util-bar-caption">
        {row.usageState === "NOT_TRACKED" ? `${fmtM(row.currentCapacity)} capacity — usage not tracked` : `${fmtM(row.used ?? 0)} used of ${fmtM(row.currentCapacity)}`}
      </div>
    </div>
  );
}

function RatioBar({ row }: { row: Extract<OverviewRow, { kind: "RATIO" }> }) {
  // Only a "does not exceed a maximum" ratio has a natural 0..limit scale to
  // draw a bar against. A "must be at least" minimum (e.g. interest coverage)
  // has no natural upper bound - drawing one would fabricate a scale (task
  // §17/§20), so those render as text only, below.
  if (row.status !== "MODELED" || row.comparisonDirection !== "at_or_below" || row.currentRatio === null) return null;
  const pct = Math.min(100, Math.max(0, (row.currentRatio / row.ratioLimit) * 100));
  return (
    <div className="util-bar-wrap">
      <div className="ratio-track">
        <div className={`ratio-track-fill ${pct > 85 ? "tight" : ""}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="util-bar-caption">
        {row.currentRatio.toFixed(2)}x current — {row.ratioLimit.toFixed(2)}x limit — {row.ratioHeadroom !== null ? `${row.ratioHeadroom.toFixed(2)}x headroom` : ""}
      </div>
    </div>
  );
}

function CapacityRowView({ row }: { row: Extract<OverviewRow, { kind: "CAPACITY" }> }) {
  return (
    <>
      <div className={`covenant-row ${row.bindingState === "BINDING" ? "binding" : ""}`}>
        <div className="covenant-cell-name">
          {row.name}
          {row.entityScope.length > 0 && <span className="entity-scope">{row.entityScope.join(", ")}</span>}
        </div>
        <div className="covenant-cell-doc">{row.documentName}</div>
        <div className="covenant-cell-section">{row.sectionRef}</div>
        <div className="covenant-cell-formula">{row.formulaDisplay ?? row.reason ?? "—"}</div>
        <div className="covenant-cell-capacity covenant-cell-num">{capacityText(row)}</div>
        <div className="covenant-cell-used covenant-cell-num">{row.usageState === "TRACKED" && row.used !== null ? fmtM(row.used) : "Not tracked"}</div>
        <div className="covenant-cell-remaining covenant-cell-num">{remainingText(row)}</div>
        <div className="covenant-cell-mobile-only">
          {capacityText(row)} capacity · {remainingText(row)} remaining
        </div>
        <div className="covenant-cell-status">
          <span className={`status-pill ${bindingPillClass(row.bindingState)}`}>{bindingLabel(row.bindingState)}</span>
        </div>
        <div className="covenant-cell-review">{reviewLabel(row.reviewState)}</div>
      </div>
      {row.status === "MODELED" && !row.capacityUnlimited && row.currentCapacity !== null && (
        <div className="covenant-row" style={{ paddingTop: 0 }}>
          <CapacityBar row={row} />
        </div>
      )}
    </>
  );
}

function RatioRowView({ row }: { row: Extract<OverviewRow, { kind: "RATIO" }> }) {
  const directionLabel = row.comparisonDirection === "at_or_below" ? "maximum" : "minimum";
  return (
    <>
      <div className={`covenant-row ${row.bindingState === "BINDING" ? "binding" : ""}`}>
        <div className="covenant-cell-name">{row.name}</div>
        <div className="covenant-cell-doc">{row.documentName}</div>
        <div className="covenant-cell-section">{row.sectionRef}</div>
        <div className="covenant-cell-formula">
          {row.status === "MODELED" && row.currentRatio !== null
            ? `${row.currentRatio.toFixed(2)}x current / ${row.ratioLimit.toFixed(2)}x ${directionLabel}`
            : (row.reason ?? statusLabel(row.status))}
        </div>
        <div className="covenant-cell-capacity covenant-cell-num">—</div>
        <div className="covenant-cell-used covenant-cell-num">—</div>
        <div className="covenant-cell-remaining covenant-cell-num">{row.status === "MODELED" && row.ratioHeadroom !== null ? `${row.ratioHeadroom.toFixed(2)}x` : "—"}</div>
        <div className="covenant-cell-mobile-only">
          {row.status === "MODELED" && row.currentRatio !== null ? `${row.currentRatio.toFixed(2)}x / ${row.ratioLimit.toFixed(2)}x ${directionLabel}` : statusLabel(row.status)}
        </div>
        <div className="covenant-cell-status">
          <span className={`status-pill ${bindingPillClass(row.bindingState)}`}>{bindingLabel(row.bindingState)}</span>
        </div>
        <div className="covenant-cell-review">{reviewLabel(row.reviewState)}</div>
      </div>
      <div className="covenant-row" style={{ paddingTop: 0 }}>
        <RatioBar row={row} />
      </div>
    </>
  );
}

function FamilySectionView({ section }: { section: CovenantFamilySection }) {
  return (
    <div className="family-section">
      <div className="family-header">
        <span className="family-name">{familyLabel(section.family)}</span>
        <span className="family-counts">
          {section.counts.modeled} modeled
          {section.counts.reviewRequired > 0 ? ` · ${section.counts.reviewRequired} review required` : ""}
          {section.counts.unmodeled > 0 ? ` · ${section.counts.unmodeled} not modeled` : ""}
        </span>
      </div>
      {section.advisoryNotes.map((note, i) => (
        <div className="family-advisory" key={i}>
          {note}
        </div>
      ))}
      {section.rows.length > 0 && (
        <div className="covenant-row-head">
          <div>Covenant / basket</div>
          <div>Document</div>
          <div>Section</div>
          <div>Formula</div>
          <div className="covenant-cell-num">Capacity</div>
          <div className="covenant-cell-num">Used</div>
          <div className="covenant-cell-num">Remaining</div>
          <div />
          <div>Review</div>
        </div>
      )}
      {section.rows.map((row) => (row.kind === "CAPACITY" ? <CapacityRowView key={row.stableKey} row={row} /> : <RatioRowView key={row.stableKey} row={row} />))}
    </div>
  );
}

function HeadlineCapacityCard({ title, side }: { title: string; side: CovenantOverview["securedCapacity"] }) {
  return (
    <div className="headline-capacity-card">
      <div className="headline-capacity-title">{title}</div>
      <div className="headline-capacity-value">{fmtMaxCapacity(side.maximumCapacity)}</div>
      <div className="headline-capacity-detail">
        {maxCapacityDetail(side.maximumCapacity) && <div>{maxCapacityDetail(side.maximumCapacity)}</div>}
        {side.bindingDocumentName && (
          <div>
            <span className="label">Binding document: </span>
            {side.bindingDocumentName}
          </div>
        )}
        {side.bindingSections.length > 0 && (
          <div>
            <span className="label">Section: </span>
            {side.bindingSections.join(" / ")}
          </div>
        )}
        {!side.bindingDocumentName && side.status !== "MODELED" && (
          <div>
            <span className="label">Status: </span>
            {side.status === "NOT_MODELED" ? "Not modeled" : "Review required"}
          </div>
        )}
      </div>
    </div>
  );
}

export function CovenantOverviewView({ overview }: { overview: CovenantOverview }) {
  const orderedFamilies = [...overview.covenantFamilies].sort((a, b) => {
    const ia = FAMILY_ORDER.indexOf(a.family);
    const ib = FAMILY_ORDER.indexOf(b.family);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  return (
    <div className="stack">
      <WarningList warnings={overview.warnings} />

      <Card>
        <div className="card-title">Position as of {fmtDate(overview.asOfDate)}</div>
        <div className="headline-metric-strip">
          {overview.headlineMetrics.map((m) => (
            <div className="headline-metric-tile" key={m.key}>
              <div className={`headline-metric-value ${m.value === null ? "na" : ""}`}>{m.value ?? (m.state === "NOT_AVAILABLE" ? "Not available" : "Review required")}</div>
              <div className="headline-metric-label">{m.label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="card-title">Headline incremental debt capacity</div>
        <div className="headline-capacity-grid">
          <HeadlineCapacityCard title="Maximum secured capacity" side={overview.securedCapacity} />
          <HeadlineCapacityCard title="Maximum unsecured capacity" side={overview.unsecuredCapacity} />
        </div>
      </Card>

      {orderedFamilies.length === 0 ? (
        <Card>
          <div className="empty-state">
            <div className="empty-state-title">Covenant model not initialized</div>
            <div>Connect sources or upload financing documents to begin.</div>
          </div>
        </Card>
      ) : (
        orderedFamilies.map((section) => <FamilySectionView key={section.family} section={section} />)
      )}
    </div>
  );
}
