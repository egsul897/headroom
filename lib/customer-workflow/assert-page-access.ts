/**
 * Authorize a company page before any sensitive page-local loaders run.
 * Denial → notFound() (no tenant-specific leakage in the response body).
 */

import { notFound } from "next/navigation";
import { gateWorkspaceAccess, loadWorkspaceCompanyIdentity } from "./workspace-access";

export async function assertCfoPageAccessOrNotFound(args: {
  companyId: string;
  principal?: unknown;
}): Promise<void> {
  const identity = await loadWorkspaceCompanyIdentity(args.companyId);
  const access = await gateWorkspaceAccess({
    companyId: args.companyId,
    principal: args.principal,
    companyIdentity: identity,
  });
  if (!access.allowed) notFound();
}
