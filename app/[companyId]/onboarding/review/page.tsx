import Link from "next/link";
import { Card, Chip, type ChipTone } from "@/components/ui";
import { ReviewerNameField } from "@/components/ReviewerNameField";
import { getCandidatesForReview, getReviewProgress, getReviewHistoryForCompany, type CandidateForReview } from "@/lib/onboarding/review";
import { approveCandidateAction, rejectCandidateAction, markReviewRequiredAction, editCandidateAction } from "./actions";
import type { ExtractionCandidateKind, ExtractionCandidateReviewStatus } from "@prisma/client";

export const metadata = { title: "Headroom — Review extraction candidates" };
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<ExtractionCandidateKind, string> = {
  DOCUMENT_RELATIONSHIP: "Document type & amendment relationship",
  DEFINED_TERM: "Defined terms",
  PERMISSION: "Permissions (debt/lien baskets)",
  COLLATERAL_SCOPE: "Collateral scope",
  RELATIONSHIP: "Permission relationships",
  SHARED_CONSTRAINT: "Shared capacity constraints",
  ACTIVATION_CONDITION: "Activation conditions",
  EXTERNAL_INPUT_REQUIREMENT: "External input requirements",
  // Autonomous information retrieval, Phase A
  // (docs/autonomous-retrieval-phase-a-foundation.md) - a connector-discovered
  // financial fact (EDGAR/CSV/upload) reviewed through this exact same
  // generic workspace, no new UI code required beyond this label.
  FINANCIAL_FACT: "Financial facts (connector-discovered)",
};

const KIND_ORDER: ExtractionCandidateKind[] = ["DOCUMENT_RELATIONSHIP", "DEFINED_TERM", "PERMISSION", "COLLATERAL_SCOPE", "RELATIONSHIP", "SHARED_CONSTRAINT", "ACTIVATION_CONDITION", "EXTERNAL_INPUT_REQUIREMENT", "FINANCIAL_FACT"];

const STATUS_TONE: Record<ExtractionCandidateReviewStatus, ChipTone> = {
  PENDING: "idle",
  APPROVED: "pass",
  EDITED: "navy",
  REJECTED: "trip",
  REVIEW_REQUIRED: "tight",
};

