/**
 * Dashboard buyer load / provenance.
 *
 * UNKNOWN and NOT_LOADED are distinct from VERIFIED_EMPTY and from
 * VERIFIED_POPULATED / VERIFIED_TRACKED. A null used figure is not $0.
 * An empty facilities list or a missing maturity is not verified-empty
 * unless this module minted the token for that slot and that outcome.
 *
 * Tokens are minted only inside the *StateFromQuery constructors. A boolean,
 * a raw empty array, or a relabelled kind is not authority. present* rejects
 * an outcome or slot mismatch and returns UNKNOWN.
 *
 * Dashboard-local. Does not rewrite Simulate-shared covenant data loads.
 *
 * Product LOCK sha256: 9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04
 * IMPLEMENTED ≠ CERTIFIED. UNKNOWN ≠ VERIFIED_EMPTY.
 */

import type { FinancialPosition } from "@/lib/financial-core/types";
import { fmtDate, fmtM } from "@/lib/format";

const queryAuthority: unique symbol = Symbol("headroom.dashboard.queryAuthority");
const queryOutcome: unique symbol = Symbol("headroom.dashboard.queryOutcome");

export type AuthorityOutcome = "EMPTY" | "POPULATED" | "TRACKED";

export type DashboardSlot = "maturities" | "facilities" | "used";

/**
 * Opaque proof that a *StateFromQuery constructor observed this slot and
 * this outcome. Slot-only or cross-outcome tokens are not authority.
 */
export type QueryAuthority<Slot extends string, Outcome extends AuthorityOutcome> = {
  readonly [queryAuthority]: Slot;
  readonly [queryOutcome]: Outcome;
};

function mintAuthority<Slot extends string, Outcome extends AuthorityOutcome>(
  slot: Slot,
  outcome: Outcome,
): QueryAuthority<Slot, Outcome> {
  return Object.freeze({
    [queryAuthority]: slot,
    [queryOutcome]: outcome,
  });
}

/** True only when `authority` was minted for this slot and this outcome. */
export function hasQueryAuthority(authority: unknown, slot: string, outcome: AuthorityOutcome): boolean {
  if (typeof authority !== "object" || authority === null) return false;
  const token = authority as { [queryAuthority]?: unknown; [queryOutcome]?: unknown };
  return token[queryAuthority] === slot && token[queryOutcome] === outcome;
}

export type UnloadedState = { kind: "UNKNOWN" } | { kind: "NOT_LOADED" };

export const UNKNOWN_STATE: { kind: "UNKNOWN" } = { kind: "UNKNOWN" };
export const NOT_LOADED_STATE: { kind: "NOT_LOADED" } = { kind: "NOT_LOADED" };

export type FacilityView = {
  name: string;
  secured: boolean;
  documentName: string | null;
  amount: number;
};

export type FacilitiesQuery =
  | { outcome: "failed" }
  | { outcome: "skipped" }
  | { outcome: "not_loaded" }
  | { outcome: "empty" }
  | { outcome: "populated"; facilities: readonly FacilityView[] };

export type FacilitiesLoadState =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; authority: QueryAuthority<"facilities", "EMPTY"> }
  | { kind: "VERIFIED_POPULATED"; authority: QueryAuthority<"facilities", "POPULATED">; facilities: readonly FacilityView[] };

export type MaturitiesQuery =
  | { outcome: "failed" }
  | { outcome: "skipped" }
  | { outcome: "not_loaded" }
  | { outcome: "empty"; dueWithin12: number; dueWithin24: number; dueWithin36: number }
  | {
      outcome: "populated";
      nextMaturityLabel: string;
      nextMaturityDate: string | null;
      nextMaturityAmount: number;
      dueWithin12: number;
      dueWithin24: number;
      dueWithin36: number;
    };

export type MaturityDues = {
  dueWithin12: number;
  dueWithin24: number;
  dueWithin36: number;
};

export type MaturitiesLoadState =
  | UnloadedState
  | ({ kind: "VERIFIED_EMPTY"; authority: QueryAuthority<"maturities", "EMPTY"> } & MaturityDues)
  | ({
      kind: "VERIFIED_POPULATED";
      authority: QueryAuthority<"maturities", "POPULATED">;
      nextMaturityLabel: string;
      nextMaturityDate: string | null;
      nextMaturityAmount: number;
    } & MaturityDues);

