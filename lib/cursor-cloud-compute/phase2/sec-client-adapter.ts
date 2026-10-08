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

function resolveExport<T>(mod: Record<string, unknown>, name: string): T | null {
  const direct = mod[name];
  if (typeof direct === "function" || (typeof direct === "object" && direct)) return direct as T;
  const def = mod.default as Record<string, unknown> | undefined;
  if (def && (typeof def[name] === "function" || typeof def[name] === "object")) return def[name] as T;
  if (typeof mod.default === "function" && name === "default") return mod.default as T;
  return null;
}

async function tryImportCkf(ckfRoot: string, cacheDir: string, logDir: string): Promise<Phase2SecClient | null> {
  const httpPath = path.join(ckfRoot, "lib/knowledge-factory/edgar/http.ts");
  if (!fs.existsSync(httpPath)) return null;
  try {
    const mod = (await import(pathToFileURL(httpPath).href)) as Record<string, unknown>;
    const SecHttpClient = resolveExport<new (config: Record<string, unknown>) => {
      get(url: string, opts?: { bypassCache?: boolean }): Promise<{ status: number; body: Buffer; fromCache: boolean; url: string }>;
      metrics(): { requestCount: number; downloadBytes: number };
      userAgent: string;
    }>(mod, "SecHttpClient");
    if (!SecHttpClient) return null;
    // Use the same identifying UA family as lib/connectors/edgar-connector.ts so
    // fair-access / Akamai policy matches the verified onboarding connector path.
    const client = new SecHttpClient({
      cacheDir,
      logDir,
      userAgent: "Headroom/1.0 (contact: engineering@headroom-app.example; WS-CCA via CKF SecHttpClient)",
      rateLimit: { maxRequests: 5, windowMs: 1000, minIntervalMs: 200 },
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
  } catch {
    return null;
  }
}

async function tryImportEhb(ehbRoot: string, cacheDir: string): Promise<Phase2SecClient | null> {
  const secPath = path.join(ehbRoot, "lib/edgar-historical-backfill/sec-access.ts");
  if (!fs.existsSync(secPath)) return null;
  try {
    const mod = (await import(pathToFileURL(secPath).href)) as Record<string, unknown>;
    const SecAccessCoordinator = resolveExport<new (opts: Record<string, unknown>) => {
      getText?(url: string): Promise<{ status: number; text: string; fromCache: boolean; url: string }>;
      fetchText?(url: string): Promise<{ status: number; text: string; fromCache: boolean; url: string }>;
      getRequestCount(): number;
    }>(mod, "SecAccessCoordinator");
    if (!SecAccessCoordinator) return null;
    const coord = new SecAccessCoordinator({
      cacheDir,
      maxConcurrency: 2,
      maxRequestsPerSecond: 5,
      userAgent: "Headroom/1.0 (contact: engineering@headroom-app.example; WS-CCA via EHB SecAccessCoordinator)",
    });
    const getText = (coord.getText ?? coord.fetchText)?.bind(coord);
    if (!getText) return null;
    let downloadBytes = 0;
    return {
      provider: "ehb-SecAccessCoordinator",
      async get(url) {
        const res = await getText(url);
        const body = Buffer.from(res.text, "utf-8");
        if (!res.fromCache) downloadBytes += body.length;
        return { status: res.status, body, fromCache: res.fromCache, url: res.url };
      },
      metrics: () => ({ requestCount: coord.getRequestCount(), downloadBytes }),
    };
  } catch {
    return null;
  }
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

  // Prefer EHB SecAccessCoordinator for exhibit-body GETs: measured on this host,
  // CKF SecHttpClient currently receives Akamai 403 for the same URL/UA that EHB
  // and raw fetch retrieve successfully (Accept/UA alone do not explain it).
  // Still try CKF first when HEADROOM_SEC_CLIENT=ckf is set for A/B.
  const prefer = (process.env.HEADROOM_SEC_CLIENT ?? "ehb").toLowerCase();
  const order = prefer === "ckf" ? ["ckf", "ehb"] : ["ehb", "ckf"];
  for (const which of order) {
    if (which === "ehb" && ehbRoot) {
      const ehb = await tryImportEhb(ehbRoot, options.cacheDir);
      if (ehb) return ehb;
    }
    if (which === "ckf" && ckfRoot) {
      const ckf = await tryImportCkf(ckfRoot, options.cacheDir, options.logDir);
      if (ckf) return ckf;
    }
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
