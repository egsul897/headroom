/**
 * Tenant boundary — the single server-side authorization decision for company-scoped data.
 *
 * Headroom has no integrated identity provider. Until one exists, every company-scoped read and
 * write path (the `[companyId]` layout, the Ask API, every server action, the document source
 * page) must pass through `authorizeCompanyAccess` / `requireCompanyAccess`, and the decision is
 * DENY BY DEFAULT for CUSTOMER-tenant companies:
 *
 *   - a request that carries a trusted server-side principal is allowed only when that principal
 *     is a member of the company (membership is checked here, never inferred from the URL);
 *   - a request with no principal may reach EVALUATION-tenant companies (public-filing evaluation
 *     fixtures) but NOT a CUSTOMER-tenant company — a valid company identifier is never, by itself,
 *     authorization for customer document intelligence;
 *   - an operator may acknowledge a single-operator, unauthenticated evaluation deployment by
 *     setting HEADROOM_TENANT_BOUNDARY=UNAUTHENTICATED_EVALUATION_INSTANCE. That is instance
 *     configuration, not a caller-controlled value, and it is the only way a CUSTOMER tenant is
 *     reachable without a principal. The default is deny.
 *   - any failure to resolve the principal or the company fails closed.
 *
 * Denials never reveal whether the company exists: the layout answers 404 and server actions /
 * the API answer with one fixed message.
 *
 * Integration point: `resolveRequestPrincipal` is where an approved identity provider binds the
 * authenticated subject and its permitted company ids. It must read only trusted server-side
 * state (a verified session), never request bodies, query strings or caller-supplied headers.
 */
import { prisma } from "../prisma";

/** Environment lookup; a plain record so tests can pass literals. */
export type EnvLike = Readonly<Record<string, string | undefined>>;

export type TenantKind = "CUSTOMER" | "EVALUATION";

export type TenantBoundaryMode = "DENY_CUSTOMER_WITHOUT_PRINCIPAL" | "UNAUTHENTICATED_EVALUATION_INSTANCE";

export const TENANT_BOUNDARY_ENV = "HEADROOM_TENANT_BOUNDARY";
export const UNAUTHENTICATED_EVALUATION_INSTANCE_TOKEN = "UNAUTHENTICATED_EVALUATION_INSTANCE";

/** The trusted, server-resolved identity of the caller. Absent until an identity provider is integrated. */
export interface RequestPrincipal {
  subject: string;
  /** Company ids this principal is a member of. Membership, not a hint. */
  companyIds: readonly string[];
}

export type TenantDecisionReason =
  | "PRINCIPAL_MEMBER"
  | "EVALUATION_TENANT_OPEN"
  | "OPERATOR_ACKNOWLEDGED_UNAUTHENTICATED_INSTANCE"
  | "COMPANY_NOT_FOUND"
  | "NO_PRINCIPAL_FOR_CUSTOMER_TENANT"
  | "PRINCIPAL_NOT_MEMBER"
  | "PRINCIPAL_RESOLUTION_FAILED"
  | "COMPANY_LOOKUP_FAILED"
  | "INVALID_COMPANY_ID";

export interface TenantDecision {
  allowed: boolean;
  companyId: string;
  tenantKind: TenantKind | null;
  mode: TenantBoundaryMode;
  principalPresent: boolean;
  reason: TenantDecisionReason;
}

/** One fixed, existence-neutral message for every denial. */
export const TENANT_ACCESS_DENIED_MESSAGE = "This workspace is not available.";

export class TenantAccessDeniedError extends Error {
  readonly code = "TENANT_ACCESS_DENIED" as const;
  constructor(readonly decision: TenantDecision) {
    super(TENANT_ACCESS_DENIED_MESSAGE);
    this.name = "TenantAccessDeniedError";
  }
}

export function resolveTenantBoundaryMode(env: EnvLike = process.env): TenantBoundaryMode {
  return env[TENANT_BOUNDARY_ENV] === UNAUTHENTICATED_EVALUATION_INSTANCE_TOKEN
    ? "UNAUTHENTICATED_EVALUATION_INSTANCE"
    : "DENY_CUSTOMER_WITHOUT_PRINCIPAL";
}

