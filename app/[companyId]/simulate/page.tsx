import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { VerifiedSimulatePanel } from "@/components/VerifiedSimulatePanel";
import { getDocuments, getDefinedTermsByProvision } from "@/lib/coherent";
import { buildSolverContext } from "@/lib/dashboard-service";
import { loadCovenantDataOrEmpty } from "@/lib/covenant-overview-service";
import { loadCapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { parseSimulateHandoffSearchParams } from "@/lib/product/unified-position/simulate-handoff";
import {
  attemptVerifiedSimulate,
  summarizeVerifiedSimulate,
} from "@/lib/product/unified-position/certified-simulate-bridge";
import { SimulateClient } from "./SimulateClient";

export const metadata = { title: "Headroom — Simulate" };

/**
 * Simulate — runs the shared covenant engine. A simulation is not a legal approval.
 * Without an executable rulebook and financial snapshot, expect NOT DETERMINABLE —
 * never a fabricated pass. Optional ?action=&amount=&secured=&asOf= seeds from Ask.
 *
 * Verified path: `verifiedPackage` is intentionally `null` on this page until authentic
 * VerifiedExecutionPackage retrieval is wired. Product never invents a package and never
 * substitutes fixture IR. Expect NOT EXECUTABLE with NO_VERIFIED_EXECUTION_PACKAGE;
 * LEGACY_ENGINE SimulateClient below remains a separate labeled analysis.
 */
export default async function SimulatePage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { companyId } = await params;
  const sp = searchParams ? await searchParams : {};
  const handoff = parseSimulateHandoffSearchParams(sp);
  const asOfDate = handoff.evaluationDate ? new Date(`${handoff.evaluationDate}T12:00:00.000Z`) : new Date();
  const evaluationDate =
    handoff.evaluationDate ?? asOfDate.toISOString().slice(0, 10);
  const amountMillions = handoff.amountMillions ?? 0;
  const kind =
    handoff.action === "rp"
      ? "RESTRICTED_PAYMENT"
      : handoff.action === "investment"
        ? "INVESTMENT"
        : handoff.secured === false
          ? "UNSECURED_DEBT"
          : "SECURED_DEBT";

  const [readiness, data, documents, definedTermsByProvision, solverContext, verified] = await Promise.all([
    loadCapacityReadiness(companyId),
    loadCovenantDataOrEmpty(companyId, asOfDate),
    getDocuments(companyId),
    getDefinedTermsByProvision(companyId),
    buildSolverContext(companyId, asOfDate),
    // Authentic VEP retrieval is not connected here — pass null; do not invent/fixture-substitute.
    attemptVerifiedSimulate({
      companyId,
      evaluationDate,
      amountMillions,
      kind,
      secured: handoff.secured,
      verifiedPackage: null,
    }),
  ]);
  const verifiedSummary = summarizeVerifiedSimulate(verified);

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

      <VerifiedSimulatePanel summary={verifiedSummary} evaluationDate={evaluationDate} />

      <SimulateClient
        companyId={companyId}
        data={data}
        documents={documents}
        definedTermsByProvision={definedTermsByProvision}
        initialHandoff={handoff}
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
