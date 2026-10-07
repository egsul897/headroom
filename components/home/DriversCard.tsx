import { HOME_SLOTS } from "@/lib/home/copy";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function DriversCard() {
  return (
    <RegionCard region="drivers" eyebrow="Top headroom drivers">
      <EmptyCopy slot={HOME_SLOTS.drivers} />
    </RegionCard>
  );
}
