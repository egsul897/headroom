import { UNKNOWN_STATE, presentTransactions, type TransactionsLoadState } from "@/lib/home/load-state";
import { EmptyCopy, LoadedList, RegionCard } from "./RegionCard";

export function TransactionsCard({ state = UNKNOWN_STATE }: { state?: TransactionsLoadState }) {
  const presented = presentTransactions(state);
  return (
    <RegionCard region="transactions" eyebrow="Recent transactions">
      {presented.kind === "VERIFIED_POPULATED" ? (
        <LoadedList rows={presented.rows} />
      ) : (
        <EmptyCopy slot="transactions" state={presented} />
      )}
    </RegionCard>
  );
}
