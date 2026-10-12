/**
 * Page-level helper: authorize CFO workflow reads before rendering sensitive UI.
 * On denial, maps to notFound() so responses do not leak tenant-specific detail.
 */

import { notFound } from "next/navigation";
import {
  assembleCfoWorkflow,
  type AssembledCfoWorkflowOk,
} from "./assemble-cfo-workflow";
import type { UnifiedTxnKind } from "@/lib/product/unified-position/certified-simulate-bridge";
import type { ProductCapacityView } from "@/lib/capacity/product-capacity-view";
import type { VerifiedRemainingResult } from "@/lib/capacity/verified-remaining";

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
  const wf = await assembleCfoWorkflow(args);
  if (!wf.ok) {
    // Generic refusal — do not surface blockers or tenantKind to the client.
    notFound();
  }
  return wf;
}
