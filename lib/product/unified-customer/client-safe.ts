/**
 * Client-safe re-exports (no Prisma / Node crypto / DB loaders).
 * UI components must import from here, not from the barrel index.
 */

import type {
  ControllingCitation,
  EngineAuthorityLabel,
  OutcomeClassification,
  StructuredTransactionKind,
} from "./types";

export type {
  CustomerOutcomeKind,
  ControllingCitation,
  StructuredTransaction,
  StructuredTransactionKind,
  OutcomeClassification,
  EngineAuthorityLabel,
} from "./types";

export { classifyCustomerOutcome, outcomeTone, type ConstraintSignal } from "./outcome";

/** Mirror of UnifiedSimulateResult for client fetch typing (kept in sync manually). */
export interface UnifiedSimulateResultView {
  ok: boolean;
  stale: boolean;
  staleReason?: string;
  companyId: string;
  stateFingerprint: string;
  requestFingerprint: string;
  asOfDateIso: string;
  authority: EngineAuthorityLabel;
  kind: StructuredTransactionKind;
  amountMillions: number;
  secured: boolean | null;
  currency: string;
  outcome: OutcomeClassification;
  engineStatus: string;
  reason?: string;
  overallCapacityMillions?: number;
  proForma: {
    totalNetLeverage?: number;
    seniorSecuredNetLeverage?: number;
    fixedChargeCoverage?: number;
    cashDelta?: number;
    grossDebtDelta?: number;
  };
  prePostRatios: Array<{
    label: string;
    pre: number | null;
    post: number | null;
    threshold: number | null;
    sectionRef: string | null;
    documentName: string | null;
    status: string;
  }>;
  basketConsumption: Array<{
    code: string;
    basketName: string;
    sectionRef: string;
    allocatedMillions: number;
  }>;
  bindingConstraints: ControllingCitation[];
  crossDocumentRestrictions: ControllingCitation[];
  explanations: Array<{ text: string; citation?: ControllingCitation }>;
  perDocument: Array<{
    documentId: string;
    documentName: string;
    status: string;
    capacityMillions?: number;
    sectionRef?: string;
    basketName?: string;
    reason?: string;
  }>;
}
