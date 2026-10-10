/**
 * Enforcement gate for corpus-scale graph expansion / relationship rebuild writes.
 *
 * Policy alone is insufficient: live Neon expand and global graph persist must
 * refuse unless an operator sets BOTH:
 *   1) KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE
 *   2) KF_GRAPH_REMEDIATION_RESUME=I_RESUME_GRAPH_WRITES_AFTER_REMEDIATION
 *
 * Company-scoped customer upload paths (persistAmendmentGraph({ companyId }))
 * are intentionally NOT covered — those are not corpus expand / concurrent
 * rebuild entry points.
 *
 * This gate does NOT claim database concurrency safety. TOCTOU remains open
 * until UNIQUE(discoveryKey) is authorized and applied.
 */

import { MASS_LIVE_ENV, MASS_LIVE_TOKEN } from "../acquisition/persistence-mode";

export const GRAPH_RESUME_ENV = "KF_GRAPH_REMEDIATION_RESUME" as const;
export const GRAPH_RESUME_TOKEN = "I_RESUME_GRAPH_WRITES_AFTER_REMEDIATION" as const;

export type CorpusGraphWritePurpose =
  | "neon-massive-expand"
  | "global-provision-graph-persist"
  | "global-amendment-graph-persist"
  | "relationship-graph-backfill";

export function massLiveWriteAuthorized(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return env[MASS_LIVE_ENV] === MASS_LIVE_TOKEN;
}

export function graphRemediationResumeAuthorized(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): boolean {
  return env[GRAPH_RESUME_ENV] === GRAPH_RESUME_TOKEN;
}

/**
 * Throws unless both operator tokens are present.
 * Call at every corpus-scale expand / global graph rebuild entry point.
 */
export function assertCorpusGraphWriteAuthorized(
  purpose: CorpusGraphWritePurpose,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): void {
  const missing: string[] = [];
  if (!massLiveWriteAuthorized(env)) {
    missing.push(`${MASS_LIVE_ENV}=${MASS_LIVE_TOKEN}`);
  }
  if (!graphRemediationResumeAuthorized(env)) {
    missing.push(`${GRAPH_RESUME_ENV}=${GRAPH_RESUME_TOKEN}`);
  }
  if (missing.length === 0) return;
  throw new Error(
    `Corpus graph write refused (${purpose}). Remediation pause is enforced in code — ` +
      `not policy-only. Set both operator tokens to resume: ${missing.join(" AND ")}. ` +
      `Open blockers remain: TOCTOU without UNIQUE(discoveryKey), 18984 historical duplicates, ` +
      `93 agreement self-loops, untested migration rollback. This gate does not provide ` +
      `database concurrency safety or CERTIFIED promotion.`,
  );
}