function ValueTable({ value }: { value: unknown }) {
  if (!value || typeof value !== "object") return <div className="row-note">{String(value)}</div>;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return (
    <dl className="candidate-value-table">
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd style={{ margin: 0, wordBreak: "break-word" }}>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function CandidateCard({ companyId, candidate, history }: { companyId: string; candidate: CandidateForReview; history: { action: string; previousStatus: string; newStatus: string; reviewedBy: string | null; note: string | null; createdAt: Date }[] }) {
  const isFinal = !!candidate.promotedAt;
  const approve = approveCandidateAction.bind(null, companyId, candidate.id);
  const reject = rejectCandidateAction.bind(null, companyId, candidate.id);
  const markReviewRequired = markReviewRequiredAction.bind(null, companyId, candidate.id);
  const edit = editCandidateAction.bind(null, companyId, candidate.id);

  return (
    <div className="candidate-card">
      <div className="candidate-card-header">
        <div>
          <Chip tone={STATUS_TONE[candidate.reviewStatus]}>{candidate.reviewStatus.replace(/_/g, " ")}</Chip>
          {candidate.promotedAt && <Chip tone="navy">PROMOTED</Chip>}
          {candidate.confidence != null && <span className="row-note"> · confidence {(candidate.confidence * 100).toFixed(0)}%</span>}
        </div>
        <div className="row-note">
          {candidate.sourceDocumentName}
          {candidate.sourceSectionRef ? ` · §${candidate.sourceSectionRef}` : ""}
          {candidate.sourcePage != null ? ` · p.${candidate.sourcePage}` : ""}
          {candidate.sourceChunkIds[0] && (
            <>
              {" · "}
              <Link href={`/${companyId}/onboarding/review/chunk/${candidate.sourceChunkIds[0]}`}>view in context</Link>
            </>
          )}
        </div>
      </div>

      <ValueTable value={candidate.proposedValue} />
      {candidate.reviewerEditedValue != null && (
        <>
          <div className="row-note" style={{ marginTop: 6 }}>
            Reviewer edit (proposedValue above is preserved unchanged):
          </div>
          <ValueTable value={candidate.reviewerEditedValue} />
        </>
      )}

      {candidate.sourceExcerpt && <div className="candidate-excerpt">&ldquo;{candidate.sourceExcerpt}&rdquo;</div>}
      {candidate.rationale && <div className="row-note">Rationale: {candidate.rationale}</div>}

      {!isFinal && (
        <div className="button-row" style={{ marginTop: 10 }}>
          <form action={approve} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <ReviewerNameField id={`reviewedBy-approve-${candidate.id}`} />
            <button type="submit" className="button-primary">
              Approve
            </button>
          </form>
          <form action={reject} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <ReviewerNameField id={`reviewedBy-reject-${candidate.id}`} />
            <button type="submit" className="button button-danger">
              Reject
            </button>
          </form>
          <form action={markReviewRequired} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <ReviewerNameField id={`reviewedBy-flag-${candidate.id}`} />
            <button type="submit" className="button">
              Flag for review
            </button>
          </form>
        </div>
      )}

      {!isFinal && (
        <details style={{ marginTop: 10 }}>
          <summary className="row-note" style={{ cursor: "pointer" }}>
            Edit value
          </summary>
          <form action={edit} style={{ marginTop: 8, display: "grid", gap: 6 }}>
            <textarea name="editedValueJson" defaultValue={JSON.stringify(candidate.reviewerEditedValue ?? candidate.proposedValue, null, 2)} rows={8} />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <ReviewerNameField id={`reviewedBy-edit-${candidate.id}`} />
              <input type="text" name="note" placeholder="Note (optional)" style={{ flex: 1 }} />
              <button type="submit" className="button">
                Save edit &amp; approve
              </button>
            </div>
          </form>
        </details>
      )}

      {history.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="row-note" style={{ cursor: "pointer" }}>
            Review history ({history.length})
          </summary>
          {history.map((h, i) => (
            <div className="review-history-entry" key={i}>
              <b>{h.action}</b> {h.previousStatus} → {h.newStatus} by {h.reviewedBy ?? "unknown"} at {h.createdAt.toISOString()}
              {h.note && <div>&ldquo;{h.note}&rdquo;</div>}
            </div>
          ))}
        </details>
      )}
      {isFinal && <div className="row-note" style={{ marginTop: 8 }}>Promoted at {candidate.promotedAt!.toISOString()} — this decision is final.</div>}
    </div>
  );
}

export default async function ReviewPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [byKind, progress, historyByCandidateId] = await Promise.all([getCandidatesForReview(companyId), getReviewProgress(companyId), getReviewHistoryForCompany(companyId)]);

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Review extraction candidates</div>
        <div className="card-subtitle">
          Organized by kind. Approve/edit/reject/flag every candidate before promotion — promotion only ever reads APPROVED/EDITED candidates, and a KNOWN_NOT_MODELED permission gap is excluded from promotion even if approved.
        </div>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-tile-value">{progress.total}</div>
            <div className="stat-tile-label">total</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{progress.pending}</div>
            <div className="stat-tile-label">pending</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{progress.reviewRequired}</div>
            <div className="stat-tile-label">review required</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{progress.approved + progress.edited}</div>
            <div className="stat-tile-label">ready to promote</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-value">{progress.promoted}</div>
            <div className="stat-tile-label">promoted</div>
          </div>
        </div>
        <div className="button-row" style={{ marginTop: 10 }}>
          <Link href={`/${companyId}/onboarding/activate`} className="button button-primary" style={{ textDecoration: "none" }}>
            Continue to Activate
          </Link>
          <Link href={`/${companyId}/onboarding`} className="button" style={{ textDecoration: "none" }}>
            Back to onboarding wizard
          </Link>
        </div>
      </Card>

      {KIND_ORDER.map((kind) => {
        const list = byKind[kind] ?? [];
        if (list.length === 0) return null;
        return (
          <Card key={kind}>
            <div className="card-title">
              {KIND_LABELS[kind]} <span className="row-note">({list.length})</span>
            </div>
            {list.map((c) => (
              <CandidateCard key={c.id} companyId={companyId} candidate={c} history={historyByCandidateId.get(c.id) ?? []} />
            ))}
          </Card>
        );
      })}

      {progress.total === 0 && (
        <Card>
          <div className="card-subtitle">No extraction candidates yet — upload a document and run extraction first.</div>
        </Card>
      )}
    </div>
  );
}
