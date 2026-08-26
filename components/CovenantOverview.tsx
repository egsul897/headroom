"use client";

import { useMemo, useState } from "react";
import { Card, WarningList } from "@/components/ui";
import { fmtDate, fmtM, fmtMaxCapacity, maxCapacityDetail } from "@/lib/format";
import type { AttentionItem, BindingState, CovenantFamilySection, CovenantOverview, OverviewRow, ReviewStateLabel, RowStatus, RowTier } from "@/lib/covenant-overview-service";

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

function tierLabel(tier: RowTier): string {
  switch (tier) {
    case "PRIMARY":
      return "Primary paths";
    case "CONDITIONAL":
      return "Conditional / special-purpose paths";
    case "EXCEPTION":
      return "Exceptions / other paths";
  }
}

/**
 * Needs Attention (task §13 - "compact... only actual material issues").
 * Every item is real (lib/covenant-overview-builder.ts's `buildAttentionItems`)
 * - this component only renders and severity-colors what it's given, never
 * invents or filters further.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <div className="card-title">Needs attention</div>
      <div className="stack" style={{ gap: 6 }}>
        {items.map((item, i) => (
          <div key={i} className={`attention-item attention-${item.severity.toLowerCase()}`}>
            {item.description}
          </div>
        ))}
      </div>
    </Card>
  );
}

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

/**
 * Green/amber/red tone (task "colored capacity bar - green / amber when
 * nearly full / red when locked, with locked states explaining why"). No
 * per-basket usage is tracked anywhere in this data model, so "nearly full"
 * cannot honestly be a fill-percentage - these tones instead reflect the
 * row's own real, already-computed state (never an invented threshold):
 * red = locked (zero/no capacity available, or genuinely not modeled/not
 * tested), amber = review required (a real computed status), green =
 * modeled and available (including genuinely unlimited).
 */
function rowTone(row: OverviewRow): "green" | "amber" | "red" {
  if (row.status === "UNMODELED" || row.status === "NOT_TESTED") return "red";
  if (row.status === "REVIEW_REQUIRED") return "amber";
  if (row.kind === "CAPACITY") {
    if (row.capacityUnlimited) return "green";
    if (row.currentCapacity !== null && row.currentCapacity <= 0) return "red";
    return "green";
  }
  return row.bindingState === "REVIEW_REQUIRED" ? "amber" : "green";
}

function lockedReason(row: OverviewRow): string | null {
  if (rowTone(row) !== "red") return null;
  if (row.reason) return row.reason;
  if (row.status === "UNMODELED") return "Acknowledged as a real, applicable provision that has not been modeled yet.";
  if (row.status === "NOT_TESTED") return "No basket configuration entered for this provision.";
  if (row.kind === "CAPACITY" && row.currentCapacity !== null && row.currentCapacity <= 0) return "No capacity currently available under this basket's own formula.";
  return "Locked.";
}

function CapacityBar({ row }: { row: Extract<OverviewRow, { kind: "CAPACITY" }> }) {
  const tone = rowTone(row);
  // Usage is never tracked per-basket today (no ledger entry is attributable
  // to one specific basket) - the bar's FILL always shows full width at its
  // own tone color (there is no fill-percentage to show honestly); the
  // caption states the real capacity figure, or the real reason it's locked.
  const caption =
    tone === "red"
      ? lockedReason(row)
      : row.status === "MODELED" && row.capacityUnlimited
        ? "Unlimited"
        : row.status === "MODELED" && row.currentCapacity !== null
          ? row.usageState === "NOT_TRACKED"
            ? `${fmtM(row.currentCapacity)} capacity — usage not tracked`
            : `${fmtM(row.used ?? 0)} used of ${fmtM(row.currentCapacity)}`
          : null;
  if (caption === null) return null;
  return (
    <div className="util-bar-wrap">
      <div className="util-bar-track">
        <div className={`util-bar-fill tone-${tone}`} style={{ width: "100%" }} />
      </div>
      <div className={`util-bar-caption ${tone === "red" ? "locked-reason" : ""}`}>{caption}</div>
    </div>
  );
}

