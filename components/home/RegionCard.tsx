import type { ReactNode } from "react";
import { resolveBuyerCopy, type CopyState, type HomeSlotId } from "@/lib/home/copy";

export function RegionCard({
  region,
  eyebrow,
  children,
  id,
  toolbar,
}: {
  region: string;
  eyebrow: string;
  children: ReactNode;
  id?: string;
  toolbar?: ReactNode;
}) {
  return (
    <section className="home-card" data-region={region} aria-label={eyebrow} id={id}>
      <div className="home-card-head">
        <h2 className="home-eyebrow">{eyebrow}</h2>
        {toolbar}
      </div>
      {children}
    </section>
  );
}

/** Renders UNKNOWN or VERIFIED_EMPTY buyer copy from load state. */
export function EmptyCopy({ slot, state }: { slot: HomeSlotId; state: CopyState }) {
  const copy = resolveBuyerCopy(slot, state);
  return (
    <div className="home-empty" data-load-kind={state.kind} data-slot={slot}>
      <p className="home-headline">{copy.headline}</p>
      <p className="home-detail">{copy.detail}</p>
    </div>
  );
}

export function LoadedList({ rows }: { rows: readonly string[] }) {
  return (
    <ul className="home-loaded" data-load-kind="VERIFIED_POPULATED">
      {rows.map((row, index) => (
        <li key={`${index}-${row}`}>{row}</li>
      ))}
    </ul>
  );
}
