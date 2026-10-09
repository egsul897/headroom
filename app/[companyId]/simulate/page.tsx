import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { getDocuments, getDefinedTermsByProvision } from "@/lib/coherent";
import { buildSolverContext } from "@/lib/dashboard-service";
import { loadCovenantDataOrEmpty } from "@/lib/covenant-overview-service";
import { CONMED_DEMO_COMPANY_ID } from "@/lib/product/conmed-demo/package";
import { SimulateClient } from "./SimulateClient";

export const metadata = { title: "Headroom — Simulate" };

/**
 * Simulate — runs the shared covenant engine. A simulation is not a legal approval.
 * CONMED demo has no capacity IR/financials; the engine will return not-determinable
 * rather than inventing clearance.
 */
export default async function SimulatePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const asOfDate = new Date();
  const [data, documents, definedTermsByProvision, solverContext] = await Promise.all([
    loadCovenantDataOrEmpty(companyId, asOfDate),
    getDocuments(companyId),
    getDefinedTermsByProvision(companyId),
    buildSolverContext(companyId, asOfDate),
  ]);

  const conmedBanner =
    companyId === CONMED_DEMO_COMPANY_ID ? (
      <Card>
        <div className="card-title">Simulation limits for CONMED demo</div>
        <div className="card-subtitle">
          The form below runs the <strong>real</strong> shared simulation engine. Without capacity formulas and an approved financial snapshot, expect{" "}
          <Chip tone="tight">NOT DETERMINABLE</Chip> / unmet input results — not a fabricated pass.
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/covenants`}>
            Review covenant structure
          </Link>
          <Link className="button" href={`/${companyId}/evidence`}>
            Evidence / unresolved
          </Link>
        </div>
      </Card>
    ) : null;

  return (
    <div className="stack">
      {conmedBanner}
      <SimulateClient
        companyId={companyId}
        data={data}
        documents={documents}
        definedTermsByProvision={definedTermsByProvision}
        solverContext={{
          ...solverContext,
          activationState: {
            ...solverContext.activationState,
            unknownKeysArray: [...solverContext.activationState.unknownKeys],
          },
        }}
      />
    </div>
  );
}
