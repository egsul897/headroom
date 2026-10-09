import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import {
  listConmedCovenantExplorerRows,
  type CapacityDeterminationStatus,
} from "@/lib/product/conmed-demo/covenant-catalog";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";

export const metadata = { title: "Headroom — Covenants" };

function statusTone(status: CapacityDeterminationStatus): "navy" | "tight" | "idle" {
  switch (status) {
    case "PROHIBITION_STRUCTURE":
    case "STRUCTURE_ONLY":
      return "navy";
    case "NEEDS_FINANCIAL_INPUTS":
    case "RATIO_GATED_UNRESOLVED":
    case "SCHEDULE_DEPENDENT_UNRESOLVED":
    case "OUT_OF_PACKAGE_UNRESOLVED":
      return "tight";
    default:
      return "idle";
  }
}

export default async function CovenantsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [review, rulebook] = await Promise.all([
    loadCovenantReviewWorkspace(companyId),
    loadRulebookReadiness(companyId),
  ]);
  const isConmed = companyId === CONMED_DEMO_COMPANY_ID;
  const provisions = await prisma.covenantProvision.findMany({
    where: { companyId },
    include: { document: true },
    orderBy: [{ sectionRef: "asc" }, { code: "asc" }],
  });

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Covenant review</div>
        <div className="card-subtitle">{review.executive.headline}</div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button button-primary" href={`/${companyId}/onboarding/documents`}>
            Upload documents
          </Link>
          <Link className="button" href={`/${companyId}/ask`}>
            Ask Headroom
          </Link>
          <Link className="button" href={`/${companyId}/documents`}>
            Documents
          </Link>
          <Link className="button" href={`/${companyId}/covenants/export`}>
            Export Markdown
          </Link>
          <Link className="button" href={`/${companyId}/covenants/export/html`}>
            Export HTML
          </Link>
          <Link className="button" href={`/${companyId}/covenants/export/docx`}>
            Export DOCX
          </Link>
          <Link className="button" href={`/${companyId}/covenants/export/pdf`}>
            Export PDF
          </Link>
          <Link className="button" href={`/${companyId}/rulebook`}>
            Lawyer review
          </Link>
          <Link className="button" href={`/${companyId}/intelligence`}>
            Debt intelligence
          </Link>
          <Link className="button" href="/research/compare">
            Compare precedents
          </Link>
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          DISCOVERED ≠ VERIFIED. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE. Summaries and Ask share the same persisted analyses.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Rulebook stage</div>
          <div className="row-value">
            <Chip tone={rulebook.stage === "EXECUTABLE" ? "pass" : "tight"}>{rulebook.stage}</Chip>
          </div>
        </div>
        <div className="row-note">{rulebook.headline}</div>
      </Card>

      {review.amendmentPackage && (
        <Card>
          <div className="card-title">Operative amendment status</div>
          <div className="row">
            <div className="row-label">Resolution</div>
            <div className="row-value">
              <Chip
                tone={
                  review.amendmentPackage.operativeResolution === "UNRESOLVED_PRECEDENCE"
                    ? "tight"
                    : review.amendmentPackage.operativeResolution === "RESOLVED"
                      ? "pass"
                      : "idle"
                }
              >
                {review.amendmentPackage.operativeResolution}
              </Chip>
            </div>
          </div>
          {review.amendmentPackage.unresolvedReasons.map((r, i) => (
            <div key={i} className="row-note">
              {r}
            </div>
          ))}
          <div className="row-note" style={{ marginTop: 8 }}>
            {review.amendmentPackage.askGuidance}
          </div>
        </Card>
      )}

      {review.amendmentCompare.rows.length > 0 && (
        <Card>
          <div className="card-title">Amendment before / after (discovery)</div>
          <div className="card-subtitle">{review.amendmentCompare.note}</div>
          {review.amendmentCompare.rows.slice(0, 16).map((row, i) => (
            <div
              key={`${row.sectionRef}-${i}`}
              style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid var(--border, #e5e7eb)" }}
            >
              <div className="row">
                <div className="row-label">§{row.sectionRef}</div>
                <div className="row-value">
                  <Chip tone="navy">{row.changeKind}</Chip>
                </div>
              </div>
              <div className="row-note">{row.note}</div>
              {row.baseExcerpt && <div className="row-note">Base: “{row.baseExcerpt}”</div>}
              {row.amendmentExcerpt && (
                <div className="row-note">Amendment: “{row.amendmentExcerpt}”</div>
              )}
            </div>
          ))}
        </Card>
      )}

      {review.dependencyGraph.edgeCount > 0 && (
        <Card>
          <div className="card-title">Cross-covenant dependencies</div>
          <div className="card-subtitle">
            {review.dependencyGraph.edgeCount} source-backed relationship hint(s). Permission under one covenant is not
            permission under every related covenant.
          </div>
          {review.dependencyGraph.edges.slice(0, 12).map((e, i) => (
            <div key={i} className="row-note" style={{ marginTop: 8 }}>
              <Chip tone="navy">{e.kind}</Chip> §{e.fromSectionRef} → §{e.toSectionRef}: {e.rationale}
            </div>
          ))}
          {review.dependencyGraph.cycles.length > 0 && (
            <div className="row-note" style={{ marginTop: 8 }}>
              Possible circular refs: {review.dependencyGraph.cycles.join("; ")}
            </div>
          )}
          <div className="row-note" style={{ marginTop: 8 }}>
            {review.dependencyGraph.note}
          </div>
        </Card>
      )}

      {review.analyzedOkCount > 0 && (
        <Card>
          <div className="card-title">Executive summary</div>
          <div className="card-subtitle">Material restrictions and permissions from analyzed package text.</div>
          <div className="row-label" style={{ marginTop: 8 }}>
            Material restrictions
          </div>
          {review.executive.materialRestrictions.length === 0 ? (
            <div className="row-note">None clearly segmented yet.</div>
          ) : (
            review.executive.materialRestrictions.map((r, i) => (
              <div key={i} className="row-note">
                • {r}
              </div>
            ))
          )}
          <div className="row-label" style={{ marginTop: 12 }}>
            Material permissions / baskets (not capacity)
          </div>
          {review.executive.materialPermissions.length === 0 ? (
            <div className="row-note">None clearly segmented yet.</div>
          ) : (
            review.executive.materialPermissions.map((p, i) => (
              <div key={i} className="row-note">
                • {p}
              </div>
            ))
          )}
          <div className="row-label" style={{ marginTop: 12 }}>
            Unresolved
          </div>
          {review.executive.unresolved.map((u, i) => (
            <div key={i} className="row-note">
              • {u}
            </div>
          ))}
        </Card>
      )}

      {review.categories.map((block) => (
        <Card key={block.category}>
          <div className="card-title">{block.categoryLabel}</div>
          <div className="card-subtitle">{block.items.length} analyzed provision(s)</div>
          {block.items.slice(0, 24).map((item, idx) => (
            <div
              key={`${item.sourceId}-${item.sectionRef}-${idx}`}
              style={{ marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--border, #e5e7eb)" }}
            >
              <div className="row">
                <div className="row-label">§{item.sectionRef}</div>
                <div className="row-value">
                  {item.posture && <Chip tone="navy">{item.posture}</Chip>}{" "}
                  <Chip tone="idle">{item.epistemicStatus}</Chip>
                </div>
              </div>
              <div className="card-subtitle">{item.heading}</div>
              <p className="row-note" style={{ whiteSpace: "pre-wrap" }}>
                {item.plainEnglish}
              </p>
              {item.restriction && <div className="row-note">Restriction: {item.restriction}</div>}
              {(item.permissions?.length ?? 0) > 0 && (
                <div className="row-note">
                  Permissions: {item.permissions!.slice(0, 3).join(" · ")}
                </div>
              )}
              {(item.materialBasketsThresholds?.length ?? 0) > 0 && (
                <div className="row-note">
                  Baskets: {item.materialBasketsThresholds.join(" · ")}
                </div>
              )}
              {(item.coveredEntities?.length ?? 0) > 0 && (
                <div className="row-note">Entities: {item.coveredEntities!.join(", ")}</div>
              )}
              {(item.dependencies?.length ?? 0) > 0 && (
                <div className="row-note">Dependencies: {item.dependencies.slice(0, 3).join(" · ")}</div>
              )}
              <div className="button-row" style={{ marginTop: 8 }}>
                {item.documentId && (
                  <Link className="button" href={`/${companyId}/documents/${item.documentId}`}>
                    Source · {item.documentTitle}
                  </Link>
                )}
                <span className="row-note">Citation: {item.sourceCitation}</span>
              </div>
            </div>
          ))}
        </Card>
      ))}

      {isConmed && (
        <>
          <Card>
            <div className="card-title">CONMED ground-truth explorer</div>
            <div className="card-subtitle">
              Human-authored Article VII catalog (capacity still STRUCTURE_ONLY / NEEDS_FINANCIAL_INPUTS).
            </div>
          </Card>
          {[...new Set(listConmedCovenantExplorerRows().map((r) => r.family))].map((family) => (
            <Card key={family}>
              <div className="card-title">{family.replace(/_/g, " ")}</div>
              {listConmedCovenantExplorerRows()
                .filter((r) => r.family === family)
                .map((r) => (
                  <div className="row" key={r.id} style={{ alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div className="row-label">
                        §{r.sectionRef} {r.isBasketLevel ? "(basket)" : ""}
                      </div>
                      <div className="row-note">{r.summary}</div>
                      {r.realFigures.length > 0 && (
                        <div className="row-note">Figures: {r.realFigures.join("; ")}</div>
                      )}
                      <div className="row-note" style={{ marginTop: 4 }}>
                        <Chip tone={statusTone(r.capacityStatus)}>{r.capacityStatus}</Chip>{" "}
                        {r.capacityExplanation}
                      </div>
                    </div>
                    <Link className="button" href={`/${companyId}/documents/${r.demoDocumentId}`}>
                      Source
                    </Link>
                  </div>
                ))}
            </Card>
          ))}
        </>
      )}

      {provisions.length > 0 && (
        <Card>
          <div className="card-title">Engine-modeled provisions</div>
          <div className="card-subtitle">Legacy CovenantProvision rows (executable path when present).</div>
          {provisions.map((p) => (
            <div className="row" key={p.id}>
              <div>
                <div className="row-label">
                  {p.basketName} — §{p.sectionRef}
                </div>
                <div className="row-note">
                  {p.document.name} · {p.formulaType} · code {p.code}
                </div>
              </div>
              <Link className="button" href={`/${companyId}/documents/${p.documentId}`}>
                Document
              </Link>
            </div>
          ))}
        </Card>
      )}

      {review.analyzedOkCount === 0 && provisions.length === 0 && !isConmed && (
        <Card>
          <div className="card-subtitle">
            Upload a credit agreement, indenture, or amendment to generate substantive covenant summaries.
          </div>
          <div className="button-row" style={{ marginTop: 12 }}>
            <Link className="button button-primary" href={`/${companyId}/onboarding/documents`}>
              Upload financing documents
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
