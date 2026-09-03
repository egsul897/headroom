import { computeSourceCoverage } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/source-coverage";
import type { SourceContextRegion } from "/home/user/headroom/lib/contract-model/compiler/semantic-accountability/types";
const R = (regionId: string, text: string, kind: SourceContextRegion["kind"] = "OPERATIVE"): SourceContextRegion => ({ regionId, kind, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null });

// A. DUPLICATE REGION IDS: a span in region#1 masks the same offsets in region#2.
const t1 = "The Borrower shall deliver the annual financial statements to the Agent by June 30.";
const t2 = "The Borrower shall not incur Indebtedness exceeding the Threshold Amount at all.";
const dup = computeSourceCoverage({
  regions: [R("operative", t1), R("operative", t2, "CROSS_REFERENCE_EXPANSION")],
  spans: [{ regionId: "operative", charStart: 0, charEnd: t1.length, materiality: "CRITICAL" }],
});
console.log("A duplicate-region-id: unaccounted =", dup.unaccounted.length, "| dispositions:", dup.spans.map(s=>s.disposition).join(","));

// B. ZERO REGIONS
const zero = computeSourceCoverage({ regions: [], spans: [] });
console.log("B zero regions: unaccounted =", zero.unaccounted.length, "regionsConsidered", zero.regionsConsidered);

// C. EXTERNAL LINK with unverifiable owner discharges an entire region of material text
const ext = computeSourceCoverage({
  regions: [R("xref-0", t2, "CROSS_REFERENCE_EXPANSION")],
  spans: [],
  externalAccountability: [{ regionId: "xref-0", ownerCandidateRef: "does-not-exist", ownerInventoryHash: "not-a-real-hash" }],
});
console.log("C bogus external link: unaccounted =", ext.unaccounted.length, "disposition =", ext.spans.map(s=>s.disposition).join(","), "values=", ext.unaccountedValues.length);

// D. EMPTY REGION ID + link with empty id
const e = computeSourceCoverage({ regions: [R("", t2)], spans: [], externalAccountability: [{ regionId: "", ownerCandidateRef: "o", ownerInventoryHash: "h" }] });
console.log("D empty region id + link: unaccounted =", e.unaccounted.length, e.spans.map(s=>s.disposition).join(","));

// E. ORDERING: span order / duplicate spans
const base = { regions: [R("operative", t1)], spans: [
  { regionId: "operative", charStart: 0, charEnd: 30, materiality: "CRITICAL" },
  { regionId: "operative", charStart: 30, charEnd: t1.length, materiality: "MATERIAL" }] };
const rev = { regions: base.regions, spans: [...base.spans].reverse() };
const dupd = { regions: base.regions, spans: [...base.spans, ...base.spans] };
const j = (x: any) => JSON.stringify(computeSourceCoverage(x).spans.map((s:any)=>[s.charStart,s.charEnd,s.disposition]));
console.log("E order-invariant:", j(base) === j(rev), "| duplicate-invariant:", j(base) === j(dupd));

// F. FALSE POSITIVES: genuine furniture
const furniture = [
  "[Signature Page Follows]",
  "IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.",
  "By: /s/ Jane Doe",
  "Name: Jane Doe\nTitle: Chief Financial Officer",
  "CREDIT AGREEMENT dated as of March 3, 2029 among ACME CORP., the Lenders party hereto and BANK, as Administrative Agent",
  "ARTICLE VII\nNEGATIVE COVENANTS",
  "Table of Contents",
];
for (const f of furniture) {
  const cov = computeSourceCoverage({ regions: [R("operative", f)], spans: [] });
  console.log("F", JSON.stringify(f.slice(0,50)).padEnd(56), "->", cov.spans.map(s=>s.disposition).join(","));
}
