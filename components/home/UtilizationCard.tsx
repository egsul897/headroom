import { HOME_SLOTS } from "@/lib/home/copy";
import { UNKNOWN_STATE, presentFigure, type FigureLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function UtilizationCard({ state = UNKNOWN_STATE }: { state?: FigureLoadState }) {
  const presented = presentFigure(state);
  return (
    <RegionCard region="utilization" eyebrow="Utilization">
      {presented.kind === "VERIFIED_POPULATED" ? (
        <div className="home-empty" data-load-kind="VERIFIED_POPULATED" data-slot="utilization">
          <p className="home-headline">{HOME_SLOTS.utilization.headline}</p>
          <p className="home-detail">{presented.display}</p>
        </div>
      ) : (
        <EmptyCopy slot="utilization" state={presented} />
      )}
    </RegionCard>
  );
}
