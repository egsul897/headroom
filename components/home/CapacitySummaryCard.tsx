import { HOME_SLOTS } from "@/lib/home/copy";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function CapacitySummaryCard() {
  return (
    <RegionCard region="capacity-summary" eyebrow="Capacity summary">
      <div className="home-chart-well">
        <EmptyCopy slot={HOME_SLOTS.capacitySummary} />
      </div>
    </RegionCard>
  );
}
