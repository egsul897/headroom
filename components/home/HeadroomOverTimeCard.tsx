import { UNKNOWN_STATE, presentList, type ListLoadState } from "@/lib/home/load-state";
import { EmptyCopy, LoadedList, RegionCard } from "./RegionCard";

export function HeadroomOverTimeCard({ state = UNKNOWN_STATE }: { state?: ListLoadState<"headroomOverTime"> }) {
  const presented = presentList(state, "headroomOverTime");
  if (presented.kind !== "VERIFIED_POPULATED") {
    return (
      <RegionCard region="headroom-over-time" eyebrow="Headroom over time">
        <EmptyCopy slot="headroomOverTime" state={presented} />
      </RegionCard>
    );
  }

  return (
    <RegionCard region="headroom-over-time" eyebrow="Headroom over time">
      <LoadedList rows={presented.rows} />
    </RegionCard>
  );
}
