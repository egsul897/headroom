import Link from "next/link";
import {
  customerWorkflowJourney,
  type WorkflowStepId,
} from "@/lib/customer-workflow/journey";

/** Compact journey nav — Documents → … → Evidence. */
export function WorkflowJourney({
  companyId,
  current,
}: {
  companyId: string;
  current: WorkflowStepId;
}) {
  const steps = customerWorkflowJourney(companyId);
  return (
    <nav className="row" aria-label="Customer workflow" style={{ flexWrap: "wrap", gap: 8, borderBottom: "none" }}>
      {steps.map((step, i) => {
        const active = step.id === current;
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
