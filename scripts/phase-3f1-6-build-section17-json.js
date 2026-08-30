const fs = require("fs");
const fi = JSON.parse(fs.readFileSync("/tmp/phase-3f1-6-section17-fault-injection-results.json", "utf-8"));

const output = {
  schemaVersion: "1.0",
  phaseVersion: "phase-3f1-6-final-foundation-certification.v1",
  artifactId: "INDEPENDENT_VERIFIER_CERTIFICATION",
  generatedAt: new Date().toISOString(),
  section: 17,
  purpose: "Certify genuine independence of Phase 3C semantic verification (lib/contract-model/compiler/semantic-verification/**): no shared-disposition leakage, source-first Layer 1 inventory, correct MATERIAL_DISCREPANCY/REVIEW_REQUIRED routing, and fault-injection against 7 of my own constructed defect classes run through the real verifier.",

  independenceChecks: [
    { check: "No shared sealed-disposition leakage / no same-output reuse masquerading as verification", method: "Read the Independence Contract at the top of semantic-verification/types.ts and independently re-ran tests/contract-model/semantic-verification-independence.test.ts (3 tests, pass) - a static regex-over-import-lines check confirming no file under lib/contract-model/compiler/semantic-verification/** imports lib/contract-model/compiler/semantic/compile.ts (compileCovenantToIR) or semantic/caller.ts's RealSemanticCaller/getSemanticCaller. Layer 1's own source-inventory.ts is independently confirmed (by reading it) to be built from compilerInput.operativeSourceText (raw text) via its own regex-based signal extraction, never from compilationResult.rules/definitions - the compiled IR is read only by ir-inventory.ts, a separate, purely-mechanical flattening step, and the two inventories are reconciled by reconciliation.ts, never one echoing the other's conclusion.", result: "PASS" },
    { check: "Source-first verification - Layer 1's SourceInventory is built independently from raw text, not derived from the compiled IR", method: "Read source-inventory.ts's buildSourceInventory signature and body directly: takes (candidateRef, operativeSourceText, sourceDocumentId, sourceSectionRef, ..., structuralNodeId, supersessionIndex) - no SemanticCompilationResult/IRRule/IRDefinition parameter anywhere in its signature.", result: "PASS" },
    { check: "Contradiction routing - MATERIAL_DISCREPANCY when a real contradiction exists", method: "determineStatus (verify.ts) returns MATERIAL_DISCREPANCY whenever any finding has severity MATERIAL, checked BEFORE any context/operative-state leniency path - confirmed by direct reading and by 6/7 of my own fault-injection cases below reaching this exact status.", result: "PASS" },
    { check: "Material-omission routing", method: "buildAggregateSignals (reconciliation.ts) independently flags source-side condition/exception/shared-cap/entity-scope markers with no corresponding IR item; confirmed via my own missing-amount and sibling-basket-substitution fault-injection cases below (both MISSING_BASKET, MATERIAL).", result: "PASS" },
    { check: "Conservative treatment of uncertainty (VERIFICATION_INCOMPLETE/REVIEW_REQUIRED rather than a false pass)", method: "determineStatus's own ordering: contextBundle.sufficiencyState !== SUFFICIENT -> VERIFICATION_INCOMPLETE; operativeLineage CONFLICTED/REVIEW_REQUIRED or sourceInventory.supersessionStatus === KNOWN_SUPERSEDED -> REVIEW_REQUIRED; UNCERTAIN-severity findings -> REVIEW_REQUIRED - all checked before a clean VERIFIED_* status can be returned. Confirmed directly via my own wrong-operative-version fault-injection case below.", result: "PASS" },
  ],

  faultInjection: {
    methodology: "7 of my OWN adversarial cases (different synthetic fact patterns/numbers than tests/contract-model/semantic-verification-fault-injection.test.ts, which was ALSO independently re-run unmodified as a baseline - see below), each deliberately wrong in exactly ONE way relative to its own source text, constructed as a compiled IRRule/IRDefinition and run through the REAL verifyCompiledCandidate (lib/contract-model/compiler/semantic-verification/verify.ts). Deterministic-tier cases use skipSemanticReview:true (Layer 1 alone, zero cost, matching the existing suite's own DETERMINISTIC_ONLY/SEMANTIC_ONLY/BOTH discipline); scripted-semantic-tier cases use forceSemanticReview:true with a scripted StageCaller returning a hand-authored, correct finding (proving orchestration, not live-model reliability, exactly as the existing suite's own header discloses it does for that tier).",
    testScript: "tests/foundation-audit/section17-verifier-fault-injection.ts (run via npx tsx)",
    baselineRegressionRun: "npx vitest run tests/contract-model/semantic-verification-fault-injection.test.ts tests/contract-model/semantic-verification-independence.test.ts tests/contract-model/adversarial-verification.test.ts tests/contract-model/semantic-verification-verify.test.ts tests/contract-model/semantic-verification-reviewer.test.ts tests/contract-model/semantic-verification-source-inventory.test.ts tests/contract-model/semantic-verification-ir-inventory.test.ts tests/contract-model/semantic-verification-reconciliation.test.ts tests/contract-model/semantic-verification-findings.test.ts -> 9 files, 77 tests, all pass (unmodified baseline).",
    results: fi.results,
    summary: { totalCases: fi.totalCases, caught: fi.caughtCount, missed: fi.missedCount },
  },

  requestedFaultClassesCoverage: {
    "missing amount": "CAUGHT (case: missing-amount)",
    "wrong action": "CAUGHT (case: wrong-action)",
    "wrong scope": "CAUGHT (case: wrong-scope)",
    "omitted condition": "MISSED (case: omitted-condition) - see F17-1 below",
    "sibling-basket substitution": "CAUGHT (case: sibling-basket-substitution)",
    "wrong definition": "CAUGHT (case: wrong-definition)",
    "wrong operative version": "CAUGHT, conservatively (case: wrong-operative-version - routed to REVIEW_REQUIRED, never a false clean pass)",
  },

  findings: [
    {
      id: "F17-1",
      severity: "BLOCKER",
      title: "A single omitted material condition on an otherwise fully dollar-reconciled, single-rule compiled candidate reaches VERIFIED_NO_MATERIAL_GAP_FOUND in real, UNMODIFIED default production routing - neither Layer 1 nor Layer 2 ever examines it",
      location: "lib/contract-model/compiler/semantic-verification/reconciliation.ts (buildAggregateSignals's own `sourceConditionalSignalCount >= 2` threshold) composed with verify.ts's shouldInvokeSemanticReview (skips Layer 2 for 'a single, fully-reconciled, non-alternating compiled unit with no unresolved numeric/structural signal')",
      mechanism: "Layer 1's deterministic aggregate condition/exception signal (the ONLY place a dropped condition could be caught without a model call) requires AT LEAST TWO independent conditional/exception/proviso markers in the source text to fire at all - a documented, deliberate threshold, presumably to avoid false positives on the very common single-condition drafting pattern. When a candidate compiles to exactly ONE rule whose OWN dollar figure matches the source exactly (so Layer 1's numeric reconciliation is fully satisfied) and there is no MAX/MIN/IF/SCHEDULE/UNLIMITED_CAPACITY alternation, shouldInvokeSemanticReview's own conservative V1 routing ALSO skips Layer 2 entirely for that exact shape. The result: a real, material compliance gate (e.g. 'may pay dividends up to $X, so long as no Default has occurred and is continuing') that the compiled IR drops entirely receives ZERO independent scrutiny from either verification layer under real, default (no test-only override) production usage.",
      confirmedByDirectExecution: "tests/foundation-audit/section17-verifier-fault-injection.ts case 'omitted-condition', run TWICE: once with skipSemanticReview:true (Layer 1 alone - correctly expected to miss it, given the >=2 threshold is a disclosed design choice, not itself a bug), and once with NO options overridden at all (verifyCompiledCandidate(input) exactly as production calls it) - semanticReviewInvoked=false, status=VERIFIED_NO_MATERIAL_GAP_FOUND, zero findings, in the SECOND, real-production-shaped call.",
      materialityOfTheGap: "This is precisely the shape the task's own BLOCKER worked example names: 'verifier failing to independently catch an injected material defect.' A single-condition, single-rule, numerically-clean covenant compilation is not a rare or contrived shape - it is one of the most common real drafting patterns in credit agreements (a flat basket gated by one condition), making this a live, not merely theoretical, risk surface.",
      notAFalseCreditIssue: "This is a coverage/detection gap, not a false-credit-generation defect: the verifier does not fabricate a finding or actively mislead about a condition it inspected - it simply never inspects the dimension at all for this shape. Still classified BLOCKER per the task's own explicit BLOCKER example matching this exact failure shape, not downgraded to MAJOR_NON_BLOCKING.",
    },
  ],

  sectionVerdict: "FAIL",
  sectionVerdictRationale: "6 of 7 independently-constructed fault-injection cases (missing amount, wrong action, wrong scope, sibling-basket substitution, wrong definition, wrong/conflicted operative version) are correctly caught by the real verifier, and all 5 independence checks pass, alongside a clean 77-test unmodified baseline run. However, the omitted-condition case demonstrates a genuine, real, default-production-routing gap: a single dropped material condition on an otherwise numerically-clean single-rule candidate receives no independent scrutiny from either verification layer. Per this task's own instruction, a confirmed instance of the named BLOCKER example ('verifier failing to independently catch an injected material defect') is reported as a FAIL for Section 17, not downgraded or suppressed because most other fault classes were caught.",
};

fs.writeFileSync("docs/phase-3f1-6-final-foundation-certification/15-independent-verifier-certification.json", JSON.stringify(output, null, 2) + "\n");
console.log("wrote 15-independent-verifier-certification.json");
