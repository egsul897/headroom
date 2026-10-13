/**
 * Demo: Coherent + Matthews contractual EBITDA build-up → leverage (same path).
 * Run: npx tsx scripts/product/demo-contractual-leverage.ts
 */
import {
  calculateContractualLeverage,
  calculateEbitdaBuildup,
  coherentTotalNetLeverageRequest,
  matthewsSecuredNetLeverageRequest,
  COHERENT_CA_DEFINITIONS,
  COHERENT_FY2026_EBITDA_LINE_ITEMS,
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
      `EBITDA build-up: ${r.ebitdaBuildup.status} ${r.ebitdaBuildup.valueMillions?.toFixed(3)} $M (${r.ebitdaBuildup.authority}) period=${r.ebitdaBuildup.period}`,
    );
    for (const row of r.ebitdaBuildup.numericalTrace) {
      console.log(`  ${row.sign} ${row.label}: ${row.amountMillions}`);
    }
    if (r.ebitdaBuildup.unresolvedComponents.length) {
      console.log(`  unresolved: ${r.ebitdaBuildup.unresolvedComponents.join(" | ")}`);
    }
  }
  console.log(`citations: ${r.citations.join(" | ")}`);
}

show("Coherent — CA TNL from FY2026 10-K EBITDA build-up (not leaf 1700)", coherentTotalNetLeverageRequest());
show("Matthews — Indenture SNLR + EBITDA build-up (same implementation)", matthewsSecuredNetLeverageRequest());

const coh = calculateEbitdaBuildup({
  companyId: "coherent",
  instrumentKey: "coherent-credit-agreement",
  ebitdaDefinition: COHERENT_CA_DEFINITIONS[0]!,
  lineItems: COHERENT_FY2026_EBITDA_LINE_ITEMS,
  expectedPeriod: "FY2026-2026-06-30",
  evidenceSnapshotStatus: "REVIEW_REQUIRED",
});
console.log("\n=== Coherent build-up alone ===");
console.log(`value=${coh.valueMillions} authority=${coh.authority}`);
console.log(`approval: ${coh.approvalResolution.map((a) => a.resolveState).join(",")}`);

const mat = calculateEbitdaBuildup({
  companyId: "matthews",
  instrumentKey: "matthews-indenture-2027-notes",
  ebitdaDefinition: MATTHEWS_INDENTURE_DEFINITIONS[0]!,
  lineItems: MATTHEWS_EBITDA_LINE_ITEMS,
  expectedPeriod: "TTM-2024-12-31",
});
console.log("\n=== Matthews build-up alone ===");
console.log(`value=${mat.valueMillions} authority=${mat.authority}`);
