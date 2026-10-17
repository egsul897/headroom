import { OpenProvenanceButton } from "@/components/motion/ProvenanceDrawer";
import { UNKNOWN_STATE, presentList, type ListLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

const NOTE = "This is the driver line already on the card. Nothing new was loaded.";

export function DriversCard({ state = UNKNOWN_STATE }: { state?: ListLoadState<"drivers"> }) {
  const presented = presentList(state, "drivers");
  return (
    <RegionCard region="drivers" eyebrow="Top headroom drivers">
      {presented.kind === "VERIFIED_POPULATED" ? (
        <ul className="home-loaded" data-load-kind="VERIFIED_POPULATED">
          {presented.rows.slice(0, 5).map((row, index) => (
            <li key={`${index}-${row}`}>
              <OpenProvenanceButton className="row-detail" title={row} note={NOTE}>
                {row}
              </OpenProvenanceButton>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <EmptyCopy slot="drivers" state={presented} />
          <OpenProvenanceButton title="Top headroom drivers" note={NOTE}>
            Open detail
          </OpenProvenanceButton>
        </>
      )}
    </RegionCard>
  );
}
