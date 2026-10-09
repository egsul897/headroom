import { Chip } from "@/components/ui";
import { outcomeTone, type CustomerOutcomeKind } from "@/lib/product/unified-customer/client-safe";

const LABELS: Record<CustomerOutcomeKind, string> = {
  SUPPORTED_PERMISSION: "Supported permission",
  SUPPORTED_PROHIBITION: "Supported prohibition",
  CONDITIONAL_OR_REVIEW_REQUIRED: "Conditional / review required",
  MISSING_EVIDENCE: "Missing evidence",
  UNSUPPORTED_CALCULATION: "Unsupported calculation",
};

export function OutcomeBadge({
  kind,
  rationale,
}: {
  kind: CustomerOutcomeKind;
  rationale?: string;
}) {
  return (
    <div>
      <Chip tone={outcomeTone(kind)}>{LABELS[kind]}</Chip>
      {rationale && (
        <div className="row-note" style={{ marginTop: 6 }}>
          {rationale}
        </div>
      )}
    </div>
  );
}
