/**
 * P3-IAF1 adversarial suite. Feeds buyer surfaces must not invent a healthy
 * connection or a clear queue.
 *
 * UNKNOWN / NOT_LOADED ≠ VERIFIED_EMPTY ≠ VERIFIED_CONNECTED / VERIFIED_POPULATED.
 * Queue clear is reachable only after a successful queue read with zero PENDING.
 * Green connected marks are reachable only from a probe-minted state.
 * Zero provider calls.
 *
 * Product LOCK sha256: 9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04
 * IMPLEMENTED ≠ CERTIFIED.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedsView } from "../../app/[companyId]/feeds/FeedsView";
import { getFeedQueueItems } from "@/lib/coherent";
import { FEEDS_UNKNOWN, FEEDS_VERIFIED_EMPTY, resolveFeedsCopy } from "../../lib/feeds/copy";
import { loadFeedsConnectedSources, loadFeedsReviewQueue } from "../../lib/feeds/load";
import { prisma } from "@/lib/prisma";
import {
  NOT_LOADED_STATE,
  UNKNOWN_STATE,
  UNWIRED_FEEDS_LOAD,
  connectedSourcesStateFromProbe,
  connectedSourcesStateFromRegistry,
  connectedSourcesStateFromSuccessfulRead,
  hasFeedsQueryAuthority,
  presentConnectedSources,
  presentReviewQueue,
  reviewQueueStateFromQuery,
  reviewQueueStateFromSuccessfulRead,
  type ConnectedSourcesLoadState,
  type FeedQueueQueryItem,
  type ReviewQueueLoadState,
} from "../../lib/feeds/load-state";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    companySourceConnection: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/coherent", () => ({
  getFeedQueueItems: vi.fn(),
}));

const ROOT = path.resolve(__dirname, "../..");

const countMock = prisma.companySourceConnection.count as unknown as ReturnType<typeof vi.fn>;
const queueMock = getFeedQueueItems as unknown as ReturnType<typeof vi.fn>;

const INVENT_HEALTHY = ["SEC EDGAR", "XBRL", "var(--green)"] as const;

function feedsHtml(sources: ConnectedSourcesLoadState, queue: ReviewQueueLoadState) {
  return renderToStaticMarkup(<FeedsView sources={sources} queue={queue} />);
}

function pendingItem(overrides: Partial<FeedQueueQueryItem> = {}): FeedQueueQueryItem {
  return {
    id: "item-1",
    title: "10-Q filed",
    description: "Quarterly figures.",
    source: "10-Q",
    filedDate: new Date("2026-11-10T00:00:00.000Z"),
    kind: "LEDGER_ENTRY",
    payload: { description: "draw", amount: 10, direction: "DEBIT", basket: "general" },
    status: "PENDING",
    ...overrides,
  };
}

function lie<T>(value: object): T {
  return value as unknown as T;
}

/** Type-level guard. Bare literals must not satisfy verified Feeds states. */
function bareFeedsLiesDoNotCompile(): void {
  // @ts-expect-error boolean connected is not a query-authority token
  const sources: ConnectedSourcesLoadState = { kind: "VERIFIED_CONNECTED", connected: true, sources: [] };
  // @ts-expect-error bare VERIFIED_EMPTY is not a query-authority token
  const queue: ReviewQueueLoadState = { kind: "VERIFIED_EMPTY", resolved: [] };
  connectedSourcesStateFromProbe({
    probed: true,
    outcome: "connected",
    sources: [
      {
        name: "EDGAR",
        role: "filings",
        // @ts-expect-error probeOk false is not a healthy probe
        probeOk: false,
      },
    ],
  });
  void sources;
  void queue;
}

