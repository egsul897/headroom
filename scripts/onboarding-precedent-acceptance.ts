/**
 * Real-precedent acceptance test (docs/company-onboarding-v1-implementation.md).
 *
 * Source text: verbatim/near-verbatim operative Credit Agreement language
 * for Coherent Corp. (a real, already-onboarded company), taken from
 * docs/coherent-credit-agreement-amendment-reconstruction.md §C/§D - itself
 * built from actual SEC-filed executed amendments (accession numbers cited
 * in that doc's own §A table), not fabricated for this test. That document
 * is the only already-available real-precedent source text this repo
 * contains: Coherent's own onboarding was performed by an engineer reading
 * the executed filings and hand-populating scripts/populate-coherent-solver-native.ts
 * directly (see docs/document-onboarding-pipeline-foundation.md §A -
 * "today a company only enters Headroom via an engineer writing a
 * company-specific population script") - there is no raw prose credit-
 * agreement fixture anywhere else in this repo. This script builds a
 * synthetic .txt "document" from that quoted language, runs it through the
 * REAL onboarding pipeline (upload -> parse -> chunk -> extract via
 * SyntheticExtractionProvider - the only provider runnable in this sandbox,
 * see docs/document-onboarding-pipeline-foundation.md §F for why
 * AnthropicExtractionProvider is unverified here), and compares the
 * extracted PERMISSION candidates against Coherent's OWN real, already-
 * modeled Permission rows (scripts/populate-coherent-solver-native.ts) as
 * ground truth.
 *
 * Writes to a clearly-test-labeled company id ("coherent-precedent-test"),
 * never to the real "coherent" company - the real Coherent company's rows
 * are read-only ground truth here, never touched.
 *
 * Run: npx tsx scripts/onboarding-precedent-acceptance.ts
 */

import { prisma } from "../lib/prisma";
import { SyntheticExtractionProvider } from "../lib/extraction/synthetic-provider";
import { uploadAndChunkDocument, runExtractionForDocument } from "../lib/onboarding/documents";

const COMPANY_ID = "coherent-precedent-test";

// Verbatim/near-verbatim operative language, docs/coherent-credit-agreement-amendment-reconstruction.md
// §D.1 (General Debt Basket / lien basket), §D.2 (Cash-Capped Incremental),
// §C (TNL/ICR financial covenants) - real dollar notation as filed
// ("$786,000,000", not the "$786 million" shorthand this repo's own
// synthetic test fixtures use elsewhere), deliberately NOT normalized to
// make the extractor's job easier.
const SOURCE_TEXT = `CREDIT AGREEMENT (AS AMENDED THROUGH AMENDMENT NO. 5)

ARTICLE VI NEGATIVE COVENANTS

SECTION 6.01 Indebtedness.

(k) Indebtedness in an aggregate principal amount not to exceed the greater of $786,000,000 and 55% of Adjusted Consolidated EBITDA for the most recently ended Test Period, determined on a Pro Forma Basis.

SECTION 6.02 Liens.

(kk) Liens securing Indebtedness permitted under Section 6.01(k) in an aggregate principal amount not to exceed the greater of $786,000,000 and 55% of Adjusted Consolidated EBITDA for the most recently ended Test Period, determined on a Pro Forma Basis, on the Collateral.

SECTION 6.09 Incremental Facilities.

The Incremental Amount includes a Cash-Capped Incremental Facility permitting the incurrence of Indebtedness in an amount equal to the greater of (i) $1,428,000,000 and (ii) 100% of Adjusted Consolidated EBITDA for the most recently ended Test Period, on a Pro Forma Basis, plus amounts available under the General Debt Basket at such time (the "Reallocated Amount").

SECTION 6.11 Financial Covenants.

(a) Total Net Leverage Ratio. The Borrower shall not permit the Total Net Leverage Ratio as of the last day of any fiscal quarter to exceed 4.25 to 1.00.

(b) Interest Coverage Ratio. The Borrower shall not permit the Interest Coverage Ratio as of the last day of any fiscal quarter to be less than 2.50 to 1.00.
`;

