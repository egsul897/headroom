/**
 * Product LOCK — Chunk A′ KPI empty copy.
 * SHA-256 cda3a4bd53f37677e0bfe5fc996d18b09af5a75712847a238361849ad5ba845a
 * Authority: CHUNK-A-PRIME-KPI-EMPTY-COPY-LOCK.md (CEO APPROVED 2026-10-07).
 * Strings below are the locked headline/detail text. Do not paraphrase.
 */

export const HOME_GREETING_NO_NAME = "Here’s your headroom overview.";

/** Tail of the named greeting. The full locked sentence is "Good morning, {name}. " + this. */
export const HOME_GREETING_NAMED_TAIL = "Here’s your headroom overview.";

export interface HomeSlotCopy {
  headline: string;
  detail: string;
}

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
    detail: "None to show yet. If REVIEW_REQUIRED: Needs review. Never seed a count.",
  },
  nextTest: {
    headline: "Next test",
    detail: "No upcoming test on file.",
  },
  headroomOverTime: {
    headline: "No history to chart yet",
    detail: "We won’t draw a trend from placeholders.",
  },
  capacitySummary: {
    headline: "Capacity breakdown not available yet",
    detail: "No facility split until provenance-bound.",
  },
  statusTable: {
    headline: "No covenant rows to show yet",
    detail: "Never default Healthy/green.",
  },
  drivers: {
    headline: "No drivers to show yet",
    detail: "Drivers require explained capacity changes — not guesses.",
  },
  alerts: {
    headline: "No alerts",
    detail: "Only real fail-closed signals; hide bell badge if none.",
  },
  transactions: {
    headline: "No transactions on file",
    detail: "Ledger-backed only.",
  },
} as const satisfies Record<string, HomeSlotCopy>;

export type HomeSlotId = keyof typeof HOME_SLOTS;

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
