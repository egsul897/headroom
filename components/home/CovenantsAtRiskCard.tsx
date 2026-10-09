import { HOME_RISK_NEEDS_REVIEW, HOME_VERIFIED_EMPTY } from "@/lib/home/copy";
import { UNKNOWN_STATE, presentRisk, type RiskLoadState } from "@/lib/home/load-state";
import { EmptyCopy, RegionCard } from "./RegionCard";

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
    const [count, ...items] = presented.items;
    const n = Number(count);
    const high = items.filter((i) => i.includes("At Risk")).length;
    const mod = items.filter((i) => i.includes("Moderate")).length;
    return (
      <RegionCard region="covenants-at-risk" eyebrow="Covenants at risk">
        <div className="home-kpi-figure" data-load-kind="VERIFIED_POPULATED" data-slot="covenantsAtRisk">
          <p className="home-kpi-value home-kpi-value-hero">{Number.isFinite(n) ? String(n) : count}</p>
          <p className="home-kpi-caption">
            {high > 0 ? `${high} high risk` : null}
            {high > 0 && mod > 0 ? ", " : null}
            {mod > 0 ? `${mod} moderate` : null}
            {high === 0 && mod === 0 ? "Needs attention" : null}
          </p>
          <ul className="home-risk-list">
            {items.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </RegionCard>
    );
  }
  if (presented.kind === "VERIFIED_EMPTY") {
    return (
      <RegionCard region="covenants-at-risk" eyebrow="Covenants at risk">
        <div className="home-kpi-figure" data-load-kind="VERIFIED_EMPTY" data-slot="covenantsAtRisk">
          <p className="home-kpi-value home-kpi-value-hero">0</p>
          <p className="home-kpi-caption">{HOME_VERIFIED_EMPTY.covenantsAtRisk.detail}</p>
        </div>
      </RegionCard>
    );
  }
  return (
    <RegionCard region="covenants-at-risk" eyebrow="Covenants at risk">
      <EmptyCopy slot="covenantsAtRisk" state={presented} />
    </RegionCard>
  );
}
