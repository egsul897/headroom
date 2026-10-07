/**
 * Overview load / provenance.
 *
 * UNKNOWN and NOT_LOADED are distinct from VERIFIED_EMPTY (count slots:
 * VERIFIED_ZERO) and from VERIFIED_POPULATED (count slots: VERIFIED_NONZERO).
 * Negative facts require an authoritative queried source.
 *
 * Verified empty and verified populated states carry an opaque query-authority
 * token. That token is minted only inside the per-slot `*StateFromQuery` /
 * `transactionsStateFromLedger` constructors. A boolean literal is not authority.
 * The token is bound to the slot and to the outcome (EMPTY or POPULATED).
 * A populated, nonzero, needs-review, or list token is not authority for
 * VERIFIED_EMPTY. present* rejects an outcome mismatch and returns UNKNOWN.
 *
 * Product LOCK sha256: 9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04
 * IMPLEMENTED ≠ CERTIFIED.
 */

export const VERIFIED_ZERO = "VERIFIED_EMPTY" as const;
export const VERIFIED_NONZERO = "VERIFIED_POPULATED" as const;

const queryAuthority: unique symbol = Symbol("headroom.overview.queryAuthority");
const queryOutcome: unique symbol = Symbol("headroom.overview.queryOutcome");

/** Outcome sealed into a query-authority token. EMPTY is not POPULATED. */
export type AuthorityOutcome = "EMPTY" | "POPULATED";

/**
 * Opaque proof that a `*StateFromQuery` constructor observed a real query
 * outcome for this slot and this outcome kind. Slot-only tokens are not authority.
 */
export type QueryAuthority<Slot extends string, Outcome extends AuthorityOutcome> = {
  readonly [queryAuthority]: Slot;
  readonly [queryOutcome]: Outcome;
};

function mintAuthority<Slot extends string, Outcome extends AuthorityOutcome>(
  slot: Slot,
  outcome: Outcome,
): QueryAuthority<Slot, Outcome> {
  const token: QueryAuthority<Slot, Outcome> = {
    [queryAuthority]: slot,
    [queryOutcome]: outcome,
  };
  return Object.freeze(token);
}

function verifiedOutcome(kind: "VERIFIED_EMPTY" | "VERIFIED_POPULATED"): AuthorityOutcome {
  return kind === "VERIFIED_EMPTY" ? "EMPTY" : "POPULATED";
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

export type AlertLoadState =
  | UnloadedState
  | { kind: typeof VERIFIED_ZERO; authority: QueryAuthority<"alerts", "EMPTY"> }
  | { kind: typeof VERIFIED_NONZERO; authority: QueryAuthority<"alerts", "POPULATED">; count: number };

export type TransactionsLoadState =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; authority: QueryAuthority<"transactions", "EMPTY"> }
  | { kind: "VERIFIED_POPULATED"; authority: QueryAuthority<"transactions", "POPULATED">; rows: readonly string[] };

export type ListSlot = "nextTest" | "drivers" | "headroomOverTime";

export type ListLoadState<Slot extends ListSlot = ListSlot> =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; authority: QueryAuthority<Slot, "EMPTY"> }
  | { kind: "VERIFIED_POPULATED"; authority: QueryAuthority<Slot, "POPULATED">; rows: readonly string[] };

export type FigureSlot = "totalHeadroom" | "utilization" | "capacitySummary";

export type FigureLoadState<Slot extends FigureSlot = FigureSlot> =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; authority: QueryAuthority<Slot, "EMPTY"> }
  | { kind: "VERIFIED_POPULATED"; authority: QueryAuthority<Slot, "POPULATED">; display: string };

export type StatusRow = {
  covenant: string;
  facility: string;
  status: string;
  headroom: string;
  trend: string;
  nextTest: string;
};

export type StatusLoadState =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; authority: QueryAuthority<"statusTable", "EMPTY"> }
  | { kind: "VERIFIED_POPULATED"; authority: QueryAuthority<"statusTable", "POPULATED">; rows: readonly StatusRow[] };

export type RiskLoadState =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; authority: QueryAuthority<"covenantsAtRisk", "EMPTY"> }
  | { kind: "VERIFIED_POPULATED"; authority: QueryAuthority<"covenantsAtRisk", "POPULATED">; disposition: "NEEDS_REVIEW" }
  | { kind: "VERIFIED_POPULATED"; authority: QueryAuthority<"covenantsAtRisk", "POPULATED">; disposition: "LIST"; items: readonly string[] };

