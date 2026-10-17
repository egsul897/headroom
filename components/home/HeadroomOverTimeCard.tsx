import { ProofTrigger } from "@/components/ux/ProofDrawer";
import { UNKNOWN_STATE, presentList, type ListLoadState } from "@/lib/home/load-state";
import { FIGURE_INPUTS, unloadedProof } from "@/lib/ux/present";
import { EmptyCopy, LoadedList, RegionCard } from "./RegionCard";

export function HeadroomOverTimeCard({ state = UNKNOWN_STATE }: { state?: ListLoadState<"headroomOverTime"> }) {
  const presented = presentList(state, "headroomOverTime");
  if (presented.kind !== "VERIFIED_POPULATED") {
    return (
      <RegionCard region="headroom-over-time" eyebrow="Headroom over time">
        <EmptyCopy slot="headroomOverTime" state={presented} />
        <ProofTrigger proof={unloadedProof("Headroom over time", null, FIGURE_INPUTS.headroomOverTime)}>How we got this</ProofTrigger>
      </RegionCard>
    );
  }

  return (
    <RegionCard region="headroom-over-time" eyebrow="Headroom over time">
      <ProofTrigger
        className="figure-hit"
        proof={unloadedProof("Headroom over time", presented.rows.join("; ") || null, FIGURE_INPUTS.headroomOverTime)}
      >
        <LoadedList rows={presented.rows} />
      </ProofTrigger>
    </RegionCard>
  );
}
