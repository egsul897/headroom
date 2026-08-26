import { getDocuments, getDefinedTermsByProvision } from "@/lib/coherent";
import { buildSolverContext } from "@/lib/dashboard-service";
import { loadCovenantDataOrEmpty } from "@/lib/covenant-overview-service";
import { SimulateClient } from "./SimulateClient";

export const metadata = { title: "Headroom — Simulate" };

/**
 * The Simulate tab (task "MAKE THE UI MATCH THE PROTOTYPE EXACTLY" -
 * reference/headroom-coherent.jsx's Simulate tab: action-type picker,
 * amount slider, pass/fail verdict, per-document breakdown, allocation
 * waterfall, pro forma ratio table). Generalized off app/simulate/page.tsx
 * (Coherent-only) - same real engine (lib/covenant-engine.ts, unmodified),
 * now explicitly companyId-scoped and passing a real `solverContext` (built
 * the same way the Dashboard tab does, via `buildSolverContext` in
 * lib/dashboard-service.ts) into the debt-incurrence simulation so a
 * solver-native document (Matthews) is actually evaluated rather than
 * silently skipped.
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
  return (
    <SimulateClient
      companyId={companyId}
      data={data}
      documents={documents}
      definedTermsByProvision={definedTermsByProvision}
      solverContext={{ ...solverContext, activationState: { ...solverContext.activationState, unknownKeysArray: [...solverContext.activationState.unknownKeys] } }}
    />
  );
}
