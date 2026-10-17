import { ProofTrigger } from "@/components/ux/ProofDrawer";
import { UNKNOWN_STATE, presentList, type ListLoadState } from "@/lib/home/load-state";
import { FIGURE_INPUTS, unloadedProof } from "@/lib/ux/present";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function DriversCard({ state = UNKNOWN_STATE }: { state?: ListLoadState<"drivers"> }) {
  const presented = presentList(state, "drivers");
  return (
    <RegionCard region="drivers" eyebrow="Top headroom drivers">
      {presented.kind === "VERIFIED_POPULATED" ? (
        <ul className="home-loaded" data-load-kind="VERIFIED_POPULATED">
          {presented.rows.slice(0, 5).map((row, index) => (
            <li key={`${index}-${row}`}>
              <ProofTrigger className="row-detail" proof={unloadedProof(row, row, FIGURE_INPUTS.driver)}>
                {row}
              </ProofTrigger>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <EmptyCopy slot="drivers" state={presented} />
          <ProofTrigger proof={unloadedProof("Top headroom drivers", null, FIGURE_INPUTS.driver)}>How we got this</ProofTrigger>
        </>
      )}
    </RegionCard>
  );
}
