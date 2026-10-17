import { CountUp } from "@/components/motion/CountUp";
import { ProofTrigger } from "@/components/ux/ProofDrawer";
import { UNKNOWN_STATE, presentFigure, type FigureLoadState } from "@/lib/home/load-state";
import { FIGURE_INPUTS, unloadedProof } from "@/lib/ux/present";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function TotalHeadroomCard({ state = UNKNOWN_STATE }: { state?: FigureLoadState<"totalHeadroom"> }) {
  const presented = presentFigure(state, "totalHeadroom");
  return (
    <RegionCard region="total-headroom" eyebrow="Total Headroom">
      {presented.kind === "VERIFIED_POPULATED" ? (
        <div className="home-kpi-figure" data-load-kind="VERIFIED_POPULATED" data-slot="totalHeadroom">
          <ProofTrigger className="figure-hit" proof={unloadedProof("Total headroom", presented.display, FIGURE_INPUTS.totalHeadroom)}>
            <p className="home-kpi-value home-kpi-value-hero">
              <CountUp text={presented.display} />
            </p>
          </ProofTrigger>
          <p className="home-kpi-caption">Secured incremental capacity, when the engine returns it.</p>
          <p className="home-kpi-caption">Change versus the prior period is not loaded.</p>
        </div>
      ) : (
        <>
          <EmptyCopy slot="totalHeadroom" state={presented} />
          <ProofTrigger proof={unloadedProof("Total headroom", null, FIGURE_INPUTS.totalHeadroom)}>How we got this</ProofTrigger>
        </>
      )}
    </RegionCard>
  );
}
