import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { requireAssembledCfoWorkflow } from "@/lib/customer-workflow/require-workflow-access";

export const metadata = { title: "Headroom — Review" };

/**
 * Review — governing docs, covenants, definitions, coverage, evidence, utilization, approvals.
 * Never fabricates REVIEWED or APPROVED. Access-gated before sensitive loads.
 */
export default async function ReviewPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const wf = await requireAssembledCfoWorkflow({ companyId });
  const { review } = wf;

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Review</div>
        <WorkflowJourney companyId={companyId} current="review" />
        <div className="card-subtitle" style={{ marginTop: 8 }}>
          Counsel / treasury review of governing documents, extracted covenants, and executable-rule
          coverage. Status chips reflect recorded decisions only — never fabricated REVIEWED/APPROVED.
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="row-label">Overall</div>
          <div className="row-value">
            <StatusChip code={review.overallStatus} />
          </div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {review.overallGuidance}
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/rulebook`}>
            Open rulebook editor
          </Link>
          <Link className="button" href={`/${companyId}/evidence`}>
            Evidence detail
          </Link>
          <Link className="button button-primary" href={`/${companyId}/position`}>
            Continue to Position
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Governing documents</div>
        {review.governingDocuments.length === 0 ? (
          <div className="row-note">
            <StatusChip code="NEEDS_INPUT" compact /> None on file.
          </div>
        ) : (
          review.governingDocuments.map((d) => (
            <div className="row" key={d.id}>
              <div className="row-label">{d.name}</div>
              <StatusChip code={d.status} compact />
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Executable-rule coverage</div>
        <div className="row">
          <div className="row-label">Rulebook stage (actual)</div>
          <div className="row-value">
            <Chip tone="navy">{review.executableRuleCoverage.stage}</Chip>
            {review.executableRuleCoverage.fabricatedReviewed === false && (
              <span className="row-note"> — not fabricated REVIEWED</span>
            )}
          </div>
        </div>
        <div className="row">
          <div className="row-label">Discovered / interpreted / reviewed / executable</div>
          <div className="row-value">
            {review.executableRuleCoverage.discovered} / {review.executableRuleCoverage.interpreted} /{" "}
            {review.executableRuleCoverage.reviewed} / {review.executableRuleCoverage.executableReported}
          </div>
        </div>
        <div className="row">
          <div className="row-label">Extracted covenants (review items)</div>
          <div className="row-value">{review.extractedCovenants}</div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {review.definitionsNote}
        </div>
        <div className="row-note">{review.exceptionsNote}</div>
      </Card>

      <Card>
        <div className="card-title">Financial evidence & utilization</div>
        <div className="row">
          <div className="row-label">Financial evidence</div>
          <div className="row-value">
            <StatusChip code={review.financialEvidence.status} />
            {review.financialEvidence.hasSnapshot
              ? ` snapshot · NS-4/NS APPROVED=${review.financialEvidence.ns4ApprovedCount}`
              : " missing snapshot"}
          </div>
        </div>
        <div className="row" style={{ borderBottom: "none" }}>
          <div className="row-label">Utilization completeness</div>
          <div className="row-value">
            <StatusChip code={review.utilizationCompleteness.status} />
            {` active ledger rows=${review.utilizationCompleteness.activeLedgerRows}`}
            {!review.utilizationCompleteness.complete && (
              <span className="row-note"> — not certified complete</span>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="card-title">Approval status & citations</div>
        {review.approvals.length === 0 ? (
          <div className="row-note">No reviewer decisions recorded.</div>
        ) : (
          review.approvals.slice(0, 20).map((a, i) => (
            <div className="row" key={`${a.sectionRef}-${i}`}>
              <div>
                <div className="row-label">{a.sectionRef}</div>
                <div className="row-note">
                  {a.heading}
                  {a.citation ? ` · ${a.citation}` : " · citation missing"}
                </div>
              </div>
              <div className="row-value">
                {a.hasRecordedDecision ? (
                  <Chip tone={a.decision === "REJECTED" ? "trip" : "pass"}>{a.decision}</Chip>
                ) : (
                  <Chip tone="tight">PENDING (not APPROVED)</Chip>
                )}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Outstanding blockers</div>
        {review.outstandingBlockers.length === 0 ? (
          <div className="row-note">No open blockers reported.</div>
        ) : (
          review.outstandingBlockers.map((b, i) => (
            <div key={i} className="row-note">
              · <StatusChip code="REVIEW_REQUIRED" compact /> {b}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