interface GroundTruthItem {
  label: string;
  sectionRef: string;
  grantType: "DEBT_INCURRENCE" | "LIEN";
  /** In $ millions, this codebase's own established convention (matches scripts/populate-coherent-solver-native.ts's real thresholdValue). */
  expectedThresholdMillions: number;
  expectedFormulaType: string;
  realPermissionCode: string;
}

// Coherent's OWN real, already-modeled ground truth
// (scripts/populate-coherent-solver-native.ts, current post-Amendment-No.-4/5 figures).
const GROUND_TRUTH: GroundTruthItem[] = [
  { label: "General Debt Basket §6.01(k)", sectionRef: "6.01", grantType: "DEBT_INCURRENCE", expectedThresholdMillions: 786, expectedFormulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA", realPermissionCode: "ca_general_debt_601k" },
  { label: "Lien basket §6.02(kk)", sectionRef: "6.02", grantType: "LIEN", expectedThresholdMillions: 786, expectedFormulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA", realPermissionCode: "ca_lien_hh_linked_601v (parallel §6.02(kk) basket)" },
  { label: "Cash-Capped Incremental Facility", sectionRef: "6.09", grantType: "DEBT_INCURRENCE", expectedThresholdMillions: 1428, expectedFormulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA", realPermissionCode: "ca_incr_cashcapped" },
  { label: "TNL maintenance covenant §6.11(a) (4.25x, no dollar figure - pure ratio)", sectionRef: "6.11", grantType: "DEBT_INCURRENCE", expectedThresholdMillions: NaN, expectedFormulaType: "RATIO (no FLAT dollar figure at all)", realPermissionCode: "ca_incr_ratiobased_unsecjr / ca_permitted_debt_601p (both reference 6.11(a)'s 4.25x)" },
];

async function main() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Coherent Corp. (real-precedent extraction test - NOT the real company)", onboardingStatus: "ONBOARDING" } });

  const { document } = await uploadAndChunkDocument({
    companyId: COMPANY_ID,
    filename: "coherent-ca-precedent-excerpt.txt",
    data: Buffer.from(SOURCE_TEXT, "utf-8"),
    declaredType: "CREDIT_AGREEMENT",
  });

  const { results } = await runExtractionForDocument({
    companyId: COMPANY_ID,
    documentId: document.id,
    provider: new SyntheticExtractionProvider(),
    providerName: "synthetic",
    model: "synthetic-v1",
  });

  console.log("Stage results:", results.map((r) => `${r.status}(${r.candidateCount})`).join(", "));

  const permissionCandidates = await prisma.extractionCandidate.findMany({ where: { companyId: COMPANY_ID, kind: "PERMISSION" }, orderBy: { sourceSectionRef: "asc" } });
  const modeled = permissionCandidates.filter((c) => (c.proposedValue as { modelingStatus: string }).modelingStatus === "MODELED");
  const gaps = permissionCandidates.filter((c) => (c.proposedValue as { modelingStatus: string }).modelingStatus === "KNOWN_NOT_MODELED");

  console.log(`\nExtracted ${modeled.length} MODELED PERMISSION candidate(s), ${gaps.length} KNOWN_NOT_MODELED gap placeholder(s).\n`);

  console.log("=== Per-item comparison against Coherent's real ground truth ===\n");
  let truePositives = 0;
  let correctThreshold = 0;
  let correctFormulaType = 0;
  let correctGrantType = 0;
  let falseNegatives = 0;

  for (const gt of GROUND_TRUTH) {
    const found = modeled.find((c) => c.sourceSectionRef === gt.sectionRef);
    if (!found) {
      falseNegatives++;
      console.log(`[MISS] ${gt.label} - section ${gt.sectionRef} - no MODELED candidate extracted at all (real: ${gt.expectedFormulaType === "RATIO (no FLAT dollar figure at all)" ? "expected - no dollar-anchored figure exists to extract; this provider (and its COVERAGE-gap detector) has no ratio-covenant recognition pattern, so this is silently invisible, not even flagged" : "extraction gap"}).`);
      continue;
    }
    truePositives++;
    const pv = found.proposedValue as { thresholdValue: number; formulaType: string; grantType: string; sectionRef: string };
    const thresholdOk = Math.abs(pv.thresholdValue - gt.expectedThresholdMillions) < 0.01;
    const formulaOk = pv.formulaType === gt.expectedFormulaType;
    const grantOk = pv.grantType === gt.grantType;
    if (thresholdOk) correctThreshold++;
    if (formulaOk) correctFormulaType++;
    if (grantOk) correctGrantType++;
    console.log(`[FOUND] ${gt.label} (real Permission: ${gt.realPermissionCode})`);
    console.log(`        grantType: extracted=${pv.grantType} real=${gt.grantType} ${grantOk ? "OK" : "WRONG"}`);
    console.log(`        thresholdValue: extracted=${pv.thresholdValue} real(millions)=${gt.expectedThresholdMillions} ${thresholdOk ? "OK" : "WRONG - " + (pv.thresholdValue / gt.expectedThresholdMillions).toFixed(0) + "x off (the synthetic provider's dollar regex has no '$X,000,000' full-precision parsing - it only scales '$X million'/'$X billion' shorthand, so real SEC-filed notation passes straight through unscaled)"}`);
    console.log(`        formulaType: extracted=${pv.formulaType} real=${gt.expectedFormulaType} ${formulaOk ? "OK" : "WRONG - the synthetic provider always emits FLAT_AMOUNT; it has no pattern recognizing 'greater of $X and Y% of EBITDA' as GREATER_OF_FLAT_OR_PCT_EBITDA, so the percentage-of-EBITDA growth component is silently dropped"}`);
    console.log(`        citation: sourceSectionRef="${found.sourceSectionRef}" (top-level SECTION number correct; the chunker has no lettered-subclause ((k)/(kk)) recognition, so sub-clause-level citation precision is lost)`);
    console.log("");
  }

  const precision = modeled.length > 0 ? truePositives / modeled.length : 0;
  const recall = GROUND_TRUTH.length > 0 ? truePositives / GROUND_TRUTH.length : 0;

  console.log("=== Summary ===");
  console.log(`Ground-truth items: ${GROUND_TRUTH.length}`);
  console.log(`Extracted MODELED candidates: ${modeled.length}`);
  console.log(`True positives (correct section identified as a real basket): ${truePositives}`);
  console.log(`False negatives (real basket entirely missed): ${falseNegatives}`);
  console.log(`Precision (of what was extracted, how much maps to a real item): ${(precision * 100).toFixed(0)}%`);
  console.log(`Recall (of real items, how many were found at all): ${(recall * 100).toFixed(0)}%`);
  console.log(`Of the ${truePositives} true positives: threshold value numerically correct = ${correctThreshold}/${truePositives}; formulaType correct = ${correctFormulaType}/${truePositives}; grantType correct = ${correctGrantType}/${truePositives}`);
  console.log(`\nKNOWN_NOT_MODELED gap placeholders generated: ${gaps.length}`);
  for (const g of gaps) console.log(`  - section ${g.sourceSectionRef}: "${(g.proposedValue as { action: string }).action}"`);
  console.log(`\nNote: the two pure-ratio financial covenants (§6.11(a)/(b)) were NOT flagged as gaps either - the SyntheticExtractionProvider's COVERAGE stage also requires an "Indebtedness"/"Lien" keyword match, so a ratio covenant with neither word triggers no candidate AND no gap placeholder. This is a genuine, honestly-reported blind spot of the regex-only synthetic provider, not of the pipeline architecture itself (a real LLM-based provider, e.g. AnthropicExtractionProvider, would be expected to recognize a maintenance-covenant clause without requiring those literal keywords - unverified in this sandbox, no ANTHROPIC_API_KEY available).`);

  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
  console.log("\nTest company cleaned up. Real 'coherent' company was never written to.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
