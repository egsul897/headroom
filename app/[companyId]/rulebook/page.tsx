import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { listReviewerApprovals } from "@/lib/product/customer-intelligence/reviewer-approvals";
import { reviewProvisionAction } from "./actions";

export const metadata = { title: "Headroom — Rulebook" };
export const dynamic = "force-dynamic";

/**
 * AI-first lawyer review: accept / edit / reject AI interpretations.
 * Does not require external legal verification before analysis is shown.
 */
export default async function RulebookPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [rulebook, review, capacity, approvals] = await Promise.all([
    loadRulebookReadiness(companyId),
    loadCovenantReviewWorkspace(companyId),
    loadCapacityReadiness(companyId),
    listReviewerApprovals(companyId),
  ]);
  const decide = reviewProvisionAction.bind(null, companyId);
  const decisionByKey = new Map(approvals.map((a) => [`${a.sourceId}|${a.sectionRef}`, a]));

  const candidates = review.categories.flatMap((c) =>
    c.items.slice(0, 10).map((item) => ({
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
      citation: item.sourceCitation,
      documentTitle: item.documentTitle,
      decision: decisionByKey.get(`${item.sourceId}|${item.sectionRef}`),
    })),
  );

  return (
    <div className="stack">
      <Card>
        <div className="card-title">AI interpretations — lawyer review</div>
        <div className="card-subtitle">{rulebook.headline}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Stage</div>
          <div className="row-value">
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
          Accept, edit, or reject AI-generated interpretations. Edited plain English becomes the workspace controlling
          text. Numerical capacity still requires compiler Permission rows.
        </div>
        {candidates.length === 0 ? (
          <div className="row-note">No interpreted provisions yet — upload and analyze financing documents first.</div>
        ) : (
          candidates.slice(0, 50).map((c, i) => (
            <div
              key={`${c.sourceId}-${c.sectionRef}-${i}`}
              style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border, #e5e7eb)" }}
            >
              <div className="row">
                <div className="row-label">
                  §{c.sectionRef} — {c.heading}
                </div>
                <div className="row-value">
                  {c.decision ? (
                    <Chip tone={c.decision.decision === "REJECTED" ? "tight" : "pass"}>{c.decision.decision}</Chip>
                  ) : (
                    <Chip tone="idle">AI DRAFT</Chip>
                  )}{" "}
                  {c.posture && <Chip tone="navy">{c.posture}</Chip>}
                </div>
              </div>
              <div className="row-note">
                {c.categoryLabel} · {c.documentTitle}
              </div>
              <div className="row-note" style={{ marginTop: 6 }}>
                {c.plainEnglish}
              </div>
              {c.baskets.slice(0, 3).map((b, j) => (
                <div key={j} className="row-note">
                  Basket: {b}
                </div>
              ))}
              {c.conditions.slice(0, 2).map((b, j) => (
                <div key={`c${j}`} className="row-note">
                  Condition: {b}
                </div>
              ))}
              <div className="row-note">Citation: {c.citation}</div>

              <form action={decide} className="stack" style={{ gap: 8, marginTop: 10 }}>
                <input type="hidden" name="sourceId" value={c.sourceId} />
                <input type="hidden" name="sectionRef" value={c.sectionRef} />
                <input type="hidden" name="category" value={c.category} />
                <div className="field">
                  <div className="field-label">Edit interpretation (optional — use with Edit)</div>
                  <div className="field-control">
                    <textarea name="editedPlainEnglish" rows={3} defaultValue={c.plainEnglish} style={{ width: "100%" }} />
                  </div>
                </div>
                <div className="field">
                  <div className="field-label">Reviewer note</div>
                  <div className="field-control">
                    <input type="text" name="note" placeholder="Optional rationale" style={{ width: "100%" }} />
                  </div>
                </div>
                <div className="button-row">
                  <button className="button" type="submit" name="decision" value="ACCEPTED">
                    Accept
                  </button>
                  <button className="button" type="submit" name="decision" value="EDITED">
                    Save edit
                  </button>
                  <button className="button" type="submit" name="decision" value="REJECTED">
                    Reject
                  </button>
                </div>
              </form>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
