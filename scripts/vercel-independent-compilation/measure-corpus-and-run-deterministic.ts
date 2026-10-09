/**
 * Data-production measurement + deterministic vertical slice over available
 * real package texts. Zero paid inference. Writes measured JSON under
 * docs/vercel-independent-covenant-compilation/ (not bulk document bodies).
 *
 * Usage:
 *   npx tsx scripts/vercel-independent-compilation/measure-corpus-and-run-deterministic.ts
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { extractDeterministicCovenantFacts } from "../../lib/contract-model/compiler/deterministic-extraction";
import { planSelectiveCompilation, type InventoryProvision } from "../../lib/contract-model/compiler/selective-compilation";
import { compileLocalSemanticUnit } from "../../lib/contract-model/compiler/local-semantic";
import { VicRunStore } from "../../lib/contract-model/compiler/inference/run-store";
import { runScaleBenchmark } from "../../lib/contract-model/compiler/inference/scale-benchmark";
import { detectDefectsFromOutput, appendEngineeringLedger, generateAdversarialCasesFromDefects } from "../../lib/contract-model/compiler/inference/adversarial-quality";
import { runModelComparison } from "../../lib/contract-model/compiler/inference/model-comparison";
import { InferenceRegistry } from "../../lib/contract-model/compiler/inference";
import { OfflineReplayAdapter } from "../../lib/contract-model/compiler/inference/adapters/replay";

const REPO = process.cwd();
const OUT = join(REPO, "docs/vercel-independent-covenant-compilation");
const DATA = join(REPO, "covenant-knowledge-data/session-run");
const FIX = join(REPO, "tests/fixtures/unseen-packages");

const REAL_PACKAGES = [
  "chwy-2026-credit-agreement",
  "conmed-2025-credit-facility",
  "dsgr-2022-2025-credit-facility",
  "fwrg-2021-credit-agreement",
  "gibraltar-2026-credit-agreement",
  "lsb-2023-abl-credit-agreement",
  "riot-2025-2026-credit-facility",
  "final-lightweight-unseen-sup",
] as const;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function collectTextDocs(): { packageKey: string; documentId: string; path: string; chars: number; text: string; isRawHtml: boolean }[] {
  const docs: { packageKey: string; documentId: string; path: string; chars: number; text: string; isRawHtml: boolean }[] = [];
  for (const pkg of REAL_PACKAGES) {
    const base = join(FIX, pkg);
    if (!existsSync(base)) continue;
    const files = walk(base).filter((f) => /\.(txt|htm|html)$/i.test(f));
    for (const f of files) {
      const rel = relative(FIX, f);
      const isRaw = /raw-html|raw-source|\/raw\//.test(f);
      const isText = /extracted-text|curated|article-|definitions-|intercreditor|credit-agreement\.txt/.test(f);
      if (!isRaw && !isText) continue;
      // Prefer extracted/curated text for deterministic processing; still count raw as acquired docs.
      if (isRaw && !isText) {
        docs.push({ packageKey: pkg, documentId: rel, path: f, chars: statSync(f).size, text: "", isRawHtml: true });
        continue;
      }
      const text = readFileSync(f, "utf8");
      if (text.length < 200) continue;
      docs.push({ packageKey: pkg, documentId: rel, path: f, chars: text.length, text, isRawHtml: false });
    }
  }
  return docs;
}

function splitProvisions(docId: string, text: string): InventoryProvision[] {
  // Lightweight section splitter for inventory — not a replacement for Phase 2A structural index.
  const parts = text.split(/(?=\n\s*(?:Section|SECTION)\s+\d+)/g).filter((p) => p.trim().length > 80);
  const provisions: InventoryProvision[] = [];
  const chunks = parts.length > 1 ? parts : [text.slice(0, Math.min(text.length, 50_000))];
  chunks.slice(0, 200).forEach((chunk, i) => {
    const m = chunk.match(/(?:Section|SECTION)\s+([\d.]+(?:\([a-z0-9]+\))?)/);
    const sectionRef = m?.[1] ?? `chunk-${i + 1}`;
    const roles: string[] = [];
    if (/shall not|may not|prohibit/i.test(chunk)) roles.push("GENERAL_PROHIBITION");
    if (/provided that|except/i.test(chunk)) roles.push("EXCEPTION");
    if (/Leverage Ratio|Coverage Ratio/i.test(chunk)) roles.push("FINANCIAL_TEST");
    if (/\bmeans\b/.test(chunk) && /“|"/.test(chunk)) roles.push("DEFINITIONAL_DEPENDENCY_CANDIDATE");
    if (/in the aggregate|Combined Cap|shared/i.test(chunk)) roles.push("SHARED_CAP");
    provisions.push({
      unitId: `${docId}::${sectionRef}::${i}`,
      documentId: docId,
      sectionRef,
      text: chunk.slice(0, 20_000),
      roles,
      isSeed: roles.includes("GENERAL_PROHIBITION") || roles.includes("FINANCIAL_TEST") || roles.includes("SHARED_CAP"),
      definitionTerms: [...chunk.matchAll(/[“"]([A-Z][^”"]{1,60})[”"]\s+means/g)].map((x) => x[1]!),
    });
  });
  return provisions;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(DATA, { recursive: true });
  const started = Date.now();
  const allDocs = collectTextDocs();
  const rawAcquired = allDocs.filter((d) => d.isRawHtml);
  const processable = allDocs.filter((d) => !d.isRawHtml && d.text.length > 0);

  // Accession filings from READMEs (measured string matches)
  const accessionSet = new Set<string>();
  const issuers = new Set<string>();
  for (const pkg of REAL_PACKAGES) {
    const readme = join(FIX, pkg, "README.md");
    if (!existsSync(readme)) continue;
    const t = readFileSync(readme, "utf8");
    for (const m of t.matchAll(/(\d{10}-\d{2}-\d{6})/g)) accessionSet.add(m[1]!);
    issuers.add(pkg.split("-")[0]!);
  }
  // Gibraltar urls.txt accessions
  const gibUrls = join(FIX, "gibraltar-2026-credit-agreement/retrieval/urls.txt");
  if (existsSync(gibUrls)) {
    for (const m of readFileSync(gibUrls, "utf8").matchAll(/(\d{10}-\d{2}-\d{6})/g)) accessionSet.add(m[1]!);
  }

  const store = new VicRunStore({ rootDir: join(DATA, "knowledge") });
  let provisionCount = 0;
  let factCount = 0;
  let hypothesisCount = 0;
  let definitionFacts = 0;
  let xrefFacts = 0;
  let compileUnits = 0;
  let omitted = 0;
  const scaleDocs: { documentId: string; provisions: InventoryProvision[] }[] = [];
  const falsePermissionDefects: string[] = [];

  for (const doc of processable) {
    const provisions = splitProvisions(doc.documentId, doc.text);
    provisionCount += provisions.length;
    scaleDocs.push({ documentId: doc.documentId, provisions });
    const plan = planSelectiveCompilation({
      provisions,
      seedUnitIds: provisions.filter((p) => p.isSeed).slice(0, 20).map((p) => p.unitId),
      maxCompileUnits: 40,
    });
    compileUnits += plan.stats.compileCount;
    omitted += plan.omitted.length;

    for (const p of provisions) {
      const extracted = extractDeterministicCovenantFacts({
        text: p.text,
        documentId: doc.documentId,
        candidateRef: p.unitId,
        citation: p.sectionRef,
        knownDefinitions: p.definitionTerms,
      });
      factCount += extracted.facts.length;
      hypothesisCount += extracted.hypotheses.length;
      definitionFacts += extracted.facts.filter((f) => f.kind === "DEFINITION").length;
      xrefFacts += extracted.facts.filter((f) => f.kind === "CROSS_REFERENCE").length;
      store.put({
        recordId: `det:${p.unitId}`,
        kind: "DETERMINISTIC_FACT",
        companyId: doc.packageKey,
        packageKey: doc.packageKey,
        instrumentKey: null,
        documentId: doc.documentId,
        candidateRef: p.unitId,
        verificationStatus: "UNVERIFIED",
        modelGenerated: false,
        body: { inventory: extracted.inventory, factCount: extracted.facts.length },
        uncertainty: extracted.hypotheses.map((h) => h.claim),
        dependencies: extracted.inventory.crossReferences,
        invalidatedBy: null,
        reviewerDecision: null,
        provenance: {
          sourceSpans: extracted.facts.slice(0, 3).map((f) => ({
            documentId: f.source.documentId,
            citation: f.source.citation,
            excerpt: f.source.excerpt,
          })),
          compilerVersion: "deterministic-covenant-extraction.v1",
          inferenceMode: "DETERMINISTIC_ONLY",
          contextHash: null,
          createdAt: new Date().toISOString(),
        },
      });
    }

    // Semantic hypotheses via deterministic-only local compiler (UNVERIFIED)
    for (const unitId of plan.compileUnitIds.slice(0, 3)) {
      const unit = plan.units.find((u) => u.unitId === unitId)!;
      const deps = plan.units.filter((u) => u.unitId !== unitId).slice(0, 5).map((u) => ({ ref: u.unitId, text: u.text.slice(0, 2000), citation: u.sectionRef }));
      const compiled = await compileLocalSemanticUnit(
        { unitId, documentId: doc.documentId, sectionRef: unit.sectionRef, operativeText: unit.text.slice(0, 8000), dependencyTexts: deps },
        { mode: "DETERMINISTIC_ONLY" }
      );
      store.put({
        recordId: `hyp:${unitId}`,
        kind: "SEMANTIC_HYPOTHESIS",
        companyId: doc.packageKey,
        packageKey: doc.packageKey,
        instrumentKey: null,
        documentId: doc.documentId,
        candidateRef: unitId,
        verificationStatus: "UNVERIFIED",
        modelGenerated: false,
        body: { output: compiled.output, inferenceStatus: compiled.inference.status },
        uncertainty: compiled.output?.unsupportedSemantics ?? ["UNRESOLVED_PENDING_MODEL"],
        dependencies: deps.map((d) => d.ref),
        invalidatedBy: null,
        reviewerDecision: null,
        provenance: {
          sourceSpans: [{ documentId: doc.documentId, citation: unit.sectionRef, excerpt: unit.text.slice(0, 200) }],
          compilerVersion: compiled.compilerVersion,
          inferenceMode: "DETERMINISTIC_ONLY",
          contextHash: compiled.contextHash,
          createdAt: new Date().toISOString(),
        },
      });
      const defects = detectDefectsFromOutput({
        caseId: unitId,
        output: compiled.output,
        plan,
        operativeText: unit.text,
      });
      for (const d of defects) {
        if (d.cls === "MISCLASSIFIED_THRESHOLD" || d.cls === "MISSING_LEGAL_RESTRICTION") falsePermissionDefects.push(d.defectId);
      }
      appendEngineeringLedger(join(OUT, "engineering-ledger.json"), defects);
    }
  }

  const scale = runScaleBenchmark({
    documents: scaleDocs,
    storeDir: join(DATA, "scale-store"),
    tiers: [10, 100, 1000],
  });

  // Model comparison: deterministic + replay only (no Ollama/vLLM weights in this environment)
  const replayDir = join(DATA, "replay");
  const replay = new OfflineReplayAdapter({ directory: replayDir });
  const registry = new InferenceRegistry({
    replayDirectory: replayDir,
    adapters: [
      new (await import("../../lib/contract-model/compiler/inference/adapters/deterministic")).DeterministicInferenceAdapter(),
      replay,
      (await import("../../lib/contract-model/compiler/inference/adapters/ollama")).createOllamaAdapter(),
      (await import("../../lib/contract-model/compiler/inference/adapters/vllm")).createVllmAdapter(),
    ],
  });
  const sampleUnit = scaleDocs[0]?.provisions[0];
  const comparison = sampleUnit
    ? await runModelComparison({
        cases: [
          {
            caseId: "ipv22-threshold",
            unit: {
              unitId: "ipv22",
              documentId: "synthetic-probe",
              sectionRef: "7.02",
              operativeText: "Investments in an aggregate amount not to exceed $25,000,000.",
            },
            expect: { forbidPermissionWithoutSupport: true, ipvModes: ["IPV-22"] },
          },
          {
            caseId: sampleUnit.unitId.slice(0, 80),
            unit: {
              unitId: sampleUnit.unitId,
              documentId: sampleUnit.documentId,
              sectionRef: sampleUnit.sectionRef,
              operativeText: sampleUnit.text.slice(0, 4000),
            },
          },
        ],
        models: [
          { modelId: "deterministic-none", mode: "DETERMINISTIC_ONLY" },
          { modelId: "ollama-probe", mode: "OLLAMA_LOCAL", model: "llama3.1" },
        ],
        registry,
        hardwareNote: "Cloud agent VM; Ollama/vLLM not installed; model weights not present; paid gateway not authorized",
      })
    : null;

  const wallMs = Date.now() - started;
  const hypotheses = store.list({ kind: "SEMANTIC_HYPOTHESIS" });
  const verified = store.list().filter((r) => r.verificationStatus === "INDEPENDENTLY_VERIFIED");

  const report = {
    artifact: "DATA_PRODUCTION_CHECKPOINT",
    measuredAt: new Date().toISOString(),
    session: {
      wallClockMs: wallMs,
      paidInferenceUsd: 0,
      paidInferenceAuthorized: false,
      ollamaAvailable: false,
      vllmAvailable: false,
      note: "This session ran DETERMINISTIC_ONLY + offline adapters. No Vercel AI Gateway calls. No independently verified legal representations produced.",
    },
    corpusExistingInRepo: {
      label: "MEASURED_FROM_FIXTURES",
      realPackageKeys: [...REAL_PACKAGES],
      accessionFilingsDiscoveredInReadmesAndUrlLists: accessionSet.size,
      accessionSample: [...accessionSet].slice(0, 20),
      issuersFromPackageKeys: [...issuers],
      issuerCount: issuers.size,
      rawHtmlOrSourceDocumentsAcquiredOnDisk: rawAcquired.length,
      processableExtractedOrCuratedTextDocuments: processable.length,
      historicalDiscoveryCandidates_examples: {
        note: "Historical run artifacts already in repo — not re-executed this session",
        phase3fFirstBlind: 2847,
        finalLightweightUnseenSup: 1810,
        riotUnseen: 887,
      },
      historicalVerification_examples: {
        note: "Prior gateway-era verification results on disk; not produced by this vercel-independent pipeline",
        phase3fFirstBlind: { MATERIAL_DISCREPANCY: 15, VERIFICATION_INCOMPLETE: 13 },
        finalLightweight: { VERIFICATION_FAILED: 13 },
      },
    },
    thisSessionPipeline: {
      label: "MEASURED",
      documentsProcessedDeterministically: processable.length,
      provisionsStructurallyWindowed: provisionCount,
      noteOnProvisions: "Lightweight section splitter over extracted text — NOT a full Phase 2A structural-index re-run",
      deterministicFactsExtracted: factCount,
      sourceBackedDefinitions: definitionFacts,
      crossReferenceDependencyEdges: xrefFacts,
      selectiveCompileUnitsPlanned: compileUnits,
      omittedSourcesAudited: omitted,
      semanticHypothesesStored: hypotheses.length,
      independentlyVerifiedRepresentations: verified.length,
      unresolvedAmbiguousIssues: hypotheses.length + hypothesisCount,
      newlyDiscoveredDraftingPatterns: 0,
      noteOnPatterns: "No novel drafting-pattern classifier run this session",
      dangerousOmissionsOrFalsePermissionsDetected: falsePermissionDefects.length,
      falsePermissionDefectIds: falsePermissionDefects.slice(0, 50),
      knowledgeStorageBytes: store.storageBytes(),
      modelCostUsd: 0,
    },
    scaleBenchmark: scale,
    modelComparison: comparison,
    blockers: [
      "No Ollama or vLLM runtime/weights in this environment",
      "No founder paid-inference authorization; Vercel AI Gateway not used",
      "Full Phase 2A structural index + discovery not re-executed on all packages in this session",
      "FWRG/LSB packages are excerpt-only (no full raw HTML on disk)",
      "Semantic hypotheses are UNVERIFIED — not legally validated knowledge",
    ],
    nextExecutableBatch: [
      "Finish automated regression tests for inference adapters + planner + knowledge store",
      "Commit/push draft PR for provider-independent compilation",
      "If Ollama becomes available: run local structured compile on CONMED Article VII seeds",
      "Wire BridgedSemanticCaller into an offline replay of one frozen candidate without paid calls",
      "Do not advance certification gates",
    ],
  };

  writeFileSync(join(OUT, "03-data-production-checkpoint.json"), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT, "02-cost-throughput-report.json"), JSON.stringify({
    artifact: "COST_THROUGHPUT_REPORT",
    measured: {
      wallClockMs: wallMs,
      documentsProcessed: processable.length,
      provisions: provisionCount,
      facts: factCount,
      paidUsd: 0,
      storageBytes: store.storageBytes(),
    },
    scale,
    extrapolated10k: scale.extrapolated10k,
    disclaimer: "Extrapolated rows are not measured. Paid model cost is $0 this session.",
  }, null, 2));

  // Seed adversarial cases into ledger from known IPV classes
  const seedDefects = [
    { defectId: "seed:IPV-22", cls: "MISCLASSIFIED_THRESHOLD" as const, severity: "CRITICAL" as const, evidence: "threshold-as-permission protocol", caseId: "ipv22", confirmed: true },
    { defectId: "seed:IPV-16", cls: "MISSING_LEGAL_RESTRICTION" as const, severity: "HIGH" as const, evidence: "missing restriction protocol", caseId: "ipv16", confirmed: true },
    { defectId: "seed:IPV-21", cls: "INCOMPLETE_DEPENDENCY_CLOSURE" as const, severity: "HIGH" as const, evidence: "dependency closure protocol", caseId: "ipv21", confirmed: true },
  ];
  appendEngineeringLedger(join(OUT, "engineering-ledger.json"), seedDefects);
  const adv = generateAdversarialCasesFromDefects(seedDefects);
  writeFileSync(join(OUT, "04-adversarial-cases.json"), JSON.stringify({ cases: adv }, null, 2));

  console.log(JSON.stringify({
    checkpoint: join(OUT, "03-data-production-checkpoint.json"),
    processable: processable.length,
    rawAcquired: rawAcquired.length,
    filings: accessionSet.size,
    provisions: provisionCount,
    facts: factCount,
    hypotheses: hypotheses.length,
    verified: verified.length,
    wallMs,
    paidUsd: 0,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
