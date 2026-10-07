/**
 * Product LOCK — Chunk A′ KPI empty copy (buyer UI only).
 * SHA-256 7f68ced002e91cb4750f4a8680462f840a2bf54ae92bfb4a423af6d8c2b7d0a4
 * Supersedes cda3a4bd53f37677e0bfe5fc996d18b09af5a75712847a238361849ad5ba845a.
 * Authority: CHUNK-A-PRIME-KPI-EMPTY-COPY-LOCK.md (CEO APPROVED, buyer polish 2026-10-07).
 * Headlines and details below are the locked buyer strings. Do not paraphrase.
 * Implementer rules stay in the LOCK and in tests; they are not part of these strings.
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
    detail: "None to show yet.",
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
    detail: "No facility split until figures are tied to sources.",
  },
  statusTable: {
    headline: "No covenant rows to show yet",
    detail: "Status stays blank until we have real rows.",
  },
  drivers: {
    headline: "No drivers to show yet",
    detail: "Drivers need explained capacity changes — not guesses.",
  },
  alerts: {
    headline: "No alerts",
    detail: "Nothing to flag yet.",
  },
  transactions: {
    headline: "No transactions on file",
    detail: "Nothing on the ledger yet.",
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
