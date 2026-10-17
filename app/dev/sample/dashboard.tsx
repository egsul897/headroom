"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { CountUp } from "@/components/motion/CountUp";
import { ProvenanceDrawer } from "@/components/motion/ProvenanceDrawer";
import { EbitdaTile } from "@/components/home/EbitdaTile";
import { SAMPLE_ADD_BACKS, SAMPLE_EBITDA_BASE } from "./ebitda";

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
    next: "Dec 31, 2024",
  },
] as const;

const DRIVERS = [
  { name: "Sample EBITDA move", note: "Made-up part of the sample figure.", amount: "+ $40 million sample" },
  { name: "Sample paydown", note: "Made-up part of the sample figure.", amount: "+ $28 million sample" },
  { name: "Sample cash", note: "Made-up part of the sample figure.", amount: "+ $18 million sample" },
] as const;

const ALERTS = [
  {
    name: "Sample maintenance covenant",
    note: "Still needs a person. Not a live alert.",
    clause: "Sample agreement §7.01. Sample language, not an operative clause.",
    tone: "var(--status-stop)",
  },
  {
    name: "Sample restricted payment",
    note: "An illustration. Not a current breach.",
    clause: "Sample agreement §6.08. Sample language, not an operative clause.",
    tone: "var(--status-attention)",
  },
] as const;

type Panel = { title: string; source: string; clause: string; history: string; note?: string };

function rowPanel(item: (typeof SAMPLE_ROWS)[number]): Panel {
  return {
    title: item.covenant,
    source: "Sample agreement. No source document is attached.",
    clause: `${item.facility}. Sample language, not an operative clause.`,
    history: "History has not been loaded.",
    note: `Status ${item.status}. Headroom ${item.headroom}. Next test ${item.next}. Trend ${item.trend}. The same sample row. No company result.`,
  };
}

/**
 * Sample answer, then the reference widgets underneath.
 * Every figure on this page is an illustration. Nothing here is a company result.
 */
