import { CapacityClaimRow } from "./CapacityClaimRow";
import type { SeparatedCapacityClaims } from "@/lib/customer-workflow/capacity-state";

/** Display gross / modeled / verified / unknown claims without collapsing them. */
export function SeparatedCapacityPanel({
  title,
  claims,
}: {
  title: string;
  claims: SeparatedCapacityClaims;
}) {
  return (
    <div>
      <div className="card-subtitle" style={{ marginBottom: 8 }}>
        {title}
      </div>
      <CapacityClaimRow label="Gross contractual capacity" claim={claims.grossContractual} />
      <CapacityClaimRow label="Hypothetical modeled capacity" claim={claims.hypotheticalModeled} />
      <CapacityClaimRow
        label="Verified remaining capacity"
        claim={claims.verifiedRemaining}
        citations={claims.sourceEvidence}
      />
      <CapacityClaimRow label="Unknown / unsupported capacity" claim={claims.unknownUnsupported} />
      {claims.bindingRestrictions.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="row-label">Binding restrictions</div>
          {claims.bindingRestrictions.slice(0, 8).map((b, i) => (
            <div key={i} className="row-note">
              · {b}
            </div>
          ))}
        </div>
      )}
      {claims.missingInputs.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="row-label">Missing inputs</div>
          {claims.missingInputs.slice(0, 8).map((m, i) => (
            <div key={i} className="row-note">
              · {m}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
