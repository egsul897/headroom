/**
 * SEC transport adapter for WS-CCA Phase 2/3.
 *
 * WS-EHB owns live SEC acquisition. Prefer EHB `SecAccessCoordinator` under
 * fleet fair-access policy (designated owner or shared budget). Never invent
 * a third independent SEC flooder. Require an authorized User-Agent — never
 * invent a placeholder contact.
 *
 * Soft gate. IMPLEMENTED ≠ CERTIFIED.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveAuthorizedUserAgent } from "../phase3/fleet-sec";

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
  userAgent: string;
  fleetMode: "designated-owner" | "shared-budget" | "cache-only";
}

function resolveExport<T>(mod: Record<string, unknown>, name: string): T | null {
  const direct = mod[name];
  if (typeof direct === "function" || (typeof direct === "object" && direct)) return direct as T;
  const def = mod.default as Record<string, unknown> | undefined;
  if (def && (typeof def[name] === "function" || typeof def[name] === "object")) return def[name] as T;
  if (typeof mod.default === "function" && name === "default") return mod.default as T;
  return null;
}

function fleetModeFromEnv(env: NodeJS.ProcessEnv): Phase2SecClient["fleetMode"] {
  if (env.HEADROOM_SEC_SHARED_BUDGET_PATH?.trim()) return "shared-budget";
  const owner = env.HEADROOM_SEC_FETCH_OWNER?.trim() || "NONE";
  if (owner === "WS-EHB" || owner === "WS-CKF") return "designated-owner";
  return "cache-only";
}

async function tryImportEhb(
  ehbRoot: string,
  cacheDir: string,
  userAgent: string,
  env: NodeJS.ProcessEnv,
): Promise<Phase2SecClient | null> {
  const secPath = path.join(ehbRoot, "lib/edgar-historical-backfill/sec-access.ts");
  if (!fs.existsSync(secPath)) return null;
  try {
    const mod = (await import(pathToFileURL(secPath).href)) as Record<string, unknown>;
    const SecAccessCoordinator = resolveExport<
      new (opts: Record<string, unknown>) => {
        getText?(url: string): Promise<{ status: number; text: string; fromCache: boolean; url: string }>;
        fetchText?(url: string): Promise<{ status: number; text: string; fromCache: boolean; url: string }>;
        getRequestCount(): number;
      }
    >(mod, "SecAccessCoordinator");
    if (!SecAccessCoordinator) return null;
    const mode = fleetModeFromEnv(env);
    const coord = new SecAccessCoordinator({
      cacheDir,
      maxConcurrency: 2,
      maxRequestsPerSecond: 5,
      userAgent,
      role: "WS-EHB",
      // When CCA is not allowed to live-fetch, force cache-only.
      cacheOnly: mode === "cache-only",
      env,
    });
    const getText = (coord.getText ?? coord.fetchText)?.bind(coord);
    if (!getText) return null;
    let downloadBytes = 0;
    return {
      provider: "ehb-SecAccessCoordinator",
      userAgent,
      fleetMode: mode,
      async get(url) {
        const res = await getText(url);
        const body = Buffer.from(res.text, "utf-8");
        if (!res.fromCache) downloadBytes += body.length;
        return { status: res.status, body, fromCache: res.fromCache, url: res.url };
      },
      metrics: () => ({ requestCount: coord.getRequestCount(), downloadBytes }),
    };
  } catch (err) {
    console.warn(
      `[sec-client-adapter] EHB SecAccessCoordinator unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

async function tryImportCkf(
  ckfRoot: string,
  cacheDir: string,
  logDir: string,
  userAgent: string,
  env: NodeJS.ProcessEnv,
): Promise<Phase2SecClient | null> {
  // Only when explicitly designated or for A/B — default acquisition owner is WS-EHB.
  const owner = env.HEADROOM_SEC_FETCH_OWNER?.trim() || "NONE";
  if (owner !== "WS-CKF" && (env.HEADROOM_SEC_CLIENT ?? "ehb").toLowerCase() !== "ckf") {
    return null;
  }
  const httpPath = path.join(ckfRoot, "lib/knowledge-factory/edgar/http.ts");
  if (!fs.existsSync(httpPath)) return null;
  try {
    const mod = (await import(pathToFileURL(httpPath).href)) as Record<string, unknown>;
    const SecHttpClient = resolveExport<
      new (config: Record<string, unknown>) => {
        get(
          url: string,
          opts?: { bypassCache?: boolean },
        ): Promise<{ status: number; body: Buffer; fromCache: boolean; url: string }>;
        metrics(): { requestCount: number; downloadBytes: number };
        userAgent: string;
      }
    >(mod, "SecHttpClient");
    if (!SecHttpClient) return null;
    const client = new SecHttpClient({
      cacheDir,
      logDir,
      userAgent,
      rateLimit: { maxRequests: 5, windowMs: 1000, minIntervalMs: 200 },
      maxBytes: 30 * 1024 * 1024,
    });
    return {
      provider: "ckf-SecHttpClient",
      userAgent,
      fleetMode: fleetModeFromEnv(env),
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

export async function createPhase2SecClient(options: {
  cacheDir: string;
  logDir: string;
  ckfRoot?: string | null;
  ehbRoot?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<Phase2SecClient> {
  fs.mkdirSync(options.cacheDir, { recursive: true });
  fs.mkdirSync(options.logDir, { recursive: true });
  const env = options.env ?? process.env;

  const ua = resolveAuthorizedUserAgent(env);
  if (!ua) {
    throw new Error(
      "Live/cached SEC client requires SEC_EDGAR_USER_AGENT or SEC_EDGAR_CONTACT_EMAIL with an authorized contact. No placeholder default is invented.",
    );
  }

  const ckfRoot = options.ckfRoot ?? env.HEADROOM_CKF_ROOT ?? null;
  const ehbRoot = options.ehbRoot ?? env.HEADROOM_EHB_ROOT ?? null;

  // Default: WS-EHB owns acquisition. Prefer EHB unless HEADROOM_SEC_CLIENT=ckf.
  const prefer = (env.HEADROOM_SEC_CLIENT ?? "ehb").toLowerCase();
  const order = prefer === "ckf" ? ["ckf", "ehb"] : ["ehb", "ckf"];
  for (const which of order) {
    if (which === "ehb" && ehbRoot) {
      const ehb = await tryImportEhb(ehbRoot, options.cacheDir, ua, env);
      if (ehb) return ehb;
    }
    if (which === "ckf" && ckfRoot) {
      const ckf = await tryImportCkf(ckfRoot, options.cacheDir, options.logDir, ua, env);
      if (ckf) return ckf;
    }
  }

  throw new Error(
    "Phase2SecClient: neither CKF SecHttpClient nor EHB SecAccessCoordinator is available under fleet policy. " +
      "Set HEADROOM_EHB_ROOT (preferred owner) and HEADROOM_SEC_FETCH_OWNER=WS-EHB. " +
      "WS-CCA must not invent a competing SEC downloader.",
  );
}

export function contentHash(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
