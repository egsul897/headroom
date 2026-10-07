import { UNKNOWN_STATE, presentList, type ListLoadState } from "@/lib/home/load-state";
import { EmptyCopy, LoadedList, RegionCard } from "./RegionCard";

export function HeadroomOverTimeCard({ state = UNKNOWN_STATE }: { state?: ListLoadState }) {
  const presented = presentList(state);
  return (
    <RegionCard region="headroom-over-time" eyebrow="Headroom over time">
      <div className="home-chart-well" aria-hidden="false">
        {presented.kind === "VERIFIED_POPULATED" ? <LoadedList rows={presented.rows} /> : <EmptyCopy slot="headroomOverTime" state={presented} />}
      </div>
    </RegionCard>
  );
}
