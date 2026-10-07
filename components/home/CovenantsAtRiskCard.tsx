import { HOME_SLOTS } from "@/lib/home/copy";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function CovenantsAtRiskCard() {
  return (
    <RegionCard region="covenants-at-risk" eyebrow="Covenants at risk">
      <EmptyCopy slot={HOME_SLOTS.covenantsAtRisk} />
    </RegionCard>
  );
}
