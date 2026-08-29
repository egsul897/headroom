/**
 * Evaluation Methodology V2 — developer inspection runner (no artifacts).
 *
 * Prints the derived signals for named ground-truth units and the top
 * candidates generated for them, so the deterministic layers can be inspected
 * directly during development.
 *
 * Run: npx tsx lib/contract-model/evaluation-v2/runner/debug-unit.ts <gtUnitId> [...]
 */
import { loadDsgrDataset } from "../adapters/dsgr";
import { buildCandidateIndex, DEFAULT_GENERATION_OPTIONS, generateCandidatePairs } from "../candidate-generation";
import { evaluatePair, signalsForGroundTruth } from "../semantic-correspondence";

function main(): void {
  const wanted = process.argv.slice(2);
  const dataset = loadDsgrDataset(process.cwd());
  const index = buildCandidateIndex(dataset.candidates);
  const byId = new Map(dataset.candidates.map((c) => [c.candidateId, c]));

  for (const id of wanted) {
    const gt = dataset.groundTruth.find((g) => g.gtUnitId === id);
    if (!gt) {
      console.log(`${id}: NOT FOUND`);
      continue;
    }
    const s = signalsForGroundTruth(gt);
    console.log(`\n=== ${gt.gtUnitId} (${gt.materiality}, ${gt.unitType}) sectionRef=${gt.sectionRef}`);
    console.log(`  excerptResolution=${gt.sourceExcerptResolution}`);
    console.log(`  description: ${gt.semanticDescription.slice(0, 260)}`);
    console.log(`  excerpt: ${gt.sourceExcerpt.slice(0, 260).replace(/\n/g, " ")}`);
    console.log(`  role=${gt.provisionRole} posture=${gt.legalPosture} family=${gt.semanticFamily}`);
    console.log(`  actions=${gt.action.join(",")} objects=${gt.objectResource.join(",")} scope=${gt.scope.join(",")}`);
    console.log(`  figures=${gt.figures.map((f) => `${f.kind}:${f.value}${f.basis ? "/" + f.basis : ""}`).join(",")} conditions=${gt.conditions.join(",")}`);
    console.log(`  capStructure=${s.capStructure} metrics=${s.metrics.join(",")}`);

    const pairs = generateCandidatePairs(gt, s, index, DEFAULT_GENERATION_OPTIONS);
    console.log(`  generated ${pairs.length} pairs`);
    for (const p of pairs.slice(0, 8)) {
      const c = byId.get(p.candidateId);
      if (!c) continue;
      const a = evaluatePair({ gt, candidate: c, generationReasons: p.reasons, gtSignals: s }, { deterministicOnly: true }, null);
      console.log(`   - ${p.candidateId} [${c.representationType}/${c.accountingRole} doc=${c.documentId} ref=${c.sectionRef}]`);
      console.log(`     reasons=${p.reasons.join(",")} => ${a.correspondence} (${a.correspondenceStrength})`);
      console.log(`     role=${c.provisionRole} posture=${c.legalPosture} family=${c.semanticFamily} actions=${c.action.join(",")}`);
      console.log(`     text: ${(c.excerpts[0] ?? c.normalizedSemantics).slice(0, 200).replace(/\n/g, " ")}`);
      console.log(`     ${a.reason.slice(0, 300)}`);
    }
  }
}

main();
