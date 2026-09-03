import { classifyUnaccountedFragment, computeSourceCoverage, segmentSourceUnits } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/source-coverage";
import { scanQuantitativeValues } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/quantitative";
const R = (text: string) => ({ regionId: "operative", kind: "OPERATIVE" as const, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null });
const cls = (f: string) => classifyUnaccountedFragment(f, scanQuantitativeValues(f)).disposition;

console.log("OCR / unicode probes");
for (const f of ["sub-ject to the fore-going,", "in-cluding the fol-lowing,", "sever­ally and joint­ly,",
  "the sum of the foregoing", "​jointly and severally​", "provided　that　such"]) {
  console.log("   ", JSON.stringify(f).padEnd(44), "->", cls(f));
}

console.log("\nno-punctuation run-on, partial item coverage:");
const t = "The Borrower shall not incur Indebtedness and shall not create Liens and shall not sell assets";
const cov = computeSourceCoverage({ regions: [R(t)], spans: [{ regionId: "operative", charStart: 0, charEnd: 40, materiality: "CRITICAL" }] });
console.log("   ", cov.spans.map(s=>`${s.disposition}:${JSON.stringify(s.excerpt.slice(0,40))}`).join(" | "));

console.log("\nextremely long single token:");
const long = "A".repeat(5000);
const c2 = computeSourceCoverage({ regions: [R(long)], spans: [] });
console.log("   ", c2.spans.map(s=>s.disposition).join(","), "unaccounted", c2.unaccounted.length);

console.log("\nvalue straddling a comma boundary:");
console.log("   segments:", JSON.stringify(segmentSourceUnits("Due on March 31, 2030, unless waived.", scanQuantitativeValues("Due on March 31, 2030, unless waived.")).map(u=>u)));

console.log("\nINFORMATIONAL item does not account (control):");
const c3 = computeSourceCoverage({ regions: [R(t)], spans: [{ regionId: "operative", charStart: 0, charEnd: t.length, materiality: "INFORMATIONAL" }] });
console.log("   ", c3.spans.map(s=>s.disposition).join(","), "unaccounted", c3.unaccounted.length);
