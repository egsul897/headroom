import { HOME_SLOTS } from "@/lib/home/copy";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function TotalHeadroomCard() {
  return (
    <RegionCard region="total-headroom" eyebrow="Total Headroom">
      <EmptyCopy slot={HOME_SLOTS.totalHeadroom} />
    </RegionCard>
  );
}
