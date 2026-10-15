import { StatusBadge } from "@/components/StatusBadge";

/**
 * Illustration of the dashboard grid. Every figure is sample copy.
 * Production overview never imports this module.
 */
export function SampleDashboard() {
  return (
    <div className="home-overview">
      <header className="home-top">
        <div className="home-greeting-block">
          <h1 className="home-greeting">Sample overview</h1>
          <p className="home-greeting-sub">Illustrative figures for layout. Not a company result.</p>
        </div>
        <div className="home-top-actions">
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
          <p className="home-kpi-value home-kpi-value-hero">$86 million</p>
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
            <div className="home-util-ring" style={{ background: "conic-gradient(#3a8a98 0deg 194deg, #dcebed 194deg 360deg)" }} aria-hidden="true">
              <div className="home-util-ring-hole">
                <span className="home-util-pct">54%</span>
              </div>
            </div>
            <p className="home-kpi-caption">Sample used against a sample cap.</p>
          </div>
        </section>
        <section className="home-card" aria-label="Covenants at risk">
          <h2 className="home-eyebrow">Covenants at risk</h2>
          <p className="home-kpi-value home-kpi-value-hero">1</p>
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
              <polyline fill="none" stroke="#3a8a98" strokeWidth="2.5" points="20,140 80,120 140,128 200,90 260,100 320,70 380,78 440,48 500,55 580,30" />
              <polyline fill="none" stroke="#7eb4be" strokeWidth="2" points="20,150 80,146 140,148 200,140 260,138 320,132 380,130 440,124 500,120 580,112" />
            </svg>
          </div>
          <p className="home-kpi-caption">Sample lines. Not a history load.</p>
        </section>
        <section className="home-card" aria-label="Capacity summary">
          <h2 className="home-eyebrow">Capacity summary</h2>
          <div className="home-capacity">
            <div
              className="home-capacity-donut"
              style={{ background: "conic-gradient(#1a5560 0% 55%, #3a8a98 55% 82%, #7eb4be 82% 100%)" }}
              aria-hidden="true"
            >
              <div className="home-capacity-donut-hole">
                <span className="home-capacity-total">$160 million</span>
                <span className="home-capacity-total-label">Sample total</span>
              </div>
            </div>
            <ul className="home-capacity-legend">
              <li>
                <span className="home-capacity-swatch" style={{ background: "#1a5560" }} />
                <span className="home-capacity-name">Sample revolver</span>
                <span className="home-capacity-amt">$88 million (55%)</span>
              </li>
              <li>
                <span className="home-capacity-swatch" style={{ background: "#3a8a98" }} />
                <span className="home-capacity-name">Sample term loan</span>
                <span className="home-capacity-amt">$43 million (27%)</span>
              </li>
              <li>
                <span className="home-capacity-swatch" style={{ background: "#7eb4be" }} />
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
                <tr>
                  <td>Sample maintenance covenant</td>
                  <td>Sample agreement §7.01</td>
                  <td>
                    <StatusBadge status="NEEDS_INPUT" />
                  </td>
                  <td className="num">Not evaluated</td>
                  <td>Unknown</td>
                  <td>Sample date</td>
                </tr>
                <tr>
                  <td>Sample indebtedness covenant</td>
                  <td>Sample agreement §6.04</td>
                  <td>
                    <StatusBadge status="DISCOVERED" />
                  </td>
                  <td className="num">$40 million sample</td>
                  <td>Unknown</td>
                  <td>Unknown</td>
                </tr>
                <tr>
                  <td>Sample restricted payment</td>
                  <td>Sample agreement §6.08</td>
                  <td>
                    <StatusBadge status="REVIEW_REQUIRED" />
                  </td>
                  <td className="num">Not evaluated</td>
                  <td>Unknown</td>
                  <td>Unknown</td>
                </tr>
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
            <li>Sample alert: a clause still needs a person.</li>
            <li>Sample alert: a document is discovered, not approved.</li>
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
    </div>
  );
}
