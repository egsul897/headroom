import { Card, LegalReviewBadge } from "@/components/ui";
import { getDocumentDetails } from "@/lib/dashboard-service";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Headroom — Documents" };

/**
 * Documents/Sources page (product IA §Documents). Governing documents,
 * effective dates, and a provenance/review-state summary per document -
 * driven entirely by `getDocumentDetails` (lib/dashboard-service.ts), no
 * per-company document name/id branching.
 */
export default async function DocumentsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const documents = await getDocumentDetails(companyId);

  return (
    <div className="stack">
      {documents.length === 0 && (
        <Card>
          <div className="card-subtitle">No governing documents on record for this company.</div>
        </Card>
      )}
      {documents.map((d) => (
        <Card key={d.id}>
          <div className="card-title">{d.name}</div>
          <div className="card-subtitle">
            {d.type}
            {d.governs ? ` — governs ${d.governs}` : ""}
          </div>
          <div className="row">
            <div className="row-label">Effective from</div>
            <div className="row-value">{d.effectiveFrom ? fmtDate(d.effectiveFrom) : "Since inception"}</div>
          </div>
          <div className="row">
            <div className="row-label">Effective to</div>
            <div className="row-value">{d.effectiveTo ? fmtDate(d.effectiveTo) : "Current"}</div>
          </div>
          <div className="row">
            <div className="row-label">Legacy provisions modeled</div>
            <div className="row-value">{d.provisionCount}</div>
          </div>
          <div className="row" style={{ borderBottom: "none" }}>
            <div className="row-label">Solver-native permissions modeled</div>
            <div className="row-value">
              {d.permissionCount === 0 ? "None (legacy path only)" : `${d.permissionsVerified} / ${d.permissionCount} legally reviewed`}
            </div>
          </div>
          {d.permissionCount > 0 && d.permissionsVerified > 0 && (
            <div style={{ marginTop: 10 }}>
              <LegalReviewBadge status="VERIFIED" context={`${d.permissionsVerified} permission(s) under ${d.name}`} />
            </div>
          )}
        </Card>
      ))}
      <Card>
        <div className="card-title">Legacy document views</div>
        <div className="row-note">
          The pre-existing /docs and /feeds pages (Coherent only) retain the defined-term-level browsing and source-feed queue views this page does not yet reproduce for every company.
        </div>
      </Card>
    </div>
  );
}
