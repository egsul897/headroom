import { HOME_SLOTS } from "@/lib/home/copy";
import { UNKNOWN_STATE, presentFigure, type FigureLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function CapacitySummaryCard({ state = UNKNOWN_STATE }: { state?: FigureLoadState<"capacitySummary"> }) {
  const presented = presentFigure(state, "capacitySummary");
  return (
    <RegionCard region="capacity-summary" eyebrow="Capacity summary">
      <div className="home-chart-well">
        {presented.kind === "VERIFIED_POPULATED" ? (
          <div className="home-empty" data-load-kind="VERIFIED_POPULATED" data-slot="capacitySummary">
            <p className="home-headline">{HOME_SLOTS.capacitySummary.headline}</p>
            <p className="home-detail">{presented.display}</p>
          </div>
        ) : (
          <EmptyCopy slot="capacitySummary" state={presented} />
        )}
      </div>
    </RegionCard>
  );
}