function RatioBar({ row }: { row: Extract<OverviewRow, { kind: "RATIO" }> }) {
  const tone = rowTone(row);
  if (row.status !== "MODELED" || row.currentRatio === null) {
    const reason = lockedReason(row);
    if (!reason) return null;
    return (
      <div className="util-bar-wrap">
        <div className="util-bar-track">
          <div className={`util-bar-fill tone-${tone}`} style={{ width: "100%" }} />
        </div>
        <div className="util-bar-caption locked-reason">{reason}</div>
      </div>
    );
  }
  // Only a "does not exceed a maximum" ratio has a natural 0..limit scale to
  // draw a bar against. A "must be at least" minimum (e.g. interest coverage)
  // has no natural upper bound - drawing one would fabricate a scale (task
  // §17/§20), so those render as text only, still tone-colored by their
  // real computed state.
  if (row.comparisonDirection !== "at_or_below") {
    return (
      <div className="util-bar-wrap">
        <div className={`util-bar-caption ${tone === "red" ? "locked-reason" : ""}`}>
          {row.currentRatio.toFixed(2)}x current — {row.ratioLimit.toFixed(2)}x minimum — {row.ratioHeadroom !== null ? `${row.ratioHeadroom.toFixed(2)}x headroom` : ""}
        </div>
      </div>
    );
  }
  const pct = Math.min(100, Math.max(0, (row.currentRatio / row.ratioLimit) * 100));
  return (
    <div className="util-bar-wrap">
      <div className="ratio-track">
        <div className={`ratio-track-fill tone-${tone}`} style={{ width: `${pct}%` }} />
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
      <div className="covenant-row" style={{ paddingTop: 0 }}>
        <CapacityBar row={row} />
      </div>
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

/**
 * The family's own one-line summary (task §15 - "lets a CFO understand the
 * family before reading individual baskets"). Purely a presentation pick of
 * the row the builder already ranked first (bindingUrgency/tier sort, see
 * lib/covenant-overview-builder.ts) - not a new calculation.
 */
function familySummaryLine(section: CovenantFamilySection): string | null {
  const top = section.rows.find((r) => r.kind === "CAPACITY" && r.status === "MODELED") as Extract<OverviewRow, { kind: "CAPACITY" }> | undefined;
  if (!top) return null;
  const value = top.capacityUnlimited ? "Unlimited" : top.currentCapacity !== null ? fmtM(top.currentCapacity) : null;
  if (value === null) return null;
  return `${top.name}: ${value} — ${top.documentName} ${top.sectionRef}`;
}

/**
 * Renders a "Primary paths / Conditional / Exceptions" sub-label (task
 * §17-20) only within the dense, healthy-available bucket, where triage
 * actually matters - a binding, locked, or review-required row is already
 * visually distinguished by its own status pill and doesn't need one.
 */
function TieredRows({ rows }: { rows: OverviewRow[] }) {
  let lastGroupKey: string | null = null;
  return (
    <>
      {rows.map((row) => {
        const groupKey = row.bindingState === "AVAILABLE" ? row.tier : null;
        const showLabel = groupKey !== null && groupKey !== lastGroupKey;
        lastGroupKey = groupKey;
        return (
          <div key={row.stableKey}>
            {showLabel && <div className="tier-label">{tierLabel(groupKey as RowTier)}</div>}
            {row.kind === "CAPACITY" ? <CapacityRowView row={row} /> : <RatioRowView row={row} />}
          </div>
        );
      })}
    </>
  );
}

function FamilySectionView({ section }: { section: CovenantFamilySection }) {
  const summary = familySummaryLine(section);
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
      {summary && <div className="family-summary">{summary}</div>}
      {section.advisoryNotes.map((note, i) => (
        <div className="family-advisory" key={i}>
          {note}
        </div>
      ))}
      {section.rows.length === 0 && <div className="row-note" style={{ padding: "10px 2px" }}>No rows modeled in this family yet.</div>}
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
      <TieredRows rows={section.rows} />
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

/** Just the covenant-family sections, ordered - reusable by app/[companyId]/dashboard's client-side editable-financials view, which supplies its own navy summary band and headline-metrics presentation instead of this component's own (see components/DashboardClient.tsx). */
type RowFilter = "ALL" | "AVAILABLE" | "USED" | "BINDING" | "REVIEW_REQUIRED";

function rowMatchesFilter(row: OverviewRow, filter: RowFilter): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "AVAILABLE":
      return row.bindingState === "AVAILABLE";
    case "BINDING":
      return row.bindingState === "BINDING";
    case "REVIEW_REQUIRED":
      return row.bindingState === "REVIEW_REQUIRED";
    case "USED":
      return row.kind === "CAPACITY" && row.usageState === "TRACKED" && row.used !== null && row.used > 0;
  }
}

function rowMatchesQuery(row: OverviewRow, familyName: string, query: string): boolean {
  const haystack = [row.name, row.sectionRef, row.documentName, familyName, row.kind === "CAPACITY" ? (row.formulaDisplay ?? "") : ""].join(" ").toLowerCase();
  return haystack.includes(query);
}

/**
 * Dashboard find/filter (task §31/§56 - "lightweight... presentation-only
 * filtering. Default remains complete view"). Filters already-loaded rows
 * client-side only; never gates access to a row that exists, and defaults
 * to showing everything (ALL, empty query).
 */
export function CovenantFamiliesView({ families }: { families: CovenantFamilySection[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RowFilter>("ALL");

  const orderedFamilies = useMemo(
    () =>
      [...families].sort((a, b) => {
        const ia = FAMILY_ORDER.indexOf(a.family);
        const ib = FAMILY_ORDER.indexOf(b.family);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      }),
    [families]
  );

  const isFiltering = query.trim().length > 0 || filter !== "ALL";
  const normalizedQuery = query.trim().toLowerCase();
  const visibleFamilies = useMemo(() => {
    if (!isFiltering) return orderedFamilies;
    return orderedFamilies
      .map((section) => ({
        ...section,
        rows: section.rows.filter((row) => rowMatchesFilter(row, filter) && (normalizedQuery === "" || rowMatchesQuery(row, section.family, normalizedQuery))),
      }))
      .filter((section) => section.rows.length > 0);
  }, [orderedFamilies, isFiltering, filter, normalizedQuery]);

  if (orderedFamilies.length === 0) {
    return (
      <Card>
        <div className="empty-state">
          <div className="empty-state-title">Covenant model not initialized</div>
          <div>Connect sources or upload financing documents to begin.</div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="dashboard-filter-bar">
        <input
          type="text"
          className="dashboard-filter-search"
          placeholder="Find a basket, section, document…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Find within the covenant overview"
        />
        <div className="button-row" style={{ marginTop: 0 }}>
          {(
            [
              ["ALL", "All"],
              ["AVAILABLE", "Available"],
              ["USED", "Used"],
              ["BINDING", "Binding"],
              ["REVIEW_REQUIRED", "Review required"],
            ] as [RowFilter, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" className={`button ${filter === id ? "active" : ""}`} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {isFiltering && visibleFamilies.length === 0 && (
        <Card>
          <div className="row-note">No rows match this filter. Every modeled row is still on the unfiltered view — clear the filter to see everything.</div>
        </Card>
      )}
      {visibleFamilies.map((section) => (
        <FamilySectionView key={section.family} section={section} />
      ))}
    </>
  );
}

export function CovenantOverviewView({ overview }: { overview: CovenantOverview }) {
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

      <AttentionList items={overview.attentionItems} />

      <CovenantFamiliesView families={overview.covenantFamilies} />
    </div>
  );
}
