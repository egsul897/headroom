import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { prisma } from "@/lib/prisma";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import { listConmedPackageFacts } from "@/lib/product/conmed-demo/covenant-catalog";
import {
  getLatestAmendmentPackage,
  listCustomerDocumentIntelligence,
} from "@/lib/product/customer-intelligence/load";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { listReviewerApprovals } from "@/lib/product/customer-intelligence/reviewer-approvals";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { getDocumentDetails } from "@/lib/dashboard-service";
import {
  buildEvidenceReviewView,
  explainRuleExecutability,
} from "@/lib/customer-workflow/evidence-view";

export const metadata = { title: "Headroom — Evidence" };

/**
 * Evidence / review journey — uploaded docs, clauses, definitions, amendments,
 * verification evidence, reviewer decisions, missing inputs.
 */
export default async function EvidencePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;

  const [candidates, documents, intelligence, amendment, review, approvals, readiness] = await Promise.all([
    prisma.extractionCandidate.findMany({
      where: {
        companyId,
        reviewStatus: { in: ["PENDING", "REVIEW_REQUIRED"] },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
      include: { sourceDocument: true },
    }),
    getDocumentDetails(companyId),
    listCustomerDocumentIntelligence(companyId),
    getLatestAmendmentPackage(companyId),
    loadCovenantReviewWorkspace(companyId).catch(() => null),
    listReviewerApprovals(companyId).catch(() => []),
    loadCapacityReadiness(companyId),
  ]);

  const intelByDoc = new Map(intelligence.map((i) => [i.documentId, i]));
  const decisionByKey = new Map(approvals.map((a) => [`${a.sourceId}|${a.sectionRef}`, a]));

  const clauses =
    review?.categories.flatMap((c) =>
      c.items.slice(0, 8).map((item) => {
        const decision = decisionByKey.get(`${item.sourceId}|${item.sectionRef}`);
        return {
          sourceId: item.sourceId,
          sectionRef: item.sectionRef,
          heading: item.heading,
          posture: item.posture,
          documentTitle: item.documentTitle,
          citation: item.sourceCitation ?? null,
          unresolvedQuestions: item.unresolvedQuestions ?? [],
          decision: (decision?.decision as "ACCEPTED" | "EDITED" | "REJECTED" | "PENDING" | undefined) ?? null,
        };
      }),
    ) ?? [];

  const view = buildEvidenceReviewView({
    companyId,
    documents: documents.map((d) => {
      const intel = intelByDoc.get(d.id);
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        analysisOk: intel?.analysisOk,
        processingStatus: intel?.processingStatus,
        covenantItemCount: intel?.covenantItemCount,
        extractionStatus: intel?.extractionStatus ?? null,
        provisionalIdentity:
          intel?.extractionStatus === "PROVISIONAL" ||
          /provisional|ambiguous|unresolved.?identity/i.test(String(intel?.processingStatus ?? "")),
      };
    }),
    clauses,
    amendment: amendment
      ? {
          operativeResolution: amendment.operativeResolution,
          unresolvedReasons: amendment.unresolvedReasons,
          askGuidance: amendment.askGuidance,
        }
      : null,
    verificationEvidence: [
      `Capacity authority: ${readiness.capacityAuthority}`,
      `Phase 3 trusted units: ${readiness.phase3TrustedUnitCount}`,
      `NS-4 APPROVED snapshots: ${readiness.approvedNorthStarSnapshotCount}`,
      `Active 4C ledger usages: ${readiness.contractLedgerActiveCount}`,
    ],
    readinessBlockers: readiness.blockers,
  });

  const executability = explainRuleExecutability({
    executable: readiness.canEvaluateExecutableCapacity && view.overallStatus !== "AMBIGUOUS",
    blockers: readiness.blockers,
    missingCitations: clauses.some((c) => !c.citation),
    utilizationComplete: readiness.contractLedgerActiveCount > 0 && readiness.ns4ApprovedSnapshotCount > 0,
    amendmentResolved: !view.amendment?.conflicting,
  });

  const isConmed = companyId === CONMED_DEMO_COMPANY_ID;
  const facts = isConmed ? listConmedPackageFacts() : [];

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Evidence & review</div>
        <WorkflowJourney companyId={companyId} current="evidence" />
        <div className="card-subtitle" style={{ marginTop: 8 }}>
          Navigable path back to supporting sources. Distinguishes source-backed facts from unresolved items.
          A simulation or discovery label is not a legal approval.
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="row-label">Evidence journey status</div>
          <div className="row-value">
            <StatusChip code={view.overallStatus} />
          </div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {view.overallGuidance}
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/onboarding/review`}>
            Extraction review queue
          </Link>
          <Link className="button" href={`/${companyId}/documents`}>
            Documents
          </Link>
          <Link className="button" href={`/${companyId}/rulebook`}>
            Rulebook review
          </Link>
          <Link className="button" href="/research/corpus">
            Research corpus
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Why a rule is executable or refused</div>
        <div className="row">
          <div className="row-label">Executability</div>
          <div className="row-value">
            <StatusChip code={executability.status} />
          </div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {executability.explanation}
        </div>
      </Card>

      <Card>
        <div className="card-title">Uploaded documents</div>
        {view.documents.length === 0 ? (
          <div className="row-note">
            <StatusChip code="NEEDS_INPUT" compact /> No governing documents on record.
          </div>
        ) : (
          view.documents.map((d) => (
            <div className="row" key={d.id}>
              <div>
                <div className="row-label">{d.name}</div>
                <div className="row-note">
                  {d.type} · {d.analysisStatus} · {d.covenantItemCount} covenant summaries
                  {d.extractionStatus ? ` · ${d.extractionStatus}` : ""}
                </div>
                {d.provisionalIdentity && (
                  <div className="row-note">
                    <StatusChip code="AMBIGUOUS" compact /> Provisional document identity
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <StatusChip code={d.customerStatus} compact />
                <Link className="button" href={`/${companyId}/documents/${d.id}`}>
                  Open
                </Link>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Extracted clauses & definitions</div>
        <div className="card-subtitle">{view.definitionsNote}</div>
        {view.clauses.length === 0 ? (
          <div className="row-note">No interpreted covenant clauses loaded for review.</div>
        ) : (
          view.clauses.map((c) => (
            <div className="row" key={`${c.sourceId}-${c.sectionRef}`}>
              <div>
                <div className="row-label">
                  {c.sectionRef} — {c.heading}
                </div>
                <div className="row-note">
                  {c.documentTitle ?? c.sourceId}
                  {c.posture ? ` · ${c.posture}` : ""}
                  {c.decision ? ` · decision ${c.decision}` : " · decision PENDING"}
                </div>
                {c.citation ? (
                  <div className="row-note">Citation: {c.citation}</div>
                ) : (
                  <div className="row-note">
                    <StatusChip code="REVIEW_REQUIRED" compact /> Source citation missing
                  </div>
                )}
                {c.unresolvedCount > 0 && (
                  <div className="row-note">{c.unresolvedCount} unresolved question(s)</div>
                )}
              </div>
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Cross-document references & amendments</div>
        <div className="card-subtitle">{view.crossDocumentNote}</div>
        {view.amendment ? (
          <>
            <div className="row">
              <div className="row-label">Operative resolution</div>
              <div className="row-value">
                <StatusChip code={view.amendment.customerStatus} />
              </div>
            </div>
            {view.amendment.conflicting && (
              <div className="row-note">
                <StatusChip code="AMBIGUOUS" compact /> Conflicting / unresolved amendment precedence
              </div>
            )}
            {view.amendment.unresolvedReasons.map((r, i) => (
              <div key={i} className="row-note">
                · {r}
              </div>
            ))}
            {view.amendment.askGuidance && (
              <div className="row-note" style={{ marginTop: 8 }}>
                {view.amendment.askGuidance}
              </div>
            )}
          </>
        ) : (
          <div className="row-note">No amendment package recorded for this workspace.</div>
        )}
      </Card>

      <Card>
        <div className="card-title">Verification evidence</div>
        {view.verificationEvidence.map((e, i) => (
          <div key={i} className="row-note">
            · {e}
          </div>
        ))}
      </Card>

      <Card>
        <div className="card-title">Reviewer-required decisions</div>
        {view.reviewerRequired.length === 0 ? (
          <div className="row-note">No open reviewer decisions from the current clause sample.</div>
        ) : (
          view.reviewerRequired.map((r, i) => (
            <div key={i} className="row-note">
              · <StatusChip code="REVIEW_REQUIRED" compact /> {r}
            </div>
          ))
        )}
      </Card>

      <Card>
        <div className="card-title">Missing inputs</div>
        {view.missingInputs.length === 0 ? (
          <div className="row-note">No readiness blockers listed.</div>
        ) : (
          view.missingInputs.map((m, i) => (
            <div key={i} className="row-note">
              · <StatusChip code="NEEDS_INPUT" compact /> {m}
            </div>
          ))
        )}
      </Card>

      {isConmed && (
        <Card>
          <div className="card-title">Known unresolved (package)</div>
          <div className="row">
            <div className="row-label">Doc C target</div>
            <div className="row-value">
              <Chip tone="tight">OUT OF PACKAGE</Chip> Amends Seventh A&R (not in workspace)
            </div>
          </div>
          <div className="row">
            <div className="row-label">Numeric capacity</div>
            <div className="row-value">
              <StatusChip code="NEEDS_INPUT" compact /> No approved snapshot / utilization ledger
            </div>
          </div>
          <div className="row" style={{ borderBottom: "none" }}>
            <div className="row-label">Schedule-dependent baskets</div>
            <div className="row-value">
              <StatusChip code="UNSUPPORTED" compact /> e.g. Schedule 7.2(e) not fully modeled
            </div>
          </div>
        </Card>
      )}

      {facts.length > 0 && (
        <Card>
          <div className="card-title">Source-backed package facts</div>
          {facts.map((f) => (
            <div className="row" key={f.id}>
              <div>
                <div className="row-label">{f.id}</div>
                <div className="row-note">{f.fact}</div>
                <div className="row-note">
                  {f.evidenceCitation} · <Chip tone="navy">{f.clarity}</Chip>
                </div>
              </div>
              <Link className="button" href={`/${companyId}/documents/${f.demoDocumentId}`}>
                Open source
              </Link>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <div className="card-title">Extraction candidates needing review</div>
        {candidates.length === 0 ? (
          <div className="card-subtitle">No open extraction candidates.</div>
        ) : (
          candidates.map((c) => (
            <div className="row" key={c.id}>
              <div>
                <div className="row-label">{c.kind}</div>
                <div className="row-note">
                  {c.sourceDocument.name} · {c.reviewStatus}
                </div>
              </div>
              <Link className="button" href={`/${companyId}/onboarding/review`}>
                Review
              </Link>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
