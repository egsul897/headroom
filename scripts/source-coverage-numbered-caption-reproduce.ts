/**
 * Numbered-caption remediation (artifact 36) - deterministic reproduction harness.
 *
 * The independent red team's own scanner probe "31 March 2030" (scripts/red-team-original/p3.ts), standing
 * alone as an uncovered residue, used to classify HEADING_OR_LABEL: the scanner returns [], the caption frame
 * read "31" as a section number and the letter-only nominal test accepted "March 2030" as a name. An accounted
 * disposition on a scanner-blind date. Zero model calls.
 *
 * Run: npx tsx scripts/source-coverage-numbered-caption-reproduce.ts
 */
import { classifyUnaccountedFragment, computeSourceCoverage } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { scanQuantitativeValues } from "../lib/contract-model/compiler/semantic-accountability/quantitative";

const show = (label: string, fragments: string[]) => {
  console.log(`\n== ${label}`);
  for (const f of fragments) {
    const v = scanQuantitativeValues(f);
    const c = classifyUnaccountedFragment(f, v);
    console.log(`   ${JSON.stringify(f).padEnd(58)} scan=${JSON.stringify(v.map((x) => x.rawText)).padEnd(18)} -> ${c.disposition}`);
  }
};

show("EXACT BLOCKER - original p3 probe (must be UNACCOUNTED_SOURCE)", ["31 March 2030"]);
show("CLASS - other number-leading substantive forms from preserved evidence (p1/p3/e2e2)", ["25000000", "3/31/2030", "2,500,000 (the \"Cap\")", "5.02 The maximum aggregate basket amount is 2,500,000", "6.02 The Borrower shall not incur any Indebtedness"]);
show("GENUINE CAPTIONS - positive legal-numbering grammar (must stay HEADING_OR_LABEL)", ["SECTION 7.04 Dispositions.", "6.02 Liens.", "7.05 Restricted Payments", "6.02 Limitation on Indebtedness.", "SECTION 1.01 Defined Terms."]);
show("REVIEW COST - bare-integer captions are no longer numbering evidence", ["1. Definitions.", "7 Restricted Payments"]);
show("SHARED HELPER - the quoted-label frame inherits the digit refusal", ["\"31 March 2030\"", "\"Consolidated EBITDA\"", "\"Applicable Margin\" means"]);
show("INDEPENDENT RULES - untouched", ["Section 7.11.", "ARTICLE VII", "Page 12 of 40"]);

// In situ: a unit whose only uncovered residue is the date must block completeness.
const text = "The Borrower shall repay the Loans in full on or before 31 March 2030";
const region = { regionId: "operative", kind: "OPERATIVE" as const, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null };
const covered = "The Borrower shall repay the Loans in full on or before";
const cov = computeSourceCoverage({ regions: [region], spans: [{ regionId: "operative", charStart: 0, charEnd: covered.length, materiality: "CRITICAL" }] });
console.log("\n== IN SITU - date as the only uncovered residue");
for (const s of cov.spans) console.log(`   [${s.disposition}] ${JSON.stringify(s.excerpt)}`);
console.log(`   unaccounted=${cov.unaccounted.length}`);
