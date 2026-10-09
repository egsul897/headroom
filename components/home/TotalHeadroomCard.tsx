import { UNKNOWN_STATE, presentFigure, type FigureLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function TotalHeadroomCard({ state = UNKNOWN_STATE }: { state?: FigureLoadState<"totalHeadroom"> }) {
  const presented = presentFigure(state, "totalHeadroom");
  return (
    <RegionCard region="total-headroom" eyebrow="Total Headroom">
      {presented.kind === "VERIFIED_POPULATED" ? (
        <div className="home-kpi-figure" data-load-kind="VERIFIED_POPULATED" data-slot="totalHeadroom">
          <p className="home-kpi-value home-kpi-value-hero">{presented.display}</p>
          <p className="home-kpi-caption">Secured incremental capacity · engine-backed</p>
          <div className="home-kpi-spark" aria-hidden="true">
            <svg viewBox="0 0 120 28" preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                points="0,22 18,18 36,20 54,12 72,14 90,8 108,10 120,4"
              />
            </svg>
          </div>
        </div>
      ) : (
        <EmptyCopy slot="totalHeadroom" state={presented} />
      )}
    </RegionCard>
  );
}
