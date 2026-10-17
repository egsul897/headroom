/**
 * Shared NS-4 APPROVED financial identity for Dashboard / Position / Simulate.
 *
 * Thin projection over loadApprovedFinancialInputBundle — the canonical binder
 * from #334 (persisted-delivery cutoff, fingerprint, IR leverage). Never upgrades
 * verified remaining / AVAILABLE.
 */

import { loadApprovedFinancialInputBundle } from "@/lib/product/north-star-workflow/approved-financial-inputs";
import type { AuthoritativeCapacityResult } from "@/lib/product/north-star-workflow/authoritative-capacity";
import {
  sharedIdentityFromApprovedBundle,
  type SharedNs4FinancialIdentity,
} from "./ns4-shared-identity-projection";

export {
  sharedIdentityFromApprovedBundle,
  type SharedNs4FinancialIdentity,
} from "./ns4-shared-identity-projection";

/** Load shared NS-4 identity via the canonical APPROVED financial binder. */
export async function loadSharedNs4FinancialIdentity(args: {
  companyId: string;
  evaluationDate?: string;
  authoritative?: AuthoritativeCapacityResult | null;
}): Promise<SharedNs4FinancialIdentity> {
  const bundle = await loadApprovedFinancialInputBundle({
    companyId: args.companyId,
    evaluationDate: args.evaluationDate,
  });
  return sharedIdentityFromApprovedBundle(
    bundle,
    args.authoritative,
    args.authoritative?.approvedSnapshotCount,
  );
}
