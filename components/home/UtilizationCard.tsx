import { UNKNOWN_STATE, presentFigure, type FigureLoadState } from "@/lib/home/load-state";
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
      </RegionCard>
    );
  }

  const { pct, detail } = parseUtilization(presented.display);
  const deg = pct === null ? 0 : (pct / 100) * 360;

  return (
    <RegionCard region="utilization" eyebrow="Utilization">
      <div className="home-util" data-load-kind="VERIFIED_POPULATED" data-slot="utilization">
        {pct !== null ? (
          <div
            className="home-util-ring"
            style={{ background: `conic-gradient(#c47a3a 0deg ${deg}deg, #e8e2d6 ${deg}deg 360deg)` }}
            aria-hidden="true"
          >
            <div className="home-util-ring-hole">
              <span className="home-util-pct">{pct.toFixed(1)}%</span>
            </div>
          </div>
        ) : (
          <p className="home-kpi-value home-kpi-value-sm">{presented.display}</p>
        )}
        <p className="home-kpi-caption">{detail || "Facility utilization"}</p>
      </div>
    </RegionCard>
  );
}
