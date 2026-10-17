/**
 * Bounded EDGAR expand slice for the standalone flywheel.
 * Requires an identifying SEC contact from env (never invents one).
 * No paid LLM calls.
 */

import { requireSecUserAgentFromEnv } from "../edgar-historical-backfill/sec-identity";

export interface EdgarSliceResult {
  status: "OK" | "SKIPPED_CONFIG" | "FAILED";
  fetched: number;
  detail: Record<string, unknown>;
  errorMessage?: string;
}

export async function runEdgarExpandSlice(opts?: {
  limit?: number;
  live?: boolean;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<EdgarSliceResult> {
  const env = opts?.env ?? process.env;
  const limit = opts?.limit ?? Number(env.FLYWHEEL_EDGAR_LIMIT ?? 2);

  let userAgent: string;
  try {
    userAgent = requireSecUserAgentFromEnv(env);
  } catch (err) {
    return {
      status: "SKIPPED_CONFIG",
      fetched: 0,
      detail: { reason: "SEC contact unset or placeholder" },
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }

  const liveAuthorized =
    env.KF_MASS_PRECEDENT_LIVE_WRITE === "I_AUTHORIZE_NEON_BULK_WRITE" &&
    env.FLYWHEEL_EDGAR_LIVE === "1";
  const live = Boolean(opts?.live) && liveAuthorized;

  if (!live) {
    return {
      status: "SKIPPED_CONFIG",
      fetched: 0,
      detail: {
        reason: "EDGAR live disabled",
        userAgentPresent: Boolean(userAgent),
        require: "FLYWHEEL_EDGAR_LIVE=1 and KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE",
        limit,
      },
    };
  }

  try {
    const { persistSecManifestBatch } = await import(
      "../knowledge-factory/mass-precedent/sec-batch-persist"
    );
    const result = await persistSecManifestBatch({ limit, live: true });
    return {
      status: "OK",
      fetched: Number((result as { persisted?: number }).persisted ?? (result as { fetched?: number }).fetched ?? 0),
      detail: { result, limit, userAgentSet: true },
    };
  } catch (err) {
    return {
      status: "FAILED",
      fetched: 0,
      detail: { limit },
      errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
    };
  }
}
