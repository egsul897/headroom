/**
 * Product LOCK — UNKNOWN ≠ VERIFIED_EMPTY (overview KPI empties).
 * LOCK sha256: 9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04
 * Plan sha256: 17e6f29f9bb933b48ef6ce13523ef3f68355c918fc29bb588e57a1f520b89822
 *
 * HOME_SLOTS is the UNKNOWN table. Use it when the slot is unwired, not loaded,
 * or the load failed. HOME_VERIFIED_EMPTY is reachable only from a verified-empty
 * load state after an authoritative query.
 *
 * Total Headroom, Utilization, and Capacity stay on the UNKNOWN table until
 * certified figures exist. Verified empty for those slots does not invent $0 or 0%.
 *
 * Supersedes Chunk A′ invent-absence buyer strings (buyer-polish sha256
 * 7f68ced002e91cb4750f4a8680462f840a2bf54ae92bfb4a423af6d8c2b7d0a4) where those
 * strings asserted absence without an authoritative queried source.
 *
 * IMPLEMENTED ≠ CERTIFIED.
 */

import { hasQueryAuthority } from "@/lib/home/load-state";

export const HOME_GREETING_NO_NAME = "Here’s your headroom overview.";

/** Tail of the named greeting. The full locked sentence is "Good morning, {name}. " + this. */
export const HOME_GREETING_NAMED_TAIL = "Here’s your headroom overview.";

export interface HomeSlotCopy {
  headline: string;
  detail: string;
}

/** Buyer UI while the authoritative source is unwired, not loaded, or failed. */
export const HOME_SLOTS = {
  totalHeadroom: {
    headline: "Headroom",
    detail: "Not available yet — we won’t invent a total.",
  },
  utilization: {
    headline: "Utilization",
    detail: "Not available yet. Used and capacity stay blank until certified figures exist.",
  },
  covenantsAtRisk: {
    headline: "Covenants at risk",
    detail: "Risk assessment not available yet.",
  },
  nextTest: {
    headline: "Next test",
    detail: "Next test not available yet.",
  },
  headroomOverTime: {
    headline: "Chart not available yet",
    detail: "We won’t draw a trend until history is loaded from sources.",
  },
  capacitySummary: {
    headline: "Capacity breakdown not available yet",
    detail: "Facility split stays blank until figures are tied to sources.",
  },
  statusTable: {
    headline: "Status not available yet",
    detail: "Rows stay blank until covenant status is loaded from sources.",
  },
  drivers: {
    headline: "Drivers not available yet",
    detail: "Driver list stays blank until explained capacity changes are loaded.",
  },
  alerts: {
    headline: "Alerts not available yet",
    detail: "Alert status has not been loaded.",
  },
  transactions: {
    headline: "Transaction history not available yet",
    detail: "Ledger activity has not been loaded.",
  },
} as const satisfies Record<string, HomeSlotCopy>;

export type HomeSlotId = keyof typeof HOME_SLOTS;

/**
 * Buyer UI after the owning query returned an authoritative empty set.
 * Figure slots are omitted: they stay on UNKNOWN until certified figures exist.
 */
export const HOME_VERIFIED_EMPTY = {
  covenantsAtRisk: {
    headline: "Covenants at risk",
    detail: "None at risk on the latest assessment.",
  },
  nextTest: {
    headline: "Next test",
    detail: "No upcoming test on file.",
  },
  headroomOverTime: {
    headline: "No history to chart",
    detail: "No sourced history points for this window.",
  },
  statusTable: {
    headline: "No covenant rows",
    detail: "Latest load returned no rows.",
  },
  drivers: {
    headline: "No drivers",
    detail: "No explained capacity changes on the latest load.",
  },
  alerts: {
    headline: "No alerts",
    detail: "Nothing to flag on the latest load.",
  },
  transactions: {
    headline: "No transactions on file",
    detail: "Nothing on the ledger for the loaded window.",
  },
} as const satisfies Partial<Record<HomeSlotId, HomeSlotCopy>>;

export type VerifiedEmptySlotId = keyof typeof HOME_VERIFIED_EMPTY;

/** Populated risk when the assessment ran and returned review required. No count. */
export const HOME_RISK_NEEDS_REVIEW: HomeSlotCopy = {
  headline: "Covenants at risk",
  detail: "Needs review.",
};

const FIGURE_SLOTS = new Set<HomeSlotId>(["totalHeadroom", "utilization", "capacitySummary"]);

export type CopyState = {
  kind: string;
  authority?: unknown;
};