export type UsedCaptionState =
  | UnloadedState
  | { kind: "NOT_TRACKED" }
  | { kind: "VERIFIED_TRACKED"; authority: QueryAuthority<"used", "TRACKED">; used: number };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function readDues(input: Partial<MaturityDues>): MaturityDues | null {
  if (!isFiniteNonNegative(input.dueWithin12) || !isFiniteNonNegative(input.dueWithin24) || !isFiniteNonNegative(input.dueWithin36)) {
    return null;
  }
  return { dueWithin12: input.dueWithin12, dueWithin24: input.dueWithin24, dueWithin36: input.dueWithin36 };
}

function duesAreZero(dues: MaturityDues): boolean {
  return dues.dueWithin12 === 0 && dues.dueWithin24 === 0 && dues.dueWithin36 === 0;
}

function readFacility(raw: unknown): FacilityView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Partial<FacilityView>;
  if (typeof row.name !== "string" || row.name.trim() === "") return null;
  if (typeof row.secured !== "boolean") return null;
  if (!(row.documentName === null || typeof row.documentName === "string")) return null;
  if (!isFiniteNumber(row.amount)) return null;
  return { name: row.name, secured: row.secured, documentName: row.documentName, amount: row.amount };
}

type FacilitiesQueryInput = {
  outcome?: string;
  facilities?: readonly unknown[];
};

/**
 * Facilities state from a load outcome.
 * Verified empty is minted only for `outcome: "empty"` with no facility rows attached.
 * A populated outcome with an empty or null-amount list does not become verified empty and does not become $0.
 */
export function facilitiesStateFromQuery(input: FacilitiesQueryInput): FacilitiesLoadState {
  switch (input.outcome) {
    case "failed":
    case "skipped":
      return UNKNOWN_STATE;
    case "not_loaded":
      return NOT_LOADED_STATE;
    case "empty":
      if (Array.isArray(input.facilities) && input.facilities.length > 0) return UNKNOWN_STATE;
      return { kind: "VERIFIED_EMPTY", authority: mintAuthority("facilities", "EMPTY") };
    case "populated": {
      if (!Array.isArray(input.facilities) || input.facilities.length === 0) return UNKNOWN_STATE;
      const facilities: FacilityView[] = [];
      for (const raw of input.facilities) {
        const row = readFacility(raw);
        if (!row) return UNKNOWN_STATE;
        facilities.push(row);
      }
      return { kind: "VERIFIED_POPULATED", authority: mintAuthority("facilities", "POPULATED"), facilities };
    }
    default:
      return UNKNOWN_STATE;
  }
}

type MaturitiesQueryInput = Partial<MaturitiesQuery> & {
  outcome?: string;
  nextMaturityLabel?: string | null;
  nextMaturityDate?: string | null;
  nextMaturityAmount?: number | null;
};

/**
 * Maturities state from a load outcome.
 * Verified empty is minted only for `outcome: "empty"` when every due window is an authoritative zero
 * and no next-maturity label is attached. Missing dues are not coerced to 0.
 */
export function maturitiesStateFromQuery(input: MaturitiesQueryInput): MaturitiesLoadState {
  switch (input.outcome) {
    case "failed":
    case "skipped":
      return UNKNOWN_STATE;
    case "not_loaded":
      return NOT_LOADED_STATE;
    case "empty": {
      if (typeof input.nextMaturityLabel === "string" && input.nextMaturityLabel.trim() !== "") return UNKNOWN_STATE;
      const dues = readDues(input);
      if (!dues || !duesAreZero(dues)) return UNKNOWN_STATE;
      return { kind: "VERIFIED_EMPTY", authority: mintAuthority("maturities", "EMPTY"), ...dues };
    }
    case "populated": {
      const label = input.nextMaturityLabel;
      if (typeof label !== "string" || label.trim() === "") return UNKNOWN_STATE;
      if (!isFiniteNumber(input.nextMaturityAmount)) return UNKNOWN_STATE;
      const dues = readDues(input);
      if (!dues) return UNKNOWN_STATE;
      const date = input.nextMaturityDate;
      if (!(date === null || date === undefined || typeof date === "string")) return UNKNOWN_STATE;
      return {
        kind: "VERIFIED_POPULATED",
        authority: mintAuthority("maturities", "POPULATED"),
        nextMaturityLabel: label,
        nextMaturityDate: typeof date === "string" ? date : null,
        nextMaturityAmount: input.nextMaturityAmount,
        ...dues,
      };
    }
    default:
      return UNKNOWN_STATE;
  }
}

