import { getCovenantData } from "@/lib/coherent";
import { SimulateClient } from "./SimulateClient";

export const metadata = { title: "Headroom — Simulate" };

export default async function SimulatePage() {
  const data = await getCovenantData();
  return <SimulateClient data={data} />;
}
