/**
 * EBITDA box API handlers (GET / refresh / CFO confirm) with the app's existing identity + tenant gate:
 * the request's credential is verified server-side by the registered ServerIdentityProvider (verifyAndMintPrincipal),
 * reads go through gateWorkspaceAccess (CUSTOMER needs an authenticated principal scoped to the company), and writes
 * (refresh, confirm) require an authenticated principal authorized for SUBMIT_EVIDENCE on the company. confirmedBy is
 * the principal id — never taken from the request body. Denials return a generic 404 (no tenant detail leaks), missing
 * credentials on a write return 401.
 */
import { authorizeDecision } from "@/lib/capacity/identity/authorize-decision";
import { verifyAndMintPrincipal, type IdentityCredentialHandle, type VerifiedServerPrincipal } from "@/lib/capacity/identity/provider-contract";
import { gateWorkspaceAccess, type WorkspaceCompanyIdentityLoader } from "@/lib/customer-workflow/workspace-access";
import { confirmEbitdaItem, latestEbitdaBox, type ConfirmationKind, type EbitdaBox, type EbitdaBoxStore, type PipelineArgs } from "./ebitda-box";

type Json = { status: number; body: unknown };
const NOT_FOUND: Json = { status: 404, body: { error: "not found" } };
const UNAUTHENTICATED: Json = { status: 401, body: { error: "authentication required" } };

/** Credential handle extracted server-side from the request: `Authorization: Bearer <session handle>`. Never logged. */
export function credentialFromRequest(req: Request): IdentityCredentialHandle | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.get("authorization") ?? "");
  return m ? { kind: "SESSION", sessionHandle: m[1]! } : null;
}

export async function principalFromRequest(req: Request): Promise<VerifiedServerPrincipal | null> {
  const cred = credentialFromRequest(req);
  if (!cred) return null;
  return (await verifyAndMintPrincipal(cred)).principal;
}

export interface EbitdaApiDeps {
  store: () => EbitdaBoxStore;
  /** The document belongs to the company (tenant check on the document id). */
  documentBelongsTo: (companyId: string, documentId: string) => Promise<boolean>;
  pipelineArgsFor: (companyId: string, documentId: string) => Promise<PipelineArgs | null>;
  refresh: (companyId: string, documentId: string) => Promise<{ box: EbitdaBox; id: string } | null>;
  companyIdentityLoader?: WorkspaceCompanyIdentityLoader;
  principal?: (req: Request) => Promise<VerifiedServerPrincipal | null>;
}

async function canRead(deps: EbitdaApiDeps, companyId: string, principal: VerifiedServerPrincipal | null): Promise<boolean> {
  const d = await gateWorkspaceAccess({ companyId, principal: principal ?? undefined, companyIdentityLoader: deps.companyIdentityLoader });
  return d.allowed;
}

async function canWrite(deps: EbitdaApiDeps, companyId: string, principal: VerifiedServerPrincipal): Promise<boolean> {
  if (!(await canRead(deps, companyId, principal))) return false;
  return (await authorizeDecision({ principal, companyId, decision: "SUBMIT_EVIDENCE" })).granted;
}

export async function handleEbitdaGet(deps: EbitdaApiDeps, req: Request, p: { companyId: string; documentId: string }): Promise<Json> {
  const principal = await (deps.principal ?? principalFromRequest)(req);
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (refresh) {
    if (!principal) return UNAUTHENTICATED;
    if (!(await canWrite(deps, p.companyId, principal))) return NOT_FOUND;
  } else if (!(await canRead(deps, p.companyId, principal))) return NOT_FOUND;
  if (!(await deps.documentBelongsTo(p.companyId, p.documentId))) return NOT_FOUND;
  if (refresh) {
    const r = await deps.refresh(p.companyId, p.documentId);
    if (!r) return { status: 404, body: { error: "document not found for this company" } };
    return { status: 200, body: { ...r.box, id: r.id } };
  }
  const box = await latestEbitdaBox(deps.store(), p);
  if (!box) return { status: 404, body: { error: "no EBITDA box yet for this document" } };
  return { status: 200, body: box };
}

export async function handleEbitdaConfirm(deps: EbitdaApiDeps, req: Request, p: { companyId: string; documentId: string }): Promise<Json> {
  const principal = await (deps.principal ?? principalFromRequest)(req);
  if (!principal) return UNAUTHENTICATED;
  if (!(await canWrite(deps, p.companyId, principal))) return NOT_FOUND;
  if (!(await deps.documentBelongsTo(p.companyId, p.documentId))) return NOT_FOUND;
  const body = (await req.json().catch(() => null)) as { inputKey?: unknown; value?: unknown; source?: unknown; kind?: unknown; idempotencyKey?: unknown } | null;
  if (!body || typeof body !== "object") return { status: 400, body: { error: "JSON body required" } };
  const v = body.value;
  const value = typeof v === "number" ? (Number.isSafeInteger(v) ? String(v) : "x") : typeof v === "string" ? v : v == null ? "" : "x";
  const idem = req.headers.get("idempotency-key") ?? (typeof body.idempotencyKey === "string" ? body.idempotencyKey : null);
  const args = await deps.pipelineArgsFor(p.companyId, p.documentId);
  if (!args) return { status: 404, body: { error: "document not found for this company" } };
  const out = await confirmEbitdaItem(deps.store(), p, args, {
    inputKey: typeof body.inputKey === "string" ? body.inputKey : "",
    value, source: typeof body.source === "string" ? body.source : "",
    kind: (body.kind ?? "AMOUNT") as ConfirmationKind,
    confirmedBy: principal.principalId, idempotencyKey: idem,
  });
  if (!out.ok) return { status: out.status, body: { error: out.error, ...(out.code ? { code: out.code } : {}) } };
  return { status: 200, body: { id: out.boxId, box: out.box, gain: out.gain, ...(out.replayed ? { replayed: true } : {}) } };
}
