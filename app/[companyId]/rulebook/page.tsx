import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";

export const metadata = { title: "Headroom — Rulebook" };

/**
 * Customer-facing rulebook ladder. Does not auto-promote discovery to executable.
 */
export default async function RulebookPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [rulebook, review, capacity] = await Promise.all([
    loadRulebookReadiness(companyId),
    loadCovenantReviewWorkspace(companyId),
    loadCapacityReadiness(companyId),
  ]);

  const candidates = review.categories.flatMap((c) =>
    c.items.slice(0, 8).map((item) => ({
      category: c.categoryLabel,
      sectionRef: item.sectionRef,
      heading: item.heading,
      posture: item.posture,
      baskets: item.materialBasketsThresholds ?? [],
      conditions: item.conditions ?? [],
      dependencies: item.dependencies ?? [],
      unresolved: item.unresolvedQuestions ?? [],
      citation: item.sourceCitation,
      documentTitle: item.documentTitle,
    })),
  );

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Executable rulebook review</div>
        <div className="card-subtitle">{rulebook.headline}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Stage</div>
          <div className="row-value">
            <Chip tone={rulebook.stage === "EXECUTABLE" ? "pass" : "tight"}>{rulebook.stage}</Chip>
          </div>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          Discovered: {rulebook.discoveredSummaries} · Interpreted: {rulebook.interpretedProvisions} · Reviewed
          permissions: {rulebook.reviewedPermissions} · Executable permissions: {rulebook.executablePermissions} ·
          Provision rows: {rulebook.provisionRows}
        </div>
        <div className="row-note">{rulebook.note}</div>
        {rulebook.blockers.map((b, i) => (
          <div key={i} className="row-note">
            • {b}
          </div>
        ))}
        <div className="button-row" style={{ marginTop: 12 }}>
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
        <div className="card-title">Interpreted candidates (not executable)</div>
        <div className="card-subtitle">
          Review these discovery interpretations before any Permission / CovenantProvision promotion. Incomplete baskets,
          missing conditions, unresolved amendments, or missing entity scope block EXECUTABLE status.
        </div>
        {candidates.length === 0 ? (
          <div className="row-note">No interpreted provisions yet — upload and analyze financing documents first.</div>
        ) : (
          candidates.slice(0, 40).map((c, i) => (
            <div
              key={`${c.sectionRef}-${i}`}
              style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--border, #e5e7eb)" }}
            >
              <div className="row">
                <div className="row-label">
                  §{c.sectionRef} — {c.heading}
                </div>
                <div className="row-value">
                  <Chip tone="idle">INTERPRETED</Chip>{" "}
                  {c.posture && <Chip tone="navy">{c.posture}</Chip>}
                </div>
              </div>
              <div className="row-note">
                {c.category} · {c.documentTitle}
              </div>
              {c.baskets.length > 0 && (
                <div className="row-note">Baskets: {c.baskets.slice(0, 3).join(" · ")}</div>
              )}
              {c.conditions.length > 0 && (
                <div className="row-note">Conditions: {c.conditions.slice(0, 3).join(" · ")}</div>
              )}
              {c.dependencies.length > 0 && (
                <div className="row-note">Dependencies: {c.dependencies.slice(0, 2).join(" · ")}</div>
              )}
              {c.unresolved.length > 0 && (
                <div className="row-note">Unresolved: {c.unresolved.slice(0, 2).join(" · ")}</div>
              )}
              <div className="row-note">Citation: {c.citation}</div>
              <div className="row-note" style={{ marginTop: 4 }}>
                Promotion to REVIEWED/EXECUTABLE requires qualified legal review — not available as an automated action
                in this build.
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
