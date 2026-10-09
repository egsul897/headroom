import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { getDocuments, getDefinedTermsByProvision } from "@/lib/coherent";
import { buildSolverContext } from "@/lib/dashboard-service";
import { loadCovenantDataOrEmpty } from "@/lib/covenant-overview-service";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { SimulateClient } from "./SimulateClient";

export const metadata = { title: "Headroom — Simulate" };

/**
 * Simulate — runs the shared covenant engine. A simulation is not a legal approval.
 * Without an executable rulebook and financial snapshot, expect NOT DETERMINABLE —
 * never a fabricated pass.
 */
export default async function SimulatePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const asOfDate = new Date();
  const [readiness, data, documents, definedTermsByProvision, solverContext] = await Promise.all([
    loadCapacityReadiness(companyId),
    loadCovenantDataOrEmpty(companyId, asOfDate),
    getDocuments(companyId),
    getDefinedTermsByProvision(companyId),
    buildSolverContext(companyId, asOfDate),
  ]);

  return (
    <div className="stack">
      <Card>
        <div className="card-title">Simulation readiness</div>
        <div className="card-subtitle">{readiness.headline}</div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="row-label">Status</div>
          <div className="row-value">
            <Chip tone={readiness.canEvaluateExecutableCapacity ? "pass" : "tight"}>{readiness.status}</Chip>
          </div>
        </div>
        {!readiness.canEvaluateExecutableCapacity && (
          <>
            {readiness.blockers.map((b, i) => (
              <div key={i} className="row-note">
                • {b}
              </div>
            ))}
            <div className="row-note" style={{ marginTop: 8 }}>
              The form below still runs the <strong>real</strong> shared simulation engine. Without capacity formulas and
              an approved financial snapshot, expect <Chip tone="tight">NOT DETERMINABLE</Chip> / unmet input results —
              not a fabricated pass. Simulations never modify the live transaction ledger.
            </div>
          </>
        )}
        <div className="button-row" style={{ marginTop: 12 }}>
          <Link className="button" href={`/${companyId}/covenants`}>
            Covenant review
          </Link>
          <Link className="button" href={`/${companyId}/capacity`}>
            Capacity status
          </Link>
          <Link className="button" href={`/${companyId}/ask`}>
            Ask Headroom
          </Link>
        </div>
      </Card>

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