export type ExportLoadState =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; exportQueried: true }
  | { kind: "VERIFIED_POPULATED"; exportQueried: true };

export type OverviewLoad = {
  alerts: AlertLoadState;
  transactions: TransactionsLoadState;
  covenantsAtRisk: RiskLoadState;
  nextTest: ListLoadState<"nextTest">;
  headroomOverTime: ListLoadState<"headroomOverTime">;
  capacitySummary: FigureLoadState<"capacitySummary">;
  statusTable: StatusLoadState;
  drivers: ListLoadState<"drivers">;
  totalHeadroom: FigureLoadState<"totalHeadroom">;
  utilization: FigureLoadState<"utilization">;
  exportState: ExportLoadState;
};

/** Page load while overview sources are unwired. Every slot is UNKNOWN. */
export const UNWIRED_OVERVIEW_LOAD: OverviewLoad = {
  alerts: UNKNOWN_STATE,
  transactions: UNKNOWN_STATE,
  covenantsAtRisk: UNKNOWN_STATE,
  nextTest: UNKNOWN_STATE,
  headroomOverTime: UNKNOWN_STATE,
  capacitySummary: UNKNOWN_STATE,
  statusTable: UNKNOWN_STATE,
  drivers: UNKNOWN_STATE,
  totalHeadroom: UNKNOWN_STATE,
  utilization: UNKNOWN_STATE,
  exportState: UNKNOWN_STATE,
};

export function countSlotAlias(kind: "VERIFIED_EMPTY" | "VERIFIED_POPULATED"): "VERIFIED_ZERO" | "VERIFIED_NONZERO" {
  return kind === "VERIFIED_EMPTY" ? "VERIFIED_ZERO" : "VERIFIED_NONZERO";
}

export function isUnloaded(state: { kind: string }): boolean {
  return state.kind === "UNKNOWN" || state.kind === "NOT_LOADED";
}

type MissedQuery = { outcome: "failed" } | { outcome: "skipped" } | { outcome: "not_loaded" };

export function alertBadgeCount(state: AlertLoadState): number | null {
  const presented = presentAlerts(state);
  if (presented.kind !== "VERIFIED_POPULATED") return null;
  return presented.count;
}

/**
 * Alert state from a query outcome.
 * Verified zero is minted only for `outcome: "zero"` when `queried` is true.
 * A numeric zero, a failed query, or a skipped query does not mint it.
 */
export function alertStateFromQuery(
  input:
    | { queried: false }
    | { queried: true; outcome: "failed" }
    | { queried: true; outcome: "skipped" }
    | { queried: true; outcome: "not_loaded" }
    | { queried: true; outcome: "zero" }
    | { queried: true; outcome: "nonzero"; count: number },
): AlertLoadState {
  if (!input.queried) return NOT_LOADED_STATE;
  switch (input.outcome) {
    case "failed":
    case "skipped":
      return UNKNOWN_STATE;
    case "not_loaded":
      return NOT_LOADED_STATE;
    case "zero":
      return { kind: VERIFIED_ZERO, authority: mintAuthority("alerts", "EMPTY") };
    case "nonzero":
      if (!Number.isInteger(input.count) || input.count < 1) return UNKNOWN_STATE;
      return { kind: VERIFIED_NONZERO, authority: mintAuthority("alerts", "POPULATED"), count: input.count };
  }
}

/**
 * Transaction state from a ledger read.
 * Verified empty is minted only when the source is available, the ledger read ran,
 * and the authoritative result is empty.
 * An empty row array is not verified empty and is not populated.
 */
export function transactionsStateFromLedger(
  input:
    | { sourceAvailable: false }
    | { sourceAvailable: true; ledgerRead: false }
    | { sourceAvailable: true; ledgerRead: true; outcome: "failed" }
    | { sourceAvailable: true; ledgerRead: true; outcome: "skipped" }
    | { sourceAvailable: true; ledgerRead: true; outcome: "not_loaded" }
    | { sourceAvailable: true; ledgerRead: true; outcome: "empty" }
    | { sourceAvailable: true; ledgerRead: true; outcome: "populated"; rows: readonly string[] },
): TransactionsLoadState {
  if (!input.sourceAvailable || !input.ledgerRead) return UNKNOWN_STATE;
  switch (input.outcome) {
    case "failed":
    case "skipped":
      return UNKNOWN_STATE;
    case "not_loaded":
      return NOT_LOADED_STATE;
    case "empty":
      return { kind: "VERIFIED_EMPTY", authority: mintAuthority("transactions", "EMPTY") };
    case "populated":
      if (input.rows.length === 0) return UNKNOWN_STATE;
      return { kind: "VERIFIED_POPULATED", authority: mintAuthority("transactions", "POPULATED"), rows: input.rows };
  }
}

