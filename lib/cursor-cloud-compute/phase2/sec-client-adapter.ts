/**
 * SEC transport adapter for WS-CCA Phase 2.
 *
 * Prefer WS-CKF `SecHttpClient` (canonical acquisition transport) when
 * HEADROOM_CKF_ROOT points at a checked-out CKF tree. Otherwise fall back to
 * WS-EHB `SecAccessCoordinator` (discovery transport). Never invent a third
 * independent SEC flooder.
 *
 * Soft gate. IMPLEMENTED ≠ CERTIFIED.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface SecGetResult {
  status: number;
  body: Buffer;
  fromCache: boolean;
  url: string;
}

export interface Phase2SecClient {
  get(url: string, opts?: { bypassCache?: boolean }): Promise<SecGetResult>;
  metrics(): { requestCount: number; downloadBytes: number };
  provider: "ckf-SecHttpClient" | "ehb-SecAccessCoordinator";
}

async function tryImportCkf(ckfRoot: string, cacheDir: string, logDir: string): Promise<Phase2SecClient | null> {
  const httpPath = path.join(ckfRoot, "lib/knowledge-factory/edgar/http.ts");
  if (!fs.existsSync(httpPath)) return null;
  const mod = await import(pathToFileURL(httpPath).href);
  const client = new mod.SecHttpClient({
    cacheDir,
    logDir,
    userAgent: "HeadroomCursorCloudCompute/1.0 (WS-CCA; contact: engineering@headroom-app.example; uses CKF SecHttpClient)",
    rateLimit: { maxRequests: 6, windowMs: 1000, minIntervalMs: 150 },
    maxBytes: 30 * 1024 * 1024,
  });
  return {
    provider: "ckf-SecHttpClient",
    async get(url, opts) {
      const res = await client.get(url, opts);
      return { status: res.status, body: res.body, fromCache: res.fromCache, url: res.url };
    },
    metrics: () => client.metrics(),
  };
}

async function tryImportEhb(ehbRoot: string, cacheDir: string): Promise<Phase2SecClient | null> {
  const secPath = path.join(ehbRoot, "lib/edgar-historical-backfill/sec-access.ts");
  if (!fs.existsSync(secPath)) return null;
  const mod = await import(pathToFileURL(secPath).href);
  const coord = new mod.SecAccessCoordinator({
    cacheDir,
    maxConcurrency: 2,
    maxRequestsPerSecond: 5,
    userAgent: "HeadroomCursorCloudCompute/1.0 (WS-CCA; contact: engineering@headroom-app.example; uses EHB SecAccessCoordinator)",
  });
  let downloadBytes = 0;
  return {
    provider: "ehb-SecAccessCoordinator",
    async get(url) {
      const res = await coord.fetchText(url);
      const body = Buffer.from(res.text, "utf-8");
      if (!res.fromCache) downloadBytes += body.length;
      return { status: res.status, body, fromCache: res.fromCache, url: res.url };
    },
    metrics: () => ({ requestCount: coord.getRequestCount(), downloadBytes }),
  };
}

export async function createPhase2SecClient(options: {
  cacheDir: string;
  logDir: string;
  ckfRoot?: string | null;
  ehbRoot?: string | null;
}): Promise<Phase2SecClient> {
  fs.mkdirSync(options.cacheDir, { recursive: true });
  fs.mkdirSync(options.logDir, { recursive: true });

  const ckfRoot = options.ckfRoot ?? process.env.HEADROOM_CKF_ROOT ?? null;
  const ehbRoot = options.ehbRoot ?? process.env.HEADROOM_EHB_ROOT ?? null;

  if (ckfRoot) {
    const ckf = await tryImportCkf(ckfRoot, options.cacheDir, options.logDir);
    if (ckf) return ckf;
  }
  if (ehbRoot) {
    const ehb = await tryImportEhb(ehbRoot, options.cacheDir);
    if (ehb) return ehb;
  }

  throw new Error(
    "Phase2SecClient: neither CKF SecHttpClient nor EHB SecAccessCoordinator is available. " +
      "Set HEADROOM_CKF_ROOT and/or HEADROOM_EHB_ROOT to peer worktrees. " +
      "WS-CCA must not invent a competing SEC downloader.",
  );
}

export function contentHash(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
