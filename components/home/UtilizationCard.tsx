import { CountUp } from "@/components/motion/CountUp";
import { ProofTrigger } from "@/components/ux/ProofDrawer";
import { UNKNOWN_STATE, presentFigure, type FigureLoadState } from "@/lib/home/load-state";
import { FIGURE_INPUTS, unloadedProof } from "@/lib/ux/present";
import { EmptyCopy, RegionCard } from "./RegionCard";

function parseUtilization(display: string): { pct: number | null; detail: string } {
  const match = display.match(/^([\d.]+)%\s*[·•-]?\s*(.*)$/);
  if (!match) return { pct: null, detail: display };
  const pct = Number(match[1]);
  return { pct: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : null, detail: match[2] || display };
}

export function UtilizationCard({ state = UNKNOWN_STATE }: { state?: FigureLoadState<"utilization"> }) {
  const presented = presentFigure(state, "utilization");
  if (presented.kind !== "VERIFIED_POPULATED") {
    return (
      <RegionCard region="utilization" eyebrow="Utilization">
        <EmptyCopy slot="utilization" state={presented} />
        <ProofTrigger proof={unloadedProof("Utilization", null, FIGURE_INPUTS.utilization)}>How we got this</ProofTrigger>
      </RegionCard>
    );
  }

  const { pct, detail } = parseUtilization(presented.display);
  const deg = pct === null ? 0 : (pct / 100) * 360;

  return (
    <RegionCard region="utilization" eyebrow="Utilization">
      <div className="home-util" data-load-kind="VERIFIED_POPULATED" data-slot="utilization">
        <ProofTrigger className="figure-hit" proof={unloadedProof("Utilization", presented.display, FIGURE_INPUTS.utilization)}>
          {pct !== null ? (
            <div
              className="home-util-ring"
              style={{ background: `conic-gradient(var(--chart-1) 0deg ${deg}deg, var(--chart-track) ${deg}deg 360deg)` }}
              aria-hidden="true"
            >
              <div className="home-util-ring-hole">
                <span className="home-util-pct">
                  <CountUp text={`${pct.toFixed(1)}%`} />
                </span>
              </div>
            </div>
          ) : (
            <p className="home-kpi-value home-kpi-value-sm">{presented.display}</p>
          )}
        </ProofTrigger>
        <p className="home-kpi-caption">{detail || "Facility utilization"}</p>
      </div>
    </RegionCard>
  );
}