/**
 * No identity provider is integrated: there is no trusted principal. This function exists so the
 * boundary has exactly one place to bind one later; it must never derive a principal from
 * caller-controlled input.
 */
export async function resolveRequestPrincipal(): Promise<RequestPrincipal | null> {
  return null;
}

const COMPANY_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** Pure decision. Deterministic, dependency-free, fully covered by tests. */
export function decideCompanyAccess(input: {
  companyId: string;
  tenantKind: TenantKind | null;
  principal: RequestPrincipal | null;
  mode: TenantBoundaryMode;
}): TenantDecision {
  const base = { companyId: input.companyId, tenantKind: input.tenantKind, mode: input.mode, principalPresent: input.principal !== null };
  if (!COMPANY_ID.test(input.companyId)) return { ...base, allowed: false, reason: "INVALID_COMPANY_ID" };
  if (input.tenantKind === null) return { ...base, allowed: false, reason: "COMPANY_NOT_FOUND" };
  if (input.principal) {
    // An authenticated caller is bound to its memberships regardless of tenant kind or instance mode.
    return input.principal.companyIds.includes(input.companyId)
      ? { ...base, allowed: true, reason: "PRINCIPAL_MEMBER" }
      : { ...base, allowed: false, reason: "PRINCIPAL_NOT_MEMBER" };
  }
  if (input.tenantKind === "EVALUATION") return { ...base, allowed: true, reason: "EVALUATION_TENANT_OPEN" };
  if (input.mode === "UNAUTHENTICATED_EVALUATION_INSTANCE") {
    return { ...base, allowed: true, reason: "OPERATOR_ACKNOWLEDGED_UNAUTHENTICATED_INSTANCE" };
  }
  return { ...base, allowed: false, reason: "NO_PRINCIPAL_FOR_CUSTOMER_TENANT" };
}

export interface TenantBoundaryDeps {
  loadTenantKind?: (companyId: string) => Promise<TenantKind | null>;
  resolvePrincipal?: () => Promise<RequestPrincipal | null>;
  env?: EnvLike;
}

async function loadTenantKindFromDatabase(companyId: string): Promise<TenantKind | null> {
  const row = await prisma.company.findUnique({ where: { id: companyId }, select: { tenantKind: true } });
  return row ? row.tenantKind : null;
}

/** Resolves principal and tenant kind, then decides. Every failure is a denial. */
export async function authorizeCompanyAccess(companyId: string, deps: TenantBoundaryDeps = {}): Promise<TenantDecision> {
  const mode = resolveTenantBoundaryMode(deps.env ?? process.env);
  const base = { companyId, tenantKind: null, mode, principalPresent: false } as const;
  if (!COMPANY_ID.test(companyId)) return { ...base, allowed: false, reason: "INVALID_COMPANY_ID" };

  let principal: RequestPrincipal | null;
  try {
    principal = await (deps.resolvePrincipal ?? resolveRequestPrincipal)();
  } catch {
    return { ...base, allowed: false, reason: "PRINCIPAL_RESOLUTION_FAILED" };
  }

  let tenantKind: TenantKind | null;
  try {
    tenantKind = await (deps.loadTenantKind ?? loadTenantKindFromDatabase)(companyId);
  } catch {
    return { ...base, allowed: false, principalPresent: principal !== null, reason: "COMPANY_LOOKUP_FAILED" };
  }

  return decideCompanyAccess({ companyId, tenantKind, principal, mode });
}

/** For server actions and route handlers: throws the fixed denial. */
export async function requireCompanyAccess(companyId: string, deps: TenantBoundaryDeps = {}): Promise<TenantDecision> {
  const decision = await authorizeCompanyAccess(companyId, deps);
  if (!decision.allowed) throw new TenantAccessDeniedError(decision);
  return decision;
}
