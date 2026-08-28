/**
 * Foundation Audit (adversarial) - Section 14 live probe. READ-ONLY
 * exploration script, not part of any production pipeline. Tests whether
 * operative-state.ts's OPERATIVE_STATE_RESOLVED can be reached for a
 * provision whose amendment TARGET never uniquely (or at all) resolved
 * against the base document's real structural index - i.e. whether a
 * verbatim `newText` captured from the amendment's own source is enough to
 * mask a target-resolution failure that should instead surface as
 * REVIEW_REQUIRED/PARTIAL/UNRESOLVED.
 */
import { parseDocumentStructure } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { computeOperativeContractState } from "../lib/contract-model/compiler/amendment/operative-state";
import type { AmendmentEffectCandidate } from "../lib/contract-model/compiler/amendment/types";

const baseDocumentId = "base-doc";
// Two PHYSICALLY DISTINCT sections both legitimately labeled "6.05" - a
// real, disclosed-as-normal drafting/extraction reality per 3F.1.2's own
// DUPLICATE_LABEL_EXPECTED finding (I2). resolveUniqueNodeByRef must report
// AMBIGUOUS for "6.05" in this document.
const baseText = `
ARTICLE VI COVENANTS

Section 6.04 Limitation on Distributions . Neither party shall make any Restricted Payment except a Restricted Payment permitted under this Agreement.

Section 6.05 Affiliate Transactions . Neither party shall enter into any transaction with an Affiliate involving $1,000,000 or more without approval.

Section 6.06 Liens . Neither party shall grant Liens except Permitted Liens.

Schedule A - Cross-Reference Appendix

Section 6.05 Affiliate Transactions . A second, physically distinct occurrence of the identical legal reference, preserved verbatim from a real cross-reference appendix restating the operative section for convenience.
`.trim();

const nodes = parseDocumentStructure({ documentId: baseDocumentId, label: baseDocumentId, text: baseText });
const index = buildStructuralIndex(new Map([[baseDocumentId, { text: baseText, nodes }]]), [], []);

console.log("=== resolveUniqueNodeByRef(base, '6.05') ===");
console.log(index.resolveUniqueNodeByRef(baseDocumentId, "6.05"));

const instrumentKey = "instrument:base-doc";

function makeEffect(overrides: Partial<AmendmentEffectCandidate>): AmendmentEffectCandidate {
  return {
    effectId: "effect-1",
    amendmentDocumentId: "amendment-doc",
    target: {
      kind: "SECTION",
      targetDocumentId: baseDocumentId,
      targetInstrumentKey: instrumentKey,
      targetStructuralNodeKey: null,
      targetSectionRef: "6.05",
      targetDefinedTermRef: null,
      targetHint: null,
    },
    operation: "REPLACE_TEXT",
    effectiveDate: { date: "2020-01-01", status: "EXPLICIT_EFFECTIVE_DATE", evidence: "shall be effective as of January 1, 2020", reason: "explicit effective date clause" },
    newText: "Section 6.05 Affiliate Transactions . Neither party shall enter into any transaction with an Affiliate involving $2,500,000 or more without approval, as amended.",
    oldText: null,
    sourceCitation: "amendment-doc::Section 2",
    sourceExcerpt: "Section 6.05 of the Agreement is hereby amended and restated to read as follows: ...",
    confidence: 0.9,
    status: "RESOLVED",
    unresolvedReason: null,
    resolutionMethod: "DETERMINISTIC_EXPLICIT_PATTERN",
    ...overrides,
  };
}

console.log("\n=== SCENARIO A: amendment target is AMBIGUOUS (2 physical occurrences share '6.05') and the effect carries verbatim newText, status RESOLVED, dated in the past ===");
const effectA = makeEffect({});
const stateA = computeOperativeContractState({ instrumentKey, baseDocumentId, asOfDate: "2021-01-01", index, allEffects: [effectA] });
console.log(JSON.stringify(stateA, null, 2));

console.log("\n=== SCENARIO B: amendment target does not exist AT ALL ('6.99'), same otherwise ===");
const effectB = makeEffect({ effectId: "effect-2", target: { ...effectA.target, targetSectionRef: "6.99" } });
const stateB = computeOperativeContractState({ instrumentKey, baseDocumentId, asOfDate: "2021-01-01", index, allEffects: [effectB] });
console.log(JSON.stringify(stateB, null, 2));

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify({
  scenarioA_targetWasAmbiguous: index.resolveUniqueNodeByRef(baseDocumentId, "6.05").status === "AMBIGUOUS",
  scenarioA_finalPackageStatus: stateA.status,
  scenarioA_provisionStatus: stateA.provisions[0]?.status,
  scenarioA_currentText: stateA.provisions[0]?.currentText,
  scenarioA_unresolvedIssues: stateA.provisions[0]?.unresolvedIssues,
  scenarioB_targetWasNotFound: index.resolveUniqueNodeByRef(baseDocumentId, "6.99").status === "NOT_FOUND",
  scenarioB_finalPackageStatus: stateB.status,
  scenarioB_provisionStatus: stateB.provisions[0]?.status,
  scenarioB_currentText: stateB.provisions[0]?.currentText,
  scenarioB_unresolvedIssues: stateB.provisions[0]?.unresolvedIssues,
}, null, 2));

// ---------------------------------------------------------------------------
// Does the "independent verification" layer catch what operative-state.ts
// missed?
// ---------------------------------------------------------------------------
import { verifyAmendmentEffectsIndependently } from "../lib/contract-model/compiler/amendment/independent-verification";

console.log("\n=== independent-verification.ts re-check of both scenarios ===");
const verification = verifyAmendmentEffectsIndependently([effectA, effectB], [{ documentId: baseDocumentId, text: baseText, label: baseDocumentId }, { documentId: "amendment-doc", text: effectA.sourceExcerpt + " " + effectA.newText, label: "amendment-doc" }], index);
console.log(JSON.stringify(verification, null, 2));
