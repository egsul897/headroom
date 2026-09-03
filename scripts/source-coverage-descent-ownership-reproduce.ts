/**
 * Child-descent ownership remediation - deterministic reproduction harness.
 *
 * Run:  npx tsx scripts/source-coverage-descent-ownership-reproduce.ts
 *
 * Pinned failure (disclosed in artifact 31): the RT-3 operator lead-in
 * "less the sum of clauses (a) and (b)," was classified UNACCOUNTED_SOURCE by
 * classifyUnaccountedFragment, but in situ the child-descent rule re-discharged
 * it as COVERED_BY_CHILD_DESCENT because its only children were the bare
 * references "(a) and " / "(b), ", each STRUCTURAL_NOISE - accounted, but owned
 * by nothing. Zero model calls.
 */
import { computeSourceCoverage } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";

type Span = { regionId: string; charStart: number; charEnd: number; materiality: "CRITICAL" | "MATERIAL" };
function region(text: string) {
  return { regionId: "operative", kind: "OPERATIVE" as const, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null };
}
function span(text: string, fragment: string): Span {
  const at = text.indexOf(fragment);
  if (at < 0) throw new Error(`fragment not present: ${fragment}`);
  return { regionId: "operative", charStart: at, charEnd: at + fragment.length, materiality: "CRITICAL" };
}
const cover = (text: string, anchored: string[]) => computeSourceCoverage({ regions: [region(text)], spans: anchored.map((f) => span(text, f)) });
const show = (label: string, text: string, anchored: string[]) => {
  const cov = cover(text, anchored);
  console.log(`\n== ${label}`);
  for (const s of cov.spans) console.log(`  [${s.disposition}] ${JSON.stringify(s.excerpt)}`);
  console.log(`  unaccounted=${cov.unaccounted.length} childDescent=${cov.countsByDisposition.COVERED_BY_CHILD_DESCENT ?? 0}`);
};

show("PINNED: operator lead-in with noise-only children", "Consolidated Net Income, less the sum of clauses (a) and (b), for such period", ["Consolidated Net Income,", "for such period"]);
show("CONTROL: canary #4 pure chapeau, inventoried children (must still descend)", "The Borrower may make the following Investments: (a) Investments in Subsidiaries. (b) Investments in Joint Ventures.", ["(a) Investments in Subsidiaries.", "(b) Investments in Joint Ventures."]);
show("CONTROL: mixed list, one glue-only child (must not descend)", "The Borrower may make the following Investments: (a) Investments in Subsidiaries. (b)", ["(a) Investments in Subsidiaries."]);
show("RECURSION: nested lead-in - enumerated units are never parents", "The Borrower shall deliver: (a) the following: (i) annual statements. (ii) quarterly statements.", ["(i) annual statements.", "(ii) quarterly statements."]);
