import { HOME_SLOTS } from "@/lib/home/copy";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function AlertsCard() {
  return (
    <RegionCard region="alerts" eyebrow="Recent alerts" id="home-alerts">
      <EmptyCopy slot={HOME_SLOTS.alerts} />
    </RegionCard>
  );
}
