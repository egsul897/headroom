/**
 * Demo: contractual leverage for Coherent + Matthews via the same pure path.
 * No DB. Run: npx tsx scripts/product/demo-contractual-leverage.ts
 */
import {
  calculateContractualLeverage,
  calculateEbitdaBuildup,
  coherentTotalNetLeverageRequest,
  matthewsSecuredNetLeverageRequest,
  MATTHEWS_EBITDA_LINE_ITEMS,
  MATTHEWS_INDENTURE_DEFINITIONS,
} from "../../lib/product/contractual-leverage";

function show(label: string, req: ReturnType<typeof coherentTotalNetLeverageRequest>) {
  const r = calculateContractualLeverage(req);
  console.log(`\n=== ${label} ===`);
  console.log(`status: ${r.status}`);
  console.log(`inputAuthority: ${r.inputAuthority}`);
  console.log(`computationAuthority: ${r.computationAuthority}`);
  console.log(`formula: ${r.formulaDisplay}`);
  console.log(`current: ${r.currentRatio?.toFixed(4)}x  threshold: ${r.threshold}x`);
  console.log(`mathematical ratio headroom: ${r.ratioHeadroom?.toFixed(4)}x`);
  console.log(`mathematical dollar room: ${r.debtHeadroomMillions?.toFixed(3)} $M`);
  console.log(`disclaimer: ${r.capacityDisclaimer}`);
  if (r.ebitdaBuildup) {
    console.log(
      `EBITDA build-up: ${r.ebitdaBuildup.status} ${r.ebitdaBuildup.valueMillions?.toFixed(3)} $M (${r.ebitdaBuildup.authority})`,
    );
    console.log(`  formula: ${r.ebitdaBuildup.formulaDisplay}`);
  }
  console.log(`citations: ${r.citations.join(" | ")}`);
  console.log(
    `inputs: ${r.inputs.map((i) => `${i.label}=${i.valueMillions} [${i.authority}]`).join("; ")}`,
  );
  if (r.missingRequirements.length) console.log(`missing: ${r.missingRequirements.join("; ")}`);
}

show("Coherent — CA Total Net Leverage (seeded → INDICATIVE)", coherentTotalNetLeverageRequest());
show("Matthews — Indenture Secured Net Leverage + EBITDA build-up", matthewsSecuredNetLeverageRequest());

const buildup = calculateEbitdaBuildup({
  companyId: "matthews",
  instrumentKey: "matthews-indenture-2027-notes",
  ebitdaDefinition: MATTHEWS_INDENTURE_DEFINITIONS[0]!,
  lineItems: MATTHEWS_EBITDA_LINE_ITEMS,
  expectedPeriod: "TTM-2024-12-31",
});
console.log("\n=== Matthews EBITDA build-up alone ===");
console.log(`status: ${buildup.status} value: ${buildup.valueMillions} authority: ${buildup.authority}`);
console.log(`formula: ${buildup.formulaDisplay}`);

const missing = calculateContractualLeverage(
  coherentTotalNetLeverageRequest({ ebitda: null, totalDebt: 3258, securedDebt: 2221, cash: 1162 }),
);
console.log("\n=== Fail-closed (missing EBITDA) ===");
console.log(`status: ${missing.status}`);
console.log(`missing: ${missing.missingRequirements.join("; ")}`);
console.log(`currentRatio: ${missing.currentRatio}`);
console.log(`computationAuthority: ${missing.computationAuthority}`);
