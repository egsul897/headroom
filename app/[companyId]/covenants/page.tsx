import Link from "next/link";
import { ActionMenu } from "@/components/ActionMenu";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, Chip } from "@/components/ui";
import { CertificateSheet } from "@/components/ux/CertificateSheet";
import { CovenantCalendar } from "@/components/ux/CovenantCalendar";
import { ThresholdAlerts } from "@/components/ux/ThresholdAlerts";
import { prisma } from "@/lib/prisma";
import { unevaluatedLine, type BandReading, type CalendarItem, type CertificateLine } from "@/lib/ux/present";
import { loadCovenantReviewWorkspace } from "@/lib/product/customer-intelligence/covenant-review";
import { listCustomerDocumentIntelligence } from "@/lib/product/customer-intelligence/load";
import { loadRulebookReadiness } from "@/lib/product/customer-intelligence/rulebook-readiness";

export const metadata = { title: "Headroom — Covenants" };

export default async function CovenantsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const [review, rulebook, intelligence] = await Promise.all([
    loadCovenantReviewWorkspace(companyId),
    loadRulebookReadiness(companyId),
    listCustomerDocumentIntelligence(companyId).catch(() => []),
  ]);
  // Rule 122: rule 118's mismatch on the covenants page — these
  // engine-modeled provisions are the executable path, so a
  // provision from a type-mismatched document must say so.
  const mismatchByDocumentId = new Map(
    (intelligence as { documentId: string; declaredType: string | null; documentClass: string }[])
      .filter((i) => i.declaredType && i.documentClass && i.documentClass !== i.declaredType)
      .map((i) => [i.documentId, `declared ${i.declaredType}, analyzed as ${i.documentClass}`] as const),
  );
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
            {review.operativeResolution.bindings.slice(0, 20).map((b, i) => {
              // Rule 104: bindings name a raw sourceId (opaque) — resolve to the document title so a reader can tell
              // WHICH document governs each section.
              const operativeDoc = review.documents.find((d) => d.sourceId === b.operativeSourceId);
              return (
                <div key={`${b.sectionRef}-${i}`} className="row-note" style={{ marginTop: 6 }}>
                  §{b.sectionRef} → {operativeDoc ? operativeDoc.filename : b.operativeSourceId} ({b.changeKind}) — {b.rationale}
                </div>
              );
            })}
            {/* Rule 89: truncation disclosed — never silently drop bindings. */}
            {review.operativeResolution.bindings.length > 20 && (
              <div className="row-note" style={{ marginTop: 6 }}>
                Showing first 20 of {review.operativeResolution.bindings.length} bindings.
              </div>
            )}
          </Card>
        )}

      {review.amendmentCompare.rows.length > 0 && (
        <Card>
          <div className="card-title">Redline</div>
          <div className="card-subtitle">Base document beside the amendment. Discovery only — not counsel approval.</div>
          <div className="row-note">{review.amendmentCompare.note}</div>
          {/* Rule 89: both truncations disclosed — the page shows 16 of the compare's 40-row cap, which itself may
              have dropped rows (totalRowsBeforeCap). */}
          {(review.amendmentCompare.rows.length > 16 || review.amendmentCompare.truncated) && (
            <div className="row-note" style={{ marginTop: 6 }}>
              Showing first 16 of {review.amendmentCompare.rows.length} compare rows
              {review.amendmentCompare.truncated
                ? ` (compare capped at 40 of ${review.amendmentCompare.totalRowsBeforeCap} total)`
                : ""}
              .
            </div>
          )}
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
          {review.dependencyGraph.edgeCount > 12 && (
            <div className="row-note">Showing first 12 of {review.dependencyGraph.edgeCount} relationship hints.</div>
          )}
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
          {block.items.length > 24 && (
            <div className="row-note">Showing first 24 of {block.items.length} provisions.</div>
          )}
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
                  {item.permissions!.length > 3 ? ` (+${item.permissions!.length - 3} more)` : ""}
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
                <div className="row-note">
                  Dependencies: {item.dependencies.slice(0, 3).join(" · ")}
                  {item.dependencies.length > 3 ? ` (+${item.dependencies.length - 3} more)` : ""}
                </div>
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
                  {mismatchByDocumentId.get(p.documentId) && (
                    <> · <span style={{ color: "var(--color-warning, #92400e)" }}>TYPE MISMATCH — {mismatchByDocumentId.get(p.documentId)}</span></>
                  )}
                </div>
              </div>
              <Link className="button" href={`/${companyId}/documents/${p.documentId}`}>
                Document
              </Link>
            </div>
          ))}
        </Card>
      )}

      {review.analyzedOkCount === 0 && provisions.length === 0 && (
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
