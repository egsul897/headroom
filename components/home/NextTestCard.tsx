import { OpenProvenanceButton } from "@/components/motion/ProvenanceDrawer";
import { UNKNOWN_STATE, presentList, type ListLoadState } from "@/lib/home/load-state";
import { EmptyCopy, LoadedList, RegionCard } from "./RegionCard";

const NOTE = "The date on the card is already shown. This panel did not load a source, a clause, or a history.";

export function NextTestCard({ state = UNKNOWN_STATE }: { state?: ListLoadState<"nextTest"> }) {
  const presented = presentList(state, "nextTest");
  return (
    <RegionCard region="next-test" eyebrow="Next test">
      {presented.kind === "VERIFIED_POPULATED" ? <LoadedList rows={presented.rows} /> : <EmptyCopy slot="nextTest" state={presented} />}
      <OpenProvenanceButton title="Next test" note={NOTE}>
        Open detail
      </OpenProvenanceButton>
    </RegionCard>
  );
}
