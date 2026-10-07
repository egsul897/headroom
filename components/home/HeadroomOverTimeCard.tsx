import { HOME_SLOTS } from "@/lib/home/copy";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function HeadroomOverTimeCard() {
  return (
    <RegionCard region="headroom-over-time" eyebrow="Headroom over time">
      <div className="home-chart-well" aria-hidden="false">
        <EmptyCopy slot={HOME_SLOTS.headroomOverTime} />
      </div>
    </RegionCard>
  );
}
