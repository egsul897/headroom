/**
 * Feeds load / provenance.
 *
 * UNKNOWN and NOT_LOADED are distinct from VERIFIED_EMPTY and from
 * VERIFIED_CONNECTED / VERIFIED_POPULATED.
 * Negative facts and healthy connection marks require an authoritative read.
 * The token is minted only inside the constructors below. A boolean, a
 * hard-coded source name, an empty array, or a registry row that was not
 * probed is not authority. present* rejects an outcome or slot mismatch
 * and returns UNKNOWN.
 *
 * Product LOCK sha256: 9489d25da4cd51bac8f49f3be1880915c65acf580f4cdc9373679511a19feb04
 * Plan sha256: 0367c5245078518a998947687267c4b08b4fd0bec2c8751f0daf6259c2f56dcf
 * IMPLEMENTED ≠ CERTIFIED. PINNED_OFFLINE ≠ CERTIFIED. UNKNOWN ≠ VERIFIED_EMPTY.
 */

const queryAuthority: unique symbol = Symbol("headroom.feeds.queryAuthority");
const queryOutcome: unique symbol = Symbol("headroom.feeds.queryOutcome");

export type FeedsAuthorityOutcome = "EMPTY" | "POPULATED" | "CONNECTED";

export type FeedsQueryAuthority<Slot extends string, Outcome extends FeedsAuthorityOutcome> = {
  readonly [queryAuthority]: Slot;
  readonly [queryOutcome]: Outcome;
};

function mintAuthority<Slot extends string, Outcome extends FeedsAuthorityOutcome>(
  slot: Slot,
  outcome: Outcome,
): FeedsQueryAuthority<Slot, Outcome> {
  return Object.freeze({
    [queryAuthority]: slot,
    [queryOutcome]: outcome,
  });
}

/** True only when `authority` was minted for this slot and this outcome. */
export function hasFeedsQueryAuthority(authority: unknown, slot: string, outcome: FeedsAuthorityOutcome): boolean {
  if (typeof authority !== "object" || authority === null) return false;
  const token = authority as { [queryAuthority]?: unknown; [queryOutcome]?: unknown };
  return token[queryAuthority] === slot && token[queryOutcome] === outcome;
}

export type UnloadedState = { kind: "UNKNOWN" } | { kind: "NOT_LOADED" };

export const UNKNOWN_STATE: { kind: "UNKNOWN" } = { kind: "UNKNOWN" };
export const NOT_LOADED_STATE: { kind: "NOT_LOADED" } = { kind: "NOT_LOADED" };

export type ConnectedSourceRow = {
  name: string;
  role: string;
};

export type ConnectedSourcesLoadState =
  | UnloadedState
  | { kind: "VERIFIED_EMPTY"; authority: FeedsQueryAuthority<"connectedSources", "EMPTY"> }
  | {
      kind: "VERIFIED_CONNECTED";
      authority: FeedsQueryAuthority<"connectedSources", "CONNECTED">;
      sources: readonly ConnectedSourceRow[];
    };

export type FeedQueuePendingItem = {
  id: string;
  title: string;
  description: string;
  source: string;
  filedDate: Date;
  kind: string;
  payload: unknown;
  status: "PENDING";
};

export type FeedQueueResolvedItem = {
  id: string;
  title: string;
  source: string;
  resolvedAt: Date | null;
  status: string;
};

/** Structural row from a successful getFeedQueueItems read. */
export type FeedQueueQueryItem = {
  id: string;
  title: string;
  description: string;
  source: string;
  filedDate: Date;
  kind: string;
  payload: unknown;
  status: string;
  resolvedAt?: Date | null;
};

export type ReviewQueueLoadState =
  | UnloadedState
  | {
      kind: "VERIFIED_EMPTY";
      authority: FeedsQueryAuthority<"reviewQueue", "EMPTY">;
      resolved: readonly FeedQueueResolvedItem[];
    }
  | {
      kind: "VERIFIED_POPULATED";
      authority: FeedsQueryAuthority<"reviewQueue", "POPULATED">;
      pending: readonly FeedQueuePendingItem[];
      resolved: readonly FeedQueueResolvedItem[];
    };

export type FeedsLoad = {
  connectedSources: ConnectedSourcesLoadState;
  reviewQueue: ReviewQueueLoadState;
};

/** Both Feeds buyer slots while their sources have not been read. */
export const UNWIRED_FEEDS_LOAD: FeedsLoad = {
  connectedSources: UNKNOWN_STATE,
  reviewQueue: UNKNOWN_STATE,
};

