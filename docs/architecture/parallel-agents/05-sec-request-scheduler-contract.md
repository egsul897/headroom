# Centralized SEC request scheduler — contract (WS-PAR publish / WS-CKF implement)

**Status:** DRAFT_CONTRACT  
**Owner of contract docs:** `WS-PAR`  
**Owner of production implementation:** `WS-CKF` (`lib/covenant-knowledge/sec-scheduler/**` once published)  
**Consumers:** `WS-EHB` and any other agent that would otherwise call SEC.gov  
**Mock for independence:** `scripts/parallel-agents/mocks/sec-scheduler-mock.ts`

## Why

Parallel corpus agents must **not** independently flood SEC infrastructure. One scheduler owns fair-access budget, User-Agent identity, pacing, and retry policy.

## Non-negotiables

1. Every SEC HTTP request goes through the scheduler API (discover, fetch submissions, fetch exhibit bytes, company tickers, etc.).
2. Preserve the existing EDGAR connector’s User-Agent discipline (`lib/connectors/edgar-connector.ts`).
3. No evasion of SEC fair-access (no rotating anonymous agents, no credential stuffing, no TOR tricks).
4. Metadata-first: prefer index/submissions JSON before exhibit byte downloads.
5. WS-EHB must queue historical backfill work through this scheduler; it must not ship a second downloader.

## Interface (TypeScript shape)

```ts
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
  // Idempotency key for deduping identical pending requests
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
  /** Convenience: enqueue + await */
  fetch(req: SecSchedulerRequest): Promise<SecSchedulerResult>;
  getBudget(): Promise<{ windowSeconds: number; requestsRemaining: number; inFlight: number }>;
}
```

## Ownership

| Surface | Owner |
| --- | --- |
| Contract + mock | WS-PAR |
| Production scheduler + shared budget persistence | WS-CKF |
| Backfill queue producing scheduler jobs | WS-EHB |
| Existing `EdgarConnector` | extendViaNewSiblingOnly — factory may inject scheduler; no silent rewrite of fair-access headers |

## Soft gates

- No paid infra for the scheduler.
- No bypass flag that lets peer agents call `fetch(sec.gov)` directly in production paths.
- Coordinator does not implement the production scheduler inside CKF trees.
