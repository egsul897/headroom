import { HOME_SLOTS } from "@/lib/home/copy";
import { UNKNOWN_STATE, presentFigure, type FigureLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function TotalHeadroomCard({ state = UNKNOWN_STATE }: { state?: FigureLoadState<"totalHeadroom"> }) {
  const presented = presentFigure(state, "totalHeadroom");
  return (
    <RegionCard region="total-headroom" eyebrow="Total Headroom">
      {presented.kind === "VERIFIED_POPULATED" ? (
        <div className="home-kpi-figure" data-load-kind="VERIFIED_POPULATED" data-slot="totalHeadroom">
          <p className="home-kpi-value">{presented.display}</p>
          <p className="home-kpi-caption">{HOME_SLOTS.totalHeadroom.headline} · engine-backed</p>
        </div>
      ) : (
        <EmptyCopy slot="totalHeadroom" state={presented} />
      )}
    </RegionCard>
  );
}
