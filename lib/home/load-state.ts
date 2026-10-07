/**
 * Overview load / provenance.
 *
 * UNKNOWN and NOT_LOADED are distinct from VERIFIED_EMPTY (count slots:
 * VERIFIED_ZERO) and from VERIFIED_POPULATED (count slots: VERIFIED_NONZERO).
 * Negative facts require an authoritative queried source.
 *
 * An unloaded alert slot is UNKNOWN or NOT_LOADED. A numeric zero is not that
 * state. Verified zero is `{ kind: "VERIFIED_EMPTY", queried: true }` only
 * after the alert query has run.
 *
 * Product LOCK sha256: 9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04
 * IMPLEMENTED ≠ CERTIFIED.
 */

export const VERIFIED_ZERO = "VERIFIED_EMPTY" as const;
export const VERIFIED_NONZERO = "VERIFIED_POPULATED" as const;

export type UnloadedState = { kind: "UNKNOWN" } | { kind: "NOT_LOADED" };

export const UNKNOWN_STATE: { kind: "UNKNOWN" } = { kind: "UNKNOWN" };
export const NOT_LOADED_STATE: { kind: "NOT_LOADED" } = { kind: "NOT_LOADED" };

export type AlertLoadState =
  | UnloadedState
  | { kind: typeof VERIFIED_ZERO; queried: true }
  | { kind: typeof VERIFIED_NONZERO; queried: true; count: number };

export type TransactionsLoadState =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; ledgerRead: true; sourceAvailable: true }
  | { kind: "VERIFIED_POPULATED"; ledgerRead: true; sourceAvailable: true; rows: readonly string[] };

export type ListLoadState =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; authoritativeEmpty: true }
  | { kind: "VERIFIED_POPULATED"; authoritative: true; rows: readonly string[] };

export type FigureLoadState =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; authoritativeEmpty: true }
  | { kind: "VERIFIED_POPULATED"; certified: true; display: string };

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
  | { kind: "VERIFIED_EMPTY"; authoritativeEmpty: true }
  | { kind: "VERIFIED_POPULATED"; authoritative: true; rows: readonly StatusRow[] };

export type RiskLoadState =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; authoritativeEmpty: true }
  | { kind: "VERIFIED_POPULATED"; disposition: "NEEDS_REVIEW" }
  | { kind: "VERIFIED_POPULATED"; disposition: "LIST"; items: readonly string[] };

export type ExportLoadState =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; exportQueried: true }
  | { kind: "VERIFIED_POPULATED"; exportQueried: true };

export type OverviewLoad = {
  alerts: AlertLoadState;
  transactions: TransactionsLoadState;
  covenantsAtRisk: RiskLoadState;
  nextTest: ListLoadState;
  headroomOverTime: ListLoadState;
  capacitySummary: FigureLoadState;
  statusTable: StatusLoadState;
  drivers: ListLoadState;
  totalHeadroom: FigureLoadState;
  utilization: FigureLoadState;
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

export function verifiedEmptyList(): ListLoadState {
  return { kind: "VERIFIED_EMPTY", authoritativeEmpty: true };
}

export function verifiedEmptyRisk(): RiskLoadState {
  return { kind: "VERIFIED_EMPTY", authoritativeEmpty: true };
}

export function verifiedEmptyStatus(): StatusLoadState {
  return { kind: "VERIFIED_EMPTY", authoritativeEmpty: true };
}

/** Verified zero alerts. Requires the alert query. There is no numeric stand-in. */
export function verifiedZeroAlerts(): AlertLoadState {
  return { kind: VERIFIED_ZERO, queried: true };
}

export function verifiedNonzeroAlerts(count: number): AlertLoadState {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("VERIFIED_NONZERO requires a positive integer from the alert query");
  }
  return { kind: VERIFIED_NONZERO, queried: true, count };
}

export function alertBadgeCount(state: AlertLoadState): number | null {
  const presented = presentAlerts(state);
  if (presented.kind !== "VERIFIED_POPULATED") return null;
  return presented.count;
}

/**
 * Alert state from a query outcome.
 * A bare zero is not accepted. `outcome: "zero"` is verified empty only when `queried` is true.
 * Failed and skipped queries stay UNKNOWN or NOT_LOADED.
 */
