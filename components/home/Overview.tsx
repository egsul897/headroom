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
import { EbitdaTile } from "./EbitdaTile";
import { HeadroomOverTimeCard } from "./HeadroomOverTimeCard";
import { BellIcon, ExportIcon } from "./icons";
import { NextTestCard } from "./NextTestCard";
import { StatusTable } from "./StatusTable";
import { KeyRatios } from "@/components/ux/KeyRatios";
import { MorningBrief } from "@/components/ux/MorningBrief";
import { UNLOADED_BRIEF, UNLOADED_KEY_RATIOS, type KeyRatioModel, type MorningBriefModel } from "@/lib/ux/present";
import { TotalHeadroomCard } from "./TotalHeadroomCard";
import { TransactionsCard } from "./TransactionsCard";
import { UtilizationCard } from "./UtilizationCard";

/**
 * Company overview / dashboard. Each slot renders from its own load state.
 * The default load is UNKNOWN for every slot (sources unwired).
 * The bell badge renders only for a queried non-zero alert count.
 */
export function CompanyOverview({
  companyId,
  identityName = null,
  load = UNWIRED_OVERVIEW_LOAD,
  readinessHeadline = null,
  authorityNote = null,
  setupCta = null,
  documents = null,
  preparingIds = null,
  brief = UNLOADED_BRIEF,
  ratios = UNLOADED_KEY_RATIOS,
}: {
  companyId: string;
  identityName?: string | null;
  load?: Partial<OverviewLoad>;
  readinessHeadline?: string | null;
  authorityNote?: string | null;
  setupCta?: { href: string; label: string; detail: string } | null;
  documents?: readonly { id: string; name: string }[] | null;
  preparingIds?: readonly string[] | null;
  /** Change feed, needs-you count, and next test. Default is unloaded. */
  brief?: MorningBriefModel;
  /** Position ratios. Missing cells stay "Missing input". */
  ratios?: readonly KeyRatioModel[];
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
          {readinessHeadline ? (
            <p className="home-readiness" data-readiness-headline hidden>
              {readinessHeadline}
            </p>
          ) : null}
          <Link className="home-ask-link" href={`/${companyId}/ask`} data-ask-hero>
            <span className="home-ask-hero-label">Ask</span>
            <span className="home-ask-hero-note">{ASK_CASES.NOT_AVAILABLE_ON_DEAL.headline}</span>
          </Link>
        </div>
        <div className="home-top-actions">
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
            <span className="home-export-chevron" aria-hidden="true">
              ▾
            </span>
          </button>
        </div>
      </header>

      <MorningBrief model={brief} />

      {setupCta ? (
        <section className="home-card home-setup-banner" data-region="setup">
          <h2 className="home-eyebrow">Set up this workspace</h2>
          <p className="home-headline">{setupCta.label}</p>
          <p className="home-detail">{setupCta.detail}</p>
          <Link className="button button-primary" href={setupCta.href} style={{ textDecoration: "none", marginTop: 12, display: "inline-flex" }}>
            {setupCta.label}
          </Link>
        </section>
      ) : null}

      <div className="home-hero">
        <TotalHeadroomCard state={slots.totalHeadroom} />
      </div>
      <div className="home-board">
        <div className="home-kpis">
          <TotalHeadroomCard state={slots.totalHeadroom} />
          <UtilizationCard state={slots.utilization} />
          <CovenantsAtRiskCard state={slots.covenantsAtRisk} />
          <NextTestCard state={slots.nextTest} />
          <EbitdaTile companyId={companyId} documents={documents} preparingIds={preparingIds} />
        </div>
        <KeyRatios ratios={ratios} />
        <div className="home-split">
          <HeadroomOverTimeCard state={slots.headroomOverTime} />
          <CapacitySummaryCard state={slots.capacitySummary} />
        </div>
        <div className="home-split">
          <StatusTable state={slots.statusTable} viewAllHref={`/${companyId}/covenants`} />
          <DriversCard state={slots.drivers} />
        </div>
        <div className="home-pair">
          <AlertsCard state={alerts} viewAllHref={`/${companyId}/alerts`} />
          <TransactionsCard state={slots.transactions} viewAllHref={`/${companyId}/ledger`} />
        </div>
      </div>
      {authorityNote ? (
        <p className="home-authority-note" data-authority-note>
          {authorityNote}
        </p>
      ) : null}
    </div>
  );
}