export function SampleDashboard({
  initialDetail = false,
  initialEbitda = null,
  failedReason = null,
  staleSince = null,
}: {
  initialDetail?: boolean;
  initialEbitda?: string | null;
  failedReason?: string | null;
  staleSince?: string | null;
}) {
  const [panel, setPanel] = useState<Panel | null>(initialDetail ? rowPanel(SAMPLE_ROWS[0]) : null);

  function openHeadroom() {
    setPanel({
      title: "Total headroom",
      source: "Sample illustration. No source document is attached.",
      clause: "Sample agreement §6.04. Sample language, not an operative clause.",
      history: "Sample spark from a made-up prior period. Not a loaded history.",
    });
  }

  return (
    <div className="home-overview">
      <header className="home-top">
        <div className="home-greeting-block">
          <h1 className="home-greeting">How much headroom can we rely on?</h1>
        </div>
        <a className="home-quiet-link" href="/dev/sample?screen=covenants">
          Read the clause
        </a>
      </header>

      <div className="home-board">
        <div className="home-kpis">
          <section className="home-card home-kpi" aria-label="Total Headroom" onClick={openHeadroom}>
            <h2 className="home-eyebrow">Total headroom</h2>
            <p className="home-kpi-value">
              <CountUp text="$86 million" />
            </p>
            <p className="home-kpi-caption">Not from the engine.</p>
          </section>
          <section
            className="home-card home-kpi"
            aria-label="Utilization"
            onClick={() =>
              setPanel({
                title: "Utilization",
                source: "Sample illustration. No source document is attached.",
                clause: "No clause is loaded for this sample figure.",
                history: "History has not been loaded.",
              })
            }
          >
            <h2 className="home-eyebrow">Utilization</h2>
            <p className="home-kpi-value">
              <CountUp text="57%" />
            </p>
            <span className="sample-ring" aria-hidden="true">
              <i />
            </span>
            <p className="home-kpi-caption">$114 million used</p>
          </section>
          <section
            className="home-card home-kpi"
            aria-label="Covenants at risk"
            onClick={() =>
              setPanel({
                title: "Covenants at risk",
                source: "Sample agreement. No source document is attached.",
                clause: "Sample agreement §6.08. Sample language, not an operative clause.",
                history: "History has not been loaded.",
              })
            }
          >
            <div className="kpi-head">
              <h2 className="home-eyebrow">Covenants at risk</h2>
              <StatusBadge status="REVIEW_REQUIRED" />
            </div>
            <p className="home-kpi-value">
              <CountUp text="1" />
            </p>
            <p className="home-kpi-caption">Needs a person.</p>
          </section>
          <section
            className="home-card home-kpi"
            aria-label="Next test"
            onClick={() =>
              setPanel({
                title: "Next test",
                source: "No source document is attached.",
                clause: "Sample agreement §7.01. Sample language, not an operative clause.",
                history: "Sample date Dec 31, 2024. Not a loaded history.",
              })
            }
          >
            <h2 className="home-eyebrow">Next test</h2>
            <p className="home-kpi-value">Dec 31</p>
            <p className="home-kpi-caption">2024 · sample date</p>
          </section>
          <EbitdaTile
            base={SAMPLE_EBITDA_BASE}
            items={SAMPLE_ADD_BACKS}
            sample
            initialView={initialEbitda}
            failedReason={failedReason}
            staleSince={staleSince}
          />
        </div>

        <div className="home-split">
          <section className="home-card home-chart-card" aria-label="Headroom over time">
            <div className="home-card-head">
              <h2 className="home-eyebrow">Headroom over time</h2>
              <ul className="sample-legend">
                <li>
                  <span className="sample-swatch" /> Headroom
                </li>
                <li>
                  <span className="sample-swatch sample-swatch-2" /> Utilization
                </li>
              </ul>
            </div>
            <Plot />
          </section>
          <section className="home-card home-chart-card" aria-label="Capacity summary">
            <h2 className="home-eyebrow">Capacity summary</h2>
            <div className="sample-capacity">
              <span className="sample-ring sample-ring-lg" aria-hidden="true">
                <i>
                  $200M
                  <br />
                  sample
                </i>
              </span>
              <ul className="sample-facilities">
                <li>
                  <span className="sample-dot" />
                  <span>Sample revolver</span>
                  <strong>$100 million · 50%</strong>
                </li>
                <li>
                  <span className="sample-dot" style={{ background: "var(--chart-2)" }} />
                  <span>Sample term loan</span>
                  <strong>$70 million · 35%</strong>
                </li>
                <li>
                  <span className="sample-dot" style={{ background: "var(--chart-3)" }} />
                  <span>Sample other</span>
                  <strong>$30 million · 15%</strong>
                </li>
              </ul>
            </div>
          </section>
        </div>

        <div className="home-split">
          <section className="home-card" aria-label="Headroom status">
            <div className="home-card-head">
              <h2 className="home-eyebrow">Headroom status</h2>
              <a className="home-view-all" href="/dev/sample?screen=covenants">
                View all
              </a>
            </div>
            <div className="home-table-wrap">
              <table className="home-table">
                <thead>
                  <tr>
                    <th scope="col">Covenant</th>
                    <th scope="col">Facility / document</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">
                      Headroom
                    </th>
                    <th scope="col">Trend</th>
                    <th scope="col">Next test</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_ROWS.slice(0, 5).map((item) => (
                    <tr key={item.covenant}>
                      <td>
                    <button type="button" className="row-detail" onClick={() => setPanel(rowPanel(item))}>
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
          <div className="home-stack">
          <section className="home-card" aria-label="Top headroom drivers">
            <h2 className="home-eyebrow">Top headroom drivers</h2>
            <ul className="sample-feed">
              {DRIVERS.slice(0, 5).map((item) => (
                <li key={item.name}>
                  <span className="sample-dot" />
                  <button
                    type="button"
                    className="row-detail"
                    onClick={() =>
                      setPanel({
                        title: item.name,
                        source: "Sample illustration. No source document is attached.",
                        clause: "No clause is loaded for this sample driver.",
                        history: "History has not been loaded.",
                        note: `${item.note} ${item.amount}. No company result.`,
                      })
                    }
                  >
                    {item.name}
                  </button>
                  <strong>{item.amount}</strong>
                </li>
              ))}
            </ul>
          </section>
          </div>
        </div>

        <div className="home-pair">
          <section className="home-card" aria-label="Recent alerts">
            <div className="home-card-head">
              <h2 className="home-eyebrow">Recent alerts</h2>
              <a className="home-view-all" href="/dev/sample?screen=covenants">
                View all
              </a>
            </div>
            <ul className="sample-feed">
              {ALERTS.slice(0, 5).map((item) => (
                <li key={item.name}>
                  <span className="sample-dot" style={{ background: item.tone }} />
                  <button
                    type="button"
                    className="row-detail"
                    onClick={() =>
                      setPanel({
                        title: item.name,
                        source: "Sample agreement. No source document is attached.",
                        clause: item.clause,
                        history: "History has not been loaded.",
                        note: `${item.note} No company result.`,
                      })
                    }
                  >
                    {item.name}
                  </button>
                  <span className="sample-aside">{item.note}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="home-card" aria-label="Recent transactions">
            <div className="home-card-head">
              <h2 className="home-eyebrow">Recent transactions</h2>
              <a className="home-view-all" href="/dev/sample?screen=covenants">
                View all
              </a>
            </div>
            <ul className="sample-feed">
              <li>
                <span className="sample-dot" />
                <span>Sample revolver draw</span>
                <strong>$25 million</strong>
              </li>
              <li>
                <span className="sample-dot" style={{ background: "var(--chart-2)" }} />
                <span>Sample paydown</span>
                <strong>$15 million</strong>
              </li>
            </ul>
            <p className="home-kpi-caption">Not on the ledger.</p>
          </section>
        </div>
      </div>

      <ProvenanceDrawer
        open={panel != null}
        title={panel?.title ?? "Detail"}
        onClose={() => setPanel(null)}
        source={panel?.source ?? ""}
        clause={panel?.clause ?? ""}
        history={panel?.history ?? ""}
        note={panel?.note}
      />
    </div>
  );
}

function Plot() {
  return (
    <div className="sample-plot">
      <svg viewBox="0 0 640 200" preserveAspectRatio="none" role="img" aria-label="Sample headroom and utilization lines">
        {[40, 80, 120, 160].map((y) => (
          <line key={y} x1="36" x2="624" y1={y} y2={y} stroke="var(--chart-track)" strokeWidth="1" />
        ))}
        <polyline
          points="48,150 144,138 240,142 336,118 432,108 528,86 616,62"
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points="48,168 144,164 240,160 336,156 432,150 528,146 616,140"
          fill="none"
          stroke="var(--chart-4)"
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((label, index) => (
          <text key={label} x={48 + index * 96} y="208" fill="var(--shell-muted)" fontSize="11">
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
