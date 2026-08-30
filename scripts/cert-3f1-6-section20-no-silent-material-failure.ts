/**
 * Phase 3F.1.6 Final Foundation Certification - Section 20 independent
 * verification: Architecture Invariant #37 (NO_SILENT_MATERIAL_FAILURE).
 *
 * For each of the five failure classes named in the certification charter -
 * compile, context, operative state, verification, unsupported semantics -
 * this script constructs its OWN fresh MaterialSemanticUnit +
 * SemanticUnitCoverageEntry (+ DangerousUnaccountedSemanticUnit where the
 * class requires one) pair, distinct from every fixture already used in
 * tests/contract-model/safe-failure-adversarial.test.ts and
 * tests/contract-model/semantic-coverage-reconciliation.test.ts, runs each
 * through the REAL deriveFromCoverageEntry() + recordClaimReview() call path
 * against real Postgres, and confirms a genuine, claim-specific
 * ClaimReviewItem row - keyed to THIS unit's own claimKey - exists afterward.
 * A generic log line or document-level warning would NOT satisfy this; only
 * an actual row lookup by this exact claimKey counts.
 */
import { prisma } from "../lib/prisma";
import { deriveFromCoverageEntry } from "../lib/contract-model/compiler/safe-failure/derive";
import { recordClaimReview } from "../lib/contract-model/compiler/safe-failure/service";
import { claimKeyFromSemanticUnit } from "../lib/contract-model/compiler/safe-failure/identity";
import type { DangerousUnaccountedSemanticUnit, MaterialSemanticUnit, SemanticUnitCoverageEntry } from "../lib/contract-model/compiler/semantic-coverage/types";

