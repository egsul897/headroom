import { UNKNOWN_STATE, presentList, type ListLoadState } from "@/lib/home/load-state";
import { EmptyCopy, LoadedList, RegionCard } from "./RegionCard";

export function DriversCard({ state = UNKNOWN_STATE }: { state?: ListLoadState<"drivers"> }) {
  const presented = presentList(state, "drivers");
  return (
    <RegionCard region="drivers" eyebrow="Top headroom drivers">
      {presented.kind === "VERIFIED_POPULATED" ? <LoadedList rows={presented.rows} /> : <EmptyCopy slot="drivers" state={presented} />}
    </RegionCard>
  );
}
