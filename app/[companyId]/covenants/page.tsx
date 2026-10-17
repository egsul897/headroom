import Link from "next/link";
import { ActionMenu } from "@/components/ActionMenu";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, Chip } from "@/components/ui";
import { CertificateSheet } from "@/components/ux/CertificateSheet";
import { CovenantCalendar } from "@/components/ux/CovenantCalendar";
import { ThresholdAlerts } from "@/components/ux/ThresholdAlerts";
import { prisma } from "@/lib/prisma";
import { unevaluatedLine, type BandReading, type CalendarItem, type CertificateLine } from "@/lib/ux/present";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import { listConmedCovenantExplorerRows } from "@/lib/product/conmed-demo/covenant-catalog";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";

export const metadata = { title: "Headroom — Covenants" };

export default async function CovenantsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [review, rulebook] = await Promise.all([
    loadCovenantReviewWorkspace(companyId),
    loadRulebookReadiness(companyId),
  ]);
  const isConmed = companyId === CONMED_DEMO_COMPANY_ID;
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  const provisions = await prisma.covenantProvision.findMany({
    where: { companyId },
    include: { document: true },
    orderBy: [{ sectionRef: "asc" }, { code: "asc" }],
  });

  const analyzedLines: CertificateLine[] = review.categories.flatMap((block) =>
    block.items.slice(0, 24).map((item) => unevaluatedLine(item.heading?.trim() || `§${item.sectionRef}`, item.sourceCitation ?? null)),
  );
  const certificateLines: CertificateLine[] =
    analyzedLines.length > 0
      ? analyzedLines
      : provisions.map((provision) => unevaluatedLine(`${provision.basketName} §${provision.sectionRef}`, provision.document.name));
  const names = certificateLines.map((line) => line.name);
  const calendarItems: CalendarItem[] =
    names.length === 0
      ? []
      : [
          ...names.slice(0, 8).map((name, index) => ({ id: `test-${index}`, kind: "test" as const, label: name, date: null })),
          { id: "reporting", kind: "reporting", label: "Reporting deadline", date: null },
          { id: "cure", kind: "cure", label: "Cure period", date: null },
        ];
  const bandReadings: BandReading[] = names.slice(0, 8).map((name) => ({
    name,
    actual: null,
    actualLabel: null,
    thresholds: null,
    previousBand: null,
    trendingToward: null,
  }));

  return (
    <div className="page-frame">
      <header className="page-head">
        <div>
          <p className="page-kicker">Covenants</p>
          <h1 className="page-question">What do the documents restrict?</h1>
          <p className="page-answer">{review.executive.headline}</p>
        </div>
      </header>
      <CertificateSheet model={{ company: company?.name?.trim() || companyId, period: null, lines: certificateLines }} />
      <CovenantCalendar items={calendarItems} today={new Date().toISOString().slice(0, 10)} />
      <ThresholdAlerts readings={bandReadings} />
      <Card>
        <div className="page-toolbar">
          <Link className="button button-primary" href={`/${companyId}/onboarding/documents`}>
            Upload documents
          </Link>
          <ActionMenu
            label="More actions"
            items={[
              { href: `/${companyId}/ask`, label: "Ask Headroom" },
              { href: `/${companyId}/documents`, label: "Documents" },
              { href: `/${companyId}/covenants/export`, label: "Export Markdown" },
              { href: `/${companyId}/covenants/export/html`, label: "Export HTML" },
              { href: `/${companyId}/covenants/export/docx`, label: "Export DOCX" },
              { href: `/${companyId}/covenants/export/pdf`, label: "Export PDF" },
              { href: `/${companyId}/rulebook`, label: "Lawyer review" },
              { href: `/${companyId}/intelligence`, label: "Debt intelligence" },
              { href: "/research/compare", label: "Compare precedents" },
            ]}
          />
        </div>
        <div className="row-note" style={{ marginTop: 8 }}>
          AI-first interpretations for counsel review. DISCOVERED ≠ counsel-approved. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE
          capacity. Summaries, Rulebook, and Ask share the same persisted analyses.
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Rulebook stage</div>
          <div className="row-value">
            <StatusBadge status={rulebook.stage} />
          </div>
        </div>
        <div className="row-note">{rulebook.headline}</div>
      </Card>

      {review.analyzedOkCount > 0 && (
        <Card>
          <div className="card-title">What the documents restrict</div>
          <div className="card-subtitle">Material restrictions and permissions from analyzed package text. Not a capacity figure.</div>
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

      {review.amendmentPackage && (
        <Card>
          <div className="card-title">Operative amendment status</div>
          <div className="row">
            <div className="row-label">Resolution</div>
            <div className="row-value">
              <StatusBadge status={review.amendmentPackage.operativeResolution} />
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

      {review.operativeResolution &&
        (review.operativeResolution.status === "RESOLVED" ||
          review.operativeResolution.status === "RESOLVED_PARTIAL") && (
          <Card>
            <div className="card-title">Operative amendment bindings</div>
            <div className="card-subtitle">{review.operativeResolution.note}</div>
            <div className="row">
              <div className="row-label">Status</div>
              <div className="row-value">
                <StatusBadge status={review.operativeResolution.status} />
              </div>
            </div>
            {review.operativeResolution.effectiveDate && (
              <div className="row">
                <div className="row-label">Effective / filing</div>
                <div className="row-value">{review.operativeResolution.effectiveDate}</div>
              </div>
            )}
            {review.operativeResolution.bindings.slice(0, 20).map((b, i) => (
              <div key={`${b.sectionRef}-${i}`} className="row-note" style={{ marginTop: 6 }}>
                §{b.sectionRef} → {b.operativeSourceId} ({b.changeKind}) — {b.rationale}
              </div>
            ))}
          </Card>
        )}

      {review.amendmentCompare.rows.length > 0 && (
        <Card>
          <div className="card-title">Redline</div>
          <div className="card-subtitle">Base document beside the amendment. Discovery only — not counsel approval.</div>
          <div className="row-note">{review.amendmentCompare.note}</div>
          {review.amendmentCompare.rows.slice(0, 16).map((row, i) => (
            <article className="clause" key={`${row.sectionRef}-${i}`}>
              <div className="clause-head">
                <div className="clause-sec">§{row.sectionRef}</div>
                <Chip tone="navy">{row.changeKind}</Chip>
              </div>
              <div className="row-note">{row.note}</div>
              <div className="redline">
                <div className="redline-col redline-base">
                  <span className="redline-label">Base document</span>
                  <div>{row.baseExcerpt ? `“${row.baseExcerpt}”` : "No base excerpt loaded."}</div>
                </div>
                <div className="redline-col redline-amend">
                  <span className="redline-label">Amendment</span>
                  <div>{row.amendmentExcerpt ? `“${row.amendmentExcerpt}”` : "No amendment excerpt loaded."}</div>
                </div>
              </div>
            </article>
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

      {review.categories.map((block) => (
        <Card key={block.category}>
          <div className="card-title">{block.categoryLabel}</div>
          <div className="card-subtitle">{block.items.length} analyzed provision(s)</div>
          {block.items.slice(0, 24).map((item, idx) => (
            <article className="clause" key={`${item.sourceId}-${item.sectionRef}-${idx}`}>
              <div className="clause-head">
                <div>
                  <div className="clause-sec">§{item.sectionRef}</div>
                  <div className="card-subtitle" style={{ marginBottom: 0 }}>
                    {item.heading}
                  </div>
                </div>
                <div className="clause-badges">
                  {item.posture ? <StatusBadge status={item.posture} /> : null}
                  <StatusBadge status={item.epistemicStatus} />
                </div>
              </div>
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
              <div className="clause-cite">
                <span>Citation</span>
                <span>{item.sourceCitation}</span>
                {item.documentId ? (
                  <Link href={`/${companyId}/documents/${item.documentId}`}>Open {item.documentTitle}</Link>
                ) : null}
              </div>
            </article>
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
                        <StatusBadge status={r.capacityStatus} />{" "}
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
            No clauses are loaded. Citations and any amendment redline appear here after a credit agreement or amendment is uploaded.
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
