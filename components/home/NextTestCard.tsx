import { ProofTrigger } from "@/components/ux/ProofDrawer";
import { UNKNOWN_STATE, presentList, type ListLoadState } from "@/lib/home/load-state";
import { FIGURE_INPUTS, unloadedProof } from "@/lib/ux/present";
import { EmptyCopy, LoadedList, RegionCard } from "./RegionCard";

export function NextTestCard({ state = UNKNOWN_STATE }: { state?: ListLoadState<"nextTest"> }) {
  const presented = presentList(state, "nextTest");
  return (
    <RegionCard region="next-test" eyebrow="Next test">
      {presented.kind === "VERIFIED_POPULATED" ? (
        <ProofTrigger className="figure-hit" proof={unloadedProof("Next test", presented.rows[0] ?? null, FIGURE_INPUTS.nextTest)}>
          <LoadedList rows={presented.rows} />
        </ProofTrigger>
      ) : (
        <EmptyCopy slot="nextTest" state={presented} />
      )}
      {presented.kind === "VERIFIED_POPULATED" ? null : (
        <ProofTrigger proof={unloadedProof("Next test", null, FIGURE_INPUTS.nextTest)}>How we got this</ProofTrigger>
      )}
    </RegionCard>
  );
}
