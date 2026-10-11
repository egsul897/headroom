import Link from "next/link";
import {
  canonicalizeWorkflowStepId,
  customerWorkflowJourney,
  type WorkflowStepId,
} from "@/lib/customer-workflow/journey";

/** Compact journey nav — Upload → Analyze → Review → Position → Simulate → Audit. */
export function WorkflowJourney({
  companyId,
  current,
}: {
  companyId: string;
  current: WorkflowStepId;
}) {
  const steps = customerWorkflowJourney(companyId);
  const activeId = canonicalizeWorkflowStepId(current);
  return (
    <nav className="row" aria-label="Customer workflow" style={{ flexWrap: "wrap", gap: 8, borderBottom: "none" }}>
      {steps.map((step, i) => {
        const active = step.id === activeId;
        return (
          <span key={step.id} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {i > 0 && <span className="row-note" aria-hidden>→</span>}
            <Link
              href={step.href}
              className={active ? "button button-primary" : "button"}
              aria-current={active ? "step" : undefined}
              title={step.purpose}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              {step.label}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
