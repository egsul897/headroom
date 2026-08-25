import { getScenarioInputs } from "@/lib/dashboard-service";
import { SimulateClient } from "./SimulateClient";

export const metadata = { title: "Headroom — Simulate" };

/**
 * Simulate page (product IA §Simulate). Loads read-only `ScenarioInputs`
 * server-side once, then hands them to the client component - every
 * subsequent "run scenario" click calls the PURE `runScenarioWithInputs`
 * (lib/scenario-runner.ts) directly in the browser against this already-
 * loaded data, issuing no further server/DB round-trip (task hard
 * requirement §6 - non-mutating by construction, not merely by convention).
 */
export default async function SimulatePage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const inputs = await getScenarioInputs(companyId);
  return <SimulateClient inputs={inputs} />;
}
