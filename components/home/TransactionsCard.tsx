import { UNKNOWN_STATE, presentTransactions, type TransactionsLoadState } from "@/lib/home/load-state";
import { EmptyCopy, LoadedList, RegionCard } from "./RegionCard";

export function TransactionsCard({ state = UNKNOWN_STATE, viewAllHref = null }: { state?: TransactionsLoadState; viewAllHref?: string | null }) {
  const presented = presentTransactions(state);
  const rows = presented.kind === "VERIFIED_POPULATED" ? presented.rows.slice(0, 5) : [];
  return (
    <RegionCard
      region="transactions"
      eyebrow="Recent transactions"
      toolbar={viewAllHref && presented.kind === "VERIFIED_POPULATED" ? <a className="home-view-all" href={viewAllHref}>View all</a> : null}
    >
      {presented.kind === "VERIFIED_POPULATED" ? (
        <LoadedList rows={rows} />
      ) : (
        <EmptyCopy slot="transactions" state={presented} />
      )}
    </RegionCard>
  );
}
