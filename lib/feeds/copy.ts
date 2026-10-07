/**
 * Feeds buyer copy. UNKNOWN ≠ VERIFIED_EMPTY.
 *
 * FEEDS_UNKNOWN is the not-available / not-verified table. Use it when the
 * slot is unwired, not loaded, not probed, or the load failed.
 * FEEDS_VERIFIED_EMPTY is reachable only from a verified-empty load state
 * after an authoritative query. A green connected row is not copy from this
 * table; the view paints it only from a probe-minted VERIFIED_CONNECTED state.
 *
 * Product LOCK sha256: 9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04
 * Plan sha256: 0367c5245078518a998947687267c4b08b4fd0bec2c8751f0daf6259c2f56dcf
 * IMPLEMENTED ≠ CERTIFIED.
 */

import { hasFeedsQueryAuthority } from "@/lib/feeds/load-state";

export interface FeedsSlotCopy {
  headline: string;
  detail: string;
}

/** Buyer UI while the authoritative source is unwired, not loaded, not probed, or failed. */
export const FEEDS_UNKNOWN = {
  connectedSources: {
    headline: "Connection status not available yet",
    detail: "Not verified. A source stays unmarked until a probe confirms it.",
  },
  reviewQueue: {
    headline: "Review queue not available yet",
    detail: "Queue status has not been loaded.",
  },
} as const satisfies Record<string, FeedsSlotCopy>;

/**
 * Buyer UI after the owning query returned an authoritative empty result.
 * Review-queue detail keeps the sign-off sentence buyers already see once
 * getFeedQueueItems has succeeded with zero PENDING items.
 */
export const FEEDS_VERIFIED_EMPTY = {
  connectedSources: {
    headline: "No sources on record",
    detail: "The latest connection load returned no sources.",
  },
  reviewQueue: {
    headline: "Queue clear",
    detail:
      "Queue clear. New filings land here for sign-off before touching the model — approving one writes a real FinancialSnapshot or LedgerEntry row to Postgres; dismissing one just closes it out with no effect on Dashboard/Simulate.",
  },
} as const satisfies Record<keyof typeof FEEDS_UNKNOWN, FeedsSlotCopy>;

export type FeedsSlotId = keyof typeof FEEDS_UNKNOWN;

export type FeedsCopyState = {
  kind: string;
  authority?: unknown;
};

/**
 * UNKNOWN and NOT_LOADED always return FEEDS_UNKNOWN.
 * VERIFIED_EMPTY returns FEEDS_VERIFIED_EMPTY only when the state carries a
 * query-authority token minted for this slot and EMPTY.
 * Any other kind, including VERIFIED_CONNECTED and VERIFIED_POPULATED, falls
 * back to UNKNOWN copy. Those kinds are rendered by the view.
 */
export function resolveFeedsCopy(slot: FeedsSlotId, state: FeedsCopyState): FeedsSlotCopy {
  const unknown = FEEDS_UNKNOWN[slot];
  if (state.kind === "UNKNOWN" || state.kind === "NOT_LOADED") return unknown;
  if (state.kind !== "VERIFIED_EMPTY") return unknown;
  if (!hasFeedsQueryAuthority(state.authority, slot, "EMPTY")) return unknown;
  return FEEDS_VERIFIED_EMPTY[slot];
}