type ListQuery = MissedQuery | { outcome: "empty" } | { outcome: "populated"; rows: readonly string[] };

function listStateFromQuery<Slot extends ListSlot>(slot: Slot, input: ListQuery): ListLoadState<Slot> {
  switch (input.outcome) {
    case "failed":
    case "skipped":
    case "not_loaded":
      return UNKNOWN_STATE;
    case "empty":
      return { kind: "VERIFIED_EMPTY", authority: mintAuthority(slot, "EMPTY") };
    case "populated":
      if (input.rows.length === 0) return UNKNOWN_STATE;
      return { kind: "VERIFIED_POPULATED", authority: mintAuthority(slot, "POPULATED"), rows: input.rows };
  }
}

/** Failed, skipped, and not-loaded outcomes stay UNKNOWN. Empty is minted only for `outcome: "empty"`. */
export function nextTestStateFromQuery(input: ListQuery): ListLoadState<"nextTest"> {
  return listStateFromQuery("nextTest", input);
}

export function driversStateFromQuery(input: ListQuery): ListLoadState<"drivers"> {
  return listStateFromQuery("drivers", input);
}

export function headroomOverTimeStateFromQuery(input: ListQuery): ListLoadState<"headroomOverTime"> {
  return listStateFromQuery("headroomOverTime", input);
}

export function statusTableStateFromQuery(
  input: MissedQuery | { outcome: "empty" } | { outcome: "populated"; rows: readonly StatusRow[] },
): StatusLoadState {
  switch (input.outcome) {
    case "failed":
    case "skipped":
    case "not_loaded":
      return UNKNOWN_STATE;
    case "empty":
      return { kind: "VERIFIED_EMPTY", authority: mintAuthority("statusTable", "EMPTY") };
    case "populated":
      if (input.rows.length === 0) return UNKNOWN_STATE;
      return { kind: "VERIFIED_POPULATED", authority: mintAuthority("statusTable", "POPULATED"), rows: input.rows };
  }
}

export function covenantsAtRiskStateFromQuery(
  input: MissedQuery | { outcome: "empty" } | { outcome: "needs_review" } | { outcome: "list"; items: readonly string[] },
): RiskLoadState {
  switch (input.outcome) {
    case "failed":
    case "skipped":
    case "not_loaded":
      return UNKNOWN_STATE;
    case "empty":
      return { kind: "VERIFIED_EMPTY", authority: mintAuthority("covenantsAtRisk", "EMPTY") };
    case "needs_review":
      return {
        kind: "VERIFIED_POPULATED",
        authority: mintAuthority("covenantsAtRisk", "POPULATED"),
        disposition: "NEEDS_REVIEW",
      };
    case "list":
      if (input.items.length === 0) return UNKNOWN_STATE;
      return {
        kind: "VERIFIED_POPULATED",
        authority: mintAuthority("covenantsAtRisk", "POPULATED"),
        disposition: "LIST",
        items: input.items,
      };
  }
}

type FigureQuery = MissedQuery | { outcome: "empty" } | { outcome: "populated"; display: string };

function figureStateFromQuery<Slot extends FigureSlot>(slot: Slot, input: FigureQuery): FigureLoadState<Slot> {
  switch (input.outcome) {
    case "failed":
    case "skipped":
    case "not_loaded":
      return UNKNOWN_STATE;
    case "empty":
      return { kind: "VERIFIED_EMPTY", authority: mintAuthority(slot, "EMPTY") };
    case "populated":
      if (isInventedZeroFigure(input.display)) return UNKNOWN_STATE;
      return { kind: "VERIFIED_POPULATED", authority: mintAuthority(slot, "POPULATED"), display: input.display };
  }
}

export function totalHeadroomStateFromQuery(input: FigureQuery): FigureLoadState<"totalHeadroom"> {
  return figureStateFromQuery("totalHeadroom", input);
}

