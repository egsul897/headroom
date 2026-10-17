import { CountUp } from "@/components/motion/CountUp";
import { OpenProvenanceButton } from "@/components/motion/ProvenanceDrawer";
import { UNKNOWN_STATE, presentFigure, type FigureLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

const NOTE = "The figure on the card is already shown. This panel did not load a source, a clause, or a history.";

export function TotalHeadroomCard({ state = UNKNOWN_STATE }: { state?: FigureLoadState<"totalHeadroom"> }) {
  const presented = presentFigure(state, "totalHeadroom");
  return (
    <RegionCard region="total-headroom" eyebrow="Total Headroom">
      {presented.kind === "VERIFIED_POPULATED" ? (
        <div className="home-kpi-figure" data-load-kind="VERIFIED_POPULATED" data-slot="totalHeadroom">
          <p className="home-kpi-value home-kpi-value-hero">
            <CountUp text={presented.display} />
          </p>
          <p className="home-kpi-caption">Secured incremental capacity, when the engine returns it.</p>
          <p className="home-kpi-caption">Change versus the prior period is not loaded.</p>
          <OpenProvenanceButton title="Total Headroom" note={NOTE}>
            Open detail
          </OpenProvenanceButton>
        </div>
      ) : (
        <>
          <EmptyCopy slot="totalHeadroom" state={presented} />
          <OpenProvenanceButton title="Total Headroom" note={NOTE}>
            Open detail
          </OpenProvenanceButton>
        </>
      )}
    </RegionCard>
  );
}
