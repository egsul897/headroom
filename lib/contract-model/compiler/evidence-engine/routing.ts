/**
 * Provider-independent routing. Model confidence is not legal correctness.
 * The policy names one model per class. A missing name is a refusal, not a
 * silent step up to a more expensive model.
 */
export type TaskClass =
  | "DETERMINISTIC_ONLY"
  | "STRAIGHTFORWARD_EXTRACTION"
  | "AMBIGUOUS_SEMANTIC"
  | "HIGH_RISK_CONCLUSION"
  | "UNSUPPORTED";

export interface RoutingPolicy {
  /** Exact model id for a class that may call a provider. Deterministic and unsupported classes have no model. */
  modelByClass: Partial<Record<TaskClass, string>>;
}

export interface RouteDecision {
  taskClass: TaskClass;
  paid: boolean;
  modelId: string | null;
  escalate: boolean;
  unsupported: boolean;
  reviewRequired: boolean;
  legalCorrectnessProven: false;
  reason: string;
}

export function routeTask(taskClass: TaskClass, policy: RoutingPolicy): RouteDecision {
  const base = { taskClass, legalCorrectnessProven: false as const };
  if (taskClass === "DETERMINISTIC_ONLY") {
    return { ...base, paid: false, modelId: null, escalate: false, unsupported: false, reviewRequired: false, reason: "deterministic work does not call a model" };
  }
  if (taskClass === "UNSUPPORTED") {
    return { ...base, paid: false, modelId: null, escalate: false, unsupported: true, reviewRequired: false, reason: "an unsupported construct stays unsupported" };
  }
  const modelId = policy.modelByClass[taskClass] ?? null;
  if (!modelId) {
    return { ...base, paid: false, modelId: null, escalate: false, unsupported: false, reviewRequired: true, reason: `no model is configured for ${taskClass}; a more expensive model is not substituted` };
  }
  if (taskClass === "HIGH_RISK_CONCLUSION") {
    return { ...base, paid: true, modelId, escalate: false, unsupported: false, reviewRequired: true, reason: "a high-risk conclusion still requires verification or review; the model is not proof" };
  }
  if (taskClass === "AMBIGUOUS_SEMANTIC") {
    return { ...base, paid: true, modelId, escalate: true, unsupported: false, reviewRequired: true, reason: "ambiguous semantic work may use the configured escalation model and remains reviewable" };
  }
  return { ...base, paid: true, modelId, escalate: false, unsupported: false, reviewRequired: false, reason: "straightforward extraction uses the configured lowest-cost validated model" };
}