describe("Feeds invent-absence", () => {
  afterEach(() => {
    countMock.mockReset();
    queueMock.mockReset();
  });

  it("unwired, NOT_LOADED, and failed loads do not invent green or Queue clear", () => {
    bareFeedsLiesDoNotCompile();
    const cases: Array<[ConnectedSourcesLoadState, ReviewQueueLoadState]> = [
      [UNWIRED_FEEDS_LOAD.connectedSources, UNWIRED_FEEDS_LOAD.reviewQueue],
      [UNKNOWN_STATE, UNKNOWN_STATE],
      [NOT_LOADED_STATE, NOT_LOADED_STATE],
      [
        connectedSourcesStateFromRegistry({ queried: true, outcome: "failed" }),
        reviewQueueStateFromQuery({ queried: true, outcome: "failed" }),
      ],
      [
        connectedSourcesStateFromRegistry({ queried: true, outcome: "skipped" }),
        reviewQueueStateFromQuery({ queried: true, outcome: "skipped" }),
      ],
      [
        connectedSourcesStateFromRegistry({ queried: false }),
        reviewQueueStateFromQuery({ queried: false }),
      ],
    ];
    for (const [sources, queue] of cases) {
      const html = feedsHtml(sources, queue);
      expect(html).toContain(FEEDS_UNKNOWN.connectedSources.headline);
      expect(html).toContain(FEEDS_UNKNOWN.connectedSources.detail);
      expect(html).toContain(FEEDS_UNKNOWN.reviewQueue.headline);
      expect(html).toContain(FEEDS_UNKNOWN.reviewQueue.detail);
      expect(html).not.toContain("Queue clear");
      expect(html).not.toContain(FEEDS_VERIFIED_EMPTY.connectedSources.headline);
      expect(html).not.toContain("Needs review · 0");
      expect(html).not.toContain("data-queue-count");
      for (const phrase of INVENT_HEALTHY) {
        expect(html, phrase).not.toContain(phrase);
      }
      expect(html).toContain('data-slot="connectedSources"');
      expect(html).toContain('data-slot="reviewQueue"');
    }
    expect(htmlKind(feedsHtml(NOT_LOADED_STATE, NOT_LOADED_STATE), "reviewQueue")).toBe("NOT_LOADED");
    expect(htmlKind(feedsHtml(UNKNOWN_STATE, UNKNOWN_STATE), "reviewQueue")).toBe("UNKNOWN");
  });

  it("a forged verified-empty or verified-connected state renders UNKNOWN", () => {
    const forgedEmpty = lie<ReviewQueueLoadState>({ kind: "VERIFIED_EMPTY", authoritativeEmpty: true, resolved: [] });
    const forgedConnected = lie<ConnectedSourcesLoadState>({
      kind: "VERIFIED_CONNECTED",
      connected: true,
      sources: [{ name: "SEC EDGAR", role: "10-K / 10-Q / 8-K filings" }],
    });
    expect(presentReviewQueue(forgedEmpty).kind).toBe("UNKNOWN");
    expect(presentConnectedSources(forgedConnected).kind).toBe("UNKNOWN");
    expect(resolveFeedsCopy("reviewQueue", { kind: "VERIFIED_EMPTY", authority: true })).toEqual(FEEDS_UNKNOWN.reviewQueue);
    expect(resolveFeedsCopy("connectedSources", { kind: "VERIFIED_CONNECTED", authority: true })).toEqual(
      FEEDS_UNKNOWN.connectedSources,
    );
    const html = feedsHtml(forgedConnected, forgedEmpty);
    expect(html).not.toContain("Queue clear");
    expect(html).not.toContain("SEC EDGAR");
    expect(html).not.toContain("var(--green)");
    expect(html).toContain("Connection status not available yet");
    expect(html).toContain("Review queue not available yet");
    expect(html).toContain('data-load-kind="UNKNOWN" data-slot="connectedSources"');
    expect(html).toContain('data-load-kind="UNKNOWN" data-slot="reviewQueue"');
  });

  it("VERIFIED_EMPTY queue copy requires an EMPTY token from a successful zero-PENDING read", () => {
    expect(reviewQueueStateFromQuery({ queried: true, outcome: "populated", pending: [] }).kind).toBe("UNKNOWN");
    expect(reviewQueueStateFromQuery({ queried: true, outcome: "not_loaded" }).kind).toBe("NOT_LOADED");
    expect(reviewQueueStateFromQuery({ queried: false }).kind).not.toBe("VERIFIED_EMPTY");

    const empty = reviewQueueStateFromSuccessfulRead([]);
    expect(empty.kind).toBe("VERIFIED_EMPTY");
    if (empty.kind === "VERIFIED_EMPTY") {
      expect(hasFeedsQueryAuthority(empty.authority, "reviewQueue", "EMPTY")).toBe(true);
      expect(hasFeedsQueryAuthority(empty.authority, "reviewQueue", "POPULATED")).toBe(false);
      expect(hasFeedsQueryAuthority(empty.authority, "connectedSources", "EMPTY")).toBe(false);
    }
    const html = feedsHtml(UNKNOWN_STATE, empty);
    expect(html).toContain(FEEDS_VERIFIED_EMPTY.reviewQueue.detail);
    expect(html).toContain("Queue clear");
    expect(html).toContain('data-load-kind="VERIFIED_EMPTY" data-slot="reviewQueue"');
    expect(html).toContain('data-queue-count="0"');
    expect(html).toContain("Needs review · 0");
    expect(html).not.toContain("Review queue not available yet");
    expect(html).toContain("Connection status not available yet");
    expect(html).not.toContain("var(--green)");
  });

  it("a populated token relabelled VERIFIED_EMPTY does not paint Queue clear", () => {
    const populated = reviewQueueStateFromSuccessfulRead([pendingItem()]);
    expect(populated.kind).toBe("VERIFIED_POPULATED");
    if (populated.kind !== "VERIFIED_POPULATED") return;
    const relabelled = lie<ReviewQueueLoadState>({
      kind: "VERIFIED_EMPTY",
      authority: populated.authority,
      resolved: [],
    });
    expect(presentReviewQueue(relabelled).kind).toBe("UNKNOWN");
    const html = feedsHtml(UNKNOWN_STATE, relabelled);
    expect(html).not.toContain("Queue clear");
    expect(html).not.toContain("10-Q filed");
    expect(html).toContain("Review queue not available yet");
    expect(html).toContain('data-load-kind="UNKNOWN" data-slot="reviewQueue"');
  });

  it("a queue EMPTY token does not authorize connected sources, and a CONNECTED token does not authorize Queue clear", () => {
    const emptyQueue = reviewQueueStateFromSuccessfulRead([]);
    if (emptyQueue.kind !== "VERIFIED_EMPTY") return;
    const forgedSources = lie<ConnectedSourcesLoadState>({ kind: "VERIFIED_EMPTY", authority: emptyQueue.authority });
    expect(presentConnectedSources(forgedSources).kind).toBe("UNKNOWN");
    expect(resolveFeedsCopy("connectedSources", forgedSources)).toEqual(FEEDS_UNKNOWN.connectedSources);

    const probed = connectedSourcesStateFromProbe({
      probed: true,
      outcome: "connected",
      sources: [{ name: "Registry row", role: "Documents", probeOk: true }],
    });
    if (probed.kind !== "VERIFIED_CONNECTED") return;
    const forgedQueue = lie<ReviewQueueLoadState>({ kind: "VERIFIED_EMPTY", authority: probed.authority, resolved: [] });
    expect(presentReviewQueue(forgedQueue).kind).toBe("UNKNOWN");
    const html = feedsHtml(forgedSources, forgedQueue);
    expect(html).not.toContain("Queue clear");
    expect(html).not.toContain("No sources on record");
    expect(html).not.toContain("var(--green)");
    expect(html).not.toContain("Registry row");
  });

  it("registry rows without a probe stay UNKNOWN and do not invent absence or a green mark", () => {
    for (const recordCount of [0, 1, 2]) {
      const state = connectedSourcesStateFromRegistry({ queried: true, outcome: "not_probed", recordCount });
      expect(state.kind).toBe("UNKNOWN");
      const html = feedsHtml(state, UNKNOWN_STATE);
      expect(html).not.toContain("No sources on record");
      expect(html).not.toContain("var(--green)");
      expect(html).not.toContain("SEC EDGAR");
      expect(html).not.toContain("XBRL");
      expect(html).toContain("Not verified. A source stays unmarked until a probe confirms it.");
    }
    expect(connectedSourcesStateFromSuccessfulRead(2).kind).toBe("UNKNOWN");
    expect(connectedSourcesStateFromSuccessfulRead(0).kind).toBe("VERIFIED_EMPTY");
    expect(connectedSourcesStateFromSuccessfulRead(1.5).kind).toBe("UNKNOWN");
    expect(connectedSourcesStateFromSuccessfulRead(-1).kind).toBe("UNKNOWN");
    expect(connectedSourcesStateFromProbe({ probed: false }).kind).toBe("UNKNOWN");
    expect(connectedSourcesStateFromProbe({ probed: true, outcome: "failed" }).kind).toBe("UNKNOWN");
    expect(connectedSourcesStateFromProbe({ probed: true, outcome: "skipped" }).kind).toBe("UNKNOWN");
    expect(connectedSourcesStateFromProbe({ probed: true, outcome: "connected", sources: [] }).kind).toBe("UNKNOWN");
    const unhealthy = connectedSourcesStateFromProbe({
      probed: true,
      outcome: "connected",
      sources: [{ name: "Registry row", role: "Documents", probeOk: false as unknown as true }],
    });
    expect(unhealthy.kind).toBe("UNKNOWN");

    const verifiedEmpty = connectedSourcesStateFromSuccessfulRead(0);
    const emptyHtml = feedsHtml(verifiedEmpty, UNKNOWN_STATE);
    expect(emptyHtml).toContain("No sources on record");
    expect(emptyHtml).toContain("The latest connection load returned no sources.");
    expect(emptyHtml).toContain('data-load-kind="VERIFIED_EMPTY" data-slot="connectedSources"');
    expect(emptyHtml).not.toContain("var(--green)");
    expect(emptyHtml).not.toContain("Queue clear");
    if (verifiedEmpty.kind === "VERIFIED_EMPTY") {
      expect(hasFeedsQueryAuthority(verifiedEmpty.authority, "connectedSources", "EMPTY")).toBe(true);
      expect(hasFeedsQueryAuthority(verifiedEmpty.authority, "connectedSources", "CONNECTED")).toBe(false);
    }
  });

  it("a healthy probe mints VERIFIED_CONNECTED and is the only path that paints green", () => {
    const probed = connectedSourcesStateFromProbe({
      probed: true,
      outcome: "connected",
      sources: [{ name: "Registry row", role: "Documents", probeOk: true }],
    });
    expect(probed.kind).toBe("VERIFIED_CONNECTED");
    expect(presentConnectedSources(probed).kind).toBe("VERIFIED_CONNECTED");
    const html = feedsHtml(probed, reviewQueueStateFromQuery({ queried: true, outcome: "failed" }));
    expect(html).toContain("var(--green)");
    expect(html).toContain('data-source-health="verified"');
    expect(html).toContain('data-load-kind="VERIFIED_CONNECTED" data-slot="connectedSources"');
    expect(html).toContain("Registry row");
    expect(html).toContain("Documents");
    expect(html).not.toContain("Queue clear");
    expect(html).not.toContain("SEC EDGAR");
    expect(html).not.toContain("XBRL");
    expect(html).toContain("Review queue not available yet");
  });

  it("a successful read with PENDING items renders the queue and withholds Queue clear", () => {
    const reviewed = pendingItem({
      id: "done-1",
      title: "Reviewed filing",
      status: "APPLIED",
      resolvedAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    const state = reviewQueueStateFromSuccessfulRead([pendingItem(), reviewed]);
    expect(state.kind).toBe("VERIFIED_POPULATED");
    const html = feedsHtml(connectedSourcesStateFromSuccessfulRead(3), state);
    expect(html).toContain("10-Q filed");
    expect(html).toContain("Needs review · 1");
    expect(html).toContain('data-queue-count="1"');
    expect(html).toContain('data-load-kind="VERIFIED_POPULATED" data-slot="reviewQueue"');
    expect(html).toContain("Recently reviewed");
    expect(html).toContain("Reviewed filing");
    expect(html).not.toContain("Queue clear");
    expect(html).not.toContain("var(--green)");
    expect(html).toContain("Connection status not available yet");
  });

  it("resolved rows from a successful empty pending read still show, and a failed read shows neither", () => {
    const clear = reviewQueueStateFromSuccessfulRead([
      pendingItem({
        id: "done-1",
        title: "Reviewed filing",
        status: "DISMISSED",
        resolvedAt: new Date("2026-10-02T00:00:00.000Z"),
      }),
    ]);
    const clearHtml = feedsHtml(UNKNOWN_STATE, clear);
    expect(clearHtml).toContain("Queue clear");
    expect(clearHtml).toContain("Recently reviewed");
    expect(clearHtml).toContain("Reviewed filing");

    const failedHtml = feedsHtml(UNKNOWN_STATE, reviewQueueStateFromQuery({ queried: true, outcome: "failed" }));
    expect(failedHtml).not.toContain("Recently reviewed");
    expect(failedHtml).not.toContain("Reviewed filing");
    expect(failedHtml).not.toContain("Queue clear");
  });

  it("UNKNOWN copy does not assert absence, and source files do not hard-code a green invent", () => {
    const unknown = Object.values(FEEDS_UNKNOWN)
      .map((slot) => `${slot.headline}\n${slot.detail}`)
      .join("\n");
    expect(unknown).not.toContain("Queue clear");
    expect(unknown).not.toContain("No sources on record");
    expect(unknown).not.toContain("SEC EDGAR");
    expect(unknown).not.toContain("XBRL");
    expect(unknown).not.toContain("var(--green)");
    expect(FEEDS_VERIFIED_EMPTY.reviewQueue.detail.startsWith("Queue clear.")).toBe(true);

    const files = [
      "app/[companyId]/feeds/page.tsx",
      "app/[companyId]/feeds/FeedsView.tsx",
      "lib/feeds/load.ts",
      "lib/feeds/load-state.ts",
    ];
    for (const file of files) {
      const text = readFileSync(path.join(ROOT, file), "utf8");
      expect(text, file).not.toContain("SEC EDGAR");
      expect(text, file).not.toContain("XBRL");
      expect(text, file).not.toContain("lib/home/load-state");
      expect(text, file).not.toContain("Queue clear");
    }
    const page = readFileSync(path.join(ROOT, "app/[companyId]/feeds/page.tsx"), "utf8");
    expect(page).not.toContain("var(--green)");
    expect(page).not.toMatch(/pending\.length\s*===\s*0/);
    expect(page).toContain("loadFeedsReviewQueue");
    expect(page).toContain("loadFeedsConnectedSources");
    expect(page).toContain("FeedsView");
    expect(page).toContain("approveFeedItem");
    expect(page).toContain("dismissFeedItem");

    const view = readFileSync(path.join(ROOT, "app/[companyId]/feeds/FeedsView.tsx"), "utf8");
    expect(view.match(/var\(--green\)/g)?.length).toBe(1);
    expect(view).toContain("presentConnectedSources");
    expect(view).toContain("presentReviewQueue");

    const load = readFileSync(path.join(ROOT, "lib/feeds/load.ts"), "utf8");
    expect(load).not.toMatch(/edgar-connector|csv-financial-connector|upload-connector|healthCheck/);
    expect(load).not.toContain("connectedSourcesStateFromProbe");
    expect(load).toContain('outcome: "failed"');
    expect(load).toContain("reviewQueueStateFromSuccessfulRead");

    const copy = readFileSync(path.join(ROOT, "lib/feeds/copy.ts"), "utf8");
    expect(copy).toContain("9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04");
    expect(copy).toContain("UNKNOWN ≠ VERIFIED_EMPTY");
    expect(copy).toContain("IMPLEMENTED ≠ CERTIFIED");
  });

  it("loaders map query results without calling a provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("provider fetch blocked"));

    try {
      countMock.mockResolvedValue(0);
      queueMock.mockRejectedValue(new Error("queue read failed"));
      const failedQueueHtml = feedsHtml(await loadFeedsConnectedSources("co"), await loadFeedsReviewQueue("co"));
      expect(failedQueueHtml).toContain("No sources on record");
      expect(failedQueueHtml).not.toContain("Queue clear");
      expect(failedQueueHtml).toContain("Review queue not available yet");
      expect(failedQueueHtml).not.toContain("var(--green)");
      expect(queueMock).toHaveBeenCalledWith("co");
      expect(countMock).toHaveBeenCalledWith({ where: { companyId: "co" } });

      countMock.mockResolvedValue(2);
      queueMock.mockResolvedValue([]);
      const unprobedHtml = feedsHtml(await loadFeedsConnectedSources("co"), await loadFeedsReviewQueue("co"));
      expect(unprobedHtml).toContain("Connection status not available yet");
      expect(unprobedHtml).not.toContain("No sources on record");
      expect(unprobedHtml).toContain("Queue clear");
      expect(unprobedHtml).not.toContain("var(--green)");
      expect(unprobedHtml).not.toContain("SEC EDGAR");

      countMock.mockRejectedValue(new Error("registry read failed"));
      queueMock.mockResolvedValue([pendingItem()]);
      const failedSourcesHtml = feedsHtml(await loadFeedsConnectedSources("co"), await loadFeedsReviewQueue("co"));
      expect(failedSourcesHtml).toContain("Connection status not available yet");
      expect(failedSourcesHtml).not.toContain("No sources on record");
      expect(failedSourcesHtml).toContain("10-Q filed");
      expect(failedSourcesHtml).not.toContain("Queue clear");
      expect(failedSourcesHtml).not.toContain("var(--green)");

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

function htmlKind(html: string, slot: string): string | undefined {
  const match = html.match(new RegExp(`data-load-kind="([^"]+)" data-slot="${slot}"`));
  return match?.[1];
}
