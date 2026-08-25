import { getCovenantData, getDefinedTermsByProvision, getDocuments } from "@/lib/coherent";
import { SimulateClient } from "./SimulateClient";

export const metadata = { title: "Headroom — Simulate" };
// Vercel deployment fix: see app/page.tsx's identical comment - this page
// queries Prisma directly with no dynamic route segment above it.
export const dynamic = "force-dynamic";

export default async function SimulatePage() {
  const [data, documents, definedTermsByProvision] = await Promise.all([
    getCovenantData(),
    getDocuments(),
    getDefinedTermsByProvision(),
  ]);
  return <SimulateClient data={data} documents={documents} definedTermsByProvision={definedTermsByProvision} />;
}