type RegistryQuery =
  | { queried: false }
  | { queried: true; outcome: "failed" }
  | { queried: true; outcome: "skipped" }
  | { queried: true; outcome: "not_loaded" }
  | { queried: true; outcome: "empty" }
  | { queried: true; outcome: "not_probed"; recordCount: number };

/**
 * Connection-registry read. This constructor never mints VERIFIED_CONNECTED.
 * `not_probed` stays UNKNOWN for every record count, including zero.
 * VERIFIED_EMPTY is minted only for `outcome: "empty"`.
 */
export function connectedSourcesStateFromRegistry(input: RegistryQuery): ConnectedSourcesLoadState {
  if (!input.queried) return NOT_LOADED_STATE;
  switch (input.outcome) {
    case "failed":
    case "skipped":
      return UNKNOWN_STATE;
    case "not_loaded":
      return NOT_LOADED_STATE;
    case "empty":
      return { kind: "VERIFIED_EMPTY", authority: mintAuthority("connectedSources", "EMPTY") };
    case "not_probed":
      if (!Number.isInteger(input.recordCount) || input.recordCount < 0) return UNKNOWN_STATE;
      return UNKNOWN_STATE;
    default:
      return UNKNOWN_STATE;
  }
}

type ProbeSource = { name: string; role: string; probeOk: true };

type ProbeQuery =
  | { probed: false }
  | { probed: true; outcome: "failed" }
  | { probed: true; outcome: "skipped" }
  | { probed: true; outcome: "connected"; sources: readonly ProbeSource[] };

/**
 * Healthy connection mark. Minted only when a probe result says each listed
 * source is healthy. An empty probe result is UNKNOWN, not verified-empty.
 * Not probed, failed, and skipped stay UNKNOWN.
 */
export function connectedSourcesStateFromProbe(input: ProbeQuery): ConnectedSourcesLoadState {
  if (!input.probed) return UNKNOWN_STATE;
  switch (input.outcome) {
    case "failed":
    case "skipped":
      return UNKNOWN_STATE;
    case "connected": {
      if (input.sources.length === 0) return UNKNOWN_STATE;
      const sources: ConnectedSourceRow[] = [];
      for (const source of input.sources) {
        if (source.probeOk !== true) return UNKNOWN_STATE;
        const name = source.name.trim();
        const role = source.role.trim();
        if (name.length === 0 || role.length === 0) return UNKNOWN_STATE;
        sources.push({ name, role });
      }
      return {
        kind: "VERIFIED_CONNECTED",
        authority: mintAuthority("connectedSources", "CONNECTED"),
        sources,
      };
    }
    default:
      return UNKNOWN_STATE;
  }
}

/**
 * Successful registry count.
 * Zero rows mint VERIFIED_EMPTY. A positive count is not a probe, so the
 * slot stays UNKNOWN. A non-integer or negative count stays UNKNOWN.
 */
export function connectedSourcesStateFromSuccessfulRead(recordCount: number): ConnectedSourcesLoadState {
  if (!Number.isInteger(recordCount) || recordCount < 0) return UNKNOWN_STATE;
  if (recordCount === 0) return connectedSourcesStateFromRegistry({ queried: true, outcome: "empty" });
  return connectedSourcesStateFromRegistry({ queried: true, outcome: "not_probed", recordCount });
}

function verifiedKindOutcome(kind: "VERIFIED_EMPTY" | "VERIFIED_POPULATED" | "VERIFIED_CONNECTED"): FeedsAuthorityOutcome {
  if (kind === "VERIFIED_EMPTY") return "EMPTY";
  if (kind === "VERIFIED_POPULATED") return "POPULATED";
  return "CONNECTED";
}

export function presentConnectedSources(state: ConnectedSourcesLoadState): ConnectedSourcesLoadState {
  if (state.kind !== "VERIFIED_EMPTY" && state.kind !== "VERIFIED_CONNECTED") return state;
  if (!hasFeedsQueryAuthority(state.authority, "connectedSources", verifiedKindOutcome(state.kind))) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_CONNECTED" && state.sources.length === 0) return UNKNOWN_STATE;
  if (
    state.kind === "VERIFIED_CONNECTED" &&
    state.sources.some((source) => source.name.trim() === "" || source.role.trim() === "")
  ) {
    return UNKNOWN_STATE;
  }
  return state;
}

