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