/**
 * Empty-style buyer copy for a slot.
 * UNKNOWN and NOT_LOADED always return HOME_SLOTS.
 * VERIFIED_EMPTY returns HOME_VERIFIED_EMPTY only when the state carries a query-authority token minted for EMPTY.
 * Populated states are rendered by the card, not by this helper; they fall back to UNKNOWN copy.
 */
export function resolveBuyerCopy(slot: HomeSlotId, state: CopyState): HomeSlotCopy {
  const unknown = HOME_SLOTS[slot];
  if (state.kind === "UNKNOWN" || state.kind === "NOT_LOADED") return unknown;
  if (state.kind !== "VERIFIED_EMPTY") return unknown;
  if (FIGURE_SLOTS.has(slot)) return unknown;
  if (!hasQueryAuthority(state.authority, slot, "EMPTY")) return unknown;
  const verified = HOME_VERIFIED_EMPTY[slot as VerifiedEmptySlotId];
  return verified ?? unknown;
}

/**
 * Per-card matrix at the unwired tip. `wired` stays false until the owning query is bound.
 * UNKNOWN strings are HOME_SLOTS. Verified-empty strings are HOME_VERIFIED_EMPTY.
 */
export const OVERVIEW_SLOT_MATRIX = {
  alerts: {
    authoritativeSource: "Alert / fail-closed signal query",
    wired: false,
    unknown: HOME_SLOTS.alerts,
    verifiedEmpty: HOME_VERIFIED_EMPTY.alerts,
    verifiedPopulated: "Real rows + badge count",
  },
  transactions: {
    authoritativeSource: "Ledger query",
    wired: false,
    unknown: HOME_SLOTS.transactions,
    verifiedEmpty: HOME_VERIFIED_EMPTY.transactions,
    verifiedPopulated: "Ledger rows",
  },
  nextTest: {
    authoritativeSource: "Covenant test schedule / next-test query",
    wired: false,
    unknown: HOME_SLOTS.nextTest,
    verifiedEmpty: HOME_VERIFIED_EMPTY.nextTest,
    verifiedPopulated: "Next test fields",
  },
  covenantsAtRisk: {
    authoritativeSource: "Covenant-risk / REVIEW assessment",
    wired: false,
    unknown: HOME_SLOTS.covenantsAtRisk,
    verifiedEmpty: HOME_VERIFIED_EMPTY.covenantsAtRisk,
    verifiedPopulated: "Risk list / Needs review",
  },
  statusTable: {
    authoritativeSource: "Covenant status row set",
    wired: false,
    unknown: HOME_SLOTS.statusTable,
    verifiedEmpty: HOME_VERIFIED_EMPTY.statusTable,
    verifiedPopulated: "Real rows; never default Healthy",
  },
  drivers: {
    authoritativeSource: "Explained capacity-change feed",
    wired: false,
    unknown: HOME_SLOTS.drivers,
    verifiedEmpty: HOME_VERIFIED_EMPTY.drivers,
    verifiedPopulated: "Driver rows",
  },
  headroomOverTime: {
    authoritativeSource: "History / chart series",
    wired: false,
    unknown: HOME_SLOTS.headroomOverTime,
    verifiedEmpty: HOME_VERIFIED_EMPTY.headroomOverTime,
    verifiedPopulated: "Chart data",
  },
  capacitySummary: {
    authoritativeSource: "Facility split provenance",
    wired: false,
    unknown: HOME_SLOTS.capacitySummary,
    verifiedEmpty: null,
    verifiedPopulated: "Provenance-bound split",
  },
  totalHeadroom: {
    authoritativeSource: "Certified headroom figure",
    wired: false,
    unknown: HOME_SLOTS.totalHeadroom,
    verifiedEmpty: null,
    verifiedPopulated: "Certified total",
  },
  utilization: {
    authoritativeSource: "Certified used/capacity",
    wired: false,
    unknown: HOME_SLOTS.utilization,
    verifiedEmpty: null,
    verifiedPopulated: "Certified figures",
  },
} as const;

const FICTIONAL_PERSON = /^john\s+davis$/i;

/**
 * Named greeting only when the caller supplies a real identity.
 * Chunk A′ has no signed-in user, so the overview passes null.
 * Mockup person/company names are rejected back to the no-name greeting.
 */
export function overviewGreeting(identityName: string | null | undefined): { heading: string; subheading: string | null } {
  const name = identityName?.trim() ?? "";
  if (!name || FICTIONAL_PERSON.test(name) || /apex/i.test(name)) {
    return { heading: HOME_GREETING_NO_NAME, subheading: null };
  }
  return { heading: `Good morning, ${name}.`, subheading: HOME_GREETING_NAMED_TAIL };
}
