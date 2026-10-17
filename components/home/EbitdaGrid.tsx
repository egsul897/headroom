import type { ReactNode } from "react";
import { lastUpdatedLabel } from "@/lib/home/ebitda-confirm";
import { formatUsd } from "@/lib/home/ebitda-tile";

function shown(value: string | null | undefined): string {
  return formatUsd(value) ?? "Needs input";
}

/**
 * One dashboard KPI box. The add-backs live in the slide-over, not on the board.
 */
export function AdjustedEbitdaCard({
  figure,
  needingYou,
  preparing = false,
  open = false,
  onOpen,
  children,
}: {
  figure: string;
  needingYou: number | null;
  preparing?: boolean;
  open?: boolean;
  onOpen: () => void;
  children?: ReactNode;
}) {
  const badge = needingYou != null && needingYou > 0 ? (needingYou === 1 ? "1 needs you" : `${needingYou} need you`) : null;
  return (
    <section className="home-card ebitda-kpi" data-region="ebitda" aria-label="Adjusted EBITDA">
      <button type="button" className="ebitda-kpi-button" onClick={onOpen} aria-expanded={open}>
        <span className="home-eyebrow">Adjusted EBITDA</span>
        {badge ? (
          <span className="need-chip" aria-label={badge}>
            {needingYou}
          </span>
        ) : null}
        {preparing ? (
          <span className="ebitda-skeleton">Preparing EBITDA…</span>
        ) : (
          <span className={figure === "Needs input" ? "home-kpi-value is-missing" : "home-kpi-value"}>{figure}</span>
        )}
        <span className="home-kpi-caption">Pro forma</span>
      </button>
      {children}
    </section>
  );
}

/** Base, confirmed, and available, as a compact header inside the slide-over. */
export function EbitdaDrawerHeader({
  base,
  confirmed,
  additional,
}: {
  base: string | null;
  confirmed: string | null;
  additional: string | null;
}) {
  const rows = [
    ["Base", shown(base)],
    ["Confirmed", shown(confirmed)],
    ["Available", shown(additional)],
  ] as const;
  return (
    <div className="ebitda-drawer-metrics">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span className="ebitda-caption">{label}</span>
          <strong className={value === "Needs input" ? "is-missing" : undefined}>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function CouldntCompute({
  reason,
  staleSince,
  retrying = false,
  onRetry,
}: {
  reason: string;
  staleSince?: string | null;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  const updated = lastUpdatedLabel(staleSince);
  return (
    <div className="ebitda-failed">
      <p className="ebitda-failed-line">
        <span>Couldn't compute</span>
        {updated ? <span>{updated}</span> : null}
      </p>
      <p>{reason}</p>
      <button type="button" className="button" disabled={retrying} onClick={onRetry}>
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
