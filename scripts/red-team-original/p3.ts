import { computeSourceCoverage } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/source-coverage";
import type { SourceContextRegion } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/types";
const R = (text: string): SourceContextRegion => ({ regionId: "operative", kind: "OPERATIVE", documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null });

// A realistic ALL-CAPS jury-trial-waiver paragraph, as drafted in real credit agreements.
const waiver = "EACH PARTY HERETO HEREBY IRREVOCABLY WAIVES, TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, ANY RIGHT IT MAY HAVE TO A TRIAL BY JURY IN ANY LEGAL PROCEEDING DIRECTLY OR INDIRECTLY ARISING OUT OF OR RELATING TO THIS AGREEMENT. EACH PARTY CERTIFIES THAT NO REPRESENTATIVE OF ANY OTHER PARTY HAS REPRESENTED THAT SUCH OTHER PARTY WOULD NOT SEEK TO ENFORCE THIS WAIVER.";
const cov = computeSourceCoverage({ regions: [R(waiver)], spans: [] });
console.log("ALL-CAPS WAIVER PARAGRAPH (no inventory items at all):");
for (const s of cov.spans) console.log("   ", s.disposition, "|", JSON.stringify(s.excerpt.slice(0, 78)));
console.log("  unaccounted:", cov.unaccounted.length, "\n");

// caption-length boundary: how long can a material numbered clause be and still be a "heading"?
for (const n of [40, 60, 80, 82, 84, 90]) {
  const body = "The Borrower shall not create any Lien on the Collateral or any part thereof at all ever more".slice(0, n);
  const t = `6.02 ${body}`;
  const c = computeSourceCoverage({ regions: [R(t)], spans: [] });
  console.log(`  bodyLen=${String(n).padStart(3)} total=${String(t.length).padStart(3)} -> ${c.spans.map(s=>s.disposition).join(",")}`);
}

// ALL-CAPS length boundary
console.log();
for (const n of [40, 60, 80, 82, 84]) {
  const t = ("THE BORROWER SHALL NOT CREATE ANY LIEN ON THE COLLATERAL OR ANY PART THEREOF EVER AGAIN").slice(0, n);
  const c = computeSourceCoverage({ regions: [R(t)], spans: [] });
  console.log(`  capsLen=${String(n).padStart(3)} -> ${c.spans.map(s=>s.disposition).join(",")}`);
}

// Value scanner blind spots
import { scanQuantitativeValues } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/quantitative";
console.log("\nvalue scanner:");
for (const v of ["five million dollars", "fifty percent (50%)", "fifty percent", "one hundred and eighty days", "one-half of the Net Proceeds", "¥500,000,000", "CHF 2,000,000", "2,500,000 (the \"Cap\")", "a ratio of 4.5:1", "3/31/2030", "31 March 2030", "one half of one percent", "twenty-five basis points", "thirty days"]) {
  console.log("   ", JSON.stringify(v).padEnd(34), "->", JSON.stringify(scanQuantitativeValues(v).map(x=>x.rawText)));
}
