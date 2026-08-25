import { Card, Chip } from "@/components/ui";
import { getCompany, getCovenantData, getFeedQueueItems, getLedgerEntries } from "@/lib/coherent";
import { fmtDate, fmtM } from "@/lib/format";
import type { FeedQueueLedgerPayload, FeedQueueSnapshotPayload } from "@/prisma/seed-data";
import { approveFeedItem, dismissFeedItem } from "./actions";

export const metadata = { title: "Headroom — Feeds" };
// Vercel deployment fix: see app/page.tsx's identical comment - this page
// queries Prisma directly with no dynamic route segment above it.
export const dynamic = "force-dynamic";

const IGNORED_SOURCES = new Set(["manual", "Simulate tab", "illustrative test fixture"]);

const SNAPSHOT_FIELD_LABELS: Record<keyof Omit<FeedQueueSnapshotPayload, "asOfDate" | "notes">, string> = {
  ebitda: "EBITDA",
  cash: "Unrestricted cash",
  interestExpense: "Interest expense",
  cumulativeNetIncome: "CNI since issue",
  equityProceedsSinceIssue: "Equity proceeds since issue",
  assumedNewDebtRatePct: "Assumed new-debt coupon",
  totalDebt: "Total debt",
  securedDebt: "Secured debt",
};

function SnapshotDiff({
  payload,
  current,
}: {
  payload: FeedQueueSnapshotPayload;
  current: Awaited<ReturnType<typeof getCovenantData>>["financials"];
}) {
  const rows = (Object.keys(SNAPSHOT_FIELD_LABELS) as (keyof typeof SNAPSHOT_FIELD_LABELS)[])
    .filter((key) => payload[key] !== undefined)
    .map((key) => {
      const from = current[key];
      const to = payload[key] as number;
      const isPct = key === "assumedNewDebtRatePct";
      return {
        label: SNAPSHOT_FIELD_LABELS[key],
        from: isPct ? `${from}%` : fmtM(from),
        to: isPct ? `${to}%` : fmtM(to),
        changed: from !== to,
      };
    });
  return (
    <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span className="muted">{r.label}</span>
          <span className="mono">
            {r.changed ? (
              <>
                {r.from} <span className="muted">→</span> <b>{r.to}</b>
              </>
            ) : (
              r.from
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function FeedsPage() {
  const [company, entries, queueItems, data] = await Promise.all([
    getCompany(),
    getLedgerEntries(),
    getFeedQueueItems(),
    getCovenantData(),
  ]);
  const appliedFromFilings = entries.filter((e) => e.source && !IGNORED_SOURCES.has(e.source));
  const pending = queueItems.filter((i) => i.status === "PENDING");
  const resolved = queueItems.filter((i) => i.status !== "PENDING").sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0));

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
        <div className="field-label" style={{ margin: "2px 2px 8px" }}>Needs review · {pending.length}</div>
        {pending.length === 0 ? (
          <Card>
            <div className="muted" style={{ fontSize: 14 }}>
              Queue clear. New filings land here for sign-off before touching the model — approving one writes a
              real FinancialSnapshot or LedgerEntry row to Postgres; dismissing one just closes it out with no
              effect on Position/Simulate.
            </div>
          </Card>
        ) : (
          <div className="stack">
            {pending.map((item) => (
              <Card key={item.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <div className="card-title" style={{ marginBottom: 0 }}>{item.title}</div>
                  <Chip tone="tight">pending</Chip>
                </div>
                <div className="card-subtitle" style={{ marginBottom: 0 }}>{item.description}</div>
                <div className="row-note" style={{ marginTop: 4 }}>
                  <span className="mono">{fmtDate(item.filedDate)}</span> · {item.source}
                </div>

                {item.kind === "SNAPSHOT_UPDATE" ? (
                  <SnapshotDiff payload={item.payload as unknown as FeedQueueSnapshotPayload} current={data.financials} />
                ) : (
                  (() => {
                    const payload = item.payload as unknown as FeedQueueLedgerPayload;
                    return (
                      <div style={{ marginTop: 8, fontSize: 13 }}>
                        New ledger entry: <b>{payload.description}</b> ·{" "}
                        {payload.direction === "CREDIT" ? "+" : "−"}
                        {fmtM(Math.abs(payload.amount))} ({payload.basket})
                      </div>
                    );
                  })()
                )}

                <div className="button-row" style={{ marginTop: 14 }}>
                  <form action={approveFeedItem.bind(null, item.id)}>
                    <button type="submit" className="button-primary" style={{ border: "none" }}>
                      Approve — apply to model
                    </button>
                  </form>
                  <form action={dismissFeedItem.bind(null, item.id)}>
                    <button type="submit" className="button">Dismiss</button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <Card>
          <div className="card-title" style={{ marginBottom: 6 }}>Recently reviewed</div>
          {resolved.map((item) => (
            <div key={item.id} className="row">
              <div>
                <div className="row-label">{item.title}</div>
                <div className="row-note">
                  <span className="mono">{item.resolvedAt ? fmtDate(item.resolvedAt) : ""}</span> · {item.source}
                </div>
              </div>
              <Chip tone={item.status === "APPLIED" ? "pass" : "idle"}>{item.status.toLowerCase()}</Chip>
            </div>
          ))}
        </Card>
      )}

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
