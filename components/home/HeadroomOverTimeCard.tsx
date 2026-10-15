import { UNKNOWN_STATE, presentList, type ListLoadState } from "@/lib/home/load-state";
import { EmptyCopy, LoadedList, RegionCard } from "./RegionCard";

export function HeadroomOverTimeCard({ state = UNKNOWN_STATE }: { state?: ListLoadState<"headroomOverTime"> }) {
  const presented = presentList(state, "headroomOverTime");
  return (
    <RegionCard
      region="headroom-over-time"
      eyebrow="Headroom over time"
      toolbar={
        <select className="home-period" disabled aria-disabled="true" title="History is not loaded" defaultValue="unloaded">
          <option value="unloaded">Period not loaded</option>
        </select>
      }
    >
      <div className="home-chart-well" aria-hidden="false">
        {presented.kind === "VERIFIED_POPULATED" ? <LoadedList rows={presented.rows} /> : <EmptyCopy slot="headroomOverTime" state={presented} />}
      </div>
    </RegionCard>
  );
}
