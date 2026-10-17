"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { CountUp } from "@/components/motion/CountUp";
import { DetailDrawer } from "@/components/motion/DetailDrawer";

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

/**
 * The sample answer to one question: how much headroom, and can anyone rely on it.
 * Charts, drivers, and a transaction feed are not on this page.
 */
export function SampleDashboard({ initialDetail = false }: { initialDetail?: boolean }) {
  const [row, setRow] = useState<number | null>(initialDetail ? 0 : null);
  const open = row == null ? null : SAMPLE_ROWS[row];

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

      <div className="home-answer">
        <div className="home-hero">
          <section className="home-card" aria-label="Total Headroom">
            <h2 className="home-eyebrow">Headroom</h2>
            <p className="home-kpi-value home-kpi-value-hero">
              <CountUp text="$86 million" />
            </p>
            <p className="home-kpi-caption">Sample incremental. Not a certified path, and not from the engine.</p>
          </section>
        </div>
        <div className="home-facts">
          <section className="home-card" aria-label="Utilization">
            <h2 className="home-eyebrow">Utilization</h2>
            <p className="home-kpi-value">
              <CountUp text="54%" />
            </p>
            <p className="home-kpi-caption">Sample used against a sample cap.</p>
          </section>
          <section className="home-card" aria-label="Covenants at risk">
            <h2 className="home-eyebrow">Needs a person</h2>
            <p className="home-kpi-value">
              <CountUp text="1" />
            </p>
            <p className="home-kpi-caption">
              <StatusBadge status="REVIEW_REQUIRED" />
            </p>
          </section>
          <section className="home-card" aria-label="Next test">
            <h2 className="home-eyebrow">Next test</h2>
            <p className="home-kpi-value home-kpi-value-sm">Dec 31, 2024</p>
            <p className="home-kpi-caption">Sample date. Not a calendar.</p>
          </section>
        </div>
      </div>

      <section className="home-card" aria-label="Headroom status">
        <h2 className="home-eyebrow">What the sample documents say</h2>
        <div className="home-table-wrap">
          <table className="home-table">
            <thead>
              <tr>
                <th scope="col">Covenant</th>
                <th scope="col">Document</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">
                  Headroom
                </th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <DetailDrawer open={open != null} title={open?.covenant ?? "Detail"} onClose={() => setRow(null)}>
        {open ? (
          <dl className="drawer-facts">
            <div>
              <dt>Document</dt>
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
        <p className="drawer-note">The same sample row. No new page, and no company result.</p>
      </DetailDrawer>
    </div>
  );
}
