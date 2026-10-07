import { Fragment, type ReactNode } from "react";
import { Card, Chip } from "@/components/ui";
import { FEEDS_VERIFIED_EMPTY, resolveFeedsCopy } from "@/lib/feeds/copy";
import { fmtDate } from "@/lib/format";
import {
  presentConnectedSources,
  presentReviewQueue,
  type ConnectedSourcesLoadState,
  type FeedQueuePendingItem,
  type ReviewQueueLoadState,
} from "@/lib/feeds/load-state";

/**
 * Buyer surfaces for Connected sources and the review queue.
 * present* runs before any verified copy or green mark. UNKNOWN and
 * NOT_LOADED render the not-available / not-verified strings.
 */
export function FeedsView({
  sources,
  queue,
  renderPending,
}: {
  sources: ConnectedSourcesLoadState;
  queue: ReviewQueueLoadState;
  renderPending?: (item: FeedQueuePendingItem) => ReactNode;
}) {
  const sourcesPresented = presentConnectedSources(sources);
  const sourcesCopy = resolveFeedsCopy("connectedSources", sourcesPresented);
  const queuePresented = presentReviewQueue(queue);
  const queueCopy = resolveFeedsCopy("reviewQueue", queuePresented);
  const queueCount =
    queuePresented.kind === "VERIFIED_POPULATED"
      ? queuePresented.pending.length
      : queuePresented.kind === "VERIFIED_EMPTY"
        ? 0
        : null;

  return (
    <>
      <Card>
        <div className="card-title">Connected sources</div>
        <div className="card-subtitle">Status follows the latest connection load for this company.</div>
        {sourcesPresented.kind === "VERIFIED_CONNECTED" ? (
          <div style={{ display: "grid", gap: 8 }} data-load-kind="VERIFIED_CONNECTED" data-slot="connectedSources">
            {sourcesPresented.sources.map((source, index) => (
              <div
                key={`${index}-${source.name}`}
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
                  <span
                    data-source-health="verified"
                    style={{ width: 8, height: 8, borderRadius: 4, background: "var(--green)", display: "inline-block" }}
                  />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{source.name}</div>
                    <div className="row-note">{source.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div data-load-kind={sourcesPresented.kind} data-slot="connectedSources">
            <div style={{ fontSize: 14, fontWeight: 600 }}>{sourcesCopy.headline}</div>
            <div className="row-note">{sourcesCopy.detail}</div>
          </div>
        )}
      </Card>

      <div>
        <div
          className="field-label"
          style={{ margin: "2px 2px 8px" }}
          data-slot="reviewQueueCount"
          data-load-kind={queuePresented.kind}
          {...(queueCount === null ? {} : { "data-queue-count": queueCount })}
        >
          {queueCount === null ? "Needs review" : `Needs review · ${queueCount}`}
        </div>
        {queuePresented.kind === "VERIFIED_POPULATED" ? (
          <div className="stack" data-load-kind="VERIFIED_POPULATED" data-slot="reviewQueue">
            {queuePresented.pending.map((item) =>
              renderPending ? (
                <Fragment key={item.id}>{renderPending(item)}</Fragment>
              ) : (
                <Card key={item.id}>
                  <div className="card-title" style={{ marginBottom: 0 }}>
                    {item.title}
                  </div>
                  <div className="card-subtitle" style={{ marginBottom: 0 }}>
                    {item.description}
                  </div>
                  <div className="row-note" style={{ marginTop: 4 }}>
                    <span className="mono">{fmtDate(item.filedDate)}</span> · {item.source}
                  </div>
                </Card>
              ),
            )}
          </div>
        ) : (
          <Card>
            <div className="muted" style={{ fontSize: 14 }} data-load-kind={queuePresented.kind} data-slot="reviewQueue">
              {queuePresented.kind === "VERIFIED_EMPTY" ? (
                queueCopy.detail
              ) : (
                <>
                  <div>{queueCopy.headline}</div>
                  <div>{queueCopy.detail}</div>
                </>
              )}
            </div>
          </Card>
        )}
      </div>

      {(queuePresented.kind === "VERIFIED_EMPTY" || queuePresented.kind === "VERIFIED_POPULATED") &&
        queuePresented.resolved.length > 0 && (
          <Card>
            <div className="card-title" style={{ marginBottom: 6 }}>
              Recently reviewed
            </div>
            {queuePresented.resolved.map((item) => (
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
    </>
  );
}

/** Visible verified-empty queue sentence. Tests and the view share this string. */
export const FEEDS_QUEUE_CLEAR_COPY = FEEDS_VERIFIED_EMPTY.reviewQueue.detail;