export function utilizationStateFromQuery(input: FigureQuery): FigureLoadState<"utilization"> {
  return figureStateFromQuery("utilization", input);
}

export function capacitySummaryStateFromQuery(input: FigureQuery): FigureLoadState<"capacitySummary"> {
  return figureStateFromQuery("capacitySummary", input);
}

export function presentAlerts(state: AlertLoadState): AlertLoadState {
  if (state.kind !== "VERIFIED_EMPTY" && state.kind !== "VERIFIED_POPULATED") return state;
  if (!hasQueryAuthority(state.authority, "alerts", verifiedOutcome(state.kind))) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED" && (!Number.isInteger(state.count) || state.count < 1)) return UNKNOWN_STATE;
  return state;
}

export function presentTransactions(state: TransactionsLoadState): TransactionsLoadState {
  if (state.kind !== "VERIFIED_EMPTY" && state.kind !== "VERIFIED_POPULATED") return state;
  if (!hasQueryAuthority(state.authority, "transactions", verifiedOutcome(state.kind))) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED" && state.rows.length === 0) return UNKNOWN_STATE;
  return state;
}

export function presentList<Slot extends ListSlot>(state: ListLoadState<Slot>, slot: Slot): ListLoadState<Slot> {
  if (state.kind !== "VERIFIED_EMPTY" && state.kind !== "VERIFIED_POPULATED") return state;
  if (!hasQueryAuthority(state.authority, slot, verifiedOutcome(state.kind))) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED" && state.rows.length === 0) return UNKNOWN_STATE;
  return state;
}

export function presentRisk(state: RiskLoadState): RiskLoadState {
  if (state.kind !== "VERIFIED_EMPTY" && state.kind !== "VERIFIED_POPULATED") return state;
  if (!hasQueryAuthority(state.authority, "covenantsAtRisk", verifiedOutcome(state.kind))) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED" && state.disposition === "LIST" && state.items.length === 0) return UNKNOWN_STATE;
  return state;
}

export function presentStatus(state: StatusLoadState): StatusLoadState {
  if (state.kind !== "VERIFIED_EMPTY" && state.kind !== "VERIFIED_POPULATED") return state;
  if (!hasQueryAuthority(state.authority, "statusTable", verifiedOutcome(state.kind))) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED" && state.rows.length === 0) return UNKNOWN_STATE;
  return state;
}

/**
 * True when `display` asserts a zero figure.
 *
 * Invented zeros: `$0`, `$0.0`, `$0M` / `$0B` / `$0K` (any case), `$0.0M` and the same
 * suffix class, `0%`, `0.0%`, and zero ratios `0x` / `0.0x`.
 * Non-zero figures pass, including `$0.4M`, `0.4%`, `0.4x`, and `1.0x`.
 * `0.0x` is in scope because a zero multiple is the same invented-zero class as `$0` and `0%`.
 */
export function isInventedZeroFigure(display: string): boolean {
  const dollarZero = /\$\s*0(?:\.0+)?(?:\s*[kmb])?(?![\d.])/i.test(display);
  const percentZero = /(?<![\d.])0(?:\.0+)?\s*%/.test(display);
  const ratioZero = /(?<![\d.])0(?:\.0+)?\s*x\b/i.test(display);
  return dollarZero || percentZero || ratioZero;
}

export function presentFigure<Slot extends FigureSlot>(state: FigureLoadState<Slot>, slot: Slot): FigureLoadState<Slot> {
  if (state.kind !== "VERIFIED_EMPTY" && state.kind !== "VERIFIED_POPULATED") return state;
  if (!hasQueryAuthority(state.authority, slot, verifiedOutcome(state.kind))) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED" && isInventedZeroFigure(state.display)) return UNKNOWN_STATE;
  return state;
}

/** Export control title. Unloaded export data uses the UNKNOWN chrome string. */
export function exportChromeTitle(state: ExportLoadState): string {
  if (state.kind === "UNKNOWN" || state.kind === "NOT_LOADED") return "Export not available yet";
  if (state.kind === "VERIFIED_EMPTY" && state.exportQueried !== true) return "Export not available yet";
  if (state.kind === "VERIFIED_POPULATED" && state.exportQueried !== true) return "Export not available yet";
  return "Export not available yet";
}
