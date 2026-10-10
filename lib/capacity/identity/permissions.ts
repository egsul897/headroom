/**
 * Discrete authorization permissions for financial evidence and capacity.
 *
 * Organization membership, "lawyer", or "admin" labels NEVER imply the full
 * set. Each production decision must check the specific permission.
 */

export const AUTHORIZATION_PERMISSIONS = [
  "UPLOAD_DOCUMENTS",
  "SUBMIT_EVIDENCE",
  "REVIEW_EVIDENCE",
  "APPROVE_FINANCIAL_METRICS",
  "CERTIFY_UTILIZATION_COMPLETENESS",
  "AUTHORIZE_PRODUCTION_CAPACITY",
] as const;

export type AuthorizationPermission = (typeof AUTHORIZATION_PERMISSIONS)[number];

/** Decision kinds that map 1:1 onto a required permission. */
export type AuthorizationDecisionKind =
  | "UPLOAD_DOCUMENT"
  | "SUBMIT_EVIDENCE"
  | "REVIEW_EVIDENCE"
  | "APPROVE_FINANCIAL_METRIC"
  | "CERTIFY_UTILIZATION_COMPLETENESS"
  | "AUTHORIZE_PRODUCTION_CAPACITY";

export const DECISION_REQUIRED_PERMISSION: Record<
  AuthorizationDecisionKind,
  AuthorizationPermission
> = {
  UPLOAD_DOCUMENT: "UPLOAD_DOCUMENTS",
  SUBMIT_EVIDENCE: "SUBMIT_EVIDENCE",
  REVIEW_EVIDENCE: "REVIEW_EVIDENCE",
  APPROVE_FINANCIAL_METRIC: "APPROVE_FINANCIAL_METRICS",
  CERTIFY_UTILIZATION_COMPLETENESS: "CERTIFY_UTILIZATION_COMPLETENESS",
  AUTHORIZE_PRODUCTION_CAPACITY: "AUTHORIZE_PRODUCTION_CAPACITY",
};

/**
 * Roles that may appear on completeness certificates — only when the principal
 * also holds CERTIFY_UTILIZATION_COMPLETENESS. Never auto-granted from org membership.
 */
export type TrustedCompletenessRole = "COUNSEL_REVIEWER" | "LEDGER_CUSTODIAN";

/**
 * Explicit grant bundles used by adapters when mapping IdP claims → permissions.
 * Adapters MUST NOT expand "admin" or "member" into every permission.
 */
export const PERMISSION_BUNDLES = {
  /** Document intake only — no review or approval authority. */
  DOCUMENT_UPLOADER: ["UPLOAD_DOCUMENTS"] as const satisfies readonly AuthorizationPermission[],
  /** Evidence submission without review or metric approval. */
  EVIDENCE_SUBMITTER: [
    "UPLOAD_DOCUMENTS",
    "SUBMIT_EVIDENCE",
  ] as const satisfies readonly AuthorizationPermission[],
  /** Reviewer of proposed evidence — not financial metric approver by default. */
  EVIDENCE_REVIEWER: [
    "REVIEW_EVIDENCE",
  ] as const satisfies readonly AuthorizationPermission[],
  /** Financial metric approver — does not certify utilization or authorize capacity. */
  FINANCIAL_METRIC_APPROVER: [
    "APPROVE_FINANCIAL_METRICS",
  ] as const satisfies readonly AuthorizationPermission[],
  /** Completeness certifier (counsel path). */
  UTILIZATION_COMPLETENESS_COUNSEL: [
    "REVIEW_EVIDENCE",
    "CERTIFY_UTILIZATION_COMPLETENESS",
  ] as const satisfies readonly AuthorizationPermission[],
  /** Completeness certifier (ledger custodian path). */
  UTILIZATION_COMPLETENESS_CUSTODIAN: [
    "SUBMIT_EVIDENCE",
    "CERTIFY_UTILIZATION_COMPLETENESS",
  ] as const satisfies readonly AuthorizationPermission[],
  /**
   * Production capacity authorizer — must be granted explicitly.
   * Never inferred from counsel / admin / org-member alone.
   */
  PRODUCTION_CAPACITY_AUTHORIZER: [
    "AUTHORIZE_PRODUCTION_CAPACITY",
  ] as const satisfies readonly AuthorizationPermission[],
} as const;

export function hasPermission(
  granted: readonly AuthorizationPermission[],
  required: AuthorizationPermission,
): boolean {
  return granted.includes(required);
}

export function permissionForDecision(
  decision: AuthorizationDecisionKind,
): AuthorizationPermission {
  return DECISION_REQUIRED_PERMISSION[decision];
}
