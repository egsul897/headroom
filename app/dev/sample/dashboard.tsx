"use client";

import { useState, type MouseEvent } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { CountUp } from "@/components/motion/CountUp";
import { ProvenanceDrawer } from "@/components/motion/ProvenanceDrawer";
import { EbitdaTile } from "@/components/home/EbitdaTile";
import { SAMPLE_ADD_BACKS, SAMPLE_EBITDA_BASE } from "./ebitda";
import { VIZ_PALETTES, type VizId } from "./viz";

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
  { name: "Sample EBITDA move", note: "Made-up part of the sample figure.", amount: "+$40 million" },
  { name: "Sample paydown", note: "Made-up part of the sample figure.", amount: "+$28 million" },
  { name: "Sample cash", note: "Made-up part of the sample figure.", amount: "+$18 million" },
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

function VizStrip({ id }: { id: VizId }) {
  const palette = VIZ_PALETTES[id];
  return (
    <div className="viz-strip" aria-label={`${palette.name} chart colors`}>
      <span className="viz-strip-name">{id} · {palette.name}</span>
      <ol>
        {palette.colors.map((hex) => (
          <li key={hex}>
            <i style={{ background: hex }} />
            <span>{hex}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Sample answer, then the reference widgets underneath.
 * Every figure on this page is an illustration. Nothing here is a company result.
 */
export function SampleDashboard({
  viz = null,
  initialDetail = false,
  initialEbitda = null,
  failedReason = null,
  staleSince = null,
}: {
  viz?: VizId | null;
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
      <div className="home-intro">
        {viz ? <VizStrip id={viz} /> : null}
        <header className="home-top">
          <div className="home-greeting-block">
            <h1 className="home-greeting">How much headroom can we rely on?</h1>
          </div>
          <a className="home-quiet-link" href="/dev/sample?screen=covenants">
            Read the clause
          </a>
        </header>
      </div>

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
            <h2 className="home-eyebrow">Covenants at risk</h2>
            <p className="home-kpi-value">
              <CountUp text="1" />
            </p>
            <p className="home-kpi-caption">
              <StatusBadge status="REVIEW_REQUIRED" />
            </p>
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
                  <span className="facility-name">Revolver</span>
                  <span className="facility-amt">$100 million</span>
                  <span className="facility-pct">50%</span>
                </li>
                <li>
                  <span className="sample-dot" style={{ background: "var(--chart-2)" }} />
                  <span className="facility-name">Term loan</span>
                  <span className="facility-amt">$70 million</span>
                  <span className="facility-pct">35%</span>
                </li>
                <li>
                  <span className="sample-dot" style={{ background: "var(--chart-3)" }} />
                  <span className="facility-name">Other</span>
                  <span className="facility-amt">$30 million</span>
                  <span className="facility-pct">15%</span>
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
                    <th scope="col">Status</th>
                    <th scope="col" className="num">
                      Headroom
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_ROWS.slice(0, 5).map((item) => (
                    <tr key={item.covenant}>
                      <td className="covenant-cell">
                        <button type="button" className="covenant-name" title={item.covenant} onClick={() => setPanel(rowPanel(item))}>
                          {item.covenant}
                        </button>
                        <span className="covenant-meta" title={item.facility}>
                          {item.facility}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={item.status} />
                      </td>
                      <td className="num">{item.headroom}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="home-stack">
          <section className="home-card" aria-label="Top headroom drivers">
            <h2 className="home-eyebrow">Top headroom drivers</h2>
            <ul className="driver-feed">
              {DRIVERS.slice(0, 5).map((item) => (
                <li key={item.name}>
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
                  <span className="driver-amt">{item.amount}</span>
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

const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const HEADROOM_M = [48, 54, 52, 66, 74, 86] as const;
const UTIL_PCT = [44, 48, 50, 52, 55, 57] as const;

function Plot() {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const height = 200;
  const left = 44;
  const right = 36;
  const top = 10;
  const bottom = 26;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const yMin = 40;
  const yMax = 100;
  const yOf = (value: number) => top + ((yMax - value) / (yMax - yMin)) * innerH;
  const xOf = (index: number) => left + (index / (MONTHS.length - 1)) * innerW;
  const headroom = HEADROOM_M.map((value, index) => `${xOf(index)},${yOf(value)}`).join(" ");
  const utilization = UTIL_PCT.map((value, index) => `${xOf(index)},${yOf(value)}`).join(" ");
  const baseline = yOf(yMin);

  function hoverAt(event: MouseEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    const index = Math.round(((local.x - left) / innerW) * (MONTHS.length - 1));
    setHover(Math.max(0, Math.min(MONTHS.length - 1, index)));
  }

  return (
    <div className="sample-plot" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sample headroom and utilization lines">
        {[100, 80, 60, 40].map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={yOf(tick)} y2={yOf(tick)} stroke="var(--chart-track)" strokeWidth="1" />
            <text x={left - 8} y={yOf(tick) + 3} textAnchor="end" fill="var(--shell-muted)" fontSize="11">
              ${tick}
            </text>
          </g>
        ))}
        <line x1={left} x2={width - right} y1={baseline} y2={baseline} stroke="var(--shell-line)" strokeWidth="1.25" />
        <polyline points={utilization} fill="none" stroke="var(--chart-4)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={headroom} fill="none" stroke="var(--chart-1)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {MONTHS.map((month, index) => (
          <text key={month} x={xOf(index)} y={height - 6} textAnchor="middle" fill="var(--shell-muted)" fontSize="11">
            {month}
          </text>
        ))}
        {hover != null ? <line x1={xOf(hover)} x2={xOf(hover)} y1={top} y2={baseline} stroke="var(--shell-line)" strokeWidth="1" /> : null}
        <rect x={left} y={top} width={innerW} height={innerH} fill="transparent" onMouseMove={hoverAt} />
      </svg>
      {hover != null ? (
        <p
          className="chart-tip"
          style={{
            left: `${(xOf(hover) / width) * 100}%`,
            transform: hover >= MONTHS.length - 2 ? "translateX(-100%)" : hover === 0 ? "translateX(0)" : "translateX(-50%)",
          }}
        >
          {MONTHS[hover]} · Headroom ${HEADROOM_M[hover]} million · Utilization {UTIL_PCT[hover]}%
        </p>
      ) : null}
    </div>
  );
}
