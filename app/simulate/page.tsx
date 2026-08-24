import { getCovenantData, getDefinedTermsByProvision } from "@/lib/coherent";
import { SimulateClient } from "./SimulateClient";

export const metadata = { title: "Headroom — Simulate" };

export default async function SimulatePage() {
  const [data, definedTermsByProvision] = await Promise.all([getCovenantData(), getDefinedTermsByProvision()]);
  return <SimulateClient data={data} definedTermsByProvision={definedTermsByProvision} />;
}
