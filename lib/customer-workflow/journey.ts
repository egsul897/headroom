/**
 * Customer workflow journey — Documents → Covenants → Rulebook → Position →
 * Ask → Simulate → Evidence. Presentation navigation only.
 */

export type WorkflowStepId =
  | "documents"
  | "covenants"
  | "rulebook"
  | "position"
  | "ask"
  | "simulate"
  | "evidence";

export interface WorkflowStep {
  id: WorkflowStepId;
  label: string;
  href: string;
  purpose: string;
}

/** Ordered CFO/treasury journey for a company workspace. */
export function customerWorkflowJourney(companyId: string): WorkflowStep[] {
  return [
    {
      id: "documents",
      label: "Documents",
      href: `/${companyId}/documents`,
      purpose: "Debt package uploads, extraction, amendment status",
    },
    {
      id: "covenants",
      label: "Covenant discovery",
      href: `/${companyId}/covenants`,
      purpose: "Discovered restrictions, baskets, and review items",
    },
    {
      id: "rulebook",
      label: "Verified rulebook",
      href: `/${companyId}/rulebook`,
      purpose: "Counsel accept/edit/reject of executable interpretations",
    },
    {
      id: "position",
      label: "Position",
      href: `/${companyId}/position`,
      purpose: "Instruments, permissions, gross vs remaining authority",
    },
    {
      id: "ask",
      label: "Ask",
      href: `/${companyId}/ask`,
      purpose: "Structured permission questions with citations and limits",
    },
    {
      id: "simulate",
      label: "Simulate",
      href: `/${companyId}/simulate`,
      purpose: "Hypothetical path effects — never ledger posts",
    },
    {
      id: "evidence",
      label: "Evidence & review",
      href: `/${companyId}/evidence`,
      purpose: "Why a rule is executable or refused; reviewer decisions",
    },
  ];
}

export function workflowStepById(
  companyId: string,
  id: WorkflowStepId,
): WorkflowStep | undefined {
  return customerWorkflowJourney(companyId).find((s) => s.id === id);
}