export function presentFacilities(state: FacilitiesLoadState): FacilitiesLoadState {
  if (state.kind !== "VERIFIED_EMPTY" && state.kind !== "VERIFIED_POPULATED") return state;
  const outcome = state.kind === "VERIFIED_EMPTY" ? "EMPTY" : "POPULATED";
  if (!hasQueryAuthority(state.authority, "facilities", outcome)) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED") {
    if (state.facilities.length === 0) return UNKNOWN_STATE;
    if (state.facilities.some((row) => !isFiniteNumber(row.amount) || row.name.trim() === "")) return UNKNOWN_STATE;
  }
  return state;
}

export function presentMaturities(state: MaturitiesLoadState): MaturitiesLoadState {
  if (state.kind !== "VERIFIED_EMPTY" && state.kind !== "VERIFIED_POPULATED") return state;
  const outcome = state.kind === "VERIFIED_EMPTY" ? "EMPTY" : "POPULATED";
  if (!hasQueryAuthority(state.authority, "maturities", outcome)) return UNKNOWN_STATE;
  const dues = readDues(state);
  if (!dues) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_EMPTY") {
    if (!duesAreZero(dues)) return UNKNOWN_STATE;
    return state;
  }
  if (state.nextMaturityLabel.trim() === "" || !isFiniteNumber(state.nextMaturityAmount)) return UNKNOWN_STATE;
  return state;
}

/**
 * Used-caption state from a capacity row.
 * NOT_TRACKED stays not tracked. TRACKED with a null or non-finite used is UNKNOWN, never zero.
 */
export function usedCaptionStateFromRow(row: { usageState?: string | null; used?: number | null }): UsedCaptionState {
  if (row.usageState === "NOT_TRACKED") return { kind: "NOT_TRACKED" };
  if (row.usageState !== "TRACKED") return UNKNOWN_STATE;
  if (!isFiniteNumber(row.used)) return UNKNOWN_STATE;
  return { kind: "VERIFIED_TRACKED", authority: mintAuthority("used", "TRACKED"), used: row.used };
}

export function presentUsed(state: UsedCaptionState): UsedCaptionState {
  if (state.kind !== "VERIFIED_TRACKED") return state;
  if (!hasQueryAuthority(state.authority, "used", "TRACKED")) return UNKNOWN_STATE;
  if (!isFiniteNumber(state.used)) return UNKNOWN_STATE;
  return state;
}

export type PresentedCapacityUsed = {
  kind: UsedCaptionState["kind"];
  caption: string;
};

/**
 * Capacity bar caption. Never paints `$0 used` from a null used figure.
 * NOT_TRACKED and UNKNOWN both use the existing usage-not-tracked sentence.
 * A finite tracked used, including a real zero, is VERIFIED_TRACKED.
 */
export function presentedCapacityUsedCaption(row: {
  usageState?: string | null;
  used?: number | null;
  currentCapacity: number;
}): PresentedCapacityUsed {
  const state = presentUsed(usedCaptionStateFromRow(row));
  if (state.kind === "VERIFIED_TRACKED") {
    return { kind: state.kind, caption: `${fmtM(state.used)} used of ${fmtM(row.currentCapacity)}` };
  }
  return { kind: state.kind, caption: `${fmtM(row.currentCapacity)} capacity — usage not tracked` };
}

export function capacityUsedCaption(row: { usageState?: string | null; used?: number | null; currentCapacity: number }): string {
  return presentedCapacityUsedCaption(row).caption;
}

/** Query discriminant after `loadCovenantOverviewInputs` has already returned a financial position. */
export function facilitiesQueryFromPosition(
  position: FinancialPosition,
  documentNameById: ReadonlyMap<string, string>,
): FacilitiesQuery {
  const facilities: FacilityView[] = position.capitalStructure.facilities.map((row) => {
    const documentId = row.facility.governingDocumentId;
    const documentName = documentId ? (documentNameById.get(documentId) ?? null) : null;
    return {
      name: row.facility.name,
      secured: row.facility.secured,
      documentName,
      amount: row.outstandingPrincipal,
    };
  });
  if (facilities.length === 0) return { outcome: "empty" };
  return { outcome: "populated", facilities };
}

/** Query discriminant after a successful financial-position load. Does not coerce missing dues. */
export function maturitiesQueryFromPosition(position: FinancialPosition): MaturitiesQuery {
  const maturities = position.maturities;
  const dues = {
    dueWithin12: maturities.dueWithin12Months,
    dueWithin24: maturities.dueWithin24Months,
    dueWithin36: maturities.dueWithin36Months,
  };
  const next = maturities.nextMaturity;
  if (!next) return { outcome: "empty", ...dues };
  return {
    outcome: "populated",
    nextMaturityLabel: next.facilityName,
    nextMaturityDate: fmtDate(next.date),
    nextMaturityAmount: next.principal,
    ...dues,
  };
}
