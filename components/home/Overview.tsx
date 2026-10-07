import Link from "next/link";
import { ASK_CASES } from "@/lib/ask/copy";
import { overviewGreeting } from "@/lib/home/copy";
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
 * CFO overview skeleton. Every figure slot is Product LOCK empty copy.
 * `alertCount` is a real alert count only; Chunk A′ passes 0, which hides the bell badge.
 * `identityName` is a real signed-in name only. This chunk has no identity, so pages pass null.
 */
export function CompanyOverview({
  companyId,
  identityName = null,
  alertCount = 0,
}: {
  companyId: string;
  identityName?: string | null;
  alertCount?: number;
}) {
  const greeting = overviewGreeting(identityName);
  const showBadge = alertCount > 0;

  return (
    <div className="home-overview">
      <header className="home-top">
        <div className="home-greeting-block">
          <h1 className="home-greeting">{greeting.heading}</h1>
          {greeting.subheading ? <p className="home-greeting-sub">{greeting.subheading}</p> : null}
        </div>
        <div className="home-top-actions">
          <Link className="home-ask-hero" href={`/${companyId}/ask`} data-ask-hero>
            <span className="home-ask-hero-label">Ask</span>
            <span className="home-ask-hero-note">{ASK_CASES.NOT_AVAILABLE_ON_DEAL.headline}</span>
          </Link>
          <a className="home-icon-button" href="#home-alerts" aria-label="Alerts">
            <BellIcon />
            {showBadge ? (
              <span className="home-alert-badge" data-alert-badge>
                {alertCount}
              </span>
            ) : null}
          </a>
          <button type="button" className="home-export" disabled aria-disabled="true" title="Nothing to export yet">
            <ExportIcon />
            Export
          </button>
        </div>
      </header>

      <div className="home-regions">
        <div className="home-kpis">
          <TotalHeadroomCard />
          <UtilizationCard />
          <CovenantsAtRiskCard />
          <NextTestCard />
        </div>
        <div className="home-split">
          <HeadroomOverTimeCard />
          <CapacitySummaryCard />
        </div>
        <div className="home-split">
          <StatusTable />
          <DriversCard />
        </div>
        <div className="home-pair">
          <AlertsCard />
          <TransactionsCard />
        </div>
      </div>
    </div>
  );
}
