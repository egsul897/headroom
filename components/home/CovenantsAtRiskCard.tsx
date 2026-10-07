import { HOME_RISK_NEEDS_REVIEW } from "@/lib/home/copy";
import { UNKNOWN_STATE, presentRisk, type RiskLoadState } from "@/lib/home/load-state";
import { EmptyCopy, LoadedList, RegionCard } from "./RegionCard";

export function CovenantsAtRiskCard({ state = UNKNOWN_STATE }: { state?: RiskLoadState }) {
  const presented = presentRisk(state);
  if (presented.kind === "VERIFIED_POPULATED" && presented.disposition === "NEEDS_REVIEW") {
    return (
      <RegionCard region="covenants-at-risk" eyebrow="Covenants at risk">
        <div className="home-empty" data-load-kind="VERIFIED_POPULATED" data-slot="covenantsAtRisk">
          <p className="home-headline">{HOME_RISK_NEEDS_REVIEW.headline}</p>
          <p className="home-detail">{HOME_RISK_NEEDS_REVIEW.detail}</p>
        </div>
      </RegionCard>
    );
  }
  if (presented.kind === "VERIFIED_POPULATED" && presented.disposition === "LIST") {
    return (
      <RegionCard region="covenants-at-risk" eyebrow="Covenants at risk">
        <LoadedList rows={presented.items} />
      </RegionCard>
    );
  }
  return (
    <RegionCard region="covenants-at-risk" eyebrow="Covenants at risk">
      <EmptyCopy slot="covenantsAtRisk" state={presented} />
    </RegionCard>
  );
}
