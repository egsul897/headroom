import type { ReactNode } from "react";

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card" style={style}>
      {children}
    </div>
  );
}

export function SectionRef({ children }: { children: ReactNode }) {
  return <span className="section-ref">{children}</span>;
}

export type ChipTone = "pass" | "trip" | "tight" | "idle" | "navy";

export function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

/** A labeled figure with its section-reference citation - the core trust mechanic: every number on the page is traceable to a specific covenant clause. */
export function Row({
  label,
  sref,
  value,
  note,
}: {
  label: string;
  /** Omit for a value that isn't itself a cited clause (e.g. a derived subtotal of other cited rows). */
  sref?: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="row">
      <div>
        <div className="row-label">{label}</div>
        <div>
          {sref && <SectionRef>{sref}</SectionRef>}
          {note && <span className="row-note"> · {note}</span>}
        </div>
      </div>
      <span className="row-value">{value}</span>
    </div>
  );
}

export function Banner({ tone, children }: { tone: "red" | "amber"; children: ReactNode }) {
  return <div className={`banner banner-${tone}`}>{children}</div>;
}

export function ProgressBar({ pct, ok }: { pct: number; ok: boolean }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="progress-track">
      <div className={`progress-fill ${ok ? "ok" : "blocked"}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** The current, controlling legal-review-status policy language (docs/legal-review-status-model.md §0) - used verbatim wherever a review status is shown, so this string exists in exactly one place. */
export const LEGAL_REVIEW_STATUS_EXPLANATION: Record<"VERIFIED" | "UNVERIFIED" | "DISPUTED", string> = {
  VERIFIED: "Reviewed and approved by Headroom's own legal reviewer (the founder, an experienced leveraged/debt-finance attorney). This is Headroom's complete legal-review standard for this conclusion - no additional peer or outside-counsel review is required. Legal review is a separate dimension from engineering/execution correctness - see the badge's own note if one is attached.",
  UNVERIFIED: "This conclusion has not yet received a recorded legal review.",
  DISPUTED: "This conclusion's legal review is disputed - do not treat it as settled.",
};

/**
 * Renders a legal-review status with its explanatory label ALWAYS visible
 * beside it (task hard requirement §4 - never a bare "VERIFIED" stamp with
 * no explanation). `context` is an optional short noun phrase naming what
 * was reviewed (e.g. "this golden question," "this permission").
 */
export function LegalReviewBadge({ status, context }: { status: "VERIFIED" | "UNVERIFIED" | "DISPUTED"; context?: string }) {
  const tone: ChipTone = status === "VERIFIED" ? "pass" : status === "DISPUTED" ? "trip" : "idle";
  return (
    <span className="legal-review-badge" title={LEGAL_REVIEW_STATUS_EXPLANATION[status]}>
      <Chip tone={tone}>{status}</Chip>
      <span className="legal-review-badge-note">
        {status === "VERIFIED"
          ? `Reviewed by Headroom's legal reviewer${context ? ` (${context})` : ""} - see note`
          : LEGAL_REVIEW_STATUS_EXPLANATION[status]}
      </span>
    </span>
  );
}

/** A prominent (never a buried tooltip-only) warning line - task hard requirement §7. */
export function WarningList({ warnings }: { warnings: { category: string; description: string }[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="warning-list">
      {warnings.map((w, i) => (
        <Banner key={i} tone="amber">
          <strong>{w.category.replace(/_/g, " ")}:</strong> {w.description}
        </Banner>
      ))}
    </div>
  );
}