export function alertStateFromQuery(
  input:
    | { queried: false }
    | { queried: true; outcome: "failed" }
    | { queried: true; outcome: "not_loaded" }
    | { queried: true; outcome: "zero" }
    | { queried: true; outcome: "nonzero"; count: number },
): AlertLoadState {
  if (!input.queried) return NOT_LOADED_STATE;
  switch (input.outcome) {
    case "failed":
      return UNKNOWN_STATE;
    case "not_loaded":
      return NOT_LOADED_STATE;
    case "zero":
      return verifiedZeroAlerts();
    case "nonzero":
      if (!Number.isInteger(input.count) || input.count < 1) return UNKNOWN_STATE;
      return verifiedNonzeroAlerts(input.count);
  }
}

/**
 * Transaction state from a ledger read.
 * Verified empty is returned only when the source is available and the ledger read ran
 * and the authoritative result is empty. Otherwise the slot stays UNKNOWN or NOT_LOADED.
 * An empty row array is not verified empty and is not populated.
 */
export function transactionsStateFromLedger(
  input:
    | { sourceAvailable: false }
    | { sourceAvailable: true; ledgerRead: false }
    | { sourceAvailable: true; ledgerRead: true; outcome: "failed" }
    | { sourceAvailable: true; ledgerRead: true; outcome: "not_loaded" }
    | { sourceAvailable: true; ledgerRead: true; outcome: "empty" }
    | { sourceAvailable: true; ledgerRead: true; outcome: "populated"; rows: readonly string[] },
): TransactionsLoadState {
  if (!input.sourceAvailable || !input.ledgerRead) return UNKNOWN_STATE;
  switch (input.outcome) {
    case "failed":
      return UNKNOWN_STATE;
    case "not_loaded":
      return NOT_LOADED_STATE;
    case "empty":
      return { kind: "VERIFIED_EMPTY", ledgerRead: true, sourceAvailable: true };
    case "populated":
      if (input.rows.length === 0) return UNKNOWN_STATE;
      return { kind: "VERIFIED_POPULATED", ledgerRead: true, sourceAvailable: true, rows: input.rows };
  }
}

export function presentAlerts(state: AlertLoadState): AlertLoadState {
  if (state.kind === "VERIFIED_EMPTY" && state.queried !== true) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED") {
    if (state.queried !== true || !Number.isInteger(state.count) || state.count < 1) return UNKNOWN_STATE;
  }
  return state;
}

export function presentTransactions(state: TransactionsLoadState): TransactionsLoadState {
  if (state.kind === "VERIFIED_EMPTY") {
    if (state.ledgerRead !== true || state.sourceAvailable !== true) return UNKNOWN_STATE;
    return state;
  }
  if (state.kind === "VERIFIED_POPULATED") {
    if (state.ledgerRead !== true || state.sourceAvailable !== true || state.rows.length === 0) return UNKNOWN_STATE;
  }
  return state;
}

export function presentList(state: ListLoadState): ListLoadState {
  if (state.kind === "VERIFIED_EMPTY" && state.authoritativeEmpty !== true) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED" && (state.authoritative !== true || state.rows.length === 0)) return UNKNOWN_STATE;
  return state;
}

export function presentRisk(state: RiskLoadState): RiskLoadState {
  if (state.kind === "VERIFIED_EMPTY" && state.authoritativeEmpty !== true) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED" && state.disposition === "LIST" && state.items.length === 0) return UNKNOWN_STATE;
  return state;
}

export function presentStatus(state: StatusLoadState): StatusLoadState {
  if (state.kind === "VERIFIED_EMPTY" && state.authoritativeEmpty !== true) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED" && (state.authoritative !== true || state.rows.length === 0)) return UNKNOWN_STATE;
  return state;
}

function isInventedZeroFigure(display: string): boolean {
  return /\$\s*0(?:\.0+)?\b/.test(display) || /\b0\s*%/.test(display);
}

export function presentFigure(state: FigureLoadState): FigureLoadState {
  if (state.kind === "VERIFIED_POPULATED") {
    if (state.certified !== true || isInventedZeroFigure(state.display)) return UNKNOWN_STATE;
  }
  return state;
}

/** Export control title. Unloaded export data uses the UNKNOWN chrome string. */
export function exportChromeTitle(state: ExportLoadState): string {
  if (state.kind === "UNKNOWN" || state.kind === "NOT_LOADED") return "Export not available yet";
  if (state.kind === "VERIFIED_EMPTY" && state.exportQueried !== true) return "Export not available yet";
  if (state.kind === "VERIFIED_POPULATED" && state.exportQueried !== true) return "Export not available yet";
  return "Export not available yet";
}
