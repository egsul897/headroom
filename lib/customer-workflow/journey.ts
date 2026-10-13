/**
 * Customer workflow journey — Upload → Analyze → Review → Position →
 * Simulate → Audit. Presentation navigation only; no capacity arithmetic.
 *
 * Legacy surfaces (Documents, Covenants, Rulebook, Ask, Evidence) remain
 * reachable; this ordered journey is the CFO / treasury product path.
 */

export type WorkflowStepId =
  | "upload"
  | "analyze"
  | "review"
  | "position"
  | "simulate"
  | "audit"
  /** @deprecated Prefer upload / analyze / review / audit */
  | "documents"
  | "covenants"
  | "rulebook"
  | "ask"
  | "evidence";

export interface WorkflowStep {
  id: Exclude<WorkflowStepId, "documents" | "covenants" | "rulebook" | "ask" | "evidence">;
  label: string;
  href: string;
  purpose: string;
}

/** Normalize legacy step ids onto the CFO journey. */
export function canonicalizeWorkflowStepId(id: WorkflowStepId): WorkflowStep["id"] {
  switch (id) {
    case "documents":
      return "upload";
    case "covenants":
      return "analyze";
    case "rulebook":
    case "ask":
      return "review";
    case "evidence":
      return "audit";
    default:
      return id;
  }
}

/** Ordered CFO/treasury journey for a company workspace. */
export function customerWorkflowJourney(companyId: string): WorkflowStep[] {
  return [
    {
      id: "upload",
      label: "Upload",
      href: `/${companyId}/documents`,
      purpose: "Create workspace package — documents received, roles, processing state",
    },
    {
      id: "analyze",
      label: "Analyze",
      href: `/${companyId}/analyze`,
      purpose: "Extraction / operative-authority status — never success-from-upload alone",
    },
    {
      id: "review",
      label: "Review",
      href: `/${companyId}/review`,
      purpose: "Governing docs, covenants, definitions, coverage, evidence, approvals",
    },
    {
      id: "position",
      label: "Position",
      href: `/${companyId}/position`,
      purpose: "Gross / modeled / verified remaining — generalized capacity result only",
    },
    {
      id: "simulate",
      label: "Simulate",
      href: `/${companyId}/simulate`,
      purpose: "Hypothetical path effects on the same capacity state — never ledger posts",
    },
    {
      id: "audit",
      label: "Audit",
      href: `/${companyId}/audit`,
      purpose: "Why a result is or is not publishable — documents, provisions, assumptions",
    },
  ];
}

export function workflowStepById(
  companyId: string,
  id: WorkflowStepId,
): WorkflowStep | undefined {
  const canonical = canonicalizeWorkflowStepId(id);
  return customerWorkflowJourney(companyId).find((s) => s.id === canonical);
}
