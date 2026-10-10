/**
 * Authorization audit records for trusted identity decisions.
 * Never includes secrets, raw session tokens, or production credentials.
 */

import type { AuthorizationDecisionKind, AuthorizationPermission } from "./permissions";
import type { IdentityAssuranceChannel } from "./provider-contract";

export interface AuthorizationAuditRecord {
  readonly auditId: string;
  readonly atMs: number;
  readonly atIso: string;
  readonly principalId: string;
  readonly companyId: string;
  readonly decision: AuthorizationDecisionKind;
  readonly requiredPermission: AuthorizationPermission;
  readonly granted: boolean;
  readonly evidenceId: string | null;
  readonly authorizationBasis: string;
  readonly identityAssurance: IdentityAssuranceChannel | "UNVERIFIED";
  readonly blockers: readonly string[];
  readonly jti: string | null;
}

const auditLog: AuthorizationAuditRecord[] = [];

export function recordAuthorizationAudit(
  input: Omit<AuthorizationAuditRecord, "auditId" | "atIso"> & {
    auditId?: string;
  },
): AuthorizationAuditRecord {
  const atMs = input.atMs;
  const record: AuthorizationAuditRecord = {
    auditId: input.auditId ?? `authz-audit:${atMs}:${Math.random().toString(36).slice(2, 10)}`,
    atMs,
    atIso: new Date(atMs).toISOString(),
    principalId: input.principalId,
    companyId: input.companyId,
    decision: input.decision,
    requiredPermission: input.requiredPermission,
    granted: input.granted,
    evidenceId: input.evidenceId,
    authorizationBasis: input.authorizationBasis,
    identityAssurance: input.identityAssurance,
    blockers: Object.freeze([...input.blockers]),
    jti: input.jti,
  };
  auditLog.push(record);
  return record;
}

export function getAuthorizationAuditLog(): readonly AuthorizationAuditRecord[] {
  return auditLog;
}

export function clearAuthorizationAuditLogForTests(opts: {
  allowTestReset: true;
}): void {
  if (opts.allowTestReset !== true) {
    throw new Error("audit log reset refused");
  }
  auditLog.length = 0;
}
