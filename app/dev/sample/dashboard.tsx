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
  ebitdaError = null,
}: {
  initialDetail?: boolean;
  initialEbitda?: string | null;
  ebitdaError?: string | null;
}) {
  const [panel, setPanel] = useState<Panel | null>(initialDetail ? rowPanel(SAMPLE_ROWS[0]) : null);

  return (
    <div className="home-overview">
      <header className="home-top">
        <div className="home-greeting-block">
          <p className="page-kicker">Sample</p>
          <h1 className="home-greeting">How much headroom can we rely on?</h1>
        </div>
        <a className="button button-primary" href="/dev/sample?screen=covenants">
          Read the clause
        </a>
      </header>

      <div className="home-hero">
        <section className="home-card" aria-label="Total Headroom">
          <h2 className="home-eyebrow">Headroom</h2>
          <p className="home-kpi-value home-kpi-value-hero">
            <CountUp text="$86 million" />
          </p>
          <p className="home-kpi-caption">Sample incremental. Not a certified path, and not from the engine.</p>
          <p className="home-source">Source: sample illustration. Not a company snapshot.</p>
          <button
            type="button"
            className="button button-quiet detail-open"
            onClick={() =>
              setPanel({
                title: "Headroom",
                source: "Sample illustration. No source document is attached.",
                clause: "Sample agreement §6.04. Sample language, not an operative clause.",
                history: "Sample spark from a made-up prior period. Not a loaded history.",
              })
            }
          >
            Open detail
          </button>
        </section>
      </div>

      <div className="home-board">
        <div className="home-kpis">
          <section className="home-card" aria-label="Total Headroom">
            <h2 className="home-eyebrow">Total headroom</h2>
            <div className="sample-kpi-row">
              <p className="home-kpi-value">
                <CountUp text="$86 million" />
              </p>
              <Spark />
            </div>
            <p className="home-kpi-caption">Sample change versus a made-up prior period.</p>
            <button
              type="button"
              className="button button-quiet detail-open"
              onClick={() =>
                setPanel({
                  title: "Total headroom",
                  source: "Sample illustration. No source document is attached.",
                  clause: "Sample agreement §6.04. Sample language, not an operative clause.",
                  history: "Sample spark from a made-up prior period. Not a loaded history.",
                })
              }
            >
              Open detail
            </button>
          </section>
          <section className="home-card" aria-label="Utilization">
            <h2 className="home-eyebrow">Utilization</h2>
            <div className="sample-kpi-row">
              <p className="home-kpi-value">
                <CountUp text="57%" />
              </p>
              <span className="sample-ring" aria-hidden="true">
                <i />
              </span>
            </div>
            <p className="home-kpi-caption">$114 million sample used against a $200 million sample cap.</p>
            <button
              type="button"
              className="button button-quiet detail-open"
              onClick={() =>
                setPanel({
                  title: "Utilization",
                  source: "Sample illustration. No source document is attached.",
                  clause: "No clause is loaded for this sample figure.",
                  history: "History has not been loaded.",
                })
              }
            >
              Open detail
            </button>
          </section>
          <section className="home-card" aria-label="Covenants at risk">
            <h2 className="home-eyebrow">Covenants at risk</h2>
            <p className="home-kpi-value">
              <CountUp text="1" />
            </p>
            <p className="home-kpi-caption">
              <StatusBadge status="REVIEW_REQUIRED" /> One sample clause still needs a person.
            </p>
            <button
              type="button"
              className="button button-quiet detail-open"
              onClick={() =>
                setPanel({
                  title: "Covenants at risk",
                  source: "Sample agreement. No source document is attached.",
                  clause: "Sample agreement §6.08. Sample language, not an operative clause.",
                  history: "History has not been loaded.",
                })
              }
            >
              Open detail
            </button>
          </section>
          <section className="home-card" aria-label="Next test">
            <h2 className="home-eyebrow">Next test</h2>
            <p className="home-kpi-value home-kpi-value-sm">Dec 31, 2024</p>
            <p className="home-kpi-caption">Sample date. Not a calendar.</p>
            <button
              type="button"
              className="button button-quiet detail-open"
              onClick={() =>
                setPanel({
                  title: "Next test",
                  source: "No source document is attached.",
                  clause: "Sample agreement §7.01. Sample language, not an operative clause.",
                  history: "Sample date Dec 31, 2024. Not a loaded history.",
                })
              }
            >
              Open detail
            </button>
          </section>
        </div>

        <div className="home-split">
          <section className="home-card" aria-label="Headroom over time">
            <div className="home-card-head">
              <h2 className="home-eyebrow">Headroom over time</h2>
              <p className="sample-window">Sample · 6 months</p>
            </div>
            <Plot />
            <ul className="sample-legend">
              <li>
                <span className="sample-swatch" /> Sample headroom
              </li>
              <li>
                <span className="sample-swatch sample-swatch-2" /> Sample utilization
              </li>
            </ul>
            <p className="home-kpi-caption">Sample lines. Not a history load.</p>
          </section>
          <section className="home-card" aria-label="Capacity summary">
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
            <p className="home-kpi-caption">Sample facility split. Not tied to a source.</p>
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
                  {SAMPLE_ROWS.map((item, index) => (
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
            <EbitdaTile base={SAMPLE_EBITDA_BASE} items={SAMPLE_ADD_BACKS} sample initialView={initialEbitda} inlineError={ebitdaError} />
          <section className="home-card" aria-label="Top headroom drivers">
            <h2 className="home-eyebrow">Top headroom drivers</h2>
            <ul className="sample-feed">
              {DRIVERS.map((item) => (
                <li key={item.name}>
                  <span className="sample-dot" />
                  <span>
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
                    <p>{item.note}</p>
                  </span>
                  <strong>{item.amount}</strong>
                </li>
              ))}
            </ul>
            <p className="home-kpi-caption">Not explained capacity moves.</p>
          </section>
          </div>
        </div>

        <div className="home-pair">
          <section className="home-card" aria-label="Recent alerts">
            <h2 className="home-eyebrow">Recent alerts</h2>
            <ul className="sample-feed">
              {ALERTS.map((item) => (
                <li key={item.name}>
                  <span className="sample-dot" style={{ background: item.tone }} />
                  <span>
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
                    <p>{item.note}</p>
                  </span>
                  <span>Sample</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="home-card" aria-label="Recent transactions">
            <h2 className="home-eyebrow">Recent transactions</h2>
            <ul className="sample-feed">
              <li>
                <span className="sample-dot" />
                <span>
                  Sample revolver draw
                  <p>Not on the ledger.</p>
                </span>
                <strong>$25 million sample</strong>
              </li>
              <li>
                <span className="sample-dot" style={{ background: "var(--chart-2)" }} />
                <span>
                  Sample paydown
                  <p>Not on the ledger.</p>
                </span>
                <strong>$15 million sample</strong>
              </li>
            </ul>
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

function Spark() {
  return (
    <span className="sample-spark" aria-hidden="true">
      <svg viewBox="0 0 96 36" fill="none">
        <polyline
          points="2,28 18,26 34,22 50,24 66,16 82,12 94,8"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function Plot() {
  return (
    <div className="sample-plot">
      <svg viewBox="0 0 640 220" role="img" aria-label="Sample headroom and utilization lines">
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
