/**
 * Bridge from #334 product NS-4 binder → package-wide financial-metric-resolver.
 *
 * Dashboard / Position / Simulate bind via loadApprovedFinancialInputBundle.
 * Package capacity/simulation provenance uses the SAME boundSnapshot identity —
 * never a second Neon load path or parallel approval authority.
 */

import {
  loadApprovedFinancialInputBundle,
  type ApprovedFinancialInputBundle,
} from "@/lib/product/north-star-workflow/approved-financial-inputs";
import {
  resolveCanonicalFinancialInputs,
  type ResolveCanonicalFinancialInputsArgs,
} from "./resolve";
import type { CanonicalFinancialInputBundle } from "./types";

export interface ProductCanonicalFinancialResolution {
  /** #334 cutoff-bound product binder (Dashboard / Position / Simulate). */
  productBinder: ApprovedFinancialInputBundle;
  /** Package-wide resolver bundle with per-fact NS-4 value provenance. */
  packageBundle: CanonicalFinancialInputBundle | null;
  /** True when both surfaces reference the same snapshotId (when bound). */
  sameBoundSnapshotIdentity: boolean;
}

/**
 * Resolve package financial inputs using the product NS-4 binder's bound snapshot.
 * Does not invent approval. Does not write Neon.
 */
export async function resolveCanonicalFinancialInputsViaProductBinder(args: {
  packageKey: string;
  companyId: string;
  evaluationDate?: string;
  ledgerFingerprint?: string;
  productionContext?: boolean;
}): Promise<ProductCanonicalFinancialResolution> {
  const productBinder = await loadApprovedFinancialInputBundle({
    companyId: args.companyId,
    evaluationDate: args.evaluationDate,
  });

  const resolveArgs: ResolveCanonicalFinancialInputsArgs = {
    packageKey: args.packageKey,
    companyId: args.companyId,
    ledgerFingerprint: args.ledgerFingerprint,
    approvedNs4Snapshot: productBinder.boundSnapshot,
    productionContext: args.productionContext,
  };

  const packageBundle = await resolveCanonicalFinancialInputs(resolveArgs);

  const packageSnapId =
    packageBundle?.facts.find((f) => f.approvedProvenance != null)?.approvedProvenance?.snapshotId ??
    null;

  return {
    productBinder,
    packageBundle,
    sameBoundSnapshotIdentity:
      productBinder.boundSnapshotId != null &&
      packageSnapId != null &&
      productBinder.boundSnapshotId === packageSnapId,
  };
}
