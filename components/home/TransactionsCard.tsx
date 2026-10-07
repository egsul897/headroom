import { HOME_SLOTS } from "@/lib/home/copy";
import { EmptyCopy, RegionCard } from "./RegionCard";

export function TransactionsCard() {
  return (
    <RegionCard region="transactions" eyebrow="Recent transactions">
      <EmptyCopy slot={HOME_SLOTS.transactions} />
    </RegionCard>
  );
}
