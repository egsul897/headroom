/** NS-4 slice 1 — append-only approved financial snapshot store (public exports). */
export type {
  AppendSnapshotRequest,
  ApprovalTransition,
  SnapshotAppendedEvent,
  SnapshotApprovedEvent,
  SnapshotSupersededEvent,
  StoreEvent,
  StoreEventType,
  StoreWriteIssue,
  StoreWriteIssueCode,
  WriteOk,
  WriteRejected,
  WriteResult,
} from "./types";
export { APPENDABLE_STATUSES, APPEND_REFUSED_STATUSES, graphIssuesToStoreIssues } from "./types";
export { InMemoryApprovedSnapshotStore } from "./memory-store";
export {
  appendSnapshot,
  approveSnapshot,
  cloneSnapshot,
  getSnapshot,
  getSnapshots,
  materializeFromEvents,
  type SnapshotStoreBackend,
} from "./write";
