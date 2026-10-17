/**
 * Bounded HTTPS precedent-import slice for the standalone flywheel.
 */

import {
  importPrecedentsOverHttps,
  isLiveAuthorized,
} from "../neon-https/precedent-import";
import type { NeonHttpsExecutor } from "../covenant-learning-factory/store/neon-transport";

export interface PrecedentSliceResult {
  status: "OK" | "SKIPPED_CONFIG" | "FAILED";
  detail: Record<string, unknown>;
  errorMessage?: string;
}

export async function runPrecedentImportSlice(opts: {
  executor: NeonHttpsExecutor;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
}): Promise<PrecedentSliceResult> {
  const env = opts.env ?? process.env;
  const live = isLiveAuthorized(env) && env.FLYWHEEL_PRECEDENT_LIVE === "1";

  if (!live) {
    return {
      status: "SKIPPED_CONFIG",
      detail: {
        reason: "precedent live disabled",
        require:
          "FLYWHEEL_PRECEDENT_LIVE=1 and KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE",
      },
    };
  }

  try {
    const result = await importPrecedentsOverHttps(opts.executor, {
      live: true,
      batchSize: Number(env.FLYWHEEL_PRECEDENT_BATCH ?? 50),
      limitBytes: Number(env.FLYWHEEL_PRECEDENT_LIMIT_BYTES ?? 10),
      limitExportRows: Number(env.FLYWHEEL_PRECEDENT_LIMIT_ROWS ?? 500),
    });
    return {
      status: result.ok ? "OK" : "FAILED",
      detail: {
        stages: result.stages,
        counts: result.counts,
        errors: result.errors.slice(0, 5),
      },
      errorMessage: result.ok ? undefined : result.detail,
    };
  } catch (err) {
    return {
      status: "FAILED",
      detail: {},
      errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
    };
  }
}
