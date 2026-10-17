/**
 * Page-level helper: authorize CFO workflow reads before rendering sensitive UI.
 * On denial, maps to notFound() so responses do not leak tenant-specific detail.
 *
 * When the caller passes no principal (every page today), the helper
 * mints one from the current NextAuth session via the registered
 * identity provider (lib/auth/nextauth-identity-provider.ts) —
 * REVIEW_EVIDENCE only, companyScope from the session, production
 * still BLOCKED. No session → null → the gate denies as before
 * (fail-closed). Callers that pass an explicit principal keep
 * exactly today's behavior (no mint attempted).
 */

import { notFound } from "next/navigation";
import {
  assembleCfoWorkflow,
  type AssembledCfoWorkflowOk,
} from "./assemble-cfo-workflow";
import type { UnifiedTxnKind } from "@/lib/product/unified-position/certified-simulate-bridge";
import type { ProductCapacityView } from "@/lib/capacity/product-capacity-view";
import type { VerifiedRemainingResult } from "@/lib/capacity/verified-remaining";
// Side-effect import: registers the NextAuth session identity
// provider before any gate call in the request.
import "@/lib/auth/nextauth-identity-provider";
import { verifyAndMintPrincipal } from "@/lib/capacity/identity/provider-contract";

export async function requireAssembledCfoWorkflow(args: {
  companyId: string;
  principal?: unknown;
  simulateAmountMillions?: number;
  simulateKind?: UnifiedTxnKind;
  evaluationDate?: string;
  productCapacityBySide?: {
    secured?: ProductCapacityView | null;
    unsecured?: ProductCapacityView | null;
  };
  verifiedRemainingBySide?: {
    secured?: VerifiedRemainingResult | null;
    unsecured?: VerifiedRemainingResult | null;
  };
}): Promise<AssembledCfoWorkflowOk> {
  // No explicit principal → mint from the current session (or null
  // when unsigned in, which the gate denies as before).
  let principal: unknown = args.principal;
  if (principal == null) {
    const minted = await verifyAndMintPrincipal({
      kind: "SESSION",
      sessionHandle: "nextauth:current-request",
    });
    principal = minted.principal;
  }
  const wf = await assembleCfoWorkflow({ ...args, principal });
  if (!wf.ok) {
    // Generic refusal — do not surface blockers or tenantKind to the client.
    notFound();
  }
  return wf;
}
