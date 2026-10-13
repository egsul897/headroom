/**
 * Explicit policy for anonymous read of EVALUATION workspaces.
 *
 * Grants are never inferred from companyId naming, missing principal, or
 * tenantKind alone. A workspace must be:
 *   1. tenantKind === EVALUATION (verified from persistence), AND
 *   2. explicitly registered here (host env or registerEvaluationAnonymousReadGrant).
 *
 * CUSTOMER workspaces can never receive anonymous grants through this policy.
 */

export interface EvaluationAnonymousReadGrant {
  companyId: string;
  /** Non-secret basis for audit (e.g. "host-env:HEADROOM_EVAL_ANONYMOUS_READ_COMPANY_IDS"). */
  policyBasis: string;
  /** Must be the literal true — structural requirement for an intentional grant. */
  allowAnonymousRead: true;
}

const grants = new Map<string, EvaluationAnonymousReadGrant>();

function parseEnvCompanyIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Load host-configured EVALUATION anonymous-read grants from environment. */
export function loadEvaluationAnonymousReadGrantsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const ids = parseEnvCompanyIds(env.HEADROOM_EVAL_ANONYMOUS_READ_COMPANY_IDS);
  for (const companyId of ids) {
    grants.set(companyId, {
      companyId,
      policyBasis: "host-env:HEADROOM_EVAL_ANONYMOUS_READ_COMPANY_IDS",
      allowAnonymousRead: true,
    });
  }
}

/** Explicit runtime registration (tests / demo setup). Never auto-infers. */
export function registerEvaluationAnonymousReadGrant(
  grant: EvaluationAnonymousReadGrant,
): void {
  if (grant.allowAnonymousRead !== true) {
    throw new Error("evaluation anonymous read grant refused — allowAnonymousRead must be true");
  }
  if (!grant.companyId?.trim()) {
    throw new Error("evaluation anonymous read grant refused — companyId required");
  }
  if (!grant.policyBasis?.trim()) {
    throw new Error("evaluation anonymous read grant refused — policyBasis required");
  }
  grants.set(grant.companyId, {
    companyId: grant.companyId,
    policyBasis: grant.policyBasis,
    allowAnonymousRead: true,
  });
}

export function getEvaluationAnonymousReadGrant(
  companyId: string,
): EvaluationAnonymousReadGrant | null {
  return grants.get(companyId) ?? null;
}

export function clearEvaluationAnonymousReadGrantsForTests(opts: {
  allowTestReset: true;
}): void {
  if (opts.allowTestReset !== true) {
    throw new Error("evaluation anonymous read grant reset refused");
  }
  grants.clear();
}

// Host env grants load once at module init (safe no-op when unset).
loadEvaluationAnonymousReadGrantsFromEnv();
