/**
 * Fleet SEC request-budget contract (WS-EHB ↔ WS-CKF).
 *
 * HONEST SCOPE:
 * - The in-process SecAccessCoordinator rate-limits workers **inside one Node
 *   process only**. It does NOT coordinate separate Cursor Cloud Agents
 *   (separate VMs / processes). Claiming fleet-wide enforcement from
 *   process-local counters would be false.
 *
 * - This module defines an **explicit shared budget contract**. When a durable
 *   shared budget file is configured (`HEADROOM_SEC_SHARED_BUDGET_PATH`) and
 *   reachable by both workstreams on the same host/volume, it provides
 *   cooperative leasing. Across distinct Cloud Agent VMs with no shared
 *   filesystem, operators MUST designate a single live SEC-fetch owner via
 *   `HEADROOM_SEC_FETCH_OWNER` and keep other agents on cache-only / deferred.
 *
 * Roles:
 * - WS-EHB — discovery metadata (submissions, indexes, primary exhibit lists)
 * - WS-CKF — exhibit-body acquisition (canonical downloader)
 *
 * Default policy when no shared budget path exists: only the designated owner
 * may perform live network GETs; others must fail closed or use cache-only.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const SEC_BUDGET_CONTRACT_VERSION = 1 as const;

export type SecFetchOwnerRole = "WS-EHB" | "WS-CKF" | "NONE" | string;

export interface SecSharedBudgetFile {
  version: typeof SEC_BUDGET_CONTRACT_VERSION;
  /** Wall-clock ms; advisory lease for who may live-fetch right now. */
  leaseHolder: SecFetchOwnerRole | null;
  leaseExpiresAtMs: number;
  /** Soft RPS target shared across cooperating processes on this volume. */
  maxRequestsPerSecond: number;
  /** Tokens remaining in the current window (token bucket). */
  tokens: number;
  windowStartedAtMs: number;
  /** Cumulative live (non-cache) requests recorded by cooperating clients. */
  liveRequestCount: number;
  updatedAt: string;
  notes: string[];
}

export interface SecAccessPolicy {
  role: SecFetchOwnerRole;
  userAgent: string;
  /** True when this process may open live SEC network requests. */
  liveNetworkAllowed: boolean;
  /** Why live is allowed or denied. */
  reason: string;
  /** True when a shared budget file is configured and usable. */
  sharedBudgetConfigured: boolean;
  /** Explicit: process-local limiter is NOT fleet-wide. */
  processLocalLimiterOnly: true;
  sharedBudgetPath: string | null;
}

/** Loose env bag — avoids requiring NODE_ENV on partial test doubles. */
export type SecEnvBag = Record<string, string | undefined>;

export function readSecFetchOwner(env: SecEnvBag = process.env): SecFetchOwnerRole {
  return (env.HEADROOM_SEC_FETCH_OWNER?.trim() || "NONE") as SecFetchOwnerRole;
}

export function sharedBudgetPath(env: SecEnvBag = process.env): string | null {
  const p = env.HEADROOM_SEC_SHARED_BUDGET_PATH?.trim();
  return p || null;
}

