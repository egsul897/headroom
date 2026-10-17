"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { CountUp } from "@/components/motion/CountUp";
import { DetailDrawer } from "@/components/motion/DetailDrawer";
import { useToast } from "@/components/motion/Toast";

/**
 * Illustration of the dashboard grid. Every figure is sample copy.
 * Production overview never imports this module.
 */
const SAMPLE_ROWS = [
  {
    covenant: "Sample maintenance covenant",
    facility: "Sample agreement §7.01",
    status: "NEEDS_INPUT",
    headroom: "Not evaluated",
    trend: "Unknown",
    next: "Sample date",
  },
  {
    covenant: "Sample indebtedness covenant",
    facility: "Sample agreement §6.04",
    status: "DISCOVERED",
    headroom: "$40 million sample",
    trend: "Unknown",
    next: "Unknown",
  },
  {
    covenant: "Sample restricted payment",
    facility: "Sample agreement §6.08",
    status: "REVIEW_REQUIRED",
    headroom: "Not evaluated",
    trend: "Unknown",
    next: "Unknown",
  },
] as const;

const SAMPLE_ALERTS = [
  "Sample alert: a clause still needs a person.",
  "Sample alert: a document is discovered, not approved.",
];

export function SampleDashboard({ initialDetail = false }: { initialDetail?: boolean }) {
  const [row, setRow] = useState<number | null>(initialDetail ? 0 : null);
  const [hiddenAlerts, setHiddenAlerts] = useState<number[]>([]);
  const toast = useToast();
  const open = row == null ? null : SAMPLE_ROWS[row];

  function hideAlert(index: number) {
    setHiddenAlerts((current) => (current.includes(index) ? current : [...current, index]));
    toast("Hidden on this screen. The sample alert is still sample text.", () => {
      setHiddenAlerts((current) => current.filter((item) => item !== index));
    });
  }

  return (
    <div className="home-overview">
      <header className="home-top">
        <div className="home-greeting-block">
          <h1 className="home-greeting">Sample overview</h1>
          <p className="home-greeting-sub">Illustrative figures for layout. Not a company result.</p>
        </div>
        <div className="home-top-actions">
          <a className="button button-primary" href="/dev/sample?screen=covenants">
            Sample covenants
          </a>
          <span className="home-icon-button" aria-label="Sample alerts">
            <span aria-hidden="true">⌁</span>
          </span>
          <button type="button" className="home-export" disabled aria-disabled="true" title="Export not available yet">
            Export
            <span className="home-export-chevron" aria-hidden="true">
              ▾
            </span>
          </button>
        </div>
      </header>

      <div className="home-kpis">
        <section className="home-card" aria-label="Total Headroom">
          <h2 className="home-eyebrow">Total headroom</h2>
          <p className="home-kpi-value home-kpi-value-hero">
            <CountUp text="$86 million" />
          </p>
          <p className="home-kpi-caption">Sample incremental. Not engine-backed.</p>
          <p className="home-kpi-caption">Sample change versus a made-up prior period.</p>
          <div className="sample-chart" aria-hidden="true">
            <svg viewBox="0 0 240 36" preserveAspectRatio="none">
              <polyline fill="none" stroke="currentColor" strokeWidth="2" points="0,28 30,24 60,26 90,16 120,18 150,10 180,12 210,8 240,6" />
            </svg>
          </div>
        </section>
        <section className="home-card" aria-label="Utilization">
          <h2 className="home-eyebrow">Utilization</h2>
          <div className="home-util">
            <div className="home-util-ring" style={{ background: "conic-gradient(var(--chart-1) 0deg 194deg, var(--chart-track) 194deg 360deg)" }} aria-hidden="true">
              <div className="home-util-ring-hole">
                <span className="home-util-pct">
                  <CountUp text="54%" />
                </span>
              </div>
            </div>
            <p className="home-kpi-caption">Sample used against a sample cap.</p>
          </div>
        </section>
        <section className="home-card" aria-label="Covenants at risk">
          <h2 className="home-eyebrow">Covenants at risk</h2>
          <p className="home-kpi-value home-kpi-value-hero">
            <CountUp text="1" />
          </p>
          <p className="home-kpi-caption">Sample count. One clause needs a person.</p>
          <p className="home-kpi-caption">
            <StatusBadge status="REVIEW_REQUIRED" />
          </p>
        </section>
        <section className="home-card" aria-label="Next test">
          <h2 className="home-eyebrow">Next test date</h2>
          <p className="home-kpi-value home-kpi-value-sm">Dec 31, 2024</p>
          <p className="home-kpi-caption">Sample maintenance test. Not a calendar.</p>
        </section>
      </div>

      <div className="home-split">
        <section className="home-card" aria-label="Headroom over time">
          <div className="home-card-head">
            <h2 className="home-eyebrow">Headroom over time</h2>
            <select className="home-period" defaultValue="sample" aria-label="Sample period">
              <option value="sample">Sample · 6 months</option>
            </select>
          </div>
          <div className="sample-chart" aria-hidden="true">
            <svg viewBox="0 0 640 180" width="100%" height="180">
              <polyline fill="none" stroke="var(--chart-2)" strokeWidth="2.5" points="20,140 80,120 140,128 200,90 260,100 320,70 380,78 440,48 500,55 580,30" />
              <polyline fill="none" stroke="var(--chart-4)" strokeWidth="2" points="20,150 80,146 140,148 200,140 260,138 320,132 380,130 440,124 500,120 580,112" />
            </svg>
          </div>
          <p className="home-kpi-caption">Sample lines. Not a history load.</p>
        </section>
        <section className="home-card" aria-label="Capacity summary">
          <h2 className="home-eyebrow">Capacity summary</h2>
          <div className="home-capacity">
            <div
              className="home-capacity-donut"
              style={{ background: "conic-gradient(var(--chart-1) 0% 55%, var(--chart-2) 55% 82%, var(--chart-3) 82% 100%)" }}
              aria-hidden="true"
            >
              <div className="home-capacity-donut-hole">
                <span className="home-capacity-total">
                  <CountUp text="$160 million" />
                </span>
                <span className="home-capacity-total-label">Sample total</span>
              </div>
            </div>
            <ul className="home-capacity-legend">
              <li>
                <span className="home-capacity-swatch" style={{ background: "var(--chart-1)" }} />
                <span className="home-capacity-name">Sample revolver</span>
                <span className="home-capacity-amt">$88 million (55%)</span>
              </li>
              <li>
                <span className="home-capacity-swatch" style={{ background: "var(--chart-2)" }} />
                <span className="home-capacity-name">Sample term loan</span>
                <span className="home-capacity-amt">$43 million (27%)</span>
              </li>
              <li>
                <span className="home-capacity-swatch" style={{ background: "var(--chart-3)" }} />
                <span className="home-capacity-name">Sample other</span>
                <span className="home-capacity-amt">$29 million (18%)</span>
              </li>
            </ul>
          </div>
        </section>
      </div>

      <div className="home-split">
        <section className="home-card" aria-label="Headroom status">
          <h2 className="home-eyebrow">Headroom status</h2>
          <div className="home-table-wrap">
            <table className="home-table">
              <thead>
                <tr>
                  <th scope="col">Covenant</th>
                  <th scope="col">Facility / Document</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">
                    Headroom
                  </th>
                  <th scope="col">Trend</th>
                  <th scope="col">Next test</th>
                </tr>
              </thead>
              <tbody>
                {SAMPLE_ROWS.map((item, index) => (
                  <tr key={item.covenant}>
                    <td>
                      <button type="button" className="row-detail" onClick={() => setRow(index)}>
                        {item.covenant}
                      </button>
                    </td>
                    <td>{item.facility}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="num">{item.headroom}</td>
                    <td>{item.trend}</td>
                    <td>{item.next}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="home-card" aria-label="Top headroom drivers">
          <h2 className="home-eyebrow">Top headroom drivers</h2>
          <ul className="home-loaded">
            <li>Sample driver: a made-up basket change. Not an explained capacity move.</li>
            <li>Sample driver: a made-up paydown. Not a ledger entry.</li>
            <li>Sample driver: a made-up ratio input. Not a financial snapshot.</li>
          </ul>
        </section>
      </div>

      <div className="home-pair">
        <section className="home-card" aria-label="Recent alerts">
          <h2 className="home-eyebrow">Recent alerts</h2>
          <ul className="home-loaded">
            {SAMPLE_ALERTS.map((alert, index) =>
              hiddenAlerts.includes(index) ? null : (
                <li key={alert} className="home-dismiss-row">
                  <span>{alert}</span>
                  <button type="button" className="button button-quiet" onClick={() => hideAlert(index)}>
                    Hide
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
        <section className="home-card" aria-label="Recent transactions">
          <h2 className="home-eyebrow">Recent transactions</h2>
          <ul className="home-loaded">
            <li>Sample borrowing · illustration · not on the ledger</li>
            <li>Sample paydown · illustration · not on the ledger</li>
          </ul>
        </section>
      </div>
      <DetailDrawer open={open != null} title={open?.covenant ?? "Detail"} onClose={() => setRow(null)}>
        {open ? (
          <dl className="drawer-facts">
            <div>
              <dt>Facility</dt>
              <dd>{open.facility}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge status={open.status} />
              </dd>
            </div>
            <div>
              <dt>Headroom</dt>
              <dd>{open.headroom}</dd>
            </div>
            <div>
              <dt>Trend</dt>
              <dd>{open.trend}</dd>
            </div>
            <div>
              <dt>Next test</dt>
              <dd>{open.next}</dd>
            </div>
          </dl>
        ) : null}
        <p className="drawer-note">This panel repeats the sample row. It does not open another page, and it is not a company result.</p>
      </DetailDrawer>
    </div>
  );
}
