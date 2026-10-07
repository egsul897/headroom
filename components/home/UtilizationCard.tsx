import { HOME_SLOTS } from "@/lib/home/copy";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function UtilizationCard() {
  return (
    <RegionCard region="utilization" eyebrow="Utilization">
      <EmptyCopy slot={HOME_SLOTS.utilization} />
    </RegionCard>
  );
}
