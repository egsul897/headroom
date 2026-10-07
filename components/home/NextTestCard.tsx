import { UNKNOWN_STATE, presentList, type ListLoadState } from "@/lib/home/load-state";
import { EmptyCopy, LoadedList, RegionCard } from "./RegionCard";

export function NextTestCard({ state = UNKNOWN_STATE }: { state?: ListLoadState }) {
  const presented = presentList(state);
  return (
    <RegionCard region="next-test" eyebrow="Next test">
      {presented.kind === "VERIFIED_POPULATED" ? <LoadedList rows={presented.rows} /> : <EmptyCopy slot="nextTest" state={presented} />}
    </RegionCard>
  );
}
