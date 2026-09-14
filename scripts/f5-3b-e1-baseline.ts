/**
 * F-5.3B section 1 / section 6 - E1 BASELINE: rebuild the frozen F-5.1 paid pair's ensemble (E1) deterministically and
 * check it against the F-5.3A record. Zero model calls. Also writes the F-5.3B freeze manifest (hashes of every frozen
 * input). Run once at the starting SHA (section 1, "baseline") and once after the F-5.3B wiring (section 6, "final").
 *   npx tsx scripts/f5-3b-e1-baseline.ts <baseline|final> <outDir>
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { resolveSourceContext } from "../lib/contract-model/compiler/semantic-accountability/source-context";
import { partitionSourceSlots } from "../lib/contract-model/compiler/semantic-accountability/slots";
import { buildEnsembleInventory, canonicalEnsembleJson } from "../lib/contract-model/compiler/semantic-accountability/ensemble";
import { stampVerifiedSourceIdentity } from "../lib/contract-model/compiler/semantic-accountability/source-identity";
import type { FrozenSemanticInventory } from "../lib/contract-model/compiler/semantic-accountability/types";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, SEMANTIC_INVENTORY_PROMPT_VERSION } from "../lib/contract-model/compiler/semantic-accountability/types";

const SRC = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt";
const UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
const DIR = "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-v5";
const F53A = "docs/phase-3-remediation-f5-3";
const EXPECTED = { canonicalItems: 396, corroborated: 282, singleRun: 114, materialSingleRun: 112, conflicted: 0, unaccountedSource: 19, frozenContentHash: "6f648e724520fdc9071c93d80860a5dbb37b5c03f9ae939a16ce2983b3e6d8ed" };
const ORIGINAL_F5_THRESHOLDS = { criticalMaterialSemanticStability: 0.85, semanticStability: 0.8, dangerousSilentOmissions: 0, referenceRecall: "no material degradation vs frozen baseline (1.0)" };

const mode = process.argv[2] ?? "baseline";
const out = process.argv[3] ?? "docs/phase-3-remediation-f5-3b";
mkdirSync(out, { recursive: true });
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const gitSha = execSync("git rev-parse HEAD").toString().trim();

const text = readFileSync(SRC, "utf-8");
const nodes = runStructureStage([{ documentId: "doc-a", label: "chwy", text }]).output;
const index = buildStructuralIndex(new Map([["doc-a", { text, nodes }]]), detectStructuralDefinitions("doc-a", text, nodes), detectStructuralReferences("doc-a", text, nodes));
const section = nodes.filter((n) => n.nodeType === "SECTION" && n.sectionRef === "6.08").sort((a, b) => b.charEnd - b.charStart - (a.charEnd - a.charStart))[0]!;
const sourceContext = resolveSourceContext({ index, documentId: "doc-a", operativeSourceText: text.slice(section.charStart, section.charEnd), anchorNodeId: section.nodeId, operativeCharStart: section.charStart, documentText: text });
const partition = partitionSourceSlots({ sourceContext, structuralIndex: index });
const unit = JSON.parse(readFileSync(UNIT, "utf-8"));
if (unit.compile.sourceContext.regions[0].text !== sourceContext.regions[0]!.text) throw new Error("6.08 operative region drifted from the frozen unit");
const rawA = JSON.parse(readFileSync(`${DIR}/run-A.json`, "utf-8")) as FrozenSemanticInventory;
const rawB = JSON.parse(readFileSync(`${DIR}/run-B.json`, "utf-8")) as FrozenSemanticInventory;
// "baseline" = the starting-SHA construction (no identity migration, no compatibility gate - the API ignored the block).
// "final"    = the F-5.3B production construction: pre-F-5.3B evidence verified by the re-anchoring migration, then STRICT.
const runA = mode === "final" ? stampVerifiedSourceIdentity(rawA, sourceContext, partition, () => "2026-09-09T00:00:00.000Z") : rawA;
const runB = mode === "final" ? stampVerifiedSourceIdentity(rawB, sourceContext, partition, () => "2026-09-09T00:00:00.000Z") : rawB;
const build = (passes: { passId: string; inventory: FrozenSemanticInventory }[]) => buildEnsembleInventory({ candidateRef: runA.candidateRef, sourceContext, structuralIndex: index, partition, passes, ...(mode === "final" ? { compatibility: { mode: "STRICT" as const } } : {}) });
const AB = build([{ passId: "pass-1", inventory: runA }, { passId: "pass-2", inventory: runB }]);
const BA = build([{ passId: "pass-2", inventory: runB }, { passId: "pass-1", inventory: runA }]);
const c = AB.ensemble.counts;
const observed = { canonicalItems: c.canonicalItems, corroborated: c.corroborated, singleRun: c.singleRun, materialSingleRun: c.materialSingleRun, conflicted: c.conflicted, unaccountedSource: AB.unaccountedSource.length, frozenContentHash: AB.frozenContentHash };
const mismatches = Object.entries(EXPECTED).filter(([k, v]) => (observed as Record<string, unknown>)[k] !== v).map(([k, v]) => ({ field: k, expected: v, observed: (observed as Record<string, unknown>)[k] }));
const orderIndependent = canonicalEnsembleJson(AB) === canonicalEnsembleJson(BA) && AB.frozenContentHash === BA.frozenContentHash;
writeFileSync(`${out}/e1-${mode}.json`, JSON.stringify(AB, null, 1));

const manifest = {
  artifact: `F-5.3B freeze manifest + E1 ${mode} reproduction (0 model calls)`,
  mode,
  gitSha,
  startingSha: "9addb29e3ccc1102c1f64a66f55663da965734fc",
  hashes: {
    ensembleTs: sha("lib/contract-model/compiler/semantic-accountability/ensemble.ts"),
    typesTs: sha("lib/contract-model/compiler/semantic-accountability/types.ts"),
    inventoryTs: sha("lib/contract-model/compiler/semantic-accountability/inventory.ts"),
    slotsTs: sha("lib/contract-model/compiler/semantic-accountability/slots.ts"),
    semanticFunctionsTs: sha("lib/contract-model/compiler/semantic-accountability/semantic-functions.ts"),
    sourceCoverageTs: sha("lib/contract-model/compiler/semantic-accountability/source-coverage.ts"),
    promptTs: sha("lib/contract-model/compiler/semantic-accountability/prompt.ts"),
    wireSchemaTs: sha("lib/contract-model/compiler/semantic-accountability/wire-schema.ts"),
    runA: sha(`${DIR}/run-A.json`),
    runB: sha(`${DIR}/run-B.json`),
    pair: sha(`${DIR}/pair.json`),
    ledger: sha(`${DIR}/ledger.json`),
    e1F53A: sha(`${F53A}/policy-canonical-union.json`),
    f53aEvaluation: sha(`${F53A}/02-ensemble-evaluation.json`),
    f53aFinalSummary: sha(`${F53A}/06-final-summary.json`),
    chewySource: sha(SRC),
    frozenUnit608: sha(UNIT),
    sourceIdentityTs: sha("lib/contract-model/compiler/semantic-accountability/source-identity.ts"),
    dualPassTs: sha("lib/contract-model/compiler/semantic-accountability/dual-pass.ts"),
    humanReference: sha("docs/phase-3-validation/04-human-reference-set.json"),
    canonicalScorer: sha("scripts/f5-1-canonical-score.py"),
    legacyScorer: sha("scripts/f5-align-runs.py"),
    referenceScorer: sha("scripts/f5-reference-recall.py"),
    originalF5Summary: sha("docs/phase-3-remediation-f5/10-certification-summary.json"),
    f52aFCases: sha("docs/phase-3-remediation-f5-2/01-f-cases.json"),
    f52aBHCases: sha("docs/phase-3-remediation-f5-2/02-b-h-cases.json"),
  },
  partition: { slots: partition.slots.length, methods: partition.methods, unitChars: sourceContext.regions[0]!.text.length, regions: sourceContext.regions.length, state: sourceContext.state, anchor: { nodeId: section.nodeId, charStart: section.charStart, charEnd: section.charEnd } },
  versions: { accountabilityAlgorithm: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, inventoryPrompt: SEMANTIC_INVENTORY_PROMPT_VERSION, runA: { algorithm: runA.algorithmVersion, prompt: runA.promptVersion, provider: runA.provider, model: runA.model, hash: runA.frozenContentHash, items: runA.items.length }, runB: { algorithm: runB.algorithmVersion, prompt: runB.promptVersion, provider: runB.provider, model: runB.model, hash: runB.frozenContentHash, items: runB.items.length } },
  originalF5Thresholds: ORIGINAL_F5_THRESHOLDS,
  e1: { expected: EXPECTED, observed, mismatches, reproduced: mismatches.length === 0, orderIndependent, sourceIdentity: { runA: runA.sourceIdentity ?? null, runB: runB.sourceIdentity ?? null, ensemble: AB.sourceIdentity ?? null }, algorithmVersion: AB.algorithmVersion, supportReviewRequired: AB.ensemble.supportReviewRequired, supportReviewFraction: AB.ensemble.supportReviewFraction, singleRunByPass: c.singleRunByPass, accountedCharFraction: AB.sourceCoverage.accountedCharFraction, uninventoriedValues: AB.uninventoriedValues.length, inventoryStatus: AB.inventoryStatus, compatibility: (AB.ensemble as unknown as { compatibility?: unknown }).compatibility ?? null },
};
writeFileSync(`${out}/${mode === "baseline" ? "00-freeze-manifest-and-e1-baseline" : "06-e1-rebuilt-final-code"}.json`, JSON.stringify(manifest, null, 1));
console.log(JSON.stringify({ mode, gitSha, e1: manifest.e1 }, null, 1));
if (mismatches.length > 0) { console.error("E1 NOT REPRODUCED"); process.exit(2); }
