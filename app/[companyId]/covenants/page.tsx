import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import {
  listConmedCovenantExplorerRows,
  type CapacityDeterminationStatus,
} from "@/lib/product/conmed-demo/covenant-catalog";

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
  const isConmed = companyId === CONMED_DEMO_COMPANY_ID;

  if (isConmed) {
    const rows = listConmedCovenantExplorerRows();
    const families = [...new Set(rows.map((r) => r.family))];
    return (
      <div className="stack">
        <Card>
          <div className="card-title">Covenant explorer</div>
          <div className="card-subtitle">
            Article VII negative covenants from the authentic Eighth A&R Credit Agreement. Capacity figures are{" "}
            <strong>not</strong> computed — each row states whether determination needs financial inputs or remains unresolved.
          </div>
          <div className="row-note" style={{ marginTop: 8 }}>
            IMPLEMENTED ≠ CERTIFIED. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE. No default zero usage.
          </div>
        </Card>

        {families.map((family) => (
          <Card key={family}>
            <div className="card-title">{family.replace(/_/g, " ")}</div>
            {rows
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
                    {r.requiredDefinedTerms.length > 0 && (
                      <div className="row-note">Defined terms: {r.requiredDefinedTerms.join(", ")}</div>
                    )}
                  </div>
                  <Link className="button" href={`/${companyId}/documents/${r.demoDocumentId}`}>
                    Source
                  </Link>
                </div>
              ))}
          </Card>
        ))}
      </div>
    );
  }

  // Generic companies: show engine-modeled CovenantProvision rows if any.
  const provisions = await prisma.covenantProvision.findMany({
    where: { companyId },
    include: { document: true },
    orderBy: [{ sectionRef: "asc" }, { code: "asc" }],
  });

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Covenant explorer</div>
        <div className="card-subtitle">
          Modeled covenant provisions for this company. Open Position for engine-evaluated capacity.
        </div>
      </Card>
      {provisions.length === 0 ? (
        <Card>
          <div className="card-subtitle">No covenant provisions modeled yet.</div>
          <div className="button-row" style={{ marginTop: 12 }}>
            <Link className="button" href={`/${companyId}/dashboard`}>
              Legacy dashboard
            </Link>
          </div>
        </Card>
      ) : (
        <Card>
          {provisions.map((p) => (
            <div className="row" key={p.id}>
              <div>
                <div className="row-label">
                  {p.basketName} — §{p.sectionRef}
                </div>
                <div className="row-note">
                  {p.document.name} · {p.formulaType} · code {p.code}
                </div>
                {p.notes && <div className="row-note">{p.notes}</div>}
              </div>
              <Link className="button" href={`/${companyId}/documents/${p.documentId}`}>
                Document
              </Link>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
