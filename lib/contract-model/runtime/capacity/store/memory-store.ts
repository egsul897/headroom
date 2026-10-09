/**
 * In-memory append-only 4C ledger store. Public surface has no raw commit.
 */
import type { LedgerUsageRecord } from "../types";
import type { AppendUsageRequest, LedgerStoreEvent, LedgerWriteResult, SupersedeUsageRequest } from "./types";
import {
  appendUsage as appendUsageWrite,
  getUsage as getUsageWrite,
  getUsages as getUsagesWrite,
  supersedeUsage as supersedeUsageWrite,
  type LedgerStoreBackend,
} from "./write";

class PrivateEventLog implements LedgerStoreBackend {
  private readonly _events: LedgerStoreEvent[] = [];

  get events(): readonly LedgerStoreEvent[] {
    return this._events;
  }

  commit(events: LedgerStoreEvent[]): void {
    for (const e of events) this._events.push(structuredClone(e));
  }

  get length(): number {
    return this._events.length;
  }
}

export class InMemoryContractLedgerStore {
  readonly #log = new PrivateEventLog();

  static fromPersistedEvents(events: readonly LedgerStoreEvent[]): InMemoryContractLedgerStore {
    const store = new InMemoryContractLedgerStore();
    if (events.length) store.#log.commit([...events]);
    return store;
  }

  get events(): readonly LedgerStoreEvent[] {
    return this.#log.events.map((e) => structuredClone(e));
  }

  eventCount(): number {
    return this.#log.length;
  }

  appendUsage(request: AppendUsageRequest): LedgerWriteResult {
    return appendUsageWrite(this.#log, request);
  }

  supersedeUsage(request: SupersedeUsageRequest): LedgerWriteResult {
    return supersedeUsageWrite(this.#log, request);
  }

  getUsages(companyId: string): LedgerUsageRecord[] {
    return getUsagesWrite(this.#log, companyId);
  }

  getUsage(usageId: string): LedgerUsageRecord | null {
    return getUsageWrite(this.#log, usageId);
  }

  /** Active (non-SUPERSEDED) usages for capacity evaluation. */
  getActiveUsages(companyId: string): LedgerUsageRecord[] {
    return this.getUsages(companyId).filter((u) => u.status !== "SUPERSEDED");
  }
}
