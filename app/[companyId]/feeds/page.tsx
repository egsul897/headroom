import { Card, Chip } from "@/components/ui";
import { getCompany, getCovenantData, getLedgerEntries } from "@/lib/coherent";
import { fmtDate, fmtM } from "@/lib/format";
import { loadFeedsConnectedSources, loadFeedsReviewQueue } from "@/lib/feeds/load";
import type { FeedQueuePendingItem } from "@/lib/feeds/load-state";
import type { FeedQueueLedgerPayload, FeedQueueSnapshotPayload } from "@/prisma/seed-data";
import { approveFeedItem, dismissFeedItem } from "./actions";
import { FeedsView } from "./FeedsView";

export const metadata = { title: "Headroom — Feeds" };

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

function SnapshotDiff({ payload, current }: { payload: FeedQueueSnapshotPayload; current: Awaited<ReturnType<typeof getCovenantData>>["financials"] }) {
  const rows = (Object.keys(SNAPSHOT_FIELD_LABELS) as (keyof typeof SNAPSHOT_FIELD_LABELS)[])
    .filter((key) => payload[key] !== undefined)
    .map((key) => {
      const from = current[key];
      const to = payload[key] as number;
      const isPct = key === "assumedNewDebtRatePct";
      return { label: SNAPSHOT_FIELD_LABELS[key], from: isPct ? `${from}%` : fmtM(from), to: isPct ? `${to}%` : fmtM(to), changed: from !== to };
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

function PendingItem({ companyId, item, data }: { companyId: string; item: FeedQueuePendingItem; data: Awaited<ReturnType<typeof getCovenantData>> | null }) {
  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {item.title}
        </div>
        <Chip tone="tight">pending</Chip>
      </div>
      <div className="card-subtitle" style={{ marginBottom: 0 }}>
        {item.description}
      </div>
      <div className="row-note" style={{ marginTop: 4 }}>
        <span className="mono">{fmtDate(item.filedDate)}</span> · {item.source}
      </div>

      {item.kind === "SNAPSHOT_UPDATE" && data ? (
        <SnapshotDiff payload={item.payload as FeedQueueSnapshotPayload} current={data.financials} />
      ) : item.kind === "LEDGER_ENTRY" ? (
        (() => {
          const payload = item.payload as FeedQueueLedgerPayload;
          return (
            <div style={{ marginTop: 8, fontSize: 13 }}>
              New ledger entry: <b>{payload.description}</b> · {payload.direction === "CREDIT" ? "+" : "−"}
              {fmtM(Math.abs(payload.amount))} ({payload.basket})
            </div>
          );
        })()
      ) : null}

      <div className="button-row" style={{ marginTop: 14 }}>
        <form action={approveFeedItem.bind(null, companyId, item.id)}>
          <button type="submit" className="button-primary" style={{ border: "none" }}>
            Approve — apply to model
          </button>
        </form>
        <form action={dismissFeedItem.bind(null, companyId, item.id)}>
          <button type="submit" className="button">
            Dismiss
          </button>
        </form>
      </div>
    </Card>
  );
}

/**
 * Feeds review queue. Connected sources and the verified-empty queue sentence
 * render only from load state. A registry count is not a probe. A failed
 * queue read stays UNKNOWN. The verified-empty sentence is minted only after
 * getFeedQueueItems succeeds with zero PENDING items.
 *
 * IMPLEMENTED ≠ CERTIFIED.
 */
export default async function FeedsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  await getCompany(companyId);
  const [entries, queue, sources, data] = await Promise.all([
    getLedgerEntries(companyId).catch(() => null),
    loadFeedsReviewQueue(companyId),
    loadFeedsConnectedSources(companyId),
    getCovenantData(companyId).catch(() => null),
  ]);
  const appliedFromFilings = (entries ?? []).filter((e) => e.source && !IGNORED_SOURCES.has(e.source));
  const ledgerLoaded = entries !== null;

  return (
    <div className="stack">
      <FeedsView sources={sources} queue={queue} renderPending={(item) => <PendingItem companyId={companyId} item={item} data={data} />} />

      {ledgerLoaded && appliedFromFilings.length > 0 && (
        <Card>
          <div className="card-title" style={{ marginBottom: 6 }}>
            Applied from filings
          </div>
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
