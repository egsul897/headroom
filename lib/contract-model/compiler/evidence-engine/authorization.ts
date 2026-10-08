/**
 * Hard spend authorization.
 *
 * The default is no paid calls. Five dollars is a proposed experiment cap,
 * not an authorization. Every nonzero paid dispatch requires a founder
 * authorization id. A development-experiment label does not authorize a
 * call at any ceiling, including a ceiling at or under five dollars.
 * Reservations are worst-case and concurrent outstanding reservations
 * count. An unbilled retry keeps its reservation.
 *
 * Direct-provider cache discounts are not assumed for Vercel AI Gateway
 * traffic. Haiku remains off the rate card; an unpriceable model is not sent.
 */
import { HardDispatchBudget, BudgetRefusedError, type DispatchEstimate, type DispatchTicket } from "../../analyzer/dispatch-budget";
import { maxCostOfRequestUsd, priceUsage, type PriceableUsage } from "../../analyzer/pricing";

export const PROPOSED_DEVELOPMENT_EXPERIMENT_CEILING_USD = 5;

export const GATEWAY_CAPABILITIES = {
  promptCacheDiscountAssumed: false,
  batchApiAssumed: false,
  note: "Cached input rates on the direct-provider rate card are not applied to Vercel AI Gateway calls. No gateway batch API is wired.",
} as const;

export type SpendAuthorization =
  | { kind: "NO_PAID_CALLS" }
  | { kind: "DEVELOPMENT_EXPERIMENT"; ceilingUsd: number }
  | { kind: "FOUNDER_AUTHORIZED"; ceilingUsd: number; authorizationId: string };

export interface AuthorizationDecision {
  paidCallsAllowed: boolean;
  ceilingUsd: number;
  reason: string;
  proposedCeilingUsd: number;
  proposedCeilingIsAuthorization: false;
}

export function resolveSpendAuthorization(authorization: SpendAuthorization = { kind: "NO_PAID_CALLS" }): AuthorizationDecision {
  const proposed = { proposedCeilingUsd: PROPOSED_DEVELOPMENT_EXPERIMENT_CEILING_USD, proposedCeilingIsAuthorization: false as const };
  if (authorization.kind === "NO_PAID_CALLS") {
    return { ...proposed, paidCallsAllowed: false, ceilingUsd: 0, reason: "NO_PAID_CALLS_DEFAULT" };
  }
  if (authorization.kind === "DEVELOPMENT_EXPERIMENT") {
    return { ...proposed, paidCallsAllowed: false, ceilingUsd: 0, reason: "DEVELOPMENT_EXPERIMENT_IS_NOT_AUTHORIZATION" };
  }
  if (!authorization.authorizationId.trim() || !(authorization.ceilingUsd > 0)) {
    return { ...proposed, paidCallsAllowed: false, ceilingUsd: 0, reason: "FOUNDER_AUTHORIZATION_ID_REQUIRED" };
  }
  return { ...proposed, paidCallsAllowed: true, ceilingUsd: authorization.ceilingUsd, reason: "FOUNDER_AUTHORIZED" };
}

export function openAuthorizedBudget(authorization: SpendAuthorization, maxCalls: number | null = null): { decision: AuthorizationDecision; budget: HardDispatchBudget } {
  const decision = resolveSpendAuthorization(authorization);
  return { decision, budget: new HardDispatchBudget({ ceilingUsd: decision.ceilingUsd, maxCalls }) };
}

export type DispatchAuthorization =
  | { allowed: true; ticket: DispatchTicket; maxUsd: number }
  | { allowed: false; reason: string };

/** Reserve the worst case or refuse. A refusal does not send the request. */
export function authorizeDispatch(budget: HardDispatchBudget, decision: AuthorizationDecision, estimate: DispatchEstimate): DispatchAuthorization {
  if (!decision.paidCallsAllowed) return { allowed: false, reason: decision.reason };
  if (GATEWAY_CAPABILITIES.promptCacheDiscountAssumed) {
    return { allowed: false, reason: "GATEWAY_CACHE_DISCOUNT_ASSUMED" };
  }
  const max = maxCostOfRequestUsd({ maxInputTokens: estimate.maxInputTokens, maxOutputTokens: estimate.maxOutputTokens }, estimate.model);
  if (max === null) return { allowed: false, reason: `UNPRICEABLE_MODEL: ${estimate.model}` };
  try {
    const ticket = budget.reserve(estimate);
    return { allowed: true, ticket, maxUsd: max };
  } catch (error) {
    if (error instanceof BudgetRefusedError) return { allowed: false, reason: `${error.reason}: ${error.detail}` };
    throw error;
  }
}

/** A retry with no usage keeps the full reservation. It is not booked at $0. */
export function settleUnbilledRetry(budget: HardDispatchBudget, ticket: DispatchTicket): void {
  budget.settle(ticket, null, "UNKNOWN_RETAINED");
}

export function settleExact(budget: HardDispatchBudget, ticket: DispatchTicket, usage: PriceableUsage): "EXACT" | "UNKNOWN_RETAINED" {
  const priced = priceUsage(usage, ticket.model);
  if (priced.costUsd === null) {
    budget.settle(ticket, usage, "UNKNOWN_RETAINED");
    return "UNKNOWN_RETAINED";
  }
  budget.settle(ticket, usage, "EXACT");
  return "EXACT";
}
