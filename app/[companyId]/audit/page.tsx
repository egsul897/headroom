import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { requireAssembledCfoWorkflow } from "@/lib/customer-workflow/require-workflow-access";

export const metadata = { title: "Headroom — Audit" };

/**
 * Audit — why a result is or is not publishable.
 * Access-gated before sensitive loads. Never claims production readiness while
 * trusted identity / evidence gates remain blocked.
 */
export default async function AuditPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const wf = await requireAssembledCfoWorkflow({ companyId });
  const { audit, workflow } = wf;

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Audit</div>
        <WorkflowJourney companyId={companyId} current="audit" />
        <div className="card-subtitle" style={{ marginTop: 8 }}>
          Coherent explanation of governing documents, provisions, financial values, utilization,
          assumptions, reviewer approvals, and publishability.
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="row-label">Publishable as AVAILABLE?</div>
          <div className="row-value">
            <Chip tone="trip">NO</Chip>{" "}
            <StatusChip code={audit.publishability.overallStatus} />
          </div>
        </div>
        <div className="row">
          <div className="row-label">Trusted identity</div>
          <div className="row-value">
            <Chip tone="tight">{wf.trustedIdentityStatus}</Chip>
          </div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Workflow production ready</div>
          <div className="row-value">{workflow.productionReady ? "YES" : "NO"}</div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {audit.overallGuidance}
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/position`}>
            Position
          </Link>
          <Link className="button" href={`/${companyId}/simulate`}>
            Simulate
          </Link>
          <Link className="button" href={`/${companyId}/evidence`}>
            Evidence detail
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Which documents governed</div>
        {audit.governingDocuments.length === 0 ? (
          <div className="row-note">None recorded.</div>
        ) : (
          audit.governingDocuments.map((d, i) => (
            <div key={i} className="row-note">
              · {d}
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Which provisions were applied</div>
        {audit.provisionsApplied.map((p, i) => (
          <div key={i} className="row-note">
            · {p}
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Financial values used</div>
        {audit.financialValuesUsed.map((f, i) => (
          <div key={i} className="row-note">
            · {f}
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Utilization entries considered</div>
        {audit.utilizationEntriesConsidered.map((u, i) => (
          <div key={i} className="row-note">
            · {u}
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Assumptions made</div>
        {audit.assumptionsMade.map((a, i) => (
          <div key={i} className="row-note">
            · {a}
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Reviewer approvals on record</div>
        {audit.reviewerApprovals.length === 0 ? (
          <div className="row-note">None — not fabricated APPROVED.</div>
        ) : (
          audit.reviewerApprovals.map((r, i) => (
            <div key={i} className="row-note">
              · {r}
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Why not publishable</div>
        {audit.publishability.reasons.map((r, i) => (
          <div key={i} className="row-note">
            · <StatusChip code="NOT_PRODUCTION_AUTHORITATIVE" compact /> {r}
          </div>
        ))}
      </Card>
    </div>
  );
}
