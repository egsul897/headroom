import { StatusChip } from "@/components/customer-workflow/StatusChip";
import type { CapacityClaimView } from "@/lib/customer-workflow/status-contract";

/** One capacity claim row — never labels GROSS or modeled remaining as AVAILABLE. */
export function CapacityClaimRow({
  label,
  claim,
  citations,
}: {
  label: string;
  claim: CapacityClaimView;
  citations?: string[];
}) {
  return (
    <div className="row">
      <div>
        <div className="row-label">{label}</div>
        <div className="row-note">
          <StatusChip code={claim.status} compact /> · {claim.claimLabel}
        </div>
        {citations && citations.length > 0 && (
          <div className="row-note">Citations: {citations.slice(0, 4).join(" · ")}</div>
        )}
        <div className="row-note">{claim.guidance}</div>
      </div>
      <div className="row-value">{claim.displayValue}</div>
    </div>
  );
}
