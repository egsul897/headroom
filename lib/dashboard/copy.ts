/**
 * Dashboard buyer copy — UNKNOWN ≠ VERIFIED_EMPTY.
 *
 * DASHBOARD_UNKNOWN is the not-available / not-verified table. Use it when the
 * slot is unwired, not loaded, or the load failed. DASHBOARD_VERIFIED_EMPTY is
 * reachable only from a verified-empty load state after an authoritative query.
 *
 * Product LOCK sha256: 9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04
 * Honest-equivalent Dashboard copy. This module does not invent Product LOCK rows.
 * IMPLEMENTED ≠ CERTIFIED. UNKNOWN ≠ VERIFIED_EMPTY.
 */

import { hasQueryAuthority } from "@/lib/dashboard/load-state";

export interface DashboardSlotCopy {
  headline: string;
  detail: string;
}

/** Buyer UI while maturities or facilities are unwired, not loaded, or failed. */
export const DASHBOARD_UNKNOWN = {
  maturities: {
    headline: "Maturities",
    detail: "Dated maturities are not available yet — not verified.",
  },
  facilities: {
    headline: "Capital structure",
    detail: "Facilities are not available yet — not verified.",
  },
} as const satisfies Record<string, DashboardSlotCopy>;

export type DashboardCopySlot = keyof typeof DASHBOARD_UNKNOWN;

/**
 * Buyer UI after the owning financial-position load returned an authoritative empty set.
 * These sentences are verified-empty only. They are not the UNKNOWN table.
 */
export const DASHBOARD_VERIFIED_EMPTY = {
  maturities: {
    headline: "Near-term maturities",
    detail: "No dated maturities on record.",
  },
  facilities: {
    headline: "Capital structure",
    detail: "No facilities on record.",
  },
} as const satisfies Record<DashboardCopySlot, DashboardSlotCopy>;

export type DashboardCopyState = {
  kind: string;
  authority?: unknown;
};

/**
 * Empty-style buyer copy for a Dashboard slot.
 * UNKNOWN and NOT_LOADED always return DASHBOARD_UNKNOWN.
 * VERIFIED_EMPTY returns DASHBOARD_VERIFIED_EMPTY only when the state carries
 * a query-authority token minted for EMPTY on that slot.
 */
export function resolveDashboardCopy(slot: DashboardCopySlot, state: DashboardCopyState): DashboardSlotCopy {
  const unknown = DASHBOARD_UNKNOWN[slot];
  if (state.kind === "UNKNOWN" || state.kind === "NOT_LOADED") return unknown;
  if (state.kind !== "VERIFIED_EMPTY") return unknown;
  if (!hasQueryAuthority(state.authority, slot, "EMPTY")) return unknown;
  return DASHBOARD_VERIFIED_EMPTY[slot];
}