const COMPANY = "cert-3f1-6-sec20-co";
const DOC = "cert-3f1-6-sec20-doc";

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`PASS: ${label}`);
  else {
    failures += 1;
    console.log(`FAIL: ${label}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

function makeUnit(overrides: Partial<MaterialSemanticUnit> & { semanticUnitId: string }): MaterialSemanticUnit {
  return {
    companyId: COMPANY,
    packageKey: "cert-sec20-pkg",
    instrumentKey: "cert-sec20-instrument",
    operativeVersionRef: "v1",
    granularity: "SEMANTIC_UNIT",
    anchors: [{ documentId: DOC, structuralNodeKey: `${DOC}::7.02`, structuralNodeId: "cert-sec20-node", sectionRef: "7.02", charStart: 100, charEnd: 250, sourceCitation: `${DOC}::7.02` }],
    family: "RESTRICTED_PAYMENTS",
    familyEvidence: null,
    postureSignal: "PROHIBITION_SIGNAL",
    materiality: "CRITICAL",
    materialityReasoning: "cert-sec20 injected fixture",
    contextuallyElevated: false,
    excerptText: "cert-sec20 injected excerpt text",
    detectedSignals: ["currency_value"],
    fromRawSourceFallback: false,
    detectionMethod: "STRUCTURAL_HYPOTHESIS",
    aiInventoryPromptVersion: null,
    confidence: "HIGH",
    uncertaintyReasons: [],
    inventoryAlgorithmVersion: "cert-sec20-v1",
    provenance: "cert-sec20-injected",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<SemanticUnitCoverageEntry> & { semanticUnitId: string }): SemanticUnitCoverageEntry {
  return {
    coverageState: "UNREPRESENTED",
    matchedIrIds: [],
    missingEconomicElement: null,
    reasoning: "cert-sec20 injected reasoning",
    materiality: "CRITICAL",
    coverageAlgorithmVersion: "cert-sec20-v1",
    ...overrides,
  };
}

interface Case {
  label: string;
  unit: MaterialSemanticUnit;
  entry: SemanticUnitCoverageEntry;
  dangerous: DangerousUnaccountedSemanticUnit | null;
  expectedReasonCode: string;
}

async function main() {
  await prisma.company.createMany({ data: [{ id: COMPANY, name: "Cert Sec20 Co" }], skipDuplicates: true });
  await prisma.document.createMany({ data: [{ id: DOC, companyId: COMPANY, name: "Cert Sec20 Doc", type: "CREDIT_AGREEMENT" }], skipDuplicates: true });

  const cases: Case[] = [
    {
      label: "1. COMPILE failure - a compilation that fails and returns REVIEW_REQUIRED-equivalent (candidate discovered, compiler never produced IR for it)",
      unit: makeUnit({ semanticUnitId: "cert-sec20-compile-fail-unit", family: "INDEBTEDNESS", excerptText: "Company shall not incur additional Indebtedness in excess of the Incremental Cap without Required Lender consent." }),
      entry: makeEntry({ semanticUnitId: "cert-sec20-compile-fail-unit", coverageState: "UNREPRESENTED" }),
      dangerous: { semanticUnitId: "cert-sec20-compile-fail-unit", reason: "CANDIDATE_DISCOVERED_NEVER_COMPILED", materiality: "CRITICAL", sourceEvidence: "Company shall not incur additional Indebtedness in excess of the Incremental Cap without Required Lender consent.", auditorReasoning: "cert-sec20: discovery produced a candidate for this provision; the semantic compiler never emitted an IR rule for it in this run." },
      expectedReasonCode: "COMPILATION_FAILURE",
    },
    {
      label: "2. CONTEXT failure - insufficient source context to resolve a cross-reference the unit depends on",
      unit: makeUnit({ semanticUnitId: "cert-sec20-context-fail-unit", family: "RESTRICTED_PAYMENTS", excerptText: "Restricted Payments permitted under clause (r) of Section 7.02 shall not exceed the Available Amount as defined in Section 1.01." }),
      entry: makeEntry({ semanticUnitId: "cert-sec20-context-fail-unit", coverageState: "SOURCE_CONTEXT_INCOMPLETE", missingEconomicElement: "cross-reference", reasoning: "cert-sec20: the referenced Section 1.01 'Available Amount' definition could not be located/resolved in the source context available to this run." }),
      dangerous: null,
      expectedReasonCode: "INSUFFICIENT_CONTEXT",
    },
    {
      label: "3. OPERATIVE STATE failure - ambiguous/conflicted as to which amendment version currently governs this provision",
      unit: makeUnit({ semanticUnitId: "cert-sec20-opstate-fail-unit", family: "FINANCIAL_COVENANTS", operativeVersionRef: null, excerptText: "The Total Net Leverage Ratio shall not exceed 4.50:1.00 as of the last day of any fiscal quarter." }),
      entry: makeEntry({ semanticUnitId: "cert-sec20-opstate-fail-unit", coverageState: "OPERATIVE_STATE_UNRESOLVED", reasoning: "cert-sec20: two amendments (Amendment No. 3 and Amendment No. 4) both purport to modify this covenant's threshold and their precedence could not be resolved." }),
      dangerous: null,
      expectedReasonCode: "OPERATIVE_STATE_UNCERTAIN",
    },
    {
      label: "4. VERIFICATION failure - a material discrepancy between compiled IR and source (verifier contradiction)",
      unit: makeUnit({ semanticUnitId: "cert-sec20-verify-fail-unit", family: "LIENS", excerptText: "Liens securing Indebtedness permitted under Section 7.01(k) shall not exceed $25,000,000 in the aggregate at any time outstanding." }),
      entry: makeEntry({ semanticUnitId: "cert-sec20-verify-fail-unit", coverageState: "UNREPRESENTED", reasoning: "cert-sec20: unit rolled into dangerous-unaccounted due to verifier contradiction" }),
      dangerous: { semanticUnitId: "cert-sec20-verify-fail-unit", reason: "COMPILED_BUT_MATERIALLY_MISREPRESENTED", materiality: "CRITICAL", sourceEvidence: "Liens securing Indebtedness permitted under Section 7.01(k) shall not exceed $25,000,000 in the aggregate at any time outstanding.", auditorReasoning: "cert-sec20: compiled IR rule capped this basket at $2,500,000 - a 10x discrepancy from the source's stated $25,000,000 cap, flagged by the semantic verifier as a material contradiction." },
      expectedReasonCode: "VERIFICATION_CONTRADICTION",
    },
    {
      label: "5. UNSUPPORTED SEMANTICS failure - an IR-inexpressible mechanic (a builder/grower basket formula the IR schema has no representation for)",
      unit: makeUnit({ semanticUnitId: "cert-sec20-unsupported-unit", family: "RESTRICTED_PAYMENTS", excerptText: "The Cumulative Credit shall be built at 50% of Consolidated Net Income accrued since the Closing Date, subject to a Retained Excess Cash Flow grower add-back mechanism not otherwise defined herein." }),
      entry: makeEntry({ semanticUnitId: "cert-sec20-unsupported-unit", coverageState: "UNSUPPORTED", reasoning: "cert-sec20: this builder/grower basket combination (Cumulative Credit + Retained ECF grower add-back) has no expressible representation in the current IR schema's basket-mechanics vocabulary." }),
      dangerous: null,
      expectedReasonCode: "UNSUPPORTED_EXPRESSION",
    },
  ];

  const createdIds: string[] = [];

  for (const c of cases) {
    const input = deriveFromCoverageEntry({
      unit: c.unit,
      entry: c.entry,
      dangerous: c.dangerous,
      companyId: COMPANY,
      packageKey: c.unit.packageKey,
      instrumentKey: c.unit.instrumentKey,
      coverageAlgorithmVersion: c.entry.coverageAlgorithmVersion,
    });
    check(`${c.label}: derive() produces a non-null ClaimReviewItemInput`, input !== null, input);
    if (!input) continue;
    check(`${c.label}: reasonCode is ${c.expectedReasonCode}`, input.reasonCode === c.expectedReasonCode, input.reasonCode);

    const result = await recordClaimReview(input);
    check(`${c.label}: recordClaimReview() reports CREATED`, result.outcome === "CREATED", result);
    createdIds.push(result.reviewItemId);

    const expectedClaimKey = claimKeyFromSemanticUnit({ semanticUnitId: c.unit.semanticUnitId });
    check(`${c.label}: a REAL ClaimReviewItem row exists, keyed to THIS unit's own claimKey (not a sibling/generic row)`, false || (await claimSpecificRowExists(expectedClaimKey)), expectedClaimKey);
  }

  // Cross-check: 5 distinct claimKeys -> 5 distinct rows, no collapsing across failure classes.
  const allRows = await prisma.claimReviewItem.findMany({ where: { companyId: COMPANY } });
  check("all 5 failure classes produced 5 DISTINCT persisted rows (no cross-class collapsing)", allRows.length === 5, allRows.length);
  check("all 5 rows have distinct reasonCodes matching their injected failure class", new Set(allRows.map((r) => r.reasonCode)).size === 5, allRows.map((r) => r.reasonCode));

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);

  await prisma.claimReviewItem.deleteMany({ where: { companyId: COMPANY } });
  await prisma.document.deleteMany({ where: { id: DOC } });
  await prisma.company.deleteMany({ where: { id: COMPANY } });
  await prisma.$disconnect();
  if (failures > 0) process.exit(1);
}

async function claimSpecificRowExists(claimKey: string): Promise<boolean> {
  const row = await prisma.claimReviewItem.findUnique({ where: { companyId_claimKey: { companyId: COMPANY, claimKey } } });
  return row !== null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
