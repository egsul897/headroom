import { HOME_SLOTS } from "@/lib/home/copy";
import { UNKNOWN_STATE, presentFigure, type FigureLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function UtilizationCard({ state = UNKNOWN_STATE }: { state?: FigureLoadState<"utilization"> }) {
  const presented = presentFigure(state, "utilization");
  return (
    <RegionCard region="utilization" eyebrow="Utilization">
      {presented.kind === "VERIFIED_POPULATED" ? (
        <div className="home-kpi-figure" data-load-kind="VERIFIED_POPULATED" data-slot="utilization">
          <p className="home-kpi-value home-kpi-value-sm">{presented.display}</p>
          <p className="home-kpi-caption">{HOME_SLOTS.utilization.headline} · facilities</p>
        </div>
      ) : (
        <EmptyCopy slot="utilization" state={presented} />
      )}
    </RegionCard>
  );
}
