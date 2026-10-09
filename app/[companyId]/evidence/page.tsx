import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import { listConmedPackageFacts } from "@/lib/product/conmed-demo/covenant-catalog";

export const metadata = { title: "Headroom — Evidence" };

/**
 * Evidence / review queue — source citations and unresolved questions.
 */
export default async function EvidencePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const candidates = await prisma.extractionCandidate.findMany({
    where: {
      companyId,
      reviewStatus: { in: ["PENDING", "REVIEW_REQUIRED"] },
    },
    take: 50,
    orderBy: { createdAt: "desc" },
    include: { sourceDocument: true },
  });

  const isConmed = companyId === CONMED_DEMO_COMPANY_ID;
  const facts = isConmed ? listConmedPackageFacts() : [];

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Evidence & review</div>
        <div className="card-subtitle">
          Navigable path back to supporting sources. Distinguishes source-backed facts from unresolved items.
          A simulation or discovery label is not a legal approval.
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/onboarding/review`}>
            Extraction review queue
          </Link>
          <Link className="button" href={`/${companyId}/documents`}>
            Documents
          </Link>
        </div>
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
              <Chip tone="tight">NEEDS FINANCIAL INPUTS</Chip> No approved snapshot / utilization ledger
            </div>
          </div>
          <div className="row" style={{ borderBottom: "none" }}>
            <div className="row-label">Schedule-dependent baskets</div>
            <div className="row-value">
              <Chip tone="tight">UNRESOLVED</Chip> e.g. Schedule 7.2(e) not fully modeled
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
