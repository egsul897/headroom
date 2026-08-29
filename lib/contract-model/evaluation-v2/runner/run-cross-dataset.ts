/**
 * Evaluation Methodology V2 — cross-dataset generalization runner.
 *
 * Phase 3F.1.5. Runs the EXACT SAME, NOW-FROZEN engine against FWRG, LSB and
 * CONMED. The purpose is evaluator GENERALITY, not product validation: does the
 * scoring machinery behave sensibly across different drafting styles
 * (single-document credit agreement with a rich analyzer run; ABL drafting with
 * Payment Conditions; an amendment-heavy multi-document package)?
 *
 * There are ZERO package-specific patches. If something looks wrong on one of
 * these, that is a finding about V2's generality or about that package's own
 * known gaps — never something to code around.
 *
 * Writes: 09-cross-dataset-generalization.json
 * Run: npx tsx lib/contract-model/evaluation-v2/runner/run-cross-dataset.ts
 */
import { loadConmedDataset, loadFwrgDataset, loadLsbDataset } from "../adapters/legacy-package";
import type { LegacyDataset } from "../adapters/legacy-package";
import { buildEvidencePacket } from "../evidence";
import { runEvaluationV2 } from "../index";
import type { EvaluationRunResult } from "../types";
import { artifactHeader, packetSummary, trimUnit, writeArtifact } from "./artifacts";

export interface CrossDatasetOutput {
  runs: { datasetKey: string; result: EvaluationRunResult; dataset: LegacyDataset }[];
  writtenArtifacts: { path: string; sha256: string; bytes: number }[];
}

const DRAFTING_STYLE: Record<string, string> = {
  "fwrg-2021-credit-agreement":
    "Single-document sponsor-style credit agreement with greater-of grower baskets and an Available Amount builder. Candidate pool includes a real analyzer run's rule/defined-term output, so substantive representations actually exist here.",
  "lsb-2023-abl-credit-agreement":
    "ABL drafting: Payment Conditions as a reused named condition, availability tests, and an out-of-package intercreditor joinder. Tests whether qualitative, non-numeric gates are handled without falling back to numeric matching.",
  "conmed-2025-credit-facility":
    "Amendment-heavy four-document package including an amendment to a document that is deliberately NOT in the package. Candidate pool is discovery inventory plus independent coverage-audit findings — there is no compiled representation layer at all, which is exactly the case where a proximity-based scorer would manufacture credit.",
};

