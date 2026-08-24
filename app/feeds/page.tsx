import { Card, Chip } from "@/components/ui";
import { getCompany, getLedgerEntries } from "@/lib/coherent";
import { fmtDate, fmtM } from "@/lib/format";

export const metadata = { title: "Headroom — Feeds" };

const IGNORED_SOURCES = new Set(["manual", "Simulate tab"]);

export default async function FeedsPage() {
  const [company, entries] = await Promise.all([getCompany(), getLedgerEntries()]);
  const appliedFromFilings = entries.filter((e) => e.source && !IGNORED_SOURCES.has(e.source));

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Connected sources</div>
        <div className="card-subtitle">
          In production this pulls from the company&apos;s own ERP, bank feeds, and agent notices. For a
          public-company proof point it pulls from EDGAR instead — same review-queue mechanic, just a different
          upstream.
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {[
            { name: `SEC EDGAR — ${company.name} (CIK ${company.cik})`, role: "10-K / 10-Q / 8-K filings" },
            { name: "XBRL financial facts", role: "Structured balance sheet & income statement tags" },
          ].map((c) => (
            <div
              key={c.name}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                border: "1px solid var(--line)",
                borderRadius: 6,
                padding: "10px 12px",
                background: "#fcfbf8",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--green)", display: "inline-block" }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                  <div className="row-note">{c.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div>
        <div className="field-label" style={{ margin: "2px 2px 8px" }}>Needs review · 0</div>
        <Card>
          <div className="muted" style={{ fontSize: 14 }}>
            Queue clear. This deployment reads {company.name}&apos;s financials and covenant provisions directly
            from covenant_provisions/financial_snapshots in Postgres, so there&apos;s no pending filing queue to
            show yet — new filings would land here for sign-off before touching the model.
          </div>
        </Card>
      </div>

      {appliedFromFilings.length > 0 && (
        <Card>
          <div className="card-title" style={{ marginBottom: 6 }}>Applied from filings</div>
          {appliedFromFilings.map((e) => (
            <div key={e.id} className="row">
              <div>
                <div className="row-label">{e.description}</div>
                <div className="row-note">
                  <span className="mono">{fmtDate(e.date)}</span> · {e.source}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="mono row-value">
                  {e.direction === "CREDIT" ? "+" : "−"}
                  {fmtM(Math.abs(Number(e.amount)))}
                </span>
                <Chip tone="pass">applied</Chip>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
