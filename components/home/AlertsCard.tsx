import { OpenProvenanceButton } from "@/components/motion/ProvenanceDrawer";
import { UNKNOWN_STATE, presentAlerts, type AlertLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

const NOTE = "The alert line on the card is already shown. This panel did not load a source, a clause, or a history.";

export function AlertsCard({ state = UNKNOWN_STATE, viewAllHref = null }: { state?: AlertLoadState; viewAllHref?: string | null }) {
  const presented = presentAlerts(state);
  return (
    <RegionCard
      region="alerts"
      eyebrow="Recent alerts"
      id="home-alerts"
      toolbar={viewAllHref && presented.kind === "VERIFIED_POPULATED" ? <a className="home-view-all" href={viewAllHref}>View all</a> : null}
    >
      {presented.kind === "VERIFIED_POPULATED" ? (
        <div className="home-empty" data-load-kind="VERIFIED_POPULATED" data-slot="alerts">
          <p className="home-headline">Alerts</p>
          <p className="home-detail" data-alert-count={presented.count}>
            {presented.count} on the latest load.
          </p>
          <OpenProvenanceButton title="Recent alerts" note={NOTE}>
            Open detail
          </OpenProvenanceButton>
        </div>
      ) : (
        <>
          <EmptyCopy slot="alerts" state={presented} />
          <OpenProvenanceButton title="Recent alerts" note={NOTE}>
            Open detail
          </OpenProvenanceButton>
        </>
      )}
    </RegionCard>
  );
}
