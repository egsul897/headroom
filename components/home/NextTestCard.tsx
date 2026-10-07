import { HOME_SLOTS } from "@/lib/home/copy";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function NextTestCard() {
  return (
    <RegionCard region="next-test" eyebrow="Next test">
      <EmptyCopy slot={HOME_SLOTS.nextTest} />
    </RegionCard>
  );
}
