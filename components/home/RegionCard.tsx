import type { ReactNode } from "react";
import type { HomeSlotCopy } from "@/lib/home/copy";

export function RegionCard({
  region,
  eyebrow,
  children,
  id,
}: {
  region: string;
  eyebrow: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="home-card" data-region={region} aria-label={eyebrow} id={id}>
      <h2 className="home-eyebrow">{eyebrow}</h2>
      {children}
    </section>
  );
}

export function EmptyCopy({ slot }: { slot: HomeSlotCopy }) {
  return (
    <div className="home-empty">
      <p className="home-headline">{slot.headline}</p>
      <p className="home-detail">{slot.detail}</p>
    </div>
  );
}
