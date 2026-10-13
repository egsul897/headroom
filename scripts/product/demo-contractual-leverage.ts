/**
 * Demo: contractual leverage for Coherent + Matthews via the same pure path.
 * No DB. Run: npx tsx scripts/product/demo-contractual-leverage.ts
 */
import {
  calculateContractualLeverage,
  coherentTotalNetLeverageRequest,
  matthewsSecuredNetLeverageRequest,
} from "../../lib/product/contractual-leverage";

function show(label: string, req: ReturnType<typeof coherentTotalNetLeverageRequest>) {
  const r = calculateContractualLeverage(req);
  console.log(`\n=== ${label} ===`);
  console.log(`status: ${r.status}`);
  console.log(`formula: ${r.formulaDisplay}`);
  console.log(`current: ${r.currentRatio?.toFixed(4)}x  threshold: ${r.threshold}x`);
  console.log(`ratio headroom: ${r.ratioHeadroom?.toFixed(4)}x`);
  console.log(`debt headroom: ${r.debtHeadroomMillions?.toFixed(3)} $M`);
  console.log(`citations: ${r.citations.join(" | ")}`);
  console.log(`inputs: ${r.inputs.map((i) => `${i.label}=${i.valueMillions}`).join("; ")}`);
  if (r.missingRequirements.length) console.log(`missing: ${r.missingRequirements.join("; ")}`);
  console.log(`limitations: ${r.limitations.join(" ")}`);
}

show("Coherent — CA Total Net Leverage", coherentTotalNetLeverageRequest());
show("Matthews — Indenture Secured Net Leverage", matthewsSecuredNetLeverageRequest());

const missing = calculateContractualLeverage(
  coherentTotalNetLeverageRequest({ ebitda: null, totalDebt: 3258, securedDebt: 2221, cash: 1162 }),
);
console.log("\n=== Fail-closed (missing EBITDA) ===");
console.log(`status: ${missing.status}`);
console.log(`missing: ${missing.missingRequirements.join("; ")}`);
console.log(`currentRatio: ${missing.currentRatio}`);
