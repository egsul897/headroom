/**
 * Phase 2D §33/§34 - independently authored context-retrieval ground truth
 * for the LSB 2023 ABL Credit Agreement regression package. Same
 * disclosed posture as fwrg-context-ground-truth.ts (known regression
 * package, not unseen; written before any real retrieval call). LSB's own
 * definitions-excerpt.txt does NOT use the "---DEFINITION BREAK---"
 * curation markers FWRG's does (verified directly - zero occurrences),
 * so its own real declared-term set is clean; every expected definition
 * below was independently verified present via detectStructuralDefinitions's
 * own real output before this file was written.
 */
import type { ContextBenchmarkCase } from "./fwrg-context-ground-truth";

export const LSB_CONTEXT_BENCHMARK: ContextBenchmarkCase[] = [
  {
    caseId: "lsb-6.01(a)-indebtedness-loan-documents",
    discoveryId: "discovery-candidate:8f90d6eac4202e65071bbcf5",
    sectionRef: "6.01(a)",
    covenantFamily: "INDEBTEDNESS",
    necessaryParentRefs: ["6.01"],
    necessaryChildRefs: [],
    necessarySiblingProvisoRefs: [],
    expectedDefinitions: [],
    expectedRecursiveDefinitions: [],
    expectedCrossReferences: [],
    expectedCalculationProvisions: [],
    knownUnresolvedDependencies: [],
    notes: "The section's own intro (parent scope) already carries the real economic gates (Fixed Charge Coverage Ratio > 2.0:1.0, Payment Conditions) - 'Fixed Charge Coverage Ratio' is a real declared term this case's own parent-scope text mentions, so it is expected as an UNRESOLVED_DEFINED_TERM lead off the PARENT item's own text, not the operative (a) clause's own text (which contains no defined-term mention itself).",
  },
  {
    caseId: "lsb-6.02-liens-permitted-liens",
    discoveryId: "discovery-candidate:2a5195dda5a015bcfc2a4f30",
    sectionRef: "6.02",
    covenantFamily: "LIENS",
    necessaryParentRefs: [],
    necessaryChildRefs: [],
    necessarySiblingProvisoRefs: [],
    expectedDefinitions: [{ term: "Permitted Liens", status: "PRESENT_IN_FIXTURE", notes: "The real exceptions to 6.02's general prohibition live entirely inside this separately-defined term, not as lettered sub-clauses of 6.02 itself (Phase 2C's own already-disclosed structural note)." }],
    expectedRecursiveDefinitions: [],
    expectedCrossReferences: [],
    expectedCalculationProvisions: [],
    knownUnresolvedDependencies: [],
    notes: "Single unified prohibition, no lettered children - the section itself is the operative rule, and its one real dependency (Permitted Liens) is genuinely retrievable from this fixture.",
  },
  {
    caseId: "lsb-6.15-financial-covenant-springing",
    discoveryId: "discovery-candidate:d6b410b5723bffaf35e7505a",
    sectionRef: "6.15",
    covenantFamily: "FINANCIAL_COVENANTS",
    necessaryParentRefs: [],
    necessaryChildRefs: [],
    necessarySiblingProvisoRefs: [],
    expectedDefinitions: [
      { term: "Availability Block Removal Period", status: "PRESENT_IN_FIXTURE", notes: "The springing trigger condition - a TRIGGER-dependent FINANCIAL_TEST." },
      { term: "Fixed Charge Coverage Ratio", status: "PRESENT_IN_FIXTURE" },
    ],
    expectedRecursiveDefinitions: [],
    expectedCrossReferences: ["2.01(b)(i)"],
    expectedCalculationProvisions: [],
    knownUnresolvedDependencies: [],
    notes: "Both of this covenant's real dependencies are genuinely declared and retrievable in this fixture - a clean positive case. The trailing cross-reference to Section 2.01(b)(i) (Availability Block Removal Notice mechanics) is outside Article 6's own text and is NOT expected to resolve (2.01 is not part of this fixture's own structural scope) - marked as a real, expected UNRESOLVED cross-reference, not a miss.",
  },
  {
    caseId: "lsb-6.11(a)-restricted-payments-affiliate",
    discoveryId: "discovery-candidate:cb5377328576a0c9174e8c36",
    sectionRef: "6.11(a)",
    covenantFamily: "RESTRICTED_PAYMENTS",
    necessaryParentRefs: ["6.11"],
    necessaryChildRefs: [],
    necessarySiblingProvisoRefs: [],
    expectedDefinitions: [],
    expectedRecursiveDefinitions: [],
    expectedCrossReferences: [],
    expectedCalculationProvisions: [],
    knownUnresolvedDependencies: [],
    notes: "6.11(a) itself ('Restricted Payments by a Loan Party to another Loan Party') has no further real dependency beyond its own parent scope (which defines 'Restricted Payment' inline via a parenthetical, not a separate declared term this fixture's detector would catch as its own defined-term declaration).",
  },
  {
    caseId: "lsb-6.04(a)-asset-disposition",
    discoveryId: "discovery-candidate:e79fa4f952a500410c504b81",
    sectionRef: "6.04(a)",
    covenantFamily: "ASSET_SALES",
    necessaryParentRefs: ["6.04"],
    necessaryChildRefs: [],
    necessarySiblingProvisoRefs: [],
    expectedDefinitions: [{ term: "ABL Priority Collateral", status: "PRESENT_IN_FIXTURE" }],
    expectedRecursiveDefinitions: [],
    expectedCrossReferences: ["2.01(a)"],
    expectedCalculationProvisions: [],
    knownUnresolvedDependencies: [],
    notes: "6.04(a) conditions large dispositions of ABL Priority Collateral on a new Borrowing Base Certificate demonstrating compliance with Section 2.01(a) - a real cross-reference outside Article 6's own fixture scope, expected UNRESOLVED (not a miss). Also references Section 6.03 in 6.04's own intro (excluded transactions) - a real in-scope cross-reference.",
  },
  {
    caseId: "lsb-6.14-affiliate-transactions-comma-list",
    discoveryId: "discovery-candidate:e1a2c06d81130c629b5c7825",
    sectionRef: "6.14",
    covenantFamily: "AFFILIATE_TRANSACTIONS",
    necessaryParentRefs: [],
    necessaryChildRefs: ["6.14(a)"], // the ONLY structurally-addressable child, per the known Phase 2A comma-list limitation (task §38) - (b)/(c)/(d) do not exist as their own nodes at all.
    necessarySiblingProvisoRefs: [],
    expectedDefinitions: [],
    expectedRecursiveDefinitions: [],
    expectedCrossReferences: [],
    expectedCalculationProvisions: [],
    knownUnresolvedDependencies: [],
    notes: "CARRIES FORWARD THE KNOWN PHASE 2A STRUCTURAL LIMITATION (task §38): exceptions (b)/(c)/(d) are comma-separated in the real source text and do not exist as their own structural nodes, so no CHILD_RULE item can ever be retrieved for them by this or any stage anchored to Phase 2A's structural index. This is counted as a raw, real gap in this benchmark's child-context recall for this one case (never excluded from the denominator), attributed explicitly to the Phase 2A parser limitation, not a Phase 2D retrieval defect.",
  },
];
