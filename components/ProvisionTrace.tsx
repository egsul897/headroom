import type { ReactNode } from "react";
import { describeFormula } from "@/lib/describe-formula";
import type { DefinedTermLite } from "@/lib/coherent";
import type { CovenantProvisionInput } from "@/lib/covenant-engine";

/**
 * The citation-to-text chain: provision cited -> defined terms it depends on
 * (collapsible, showing actual text) -> formula -> computed number. Built on
 * native <details>/<summary> so it works with zero JS in server components
 * and drops into client components (like Simulate) without needing "use
 * client" of its own.
 */
export function ProvisionTrace({
  provision,
  definedTerms,
  value,
  note,
  open,
}: {
  provision: CovenantProvisionInput;
  definedTerms: DefinedTermLite[];
  /** Usually a formatted string, but can be a Chip or other node (e.g. an "open/locked" ratio-gate badge). */
  value: ReactNode;
  note?: string;
  open?: boolean;
}) {
  return (
    <details className="trace" open={open}>
      <summary className="trace-summary">
        <span className="trace-summary-main">
          <span className="row-label">{provision.basketName}</span>
          <span>
            <span className="section-ref">{provision.sectionRef}</span>
            {note && <span className="row-note"> · {note}</span>}
          </span>
        </span>
        <span className="row-value">{value}</span>
      </summary>
      <div className="trace-body">
        <div className="trace-formula">
          <span className="trace-label">Formula</span> {describeFormula(provision)}
        </div>
        {definedTerms.length > 0 ? (
          <div className="trace-terms">
            <div className="trace-label">Defined terms this depends on</div>
            {definedTerms.map((t) => (
              <details key={t.termName} className="trace-term">
                <summary>
                  <span className="trace-term-name">{t.termName}</span>{" "}
                  <span className="section-ref">{t.sectionRef}</span>
                  {t.status !== "VERIFIED" && (
                    <span className="chip chip-tight" style={{ marginLeft: 8 }}>
                      {t.status === "DISPUTED" ? "disputed" : "unverified"}
                    </span>
                  )}
                </summary>
                <p className="trace-term-text">{t.fullText}</p>
              </details>
            ))}
          </div>
        ) : (
          <div className="trace-label">No defined terms linked yet.</div>
        )}
      </div>
    </details>
  );
}
