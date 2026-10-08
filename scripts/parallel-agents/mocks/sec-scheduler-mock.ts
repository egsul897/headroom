/**
 * WS-PAR mock SecRequestScheduler for peers blocked on WS-CKF production impl.
 * Not a production SEC client — no network I/O. Deterministic fixture responses only.
 */

export type SecRequestKind =
  | "TICKERS"
  | "SUBMISSIONS"
  | "FILING_INDEX"
  | "EXHIBIT_BYTES"
  | "OTHER_SEC_JSON";

export type SecSchedulerRequest = {
  kind: SecRequestKind;
  url: string;
  workstreamId: string;
  priority: "interactive" | "backfill" | "research";
  dedupeKey: string;
};

export type SecSchedulerResult = {
  status: number;
  body: Buffer;
  fromCache: boolean;
  waitedMs: number;
  budgetRemaining: { windowSeconds: number; requestsRemaining: number };
};

export interface SecRequestScheduler {
  enqueue(req: SecSchedulerRequest): Promise<{ requestId: string }>;
  awaitResult(requestId: string, opts?: { timeoutMs?: number }): Promise<SecSchedulerResult>;
  fetch(req: SecSchedulerRequest): Promise<SecSchedulerResult>;
  getBudget(): Promise<{ windowSeconds: number; requestsRemaining: number; inFlight: number }>;
}

type Pending = {
  req: SecSchedulerRequest;
  result: SecSchedulerResult;
};

/**
 * In-memory mock: records requests, returns empty JSON 200s, enforces a tiny budget.
 * Peers use this to continue independently without hitting SEC.gov.
 */
export class MockSecRequestScheduler implements SecRequestScheduler {
  readonly #pending = new Map<string, Pending>();
  readonly #seenDedupe = new Set<string>();
  #seq = 0;
  #requestsRemaining = 10;

  async enqueue(req: SecSchedulerRequest): Promise<{ requestId: string }> {
    if (this.#seenDedupe.has(req.dedupeKey)) {
      for (const [id, p] of this.#pending) {
        if (p.req.dedupeKey === req.dedupeKey) return { requestId: id };
      }
    }
    if (this.#requestsRemaining <= 0) {
      throw new Error("MockSecRequestScheduler budget exhausted — backpressure (no SEC flood)");
    }
    this.#requestsRemaining -= 1;
    this.#seq += 1;
    const requestId = `mock-sec-${this.#seq}`;
    const result: SecSchedulerResult = {
      status: 200,
      body: Buffer.from(JSON.stringify({ mock: true, kind: req.kind, url: req.url }), "utf8"),
      fromCache: this.#seenDedupe.has(req.dedupeKey),
      waitedMs: 0,
      budgetRemaining: { windowSeconds: 1, requestsRemaining: this.#requestsRemaining },
    };
    this.#seenDedupe.add(req.dedupeKey);
    this.#pending.set(requestId, { req, result });
    return { requestId };
  }

  async awaitResult(requestId: string): Promise<SecSchedulerResult> {
    const pending = this.#pending.get(requestId);
    if (!pending) throw new Error(`Unknown mock requestId: ${requestId}`);
    return pending.result;
  }

  async fetch(req: SecSchedulerRequest): Promise<SecSchedulerResult> {
    const { requestId } = await this.enqueue(req);
    return this.awaitResult(requestId);
  }

  async getBudget(): Promise<{ windowSeconds: number; requestsRemaining: number; inFlight: number }> {
    return {
      windowSeconds: 1,
      requestsRemaining: this.#requestsRemaining,
      inFlight: 0,
    };
  }
}
