/**
 * Reproducible scale benchmark for 10 / 100 / 1_000 documents.
 * Uses actual available documents and recorded fixtures.
 * Does NOT claim 1_000-doc execution unless it ran.
 * Extrapolated 10_000-doc cost model is clearly labelled EXTRAPOLATED.
 */
import { extractDeterministicCovenantFacts } from "../deterministic-extraction";
import { planSelectiveCompilation, type InventoryProvision } from "../selective-compilation";
import { CovenantKnowledgeStore } from "../../covenant-knowledge";

export interface ScaleDoc {
  documentId: string;
  provisions: InventoryProvision[];
}

export interface ScaleTierResult {
  tier: 10 | 100 | 1000;
  executed: boolean;
  documentsProcessed: number;
  wallClockMs: number;
  parsingThroughputDocsPerSec: number;
  candidateCount: number;
  compileUnitCount: number;
  modelInputChars: number;
  fullInventoryChars: number;
  modelInputReductionRatio: number;
  storageBytes: number;
  errors: string[];
  measured: true;
}

export interface ScaleBenchmarkReport {
  version: "scale-benchmark.v1";
  ranAt: string;
  availableDocuments: number;
  tiers: ScaleTierResult[];
  /** Clearly distinguished from measured results. */
  extrapolated10k: {
    label: "EXTRAPOLATED";
    basisTier: 10 | 100 | 1000 | null;
    assumedDocs: 10000;
    projectedWallClockMs: number | null;
    projectedStorageBytes: number | null;
    projectedCompileUnits: number | null;
    projectedModelInputChars: number | null;
    notes: string[];
  };
}

function runTier(docs: ScaleDoc[], n: 10 | 100 | 1000, store: CovenantKnowledgeStore): ScaleTierResult {
  const slice = docs.slice(0, n);
  const executed = slice.length === n || (docs.length < n && slice.length === docs.length && docs.length > 0);
  const errors: string[] = [];
  if (slice.length < n) {
    errors.push(`Requested ${n} documents but only ${docs.length} available; measured on ${slice.length}.`);
  }
  const started = Date.now();
  let candidateCount = 0;
  let compileUnitCount = 0;
  let modelInputChars = 0;
  let fullInventoryChars = 0;
  for (const doc of slice) {
    try {
      for (const p of doc.provisions) {
        const facts = extractDeterministicCovenantFacts({
          text: p.text,
          documentId: doc.documentId,
          candidateRef: p.unitId,
          citation: p.sectionRef,
        });
        store.put({
          recordId: `fact:${p.unitId}`,
          kind: "DETERMINISTIC_FACT",
          companyId: null,
          packageKey: null,
          instrumentKey: null,
          documentId: doc.documentId,
          candidateRef: p.unitId,
          verificationStatus: "UNVERIFIED",
          modelGenerated: false,
          body: { facts: facts.facts, inventory: facts.inventory },
          uncertainty: facts.hypotheses.map((h) => h.claim),
          dependencies: [],
          invalidatedBy: null,
          reviewerDecision: null,
          provenance: {
            sourceSpans: facts.facts.slice(0, 5).map((f) => ({
              documentId: f.source.documentId,
              citation: f.source.citation,
              excerpt: f.source.excerpt,
              startOffset: f.source.startOffset,
              endOffset: f.source.endOffset,
            })),
            compilerVersion: "deterministic-covenant-extraction.v1",
            inferenceMode: "DETERMINISTIC_ONLY",
            contextHash: null,
            createdAt: new Date().toISOString(),
          },
        });
      }
      const plan = planSelectiveCompilation({ provisions: doc.provisions });
      candidateCount += plan.stats.inventoryCount;
      compileUnitCount += plan.stats.compileCount;
      modelInputChars += plan.stats.modelInputChars;
      fullInventoryChars += plan.stats.fullInventoryChars;
    } catch (err) {
      errors.push(`${doc.documentId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const wallClockMs = Date.now() - started;
  const docsProcessed = slice.length;
  return {
    tier: n,
    executed: executed && docsProcessed > 0,
    documentsProcessed: docsProcessed,
    wallClockMs,
    parsingThroughputDocsPerSec: wallClockMs === 0 ? docsProcessed : docsProcessed / (wallClockMs / 1000),
    candidateCount,
    compileUnitCount,
    modelInputChars,
    fullInventoryChars,
    modelInputReductionRatio: fullInventoryChars === 0 ? 0 : 1 - modelInputChars / fullInventoryChars,
    storageBytes: store.storageBytes(),
    errors,
    measured: true,
  };
}

export function runScaleBenchmark(args: {
  documents: ScaleDoc[];
  storeDir: string;
  tiers?: Array<10 | 100 | 1000>;
}): ScaleBenchmarkReport {
  const store = new CovenantKnowledgeStore({ rootDir: args.storeDir });
  const tiersToRun = args.tiers ?? [10, 100, 1000];
  const tiers: ScaleTierResult[] = [];
  for (const t of tiersToRun) {
    if (args.documents.length === 0) {
      tiers.push({
        tier: t,
        executed: false,
        documentsProcessed: 0,
        wallClockMs: 0,
        parsingThroughputDocsPerSec: 0,
        candidateCount: 0,
        compileUnitCount: 0,
        modelInputChars: 0,
        fullInventoryChars: 0,
        modelInputReductionRatio: 0,
        storageBytes: 0,
        errors: ["No documents available"],
        measured: true,
      });
      continue;
    }
    tiers.push(runTier(args.documents, t, store));
  }

  const basis = [...tiers].reverse().find((t) => t.executed && t.documentsProcessed > 0) ?? null;
  const scale = basis ? 10000 / basis.documentsProcessed : null;

  return {
    version: "scale-benchmark.v1",
    ranAt: new Date().toISOString(),
    availableDocuments: args.documents.length,
    tiers,
    extrapolated10k: {
      label: "EXTRAPOLATED",
      basisTier: basis?.tier ?? null,
      assumedDocs: 10000,
      projectedWallClockMs: basis && scale != null ? Math.round(basis.wallClockMs * scale) : null,
      projectedStorageBytes: basis && scale != null ? Math.round(basis.storageBytes * scale) : null,
      projectedCompileUnits: basis && scale != null ? Math.round(basis.compileUnitCount * scale) : null,
      projectedModelInputChars: basis && scale != null ? Math.round(basis.modelInputChars * scale) : null,
      notes: [
        "EXTRAPOLATED figures are linear projections from the largest executed tier.",
        "They are not measured 10,000-document results.",
        "Semantic model cost is excluded from deterministic parsing throughput.",
        basis ? `Basis: ${basis.documentsProcessed} docs in ${basis.wallClockMs}ms.` : "No executed tier available for extrapolation.",
      ],
    },
  };
}
