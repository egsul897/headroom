import Link from "next/link";
import { ASK_CASES } from "@/lib/ask/copy";
import { overviewGreeting } from "@/lib/home/copy";
import {
  UNWIRED_OVERVIEW_LOAD,
  alertBadgeCount,
  exportChromeTitle,
  presentAlerts,
  type OverviewLoad,
} from "@/lib/home/load-state";
import { AlertsCard } from "./AlertsCard";
import { CapacitySummaryCard } from "./CapacitySummaryCard";
import { CovenantsAtRiskCard } from "./CovenantsAtRiskCard";
import { DriversCard } from "./DriversCard";
import { HeadroomOverTimeCard } from "./HeadroomOverTimeCard";
import { BellIcon, ExportIcon } from "./icons";
import { NextTestCard } from "./NextTestCard";
import { StatusTable } from "./StatusTable";
import { TotalHeadroomCard } from "./TotalHeadroomCard";
import { TransactionsCard } from "./TransactionsCard";
import { UtilizationCard } from "./UtilizationCard";

/**
 * Company overview. Each slot renders from its own load state.
 * The default load is UNKNOWN for every slot (sources unwired).
 * The bell badge renders only for a queried non-zero alert count.
 */
export function CompanyOverview({
  companyId,
  identityName = null,
  load = UNWIRED_OVERVIEW_LOAD,
}: {
  companyId: string;
  identityName?: string | null;
  load?: Partial<OverviewLoad>;
}) {
  const slots: OverviewLoad = { ...UNWIRED_OVERVIEW_LOAD, ...load };
  const alerts = presentAlerts(slots.alerts);
  const greeting = overviewGreeting(identityName);
  const badge = alertBadgeCount(alerts);

  return (
    <div className="home-overview">
      <header className="home-top">
        <div className="home-greeting-block">
          <h1 className="home-greeting">{greeting.heading}</h1>
          {greeting.subheading ? <p className="home-greeting-sub">{greeting.subheading}</p> : null}
        </div>
        <div className="home-top-actions">
          <Link className="button button-primary" href={`/${companyId}/intelligence`}>
            Debt intelligence
          </Link>
          <Link className="home-ask-hero" href={`/${companyId}/ask`} data-ask-hero>
            <span className="home-ask-hero-label">Ask</span>
            <span className="home-ask-hero-note">{ASK_CASES.NOT_AVAILABLE_ON_DEAL.headline}</span>
          </Link>
          <a className="home-icon-button" href="#home-alerts" aria-label="Alerts">
            <BellIcon />
            {badge != null ? (
              <span className="home-alert-badge" data-alert-badge>
                {badge}
              </span>
            ) : null}
          </a>
          <button
            type="button"
            className="home-export"
            disabled
            aria-disabled="true"
            title={exportChromeTitle(slots.exportState)}
          >
            <ExportIcon />
            Export
          </button>
        </div>
      </header>

      <div className="home-regions">
        <div className="home-kpis">
          <TotalHeadroomCard state={slots.totalHeadroom} />
          <UtilizationCard state={slots.utilization} />
          <CovenantsAtRiskCard state={slots.covenantsAtRisk} />
          <NextTestCard state={slots.nextTest} />
        </div>
        <div className="home-split">
          <HeadroomOverTimeCard state={slots.headroomOverTime} />
          <CapacitySummaryCard state={slots.capacitySummary} />
        </div>
        <div className="home-split">
          <StatusTable state={slots.statusTable} />
          <DriversCard state={slots.drivers} />
        </div>
        <div className="home-pair">
          <AlertsCard state={alerts} />
          <TransactionsCard state={slots.transactions} />
        </div>
      </div>
    </div>
  );
}
