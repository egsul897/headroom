/**
 * Deterministic preflight. A paid call is the last option, after identity,
 * operative authority, completeness, duplicates, context, and a reservable
 * maximum cost have all succeeded.
 */
import type { HardDispatchBudget } from "../../analyzer/dispatch-budget";
import type { DispatchEstimate } from "../../analyzer/dispatch-budget";
import { classifyStructuralOccurrence, type OperativeTextIndex } from "../operative-authority";
import type { StructuralNode } from "../types";
import { authorizeDispatch, type AuthorizationDecision } from "./authorization";
import { assembleLegalContext, type ContextFragment } from "./context";
import type { EvidenceReuseContract } from "./identity";
import { routeTask, type RouteDecision, type RoutingPolicy, type TaskClass } from "./routing";
import { ContentAddressedEvidenceStore, type EvidenceRead } from "./store";

export interface PreflightRequest<T> {
  structuralIdentityPresent: boolean;
  structuralKind: "OPERATIVE_OCCURRENCE" | "CONTENTS_LISTING" | "NO_OPERATIVE_EVIDENCE" | "MISSING";
  sourceComplete: boolean;
  contract: EvidenceReuseContract;
  contextFragments: readonly ContextFragment[];
  tokenBudget: number;
  estimate: Omit<DispatchEstimate, "model">;
  taskClass: TaskClass;
  policy: RoutingPolicy;
  authorization: AuthorizationDecision;
  budget: HardDispatchBudget;
  store: ContentAddressedEvidenceStore;
  duplicateInFlight: boolean;
}

export type PreflightDecision<T> =
  | { disposition: "REUSE"; read: EvidenceRead<T>; paidCall: false; advancesCertification: false }
  | { disposition: "REJECT"; reason: string; paidCall: false; advancesCertification: false }
  | { disposition: "DEFER"; reason: string; paidCall: false; advancesCertification: false }
  | { disposition: "NEEDS_CONTEXT"; missing: string[]; reason: string; paidCall: false; advancesCertification: false }
  | { disposition: "DISPATCH"; route: RouteDecision; reservedUsd: number; paidCall: true; advancesCertification: false };

export function preflight<T>(request: PreflightRequest<T>): PreflightDecision<T> {
  const closed = { paidCall: false as const, advancesCertification: false as const };
  if (!request.structuralIdentityPresent || request.structuralKind === "MISSING") {
    return { disposition: "REJECT", reason: "STRUCTURAL_IDENTITY_MISSING", ...closed };
  }
  if (request.structuralKind !== "OPERATIVE_OCCURRENCE") {
    return { disposition: "REJECT", reason: "OPERATIVE_AUTHORITY_REFUSED", ...closed };
  }
  if (!request.sourceComplete) return { disposition: "DEFER", reason: "SOURCE_INCOMPLETE", ...closed };
  if (request.duplicateInFlight) return { disposition: "DEFER", reason: "DUPLICATE_REQUEST_IN_FLIGHT", ...closed };
  const read = request.store.read<T>(request.contract);
  if (read.status === "HIT") return { disposition: "REUSE", read, ...closed };
  if (read.status === "CORRUPT") return { disposition: "REJECT", reason: read.reason, ...closed };
  if (read.status === "UNREUSABLE") return { disposition: "DEFER", reason: read.reason, ...closed };
  if (read.status === "PARTIAL") return { disposition: "DEFER", reason: "PARTIAL_OUTPUT_NOT_COMPLETE", ...closed };
  const context = assembleLegalContext(request.contextFragments, request.tokenBudget);
  if (context.status === "NEEDS_CONTEXT") return { disposition: "NEEDS_CONTEXT", missing: context.missing, reason: context.reason, ...closed };
  const route = routeTask(request.taskClass, request.policy);
  if (!route.paid || !route.modelId) return { disposition: "REJECT", reason: route.reason, ...closed };
  const reserved = authorizeDispatch(request.budget, request.authorization, { ...request.estimate, model: route.modelId });
  if (!reserved.allowed) return { disposition: "REJECT", reason: reserved.reason, ...closed };
  return { disposition: "DISPATCH", route, reservedUsd: reserved.maxUsd, paidCall: true, advancesCertification: false };
}

export function structuralKindForPreflight(node: StructuralNode, index: OperativeTextIndex): "OPERATIVE_OCCURRENCE" | "CONTENTS_LISTING" | "NO_OPERATIVE_EVIDENCE" {
  return classifyStructuralOccurrence(node, index);
}
