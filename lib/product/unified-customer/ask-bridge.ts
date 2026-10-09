/**
 * Ask → structured transaction → Simulate handoff.
 * Reuses North-Star draft parsing; attaches handoff id + state fingerprint.
 */

import {
  analyzeContemplatedTransaction,
  parseTransactionDraft,
  type TransactionAnalysisResult,
} from "@/lib/product/north-star-workflow";
import { newHandoffId } from "./fingerprint";
import { loadVerifiedCustomerState } from "./state";
import { simulateHrefFromStructured } from "./simulate";
import type { StructuredTransaction, StructuredTransactionKind } from "./types";

function mapKind(kind: ReturnType<typeof parseTransactionDraft>["kind"]): StructuredTransactionKind {
  switch (kind) {
    case "SECURED_DEBT":
      return "SECURED_DEBT";
    case "UNSECURED_DEBT":
      return "UNSECURED_DEBT";
    case "RESTRICTED_PAYMENT":
      return "RESTRICTED_PAYMENT";
    case "INVESTMENT":
      return "INVESTMENT";
    case "ACQUISITION":
      return "ACQUISITION";
    default:
      return "UNKNOWN";
  }
}

/** Enrich NL question with hybrid / secured-note / revolver cues. */
export function refineKindFromQuestion(
  question: string,
  base: StructuredTransactionKind,
): StructuredTransactionKind {
  const q = question.toLowerCase();
  if (/hybrid|convertible|preferred/.test(q)) return "HYBRID_SECURITY";
  if (/secured note|senior note|second lien note/.test(q)) return "SECURED_NOTE";
  if (/revolver|revolving|draw/.test(q)) return "REVOLVER_DRAW";
  if (/refinanc/.test(q)) return "REFINANCING";
  if (/asset sale|disposition|divest/.test(q)) return "ASSET_SALE";
  if (/dividend/.test(q)) return "RESTRICTED_PAYMENT";
  return base;
}

export function structuredTransactionFromDraft(
  draft: ReturnType<typeof parseTransactionDraft>,
  opts?: { stateFingerprint?: string; currency?: string; entityLabel?: string | null },
): StructuredTransaction {
  const kind = refineKindFromQuestion(draft.rawQuestion, mapKind(draft.kind));
  return {
    kind,
    amountMillions: draft.amountMillions,
    secured:
      kind === "SECURED_DEBT" || kind === "SECURED_NOTE" || kind === "ACQUISITION"
        ? true
        : kind === "UNSECURED_DEBT"
          ? false
          : draft.secured,
    evaluationDate: draft.evaluationDate,
    currency: opts?.currency ?? "USD",
    entityLabel: opts?.entityLabel ?? null,
    rawQuestion: draft.rawQuestion,
    handoffId: newHandoffId(),
    stateFingerprint: opts?.stateFingerprint,
  };
}

export interface UnifiedAskResult {
  analysis: TransactionAnalysisResult;
  structuredTransaction: StructuredTransaction;
  simulateHref: string;
  stateFingerprint: string;
  asOfDateIso: string;
}

/**
 * Full Ask transaction path with Simulate handoff payload.
 */
export async function analyzeAskForSimulate(args: {
  companyId: string;
  question: string;
  sourceId?: string;
  confirmed?: boolean;
}): Promise<UnifiedAskResult> {
  const state = await loadVerifiedCustomerState(args.companyId);
  const analysis = await analyzeContemplatedTransaction({
    companyId: args.companyId,
    question: args.question,
    sourceId: args.sourceId,
    confirmed: args.confirmed === true,
    verifiedPackage: null,
  });
  const structuredTransaction = structuredTransactionFromDraft(analysis.draft, {
    stateFingerprint: state.stateFingerprint,
  });
  // Prefer evaluation date from draft when resolving as-of for handoff display.
  const dated =
    analysis.draft.evaluationDate != null
      ? await loadVerifiedCustomerState(args.companyId, {
          evaluationDate: analysis.draft.evaluationDate,
        })
      : state;
  structuredTransaction.stateFingerprint = dated.stateFingerprint;

  return {
    analysis,
    structuredTransaction,
    simulateHref: simulateHrefFromStructured(args.companyId, structuredTransaction),
    stateFingerprint: dated.stateFingerprint,
    asOfDateIso: dated.asOfDateIso,
  };
}

/** Parse Simulate URL search params into a partial structured transaction. */
export function structuredTransactionFromSearchParams(
  params: URLSearchParams,
): Partial<StructuredTransaction> | null {
  const kind = params.get("kind") as StructuredTransactionKind | null;
  if (!kind) return null;
  const amountRaw = params.get("amount");
  const amountMillions = amountRaw != null && amountRaw !== "" ? Number(amountRaw) : null;
  const securedRaw = params.get("secured");
  return {
    kind,
    amountMillions: amountMillions != null && Number.isFinite(amountMillions) ? amountMillions : null,
    secured: securedRaw === "1" ? true : securedRaw === "0" ? false : null,
    evaluationDate: params.get("date"),
    currency: params.get("currency") ?? "USD",
    entityLabel: params.get("entity"),
    rawQuestion: params.get("q"),
    handoffId: params.get("handoff") ?? newHandoffId(),
    stateFingerprint: params.get("stateFp") ?? undefined,
  };
}