export async function runCrossDataset(repoRoot: string): Promise<CrossDatasetOutput> {
  const datasets: LegacyDataset[] = [loadFwrgDataset(repoRoot), loadLsbDataset(repoRoot), loadConmedDataset(repoRoot)];
  const runs: CrossDatasetOutput["runs"] = [];

  for (const dataset of datasets) {
    const result = await runEvaluationV2(dataset.groundTruth, dataset.candidates, {
      datasetKey: dataset.datasetKey,
      inputHashes: dataset.inputHashes,
    });
    runs.push({ datasetKey: dataset.datasetKey, result, dataset });
  }

  const perDataset = runs.map(({ datasetKey, result, dataset }) => {
    const gtById = new Map(dataset.groundTruth.map((g) => [g.gtUnitId, g]));
    const candidatesById = new Map(dataset.candidates.map((c) => [c.candidateId, c]));
    return {
      datasetKey,
      draftingStyle: DRAFTING_STYLE[datasetKey] ?? "",
      groundTruthUnits: dataset.groundTruth.length,
      candidatePool: dataset.candidates.length,
      droppedContentFreeCandidates: dataset.droppedContentFreeCandidates,
      inputHashes: dataset.inputHashes,
      metrics: result.metrics,
      performance: result.performance,
      units: result.units.map((u) => {
        const gt = gtById.get(u.gtUnitId);
        return trimUnit(u, gt?.sourceExcerpt ?? "", gt?.semanticDescription ?? "", gt?.sourceExcerptResolution ?? "UNRESOLVED_DESCRIPTION_ONLY", candidatesById, 3);
      }),
      // Categorized so the exact/composite evidence packets DSGR cannot supply
      // (its first-blind run produced almost no substantive representations)
      // are available here instead.
      evidencePacketsByCategory: Object.fromEntries(
        (
          [
            ["truePositiveExactSingle", (u: (typeof result.units)[number]) => u.matchStatus === "EXACT_SINGLE"],
            ["truePositiveExactComposite", (u: (typeof result.units)[number]) => u.matchStatus === "EXACT_COMPOSITE"],
            ["partialMatches", (u: (typeof result.units)[number]) => u.matchStatus === "PARTIAL"],
            ["unrepresented", (u: (typeof result.units)[number]) => u.matchStatus === "UNREPRESENTED"],
            ["honestlyUnresolvedOrUnsupported", (u: (typeof result.units)[number]) => u.matchStatus === "HONESTLY_UNRESOLVED" || u.matchStatus === "HONESTLY_UNSUPPORTED"],
            ["ambiguous", (u: (typeof result.units)[number]) => u.matchStatus === "AMBIGUOUS"],
            ["contradictory", (u: (typeof result.units)[number]) => u.matchStatus === "CONTRADICTORY"],
          ] as const
        ).map(([name, predicate]) => [
          name,
          result.units
            .filter(predicate)
            .slice(0, 10)
            .map((u) => {
              const gt = gtById.get(u.gtUnitId);
              if (!gt) return null;
              return packetSummary(buildEvidencePacket({ gt, result: u, candidatesById, maxCandidates: 4, excerptCharLimit: 900 }));
            })
            .filter(Boolean),
        ]),
      ),
    };
  });

  const written = [
    writeArtifact(repoRoot, "09-cross-dataset-generalization.json", {
      ...artifactHeader(
        "PHASE_3F_1_5_CROSS_DATASET_GENERALIZATION",
        "The frozen Evaluation V2 engine run unchanged against FWRG, LSB and CONMED. Purpose: evaluator generality across drafting styles, not product validation. Zero package-specific logic exists anywhere in the engine.",
      ),
      packageStatusDisclosure:
        "FWRG, LSB and CONMED are permanent regression evidence, never unseen packages (architecture invariant #28). Nothing here re-labels them, and their historical verdicts are untouched.",
      engineFreezeDisclosure: {
        honestStatement:
          "This is NOT a fully blind generalization test, and it is not presented as one. Three GENERAL engine refinements were made after a first cross-dataset execution was inspected, and the engine was frozen only afterwards.",
        refinementsMadeAfterSeeingCrossDatasetOutput: [
          "The object/resource dimension switched from asymmetric containment to the overlap coefficient (normalized by the smaller vocabulary). Motivation: a correct but terse candidate excerpt was being scored as a material conflict against a paragraph-long adjudicated description purely for brevity. General measurement fix; applies identically to every dataset including DSGR.",
          "FINANCIAL_TEST / RATIO_TEST were removed from the declared-type → posture map. Motivation: a ratio test is a measurement, not a deontic statement, and inferring PROHIBITION from the label alone manufactured a posture inversion out of a labelling choice. General correctness fix.",
          "Every material object/resource conflict now leaves an explicit conflict FINDING behind, so no dimension can fail without recorded evidence. Evidence-completeness fix, not a threshold change.",
        ],
        whatWasNotChanged:
          "No threshold, pattern, tag vocabulary or decision rule was keyed to any package, document, section number, figure or ground-truth unit id. There is no branch anywhere in the engine that tests which dataset it is running on.",
        afterFreeze: "The DSGR reconciliation, the false-credit gate and these three runs were all re-executed on the frozen engine, and the results published here are from that frozen run.",
      },
      datasets: perDataset,
      generalitySummary: perDataset.map((d) => ({
        datasetKey: d.datasetKey,
        groundTruthUnits: d.groundTruthUnits,
        candidatePool: d.candidatePool,
        byMatchStatus: d.metrics.byMatchStatus,
        combinedCriticalMaterialRecall: d.metrics.combinedCriticalMaterialRecall.rate,
        dangerousUnaccountedCount: d.metrics.dangerousUnaccountedCount,
        inventoryOnlySurfacedRate: d.metrics.inventoryOnlySurfacedRate.rate,
        candidateGenerationPrecision: d.metrics.candidateGenerationPrecision.rate,
      })),
    }),
  ];

  return { runs, writtenArtifacts: written };
}

if (process.argv[1] && process.argv[1].endsWith("run-cross-dataset.ts")) {
  void runCrossDataset(process.cwd()).then((out) => {
    for (const r of out.runs) {
      console.log(`${r.datasetKey}: ${r.result.units.length} units, ${r.result.performance.candidateCount} candidates`);
      console.log(`  byMatchStatus`, r.result.metrics.byMatchStatus);
      console.log(`  dangerous=${r.result.metrics.dangerousUnaccountedCount} recall=${r.result.metrics.combinedCriticalMaterialRecall.rate}`);
    }
    for (const a of out.writtenArtifacts) console.log(`  wrote ${a.path} (${a.bytes} bytes)`);
  });
}
