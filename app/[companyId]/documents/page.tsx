import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { getDocumentDetails } from "@/lib/dashboard-service";
import { fmtDate } from "@/lib/format";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import { listConmedPackageFacts } from "@/lib/product/conmed-demo/covenant-catalog";

export const metadata = { title: "Headroom — Documents" };

/**
 * Documents workspace — governing financing package with source navigation.
 */
export default async function DocumentsPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const documents = await getDocumentDetails(companyId);
  const isConmed = companyId === CONMED_DEMO_COMPANY_ID;
  const facts = isConmed ? listConmedPackageFacts() : [];

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Financing documents</div>
        <div className="card-subtitle">
          Governing agreements and amendments for this workspace. Open a document to inspect source text and package relationships.
        </div>
      </Card>

      {documents.length === 0 && (
        <Card>
          <div className="card-subtitle">No governing documents on record for this company.</div>
          {isConmed && (
            <div className="row-note" style={{ marginTop: 8 }}>
              Run <code>npm run product:setup-conmed-demo</code> (dry-run) then authorize live setup to persist the authentic CONMED package.
            </div>
          )}
        </Card>
      )}

      {documents.map((d) => (
        <Card key={d.id}>
          <div className="card-title">{d.name}</div>
          <div className="card-subtitle">
            {d.type}
            {d.governs ? ` — ${d.governs}` : ""}
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
            <div className="row-label">Modeled provisions</div>
            <div className="row-value">{d.provisionCount}</div>
          </div>
          <div className="button-row" style={{ marginTop: 12 }}>
            <Link className="button button-primary" href={`/${companyId}/documents/${d.id}`}>
              Open source
            </Link>
            <Link className="button" href={`/${companyId}/covenants`}>
              View covenants
            </Link>
          </div>
        </Card>
      ))}

      {facts.length > 0 && (
        <Card>
          <div className="card-title">Package relationships</div>
          <div className="card-subtitle">Source-backed package facts — not capacity determinations.</div>
          {facts.map((f) => (
            <div className="row" key={f.id}>
              <div>
                <div className="row-label">{f.id}</div>
                <div className="row-note">{f.fact}</div>
                <div className="row-note">
                  Citation: {f.evidenceCitation}{" "}
                  <Chip tone="navy">{f.clarity}</Chip>
                </div>
              </div>
              <Link className="button" href={`/${companyId}/documents/${f.demoDocumentId}`}>
                Source
              </Link>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
