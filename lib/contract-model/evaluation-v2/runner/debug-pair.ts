/**
 * Evaluation Methodology V2 — developer pair inspector for synthetic text.
 *
 * Builds a ground-truth unit and a candidate from two raw strings and prints
 * the full Layer 1-3 output for the pair. Used while developing the
 * deterministic rules; produces no artifact.
 *
 * Run: npx tsx lib/contract-model/evaluation-v2/runner/debug-pair.ts "<gt text>" "<candidate text>" [gtDocId] [candDocId]
 */
import { buildCandidate, buildGroundTruthUnit, EMPTY_SELF_REPORT } from "../adapters/common";
import { extractSignals } from "../signals";
import { evaluatePair } from "../semantic-correspondence";

function main(): void {
  const [gtText, candText, gtDoc = "doc-x", candDoc = "doc-x"] = process.argv.slice(2);
  if (!gtText || !candText) {
    console.log("usage: debug-pair.ts <gt text> <candidate text> [gtDocId] [candDocId]");
    return;
  }
  const unit = buildGroundTruthUnit({
    gtUnitId: "debug-gt",
    datasetKey: "debug",
    packageKey: "debug",
    documentId: gtDoc,
    sectionRef: "0.00",
    articleRef: null,
    sourceExcerpt: gtText,
    sourceExcerptResolution: "PROVIDED_BY_GROUND_TRUTH",
    semanticDescription: gtText,
    materiality: "CRITICAL",
    unitType: "COVENANT",
    referencedDefinedTerms: [],
    materialDependencies: [],
    operativeStateAssumption: gtDoc,
    adjudication: { kind: "UNKNOWN_PROVENANCE", sourceStatement: "debug", authoredAt: null, sourceArtifactPath: "debug", externallyHumanReviewed: false },
    notes: null,
  });
  const cand = buildCandidate({
    candidateId: "debug-candidate",
    datasetKey: "debug",
    packageKey: "debug",
    documentId: candDoc,
    sectionRef: "0.00",
    representationType: "SYNTHETIC_TEST_CANDIDATE",
    accountingRole: "SUBSTANTIVE_REPRESENTATION",
    excerpts: [candText],
    normalizedSemantics: candText,
    provisionRoleDeclared: null,
    declaredFamily: null,
    formulaSemantics: null,
    dependencyRefs: [],
    referencedDefinedTerms: [],
    selfReportedState: { ...EMPTY_SELF_REPORT },
    operativeProvenance: { documentId: candDoc, operativeVersionRef: null, sourceCitation: null },
    provenancePath: "debug",
  });

  console.log("GT      :", { role: unit.provisionRole, breadth: unit.provisionBreadth, posture: unit.legalPosture, family: unit.semanticFamily, actions: unit.action, scope: unit.scope, instrument: unit.instrument, figures: unit.figures.map((f) => `${f.kind}:${f.value}/${f.basis ?? ""}`) });
  console.log("CAND    :", { role: cand.provisionRole, breadth: cand.provisionBreadth, posture: cand.legalPosture, family: cand.semanticFamily, actions: cand.action, scope: cand.scope, instrument: cand.instrument, figures: cand.figures.map((f) => `${f.kind}:${f.value}/${f.basis ?? ""}`) });

  const assessment = evaluatePair(
    { gt: unit, candidate: cand, generationReasons: ["EXPLICIT_TEST_PAIRING"], gtSignals: extractSignals({ text: gtText }), candidateSignals: extractSignals({ text: candText }) },
    { deterministicOnly: true },
    null,
  );
  console.log("RESULT  :", assessment.correspondence, assessment.correspondenceStrength);
  for (const d of assessment.dimensions) console.log(`  ${d.dimension}: ${d.outcome} (required=${d.requiredByGroundTruth})`);
  for (const c of assessment.conflicts) console.log(`  CONFLICT ${c.severity} ${c.code} [${c.dimension}]: ${c.explanation.slice(0, 200)}`);
}

main();
