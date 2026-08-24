import { getCovenantData, getDefinedTermsByProvision, getDocuments } from "@/lib/coherent";
import { SimulateClient } from "./SimulateClient";

export const metadata = { title: "Headroom — Simulate" };

export default async function SimulatePage() {
  const [data, documents, definedTermsByProvision] = await Promise.all([
    getCovenantData(),
    getDocuments(),
    getDefinedTermsByProvision(),
  ]);
  return <SimulateClient data={data} documents={documents} definedTermsByProvision={definedTermsByProvision} />;
}