type QueueQuery =
  | { queried: false }
  | { queried: true; outcome: "failed" }
  | { queried: true; outcome: "skipped" }
  | { queried: true; outcome: "not_loaded" }
  | { queried: true; outcome: "empty"; resolved?: readonly FeedQueueResolvedItem[] }
  | {
      queried: true;
      outcome: "populated";
      pending: readonly FeedQueuePendingItem[];
      resolved?: readonly FeedQueueResolvedItem[];
    };

function cleanResolved(resolved: readonly FeedQueueResolvedItem[] | undefined): FeedQueueResolvedItem[] | null {
  if (!resolved) return [];
  const rows: FeedQueueResolvedItem[] = [];
  for (const item of resolved) {
    if (item.status === "PENDING") return null;
    if (item.id.trim() === "") return null;
    rows.push({
      id: item.id,
      title: item.title,
      source: item.source,
      resolvedAt: item.resolvedAt,
      status: item.status,
    });
  }
  return rows;
}

/**
 * Queue state from an explicit query outcome.
 * VERIFIED_EMPTY is minted only for `outcome: "empty"`.
 * `outcome: "populated"` with zero PENDING stays UNKNOWN and does not
 * collapse into verified-empty.
 */
export function reviewQueueStateFromQuery(input: QueueQuery): ReviewQueueLoadState {
  if (!input.queried) return NOT_LOADED_STATE;
  switch (input.outcome) {
    case "failed":
    case "skipped":
      return UNKNOWN_STATE;
    case "not_loaded":
      return NOT_LOADED_STATE;
    case "empty": {
      const resolved = cleanResolved(input.resolved);
      if (resolved === null) return UNKNOWN_STATE;
      return { kind: "VERIFIED_EMPTY", authority: mintAuthority("reviewQueue", "EMPTY"), resolved };
    }
    case "populated": {
      if (input.pending.length === 0) return UNKNOWN_STATE;
      const pending: FeedQueuePendingItem[] = [];
      for (const item of input.pending) {
        if ((item.status as string) !== "PENDING") return UNKNOWN_STATE;
        if (item.id.trim() === "") return UNKNOWN_STATE;
        pending.push({
          id: item.id,
          title: item.title,
          description: item.description,
          source: item.source,
          filedDate: item.filedDate,
          kind: item.kind,
          payload: item.payload,
          status: "PENDING",
        });
      }
      const resolved = cleanResolved(input.resolved);
      if (resolved === null) return UNKNOWN_STATE;
      return {
        kind: "VERIFIED_POPULATED",
        authority: mintAuthority("reviewQueue", "POPULATED"),
        pending,
        resolved,
      };
    }
    default:
      return UNKNOWN_STATE;
  }
}

function toResolved(item: FeedQueueQueryItem): FeedQueueResolvedItem {
  return {
    id: item.id,
    title: item.title,
    source: item.source,
    resolvedAt: item.resolvedAt ?? null,
    status: item.status,
  };
}

function toPending(item: FeedQueueQueryItem): FeedQueuePendingItem {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    source: item.source,
    filedDate: item.filedDate,
    kind: item.kind,
    payload: item.payload,
    status: "PENDING",
  };
}

/**
 * Maps a successful getFeedQueueItems result.
 * Call this only after the read returns. A thrown or skipped read must use
 * `reviewQueueStateFromQuery` with `outcome: "failed"` (UNKNOWN), not `[]`.
 */
export function reviewQueueStateFromSuccessfulRead(items: readonly FeedQueueQueryItem[]): ReviewQueueLoadState {
  const pending = items.filter((item) => item.status === "PENDING").map(toPending);
  const resolved = items
    .filter((item) => item.status !== "PENDING")
    .map(toResolved)
    .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0));
  if (pending.length === 0) {
    return reviewQueueStateFromQuery({ queried: true, outcome: "empty", resolved });
  }
  return reviewQueueStateFromQuery({ queried: true, outcome: "populated", pending, resolved });
}

export function presentReviewQueue(state: ReviewQueueLoadState): ReviewQueueLoadState {
  if (state.kind !== "VERIFIED_EMPTY" && state.kind !== "VERIFIED_POPULATED") return state;
  if (!hasFeedsQueryAuthority(state.authority, "reviewQueue", verifiedKindOutcome(state.kind))) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED" && state.pending.length === 0) return UNKNOWN_STATE;
  if (state.kind === "VERIFIED_POPULATED" && state.pending.some((item) => (item.status as string) !== "PENDING")) {
    return UNKNOWN_STATE;
  }
  if (state.resolved.some((item) => item.status === "PENDING")) return UNKNOWN_STATE;
  return state;
}
