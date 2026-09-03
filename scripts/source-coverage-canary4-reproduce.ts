/**
 * CANARY #4: the red team's RT-4/S5 parent-descent attack, verbatim.
 *
 * Defect (pre-fix): a substantive parent/chapeau span became COVERED_BY_CHILD_DESCENT merely because the
 * enumerated children it introduced were each covered. Two independent obligations sitting in the same
 * sentence as the lead-in ("shall prepay the Loans in full upon a Change of Control", "shall cure any
 * Default") were discharged for free, and the region reported semanticallyComplete = true with zero
 * unaccounted source.
 *
 * Run:  npx tsx scripts/source-coverage-canary4-reproduce.ts
 */
import { computeSourceCoverage } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";

type Span = { regionId: string; charStart: number; charEnd: number; materiality: "CRITICAL" | "MATERIAL" };

function region(text: string) {
  return { regionId: "operative", kind: "OPERATIVE" as const, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null };
}
function span(text: string, fragment: string, materiality: "CRITICAL" | "MATERIAL" = "CRITICAL"): Span {
  const at = text.indexOf(fragment);
  if (at < 0) throw new Error(`fragment not present: ${fragment}`);
  return { regionId: "operative", charStart: at, charEnd: at + fragment.length, materiality };
}
function report(label: string, text: string, fragments: string[]) {
  const cov = computeSourceCoverage({ regions: [region(text)], spans: fragments.map((f) => span(text, f)) });
  console.log(`\n=== ${label}`);
  for (const s of cov.spans) console.log(`   [${s.disposition}] ${JSON.stringify(s.excerpt)}`);
  console.log(`   unaccounted=${cov.unaccounted.length} unaccountedValues=${cov.unaccountedValues.length} ${JSON.stringify(cov.unaccountedValues.map((v) => `${v.kind}:${v.rawText}`))}`);
}

// --- §1 the attack, verbatim -------------------------------------------------------------------------------
const ATTACK = "The Borrower shall prepay the Loans in full upon a Change of Control and shall cure any Default within thirty days after notice and shall not incur any Indebtedness other than (a) the Existing Debt (b) the Revolving Loans.";
report("ATTACK - only the two enumerated children are inventoried", ATTACK, ["the Existing Debt", "the Revolving Loans"]);

// --- §9 legitimate pure-chapeau control: the lead-in really does only introduce the list --------------------
const CHAPEAU = "The Borrower may make the following Investments: (a) Investments in Subsidiaries. (b) Permitted Acquisitions.";
report("CONTROL A - pure chapeau (must NOT surface a gap)", CHAPEAU, ["Investments in Subsidiaries", "Permitted Acquisitions"]);

// --- §10 mixed-parent control: substantive conjunct + genuine introducer in one sentence --------------------
const MIXED = "The Company shall comply within 30 days and may take only the following actions: (a) Action A. (b) Action B.";
report("CONTROL B - mixed parent (substantive conjunct stays accountable, introducer descends)", MIXED, ["Action A", "Action B"]);