export function evaluateSecAccessPolicy(params: {
  role: SecFetchOwnerRole;
  userAgent: string;
  env?: SecEnvBag;
  nowMs?: number;
}): SecAccessPolicy {
  const env = params.env ?? process.env;
  const path = sharedBudgetPath(env);
  const owner = readSecFetchOwner(env);
  const base = {
    role: params.role,
    userAgent: params.userAgent,
    processLocalLimiterOnly: true as const,
    sharedBudgetPath: path,
  };

  if (path) {
    // Shared file present → cooperative lease; role may acquire if free/expired or already held.
    return {
      ...base,
      liveNetworkAllowed: true,
      sharedBudgetConfigured: true,
      reason: `Shared budget path configured (${path}); live GETs must acquireLease() before each burst. Process-local RPS still applies inside this process.`,
    };
  }

  if (owner === "NONE") {
    return {
      ...base,
      liveNetworkAllowed: false,
      sharedBudgetConfigured: false,
      reason:
        "No HEADROOM_SEC_SHARED_BUDGET_PATH and HEADROOM_SEC_FETCH_OWNER=NONE. Refusing live SEC network to prevent uncontrolled parallel acquisition across fleet agents. Set HEADROOM_SEC_FETCH_OWNER=WS-EHB (discovery) or WS-CKF (acquisition) for a single designated owner, or provide a shared budget path on a common volume.",
    };
  }

  if (owner !== params.role) {
    return {
      ...base,
      liveNetworkAllowed: false,
      sharedBudgetConfigured: false,
      reason: `Designated SEC-fetch owner is ${owner}; this process role is ${params.role}. Live network denied (cache-only / deferred). Process-local counters cannot enforce fleet-wide limits.`,
    };
  }

  return {
    ...base,
    liveNetworkAllowed: true,
    sharedBudgetConfigured: false,
    reason: `This process is the designated SEC-fetch owner (${owner}). In-process limiter applies here only — other Cloud Agents must not live-fetch concurrently unless a shared budget path is configured.`,
  };
}

function defaultBudget(nowMs: number, rps: number): SecSharedBudgetFile {
  return {
    version: SEC_BUDGET_CONTRACT_VERSION,
    leaseHolder: null,
    leaseExpiresAtMs: 0,
    maxRequestsPerSecond: rps,
    tokens: rps,
    windowStartedAtMs: nowMs,
    liveRequestCount: 0,
    updatedAt: new Date(nowMs).toISOString(),
    notes: [
      "Cooperative advisory budget for processes sharing this file.",
      "Does not magically span Cursor Cloud Agents without a shared volume.",
    ],
  };
}

export function loadOrInitSharedBudget(path: string, opts?: { rps?: number; nowMs?: number }): SecSharedBudgetFile {
  const nowMs = opts?.nowMs ?? Date.now();
  const rps = opts?.rps ?? 6;
  if (!existsSync(path)) {
    const b = defaultBudget(nowMs, rps);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(b, null, 2));
    return b;
  }
  return JSON.parse(readFileSync(path, "utf8")) as SecSharedBudgetFile;
}

function saveBudget(path: string, budget: SecSharedBudgetFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(budget, null, 2));
  renameSync(tmp, path);
}

/**
 * Acquire a short advisory lease + consume one token. Returns false if another
 * holder owns a non-expired lease or tokens are exhausted (caller should wait).
 */
export function tryAcquireSharedBudgetToken(params: {
  path: string;
  role: SecFetchOwnerRole;
  leaseMs?: number;
  nowMs?: number;
}): { ok: boolean; budget: SecSharedBudgetFile; detail: string } {
  const nowMs = params.nowMs ?? Date.now();
  const leaseMs = params.leaseMs ?? 5_000;
  const budget = loadOrInitSharedBudget(params.path, { nowMs });

  // Refill tokens each second window.
  const elapsed = nowMs - budget.windowStartedAtMs;
  if (elapsed >= 1000) {
    const windows = Math.floor(elapsed / 1000);
    budget.tokens = Math.min(budget.maxRequestsPerSecond, budget.tokens + windows * budget.maxRequestsPerSecond);
    budget.windowStartedAtMs += windows * 1000;
  }

  if (budget.leaseHolder && budget.leaseHolder !== params.role && budget.leaseExpiresAtMs > nowMs) {
    return { ok: false, budget, detail: `Lease held by ${budget.leaseHolder} until ${budget.leaseExpiresAtMs}` };
  }
  if (budget.tokens < 1) {
    return { ok: false, budget, detail: "Shared budget tokens exhausted this window" };
  }

  budget.leaseHolder = params.role;
  budget.leaseExpiresAtMs = nowMs + leaseMs;
  budget.tokens -= 1;
  budget.liveRequestCount += 1;
  budget.updatedAt = new Date(nowMs).toISOString();
  saveBudget(params.path, budget);
  return { ok: true, budget, detail: "token acquired" };
}
