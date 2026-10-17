/**
 * Authorize a company page before any sensitive page-local loaders run.
 * Denial → notFound() (no tenant-specific leakage in the response body).
 *
 * When the caller passes no principal, one is minted from the current
 * NextAuth session (REVIEW_EVIDENCE only, companyScope from the
 * session — see lib/auth/nextauth-identity-provider.ts). No session →
 * null → the gate denies as before (fail-closed).
 */

import { notFound } from "next/navigation";
import { gateWorkspaceAccess, loadWorkspaceCompanyIdentity } from "./workspace-access";
// Side-effect import: registers the NextAuth session identity
// provider before any gate call in the request.
import "@/lib/auth/nextauth-identity-provider";
import { verifyAndMintPrincipal } from "@/lib/capacity/identity/provider-contract";

export async function assertCfoPageAccessOrNotFound(args: {
  companyId: string;
  principal?: unknown;
}): Promise<void> {
  const identity = await loadWorkspaceCompanyIdentity(args.companyId);
  let principal: unknown = args.principal;
  if (principal == null) {
    const minted = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "nextauth:current-request",
    });
    principal = minted.principal;
  }
  const access = await gateWorkspaceAccess({
    companyId: args.companyId,
    principal,
    companyIdentity: identity,
  });
  if (!access.allowed) notFound();
}
