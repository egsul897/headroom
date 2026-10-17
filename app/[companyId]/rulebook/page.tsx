import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { WorkflowJourney } from "@/components/customer-workflow/WorkflowJourney";
import { StatusChip } from "@/components/customer-workflow/StatusChip";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { listReviewerApprovals } from "@/lib/product/customer-intelligence/reviewer-approvals";
import { listCustomerDocumentIntelligence } from "@/lib/product/customer-intelligence/load";
import { proposeReviewDecision } from "@/lib/product/customer-intelligence/review-proposal";
import { ReviewerNameField } from "@/components/ReviewerNameField";
import { mapEngineLabelToCustomerStatus } from "@/lib/customer-workflow/status-contract";
import { reviewProvisionAction } from "./actions";

export const metadata = { title: "Headroom — Rulebook" };
export const dynamic = "force-dynamic";

/**
 * AI-first lawyer review: accept / edit / reject AI interpretations.
 * Does not require external legal verification before analysis is shown.
 */
export default async function RulebookPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams?: Promise<{ page?: string; view?: string }>;
}) {
  const { companyId } = await params;
  const sp = searchParams ? await searchParams : {};
  // Integration fix: the queue used to cap at 10 items per category
  // and 50 total with no way to reach the rest — a 120-item
  // agreement could never be fully reviewed through the UI, so
  // counsel could never complete coverage. The queue is now
  // paginated (50 per page) over the FULL candidate list; every
  // interpretation is reachable.
  const PAGE_SIZE = 50;
  const requestedPage = Number.parseInt(typeof sp.page === "string" ? sp.page : "", 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
  // Jobs rule: the Rulebook opens on the work — the items needing
  // a decision. Already-decided items live on a separate view
  // (?view=decided), one click away, so pagination never mixes
  // the two and the action list shrinks as counsel works.
  const view = sp.view === "decided" ? "decided" : "action";
  const [rulebook, review, capacity, approvals, intelligence] = await Promise.all([
    loadRulebookReadiness(companyId),
    loadCovenantReviewWorkspace(companyId),
    loadCapacityReadiness(companyId),
    listReviewerApprovals(companyId),
    listCustomerDocumentIntelligence(companyId).catch(() => []),
  ]);
  // Rule 121: rule 118's mismatch on the rulebook — these decisions
  // compile executable Permissions, so the signal must travel with
  // the interpretation being accepted, not only live on document pages.
  const mismatchBySourceId = new Map(
    (intelligence as { sourceId: string; declaredType: string | null; documentClass: string }[])
      .filter((i) => i.declaredType && i.documentClass && i.documentClass !== i.declaredType)
      .map((i) => [i.sourceId, `declared ${i.declaredType}, analyzed as ${i.documentClass}`] as const),
  );
  const decide = reviewProvisionAction.bind(null, companyId);
  // Fix 6: decision lookup keys on category — two queue rows sharing
  // a sectionRef but in different categories are distinct decisions.
  const decisionByKey = new Map(approvals.map((a) => [`${a.sourceId}|${a.sectionRef}|${a.category}`, a]));

  const candidates = review.categories.flatMap((c) =>
    c.items.map((item) => ({
      sourceId: item.sourceId,
      category: c.category,
      categoryLabel: c.categoryLabel,
      sectionRef: item.sectionRef,
      heading: item.heading,
      posture: item.posture,
      plainEnglish: item.plainEnglish,
      baskets: item.materialBasketsThresholds ?? [],
      conditions: item.conditions ?? [],
      unresolved: item.unresolvedQuestions ?? [],
      alternatives: item.alternativeInterpretations ?? item.analysis?.alternativeInterpretations ?? [],
      assumptions: item.assumptions ?? item.analysis?.assumptions ?? [],
      citation: item.sourceCitation,
      documentTitle: item.documentTitle,
      typeMismatch: mismatchBySourceId.get(item.sourceId) ?? null,
      decision: decisionByKey.get(`${item.sourceId}|${item.sectionRef}|${item.category}`),
      // Headroom proposes a decision for EVERY item — counsel
      // confirms or edits, never decides from scratch.
      proposal: proposeReviewDecision(item),
    })),
  );
  // Jobs rule: counsel's time goes to the items that need it.
  // The default view is the action list (undecided items only);
  // already-decided items (SYSTEM auto-accept + counsel decisions)
  // live on ?view=decided, one click away — never mixed into the
  // action list by pagination.
  const actionItems = candidates.filter((c) => !c.decision);
  const decidedItems = candidates.filter((c) => c.decision);
  const visibleCandidates = view === "decided" ? decidedItems : actionItems;
  const systemDecided = decidedItems.filter((c) => c.decision?.reviewerKind === "SYSTEM").length;
  const counselDecided = decidedItems.length - systemDecided;
  const flaggedCount = actionItems.filter((c) => c.proposal.needsAttention).length;

  return (
    <div className="stack">
      <Card>
        <div className="card-title">AI interpretations — lawyer review</div>
        <WorkflowJourney companyId={companyId} current="review" />
        <div className="card-subtitle" style={{ marginTop: 8 }}>
          {rulebook.headline}
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          Headroom is AI-first: substantive interpretations are generated from your financing documents for your
          counsel to accept, edit, or reject. External legal verification is not required before analysis appears.
          Counsel-approved text becomes the controlling workspace reading (subject to later document changes).
          Stage EXECUTABLE here means legacy Permission path readiness — not Phase 4E / production-authoritative capacity.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Stage</div>
          <div className="row-value">
            <StatusChip
              code={
                rulebook.stage === "EXECUTABLE"
                  ? "NOT_PRODUCTION_AUTHORITATIVE"
                  : mapEngineLabelToCustomerStatus(rulebook.stage)
              }
            />{" "}
            <Chip tone={rulebook.stage === "EXECUTABLE" ? "pass" : "tight"}>{rulebook.stage}</Chip>
          </div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          Discovered: {rulebook.discoveredSummaries} · Interpreted: {rulebook.interpretedProvisions} · Reviewed:{" "}
          {rulebook.reviewedPermissions} · Executable permissions: {rulebook.executablePermissions}
        </div>
        <div className="row-note">{rulebook.note}</div>
        {rulebook.blockers.map((b, i) => (
          <div key={i} className="row-note">
            • {b}
          </div>
        ))}
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/intelligence`}>
            Debt intelligence
          </Link>
          <Link className="button" href={`/${companyId}/covenants`}>
            Covenant review
          </Link>
          <Link className="button" href={`/${companyId}/capacity`}>
            Capacity
          </Link>
          <Link className="button" href={`/${companyId}/ask`}>
            Ask Headroom
          </Link>
          <Link className="button" href={`/${companyId}/onboarding/financials`}>
            Financial inputs
          </Link>
        </div>
      </Card>

      <Card>
        <div className="card-title">Capacity readiness gate</div>
        <div className="card-subtitle">{capacity.headline}</div>
        <Chip tone={capacity.canEvaluateExecutableCapacity ? "pass" : "tight"}>{capacity.status}</Chip>
      </Card>

      <Card>
        <div className="card-title">Review queue</div>
        <div className="card-subtitle">
          Headroom proposes a decision for every interpretation — counsel confirms, edits, or rejects. Only flagged
          items genuinely need your attention; the rest are one-click confirms. Numerical capacity still requires a
          counsel-reviewed executable rulebook and financial inputs — missing numbers stay conditional, never invented.
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          {actionItems.length} need your decision
          {flaggedCount > 0 && <> · {flaggedCount} flagged for your attention</>} · {decidedItems.length} already
          decided ({systemDecided} system-accepted, {counselDecided} counsel-decided)
        </div>
        <div className="row-note" style={{ marginTop: 4 }}>
          {review.totalDiscovered} provisions found in documents · {review.totalSummaries} analyzed
          {review.awaitingAnalysis > 0 && (
            <>
              {" "}· {review.awaitingAnalysis} awaiting analysis — not reviewed, not rejected, not irrelevant.
            </>
          )}{" "}
          · {candidates.length} interpretations to review
          {candidates.length !== review.totalSummaries && (
            <> ({review.totalSummaries - candidates.length} duplicate rows merged)</>
          )}
          . Capacity is computed from analyzed provisions only and may be incomplete until awaiting items are analyzed.
        </div>
        <div className="button-row" style={{ marginTop: 8 }}>
          <Link
            className={view === "action" ? "button button-primary" : "button"}
            href={`/${companyId}/rulebook`}
          >
            Needs your decision ({actionItems.length})
          </Link>
          <Link
            className={view === "decided" ? "button button-primary" : "button"}
            href={`/${companyId}/rulebook?view=decided`}
          >
            Already decided ({decidedItems.length})
          </Link>
        </div>
        {visibleCandidates.length === 0 ? (
          <div className="row-note">
            No interpreted provisions yet — upload financing documents; AI analysis runs without waiting for external
            legal verification.
          </div>
        ) : (
          <>
            {(() => {
              const pageCount = Math.max(1, Math.ceil(visibleCandidates.length / PAGE_SIZE));
              const safePage = Math.min(page, pageCount);
              const start = (safePage - 1) * PAGE_SIZE;
              const pageItems = visibleCandidates.slice(start, start + PAGE_SIZE);
              return (
                <>
                  <div className="row-note" style={{ marginTop: 8 }}>
                    Showing {start + 1}–{Math.min(start + pageItems.length, visibleCandidates.length)} of{" "}
                    {visibleCandidates.length} interpretations · page {safePage} of {pageCount}
                  </div>
                  {safePage > 1 && (
                    <div className="button-row" style={{ marginTop: 8 }}>
                      <Link className="button" href={`/${companyId}/rulebook?view=${view}&page=${safePage - 1}`}>
                        ← Previous page
                      </Link>
                    </div>
                  )}
                  {pageItems.map((c, i) => (
                    <div
                      key={`${c.sourceId}-${c.sectionRef}-${start + i}`}
                      style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--line)" }}
                    >
                      <div className="row">
                        <div className="row-label">
                          §{c.sectionRef} — {c.heading}
                        </div>
                        <div className="row-value">
                          {c.decision ? (
                            <Chip tone={c.decision.decision === "REJECTED" ? "tight" : "pass"}>
                              {c.decision.decision}
                              {c.decision.version ? ` v${c.decision.version}` : ""}
                            </Chip>
                          ) : (
                            <Chip tone="idle">AI DRAFT</Chip>
                          )}{" "}
                          {c.decision?.reviewerKind === "SYSTEM" && (
                            <Chip tone="idle">System-accepted — not counsel-verified</Chip>
                          )}
                          {c.posture && <Chip tone="navy">{c.posture}</Chip>}
                          {c.typeMismatch && <Chip tone="tight">TYPE MISMATCH — {c.typeMismatch}</Chip>}
                        </div>
                      </div>
                      <div className="row-note">
                        {c.categoryLabel} · {c.documentTitle}
                      </div>
                      <div
                        className="row-note"
                        style={{
                          marginTop: 6,
                          fontWeight: c.proposal.needsAttention ? 600 : undefined,
                        }}
                      >
                        {c.proposal.needsAttention ? "⚠ Needs your input — " : "Headroom proposes: "}
                        {c.proposal.decision === "ACCEPTED"
                          ? "Accept"
                          : c.proposal.decision === "REJECTED"
                            ? "Reject"
                            : "Needs your input"}
                        {c.proposal.terms ? ` — ${c.proposal.terms}` : ""} · {c.proposal.reason}
                      </div>
                      <div className="row-note" style={{ marginTop: 6 }}>
                        {c.plainEnglish}
                      </div>
                      {c.alternatives.slice(0, 2).map((a, j) => (
                        <div key={`alt${j}`} className="row-note">
                          Alternative: {a}
                        </div>
                      ))}
                      {c.alternatives.length > 2 && (
                        <div className="row-note">(+{c.alternatives.length - 2} more alternatives — see source document)</div>
                      )}
                      {c.assumptions.slice(0, 2).map((a, j) => (
                        <div key={`as${j}`} className="row-note">
                          Assumption: {a}
                        </div>
                      ))}
                      {c.assumptions.length > 2 && (
                        <div className="row-note">(+{c.assumptions.length - 2} more assumptions — see source document)</div>
                      )}
                      {c.baskets.slice(0, 3).map((b, j) => (
                        <div key={j} className="row-note">
                          Basket: {b}
                        </div>
                      ))}
                      {c.baskets.length > 3 && (
                        <div className="row-note">(+{c.baskets.length - 3} more baskets — see source document)</div>
                      )}
                      {c.conditions.slice(0, 2).map((b, j) => (
                        <div key={`c${j}`} className="row-note">
                          Condition: {b}
                        </div>
                      ))}
                      {c.conditions.length > 2 && (
                        <div className="row-note">(+{c.conditions.length - 2} more conditions — see source document)</div>
                      )}
                      <div className="row-note">Citation: {c.citation}</div>
                      {c.decision?.note ? <div className="row-note">Prior note: {c.decision.note}</div> : null}

                      <form action={decide} className="stack" style={{ gap: 8, marginTop: 10 }}>
                        <input type="hidden" name="sourceId" value={c.sourceId} />
                        <input type="hidden" name="sectionRef" value={c.sectionRef} />
                        <input type="hidden" name="category" value={c.category} />
                        <div className="field">
                          <div className="field-label">Edit / replace interpretation (required for Save edit)</div>
                          <div className="field-control">
                            <textarea name="editedPlainEnglish" rows={3} defaultValue={c.plainEnglish} style={{ width: "100%" }} />
                          </div>
                        </div>
                        <div className="field">
                          <div className="field-label">Reviewer note / legal judgment</div>
                          <div className="field-control">
                            <input
                              type="text"
                              name="note"
                              placeholder="Optional rationale or amendment precedence judgment"
                              style={{ width: "100%" }}
                            />
                          </div>
                        </div>
                        {/* Rule 113: rulebook decisions compile executable
                            Permissions — they need a real reviewer, not the
                            hardcoded "workspace-counsel" label. */}
                        <ReviewerNameField id={`reviewedBy-rulebook-${c.sourceId}-${c.sectionRef}`} />
                        <div className="button-row">
                          <button className="button" type="submit" name="decision" value="ACCEPTED">
                            Accept
                          </button>
                          <button className="button" type="submit" name="decision" value="EDITED">
                            Save edit / replace
                          </button>
                          <button className="button" type="submit" name="decision" value="REJECTED">
                            Reject
                          </button>
                        </div>
                      </form>
                    </div>
                  ))}
                  {safePage < pageCount && (
                    <div className="button-row" style={{ marginTop: 12 }}>
                      <Link className="button button-primary" href={`/${companyId}/rulebook?view=${view}&page=${safePage + 1}`}>
                        Next page →
                      </Link>
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}
      </Card>
    </div>
  );
}
