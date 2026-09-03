/**
 * CANARY #10: the residual determinerless ALL-CAPS predication hole that canary #8 pinned and disclosed.
 *
 * Canary #8 replaced "all caps + short" with "all caps + no clause punctuation + no determiner". That is
 * necessary but not sufficient: a predication whose arguments are bare nouns carries no determiner either.
 *
 * Run:  npx tsx scripts/source-coverage-canary10-reproduce.ts
 */
import { computeSourceCoverage, classifyUnaccountedFragment } from "../lib/contract-model/compiler/semantic-accountability/source-coverage";

function region(text: string) {
  return { regionId: "operative", kind: "OPERATIVE" as const, documentId: "d", sourceNodeId: null, sectionRef: null, charStart: 0, charEnd: text.length, text, expandedFor: null, truncatedAtBudget: false, unitExtension: null };
}
function cover(text: string) {
  return computeSourceCoverage({ regions: [region(text)], spans: [] });
}
function line(label: string, text: string) {
  const cov = cover(text);
  console.log(`   ${label.padEnd(46)} -> ${classifyUnaccountedFragment(text, []).disposition.padEnd(22)} unaccounted=${cov.unaccounted.length}`);
}

// --- §1 the pinned fixture, exactly ------------------------------------------------------------------------
const PINNED = "BORROWER SHALL PAY INTEREST";
console.log("=== §1 the pinned fixture");
line(JSON.stringify(PINNED), PINNED);

// --- §8 the original canary #8 attacks, verbatim -----------------------------------------------------------
console.log("\n=== §8 the original canary #8 attacks (must remain review-blocking)");
line("waiver", "EACH PARTY HEREBY IRREVOCABLY WAIVES ANY RIGHT TO TRIAL BY JURY");
line("liability cap", "IN NO EVENT SHALL THE AGGREGATE LIABILITY EXCEED FIVE MILLION DOLLARS");

// --- §9 heading controls - REPORT, do not force ------------------------------------------------------------
console.log("\n=== §9 heading controls (report the outcome, do not force it green)");
line("NEGATIVE COVENANTS", "NEGATIVE COVENANTS");
line("ARTICLE VII / NEGATIVE COVENANTS", "ARTICLE VII\nNEGATIVE COVENANTS");
line("ARTICLE VII alone", "ARTICLE VII");
line("RESTRICTED PAYMENTS", "RESTRICTED PAYMENTS");
line("EVENTS OF DEFAULT", "EVENTS OF DEFAULT");

// --- §10 generic non-legal control -------------------------------------------------------------------------
console.log("\n=== §10 generic non-legal control");
line("COMPANY DELIVERS REPORTS", "COMPANY DELIVERS REPORTS");

// --- casing-independent frames must be unaffected -----------------------------------------------------------
console.log("\n=== casing-independent frames (unchanged by this canary)");
line("SECTION 7.04 Dispositions.", "SECTION 7.04 Dispositions.");
line("Section 7.11.", "Section 7.11.");
line("Page 12 of 40", "Page 12 of 40");
line('"Consolidated EBITDA"', '"Consolidated EBITDA"');
