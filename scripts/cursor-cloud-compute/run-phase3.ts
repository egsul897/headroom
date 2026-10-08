/**
 * Phase 3 orchestrator — forensic summary, durable handoff, fleet SEC gate,
 * quality sample, warm re-benchmark. Soft gate. IMPLEMENTED ≠ CERTIFIED.
 *
 * Does not launch EHB discovery. Does not invent a competing downloader.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseDocument } from "../../lib/extraction/parse";
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { runPassADeterministicSignals } from "../../lib/contract-model/compiler/discovery/pass-a-signals";
import { loadEhbSourceDocuments, readEhbDiscoveryWallMs } from "../../lib/cursor-cloud-compute/phase2/ehb-manifest-loader";
import { createPhase2SecClient, contentHash } from "../../lib/cursor-cloud-compute/phase2/sec-client-adapter";
import { loadProcessingQueue } from "../../lib/cursor-cloud-compute/phase2/processing-queue";
import { processQueueItem, directorySizeBytes } from "../../lib/cursor-cloud-compute/phase2/process-document";
import {
  buildHandoffRecord,
  persistHandoffPackage,
  proveArtifactReconstruction,
  type ExtractionStatus,
  type FailureDiagnostic,
} from "../../lib/cursor-cloud-compute/phase3/handoff-contract";
import { evaluateFleetSecGate, ensureSharedBudgetFile } from "../../lib/cursor-cloud-compute/phase3/fleet-sec";
import { runIndependentQualitySample } from "../../lib/cursor-cloud-compute/phase3/quality-sample";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function guessCT(filename: string, uri: string): string {
  const ext = (filename.split(".").pop() ?? uri.split(".").pop() ?? "").toLowerCase();
  if (ext === "htm" || ext === "html") return "text/html";
  if (ext === "txt") return "text/plain";
  if (ext === "pdf") return "application/pdf";
  return "text/html";
}

function safe(id: string): string {
  return id.replace(/[^a-zA-Z0-9._:-]/g, "_");
}

function toExtractionStatus(errorClass: string | null | undefined, status: string | undefined): ExtractionStatus {
  if (status === "SKIPPED_DUPLICATE") return "SKIPPED_DUPLICATE";
  if (status === "UNSUPPORTED") return "UNSUPPORTED";
  if (status === "OVERSIZED") return "OVERSIZED";
  if (status === "FAILED") return "FAILED";
  if (errorClass === "STRUCTURE_EMPTY") return "STRUCTURE_EMPTY";
  if (errorClass === "MISSING_DEFINITIONS") return "MISSING_DEFINITIONS";
  if (errorClass === "STRUCTURE_BROKEN_HIERARCHY") return "STRUCTURE_BROKEN_HIERARCHY";
  return "OK";
}

async function main(): Promise<void> {
  const startingSha = process.env.HEADROOM_STARTING_SHA ?? "bc1abd6934f4ee037ada161695f906506dd6f13d";
  const corpusRoot =
    arg("corpus-root") ??
    path.join(process.cwd(), "data", "cursor-cloud-compute", "phase2-corpus-pilot100");
  const ehbRunDir =
    arg("ehb-run-dir") ??
    path.join(process.cwd(), "data", "edgar-historical-backfill", "cca-phase2-pilot100");
  const scaleRunDir =
    arg("scale-run-dir") ??
    path.join(process.cwd(), "data", "edgar-historical-backfill", "cca-phase2-scale1000");
  const forensicPath =
    arg("forensic") ??
    path.join(process.cwd(), "docs", "cursor-cloud-compute", "results", "phase3-forensic-classification.json");
  const artifactHandoffRoot = path.join(
    "/opt/cursor/artifacts",
    "cursor-cloud-compute",
    "handoff-cas",
  );
  const checkpointId = `phase3-${new Date().toISOString().replace(/[:.]/g, "-")}-${createHash("sha256")
    .update(String(process.pid))
    .digest("hex")
    .slice(0, 8)}`;

  // Fleet SEC: designate WS-EHB as owner; optional shared budget on local volume for coop proof.
  if (!process.env.HEADROOM_SEC_FETCH_OWNER) {
    process.env.HEADROOM_SEC_FETCH_OWNER = "WS-EHB";
  }
  if (!process.env.HEADROOM_SEC_SHARED_BUDGET_PATH) {
    process.env.HEADROOM_SEC_SHARED_BUDGET_PATH = path.join(
      process.cwd(),
      "data",
      "cursor-cloud-compute",
      "sec-shared-budget.json",
    );
  }
  ensureSharedBudgetFile(process.env.HEADROOM_SEC_SHARED_BUDGET_PATH);
  if (!process.env.SEC_EDGAR_CONTACT_EMAIL && !process.env.SEC_EDGAR_USER_AGENT) {
    // Owner email from Cursor Cloud run identity (authorized operator contact).
    process.env.SEC_EDGAR_CONTACT_EMAIL = process.env.HEADROOM_SEC_CONTACT_EMAIL ?? "egsul897@gmail.com";
  }

  const fleet = await evaluateFleetSecGate({
    ehbRoot: process.env.HEADROOM_EHB_ROOT ?? "/tmp/peer-worktrees/ehb",
  });

  const forensic = fs.existsSync(forensicPath)
    ? JSON.parse(fs.readFileSync(forensicPath, "utf-8"))
    : null;

  const queue = loadProcessingQueue(corpusRoot);
  if (!queue) throw new Error(`processing queue missing under ${corpusRoot}`);

  // Coverage available without launching discovery
  const pilotLoad = loadEhbSourceDocuments(ehbRunDir, { limit: 5000 });
  const scaleLoad = fs.existsSync(scaleRunDir)
    ? loadEhbSourceDocuments(scaleRunDir, { limit: 5000 })
    : { documents: [], stats: { selected: 0, issuers: 0, kindCounts: {}, queueItems: 0, manifestExhibits: 0 }, discoveryMs: 0 };
  const pilotUris = new Set(pilotLoad.documents.map((d) => d.sourceUri));
  const scaleNew = scaleLoad.documents.filter((d) => !pilotUris.has(d.sourceUri)).length;

  // Build content-addressed handoff for all OK/quality-flagged docs with raw bytes
  const forensicById = new Map<string, { rootCause?: string; evidence?: string[]; recoverable?: boolean }>();
  for (const c of forensic?.structureEmpty?.cases ?? []) {
    forensicById.set(c.sourceDocumentId, c);
  }
  for (const c of forensic?.missingDefinitions?.cases ?? []) {
    forensicById.set(c.sourceDocumentId, c);
  }

  const handoffRecords: Array<{
    record: ReturnType<typeof buildHandoffRecord>;
    rawBytes: Buffer;
    structuralNodes: unknown;
  }> = [];

  for (const item of queue.items) {
    const rawPath = path.join(corpusRoot, "raw", `${safe(item.source.sourceDocumentId)}.bin`);
    if (!fs.existsSync(rawPath)) continue;
    if (item.result?.status === "SKIPPED_DUPLICATE") continue;
    const rawBytes = fs.readFileSync(rawPath);
    const ct = guessCT(item.source.filename, item.source.sourceUri);
    const parsed = await parseDocument(rawBytes, ct);
    const nodes = parseDocumentStructure({
      documentId: item.source.sourceDocumentId,
      label: item.source.description || item.source.filename,
      text: parsed.fullText,
    });
    const defs = detectStructuralDefinitions(item.source.sourceDocumentId, parsed.fullText, nodes);
    const refs = detectStructuralReferences(item.source.sourceDocumentId, parsed.fullText, nodes);
    const index = buildStructuralIndex(
      new Map([[item.source.sourceDocumentId, { text: parsed.fullText, nodes }]]),
      defs,
      refs,
    );
    const passA = runPassADeterministicSignals(item.source.sourceDocumentId, index);

    const extractionStatus = toExtractionStatus(item.result?.errorClass, item.result?.status);
    const f = forensicById.get(item.source.sourceDocumentId);
    const failureDiagnostics: FailureDiagnostic | null =
      extractionStatus === "OK"
        ? null
        : {
            stage:
              extractionStatus === "STRUCTURE_EMPTY"
                ? "structure"
                : extractionStatus === "MISSING_DEFINITIONS"
                  ? "definitions"
                  : "pipeline",
            errorClass: item.result?.errorClass ?? null,
            message: item.result?.error ?? null,
            rootCauseClass: f?.rootCause ?? null,
            evidence: f?.evidence ?? [],
            recoverable: f?.recoverable,
          };

    const record = buildHandoffRecord({
      source: item.source,
      rawBytes,
      normalizedText: parsed.fullText,
      structuralNodes: nodes.map((n) => ({
        nodeId: n.nodeId,
        nodeType: n.nodeType,
        sectionRef: n.sectionRef,
        heading: n.heading,
        charStart: n.charStart,
        charEnd: n.charEnd,
        parentNodeId: n.parentNodeId,
      })),
      extractionStatus,
      failureDiagnostics,
      acquiredVia: "WS-EHB-SecAccessCoordinator",
      checkpointId,
      metrics: {
        byteLength: rawBytes.length,
        charCount: parsed.fullText.length,
        nodeCount: nodes.length,
        definitionCount: defs.length,
        referenceCount: refs.length,
        resolvedReferenceCount: refs.filter((r) => r.resolved).length,
        passACandidateCount: passA.length,
      },
    });
    handoffRecords.push({
      record,
      rawBytes,
      structuralNodes: nodes.map((n) => ({
        nodeId: n.nodeId,
        nodeType: n.nodeType,
        sectionRef: n.sectionRef,
        heading: n.heading,
        charStart: n.charStart,
        charEnd: n.charEnd,
        parentNodeId: n.parentNodeId,
      })),
    });
  }

  const handoffManifest = persistHandoffPackage({
    packageRoot: artifactHandoffRoot,
    checkpointId,
    records: handoffRecords,
  });

  // Also write git-tracked index (hashes only — not raw bodies)
  const gitIndexPath = path.join(
    process.cwd(),
    "docs",
    "cursor-cloud-compute",
    "results",
    `phase3-handoff-index-${checkpointId}.json`,
  );
  const gitIndex = {
    ...handoffManifest,
    documents: handoffManifest.documents.map((d) => ({
      ...d,
      // strip nothing essential; bodies are CAS-referenced not inlined
    })),
    durableClaim:
      "Git tracks this index of content hashes + provenance. Raw source bytes are in /opt/cursor/artifacts CAS and/or re-fetchable from SEC via WS-EHB. This JSON alone is not corpus durability.",
  };
  fs.mkdirSync(path.dirname(gitIndexPath), { recursive: true });
  fs.writeFileSync(gitIndexPath, JSON.stringify(gitIndex, null, 2));

  // Durability proof: reconstruct into independent temp dir from artifact CAS
  const reconstructRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cca-handoff-reconstruct-"));
  const durability = proveArtifactReconstruction({
    sourcePackageRoot: artifactHandoffRoot,
    reconstructRoot,
    sampleLimit: handoffManifest.documentCount,
  });

  // SEC refetch hash-match sample (small; respects fleet owner + rate limits)
  let secRefetchProof: {
    checked: number;
    matches: number;
    failures: Array<{ id: string; reason: string }>;
  } = { checked: 0, matches: 0, failures: [] };
  if (fleet.liveNetworkAllowedForCca) {
    const sec = await createPhase2SecClient({
      cacheDir: path.join(corpusRoot, ".sec-cache-phase3-proof"),
      logDir: path.join(corpusRoot, "logs"),
      ehbRoot: process.env.HEADROOM_EHB_ROOT,
      ckfRoot: process.env.HEADROOM_CKF_ROOT,
    });
    const sample = handoffManifest.documents
      .filter((d) => d.extractionStatus === "OK")
      .slice(0, 5);
    for (const doc of sample) {
      secRefetchProof.checked += 1;
      try {
        const res = await sec.get(doc.sourceIdentity.sourceUri);
        if (res.status !== 200) {
          secRefetchProof.failures.push({
            id: doc.sourceIdentity.sourceDocumentId,
            reason: `HTTP ${res.status}`,
          });
          continue;
        }
        const h = contentHash(res.body);
        if (h === doc.sourceHash) secRefetchProof.matches += 1;
        else {
          secRefetchProof.failures.push({
            id: doc.sourceIdentity.sourceDocumentId,
            reason: `hash mismatch cas=${doc.sourceHash.slice(0, 12)} refetch=${h.slice(0, 12)}`,
          });
        }
      } catch (err) {
        secRefetchProof.failures.push({
          id: doc.sourceIdentity.sourceDocumentId,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Independent quality sample
  const quality = await runIndependentQualitySample({
    corpusRoot,
    sampleSize: 50,
  });
  const qualityPath = path.join(
    process.cwd(),
    "docs",
    "cursor-cloud-compute",
    "results",
    `phase3-quality-sample-${checkpointId}.json`,
  );
  fs.writeFileSync(qualityPath, JSON.stringify(quality, null, 2));

  // Warm re-benchmark (processing-only; no discovery; cache hits)
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  let peakRss = process.memoryUsage().rss;
  const seenHashes = new Map<string, string>();
  const warmResults = [];
  // Prefer cache-only client for warm — force owner path but use existing raw files via processQueueItem
  const secWarm = await createPhase2SecClient({
    cacheDir: path.join(corpusRoot, ".sec-cache"),
    logDir: path.join(corpusRoot, "logs"),
    ehbRoot: process.env.HEADROOM_EHB_ROOT,
    ckfRoot: process.env.HEADROOM_CKF_ROOT,
  });
  for (const item of queue.items) {
    // Reset downstream stages to force reprocess from cached raw
    if (item.result?.status === "SKIPPED_DUPLICATE") continue;
    for (const stage of ["parse", "dedupe", "structure", "definitions", "references", "passA", "storage"] as const) {
      if (item.stages[stage] === "DONE") item.stages[stage] = "PENDING";
    }
    const r = await processQueueItem({
      item,
      corpusRoot,
      sec: secWarm,
      seenHashes,
    });
    warmResults.push(r);
    peakRss = Math.max(peakRss, r.peakRssBytes);
  }
  const warmWallMs = performance.now() - t0;
  const cpu1 = process.cpuUsage(cpu0);
  const processingOnlyMs = warmResults.reduce((s, r) => s + r.timingsMs.totalProcessingMs, 0);
  const okCount = warmResults.filter((r) => r.status === "OK").length;

  const errorClassCounts: Record<string, number> = {};
  for (const r of warmResults) {
    if (r.errorClass) errorClassCounts[r.errorClass] = (errorClassCounts[r.errorClass] ?? 0) + 1;
  }

  const report = {
    status: "COMPUTE_ASSESSMENT_PHASE3_NOT_CERTIFIED",
    generatedAt: new Date().toISOString(),
    checkpointId,
    startingSha,
    northStarPreserved: true,
    certificationClaimed: false,
    coordination: {
      workstreamId: "WS-CCA",
      ehbOwnsSecAcquisition: true,
      fleet,
      ehbRunDir,
      scaleRunDir,
    },
    coverage: {
      pilotEligible: pilotLoad.stats.selected,
      scaleEligible: scaleLoad.stats.selected,
      scaleOnlyNewDocuments: scaleNew,
      unionDistinctDocuments: new Set([
        ...pilotLoad.documents.map((d) => d.sourceUri),
        ...scaleLoad.documents.map((d) => d.sourceUri),
      ]).size,
      uniqueIssuersPilot: pilotLoad.stats.issuers,
      uniqueIssuersScale: scaleLoad.stats.issuers,
      discoveryWallMsPilot: readEhbDiscoveryWallMs(ehbRunDir),
      discoveryWallMsScale: readEhbDiscoveryWallMs(scaleRunDir),
      scale1000Blocker:
        scaleNew === 0
          ? "WS-EHB scale-1000 discovery incomplete (55/1000 issuers; queuedForAcquisition=0; no new fetchable financing docs beyond pilot-100). WS-CCA will not launch discovery."
          : null,
    },
    forensic: forensic
      ? {
          structureEmpty: {
            count: forensic.structureEmpty.count,
            byRootCause: forensic.structureEmpty.byRootCause,
            recoverableParserFailures: forensic.structureEmpty.recoverableParserFailures,
            unsupportedFormats: forensic.structureEmpty.unsupportedFormats,
            nonRecoverableWrongSelectionOrClass:
              forensic.structureEmpty.nonRecoverableWrongSelectionOrClass,
          },
          missingDefinitions: {
            count: forensic.missingDefinitions.count,
            byRootCause: forensic.missingDefinitions.byRootCause,
            presentButMissed: forensic.missingDefinitions.presentButMissed,
            recoveryRateIfParserFixed: forensic.missingDefinitions.recoveryRateIfParserFixed,
          },
        }
      : null,
    durableHandoff: {
      contractVersion: handoffManifest.contractVersion,
      processingVersion: handoffManifest.processingVersion,
      artifactPackageRoot: artifactHandoffRoot,
      gitTrackedIndex: gitIndexPath,
      documentCount: handoffManifest.documentCount,
      distinctSourceHashes: handoffManifest.distinctSourceHashes,
      reconstructionProof: durability,
      secRefetchHashProof: secRefetchProof,
      vmLocalCorpusNotDurable: true,
    },
    warmRebenchmark: {
      uniqueDocumentsProcessed: okCount,
      wallMs: warmWallMs,
      processingOnlyMs,
      processingOnlyDocsPerSecond: processingOnlyMs > 0 ? (okCount / processingOnlyMs) * 1000 : 0,
      endToEndDocsPerSecond: warmWallMs > 0 ? (okCount / warmWallMs) * 1000 : 0,
      peakRssBytes: peakRss,
      cpuUserMs: cpu1.user / 1000,
      cpuSystemMs: cpu1.system / 1000,
      storageBytes: directorySizeBytes(corpusRoot),
      storageBytesPerDocument: okCount ? directorySizeBytes(corpusRoot) / okCount : 0,
      errorClassCounts,
      secProvider: secWarm.provider,
      secFleetMode: secWarm.fleetMode,
    },
    quality: {
      portablePath: qualityPath,
      sampleSize: quality.sampleSize,
      distinctIssuers: quality.distinctIssuers,
      aggregates: quality.aggregates,
      disclaimer: quality.disclaimer,
    },
    cost: {
      externalPaidUsd: 0,
      anthropicCalls: 0,
      gpuProvisioned: false,
    },
    readiness1000: {
      ready: false,
      actualDistinctDocuments: new Set([
        ...pilotLoad.documents.map((d) => d.sourceUri),
        ...scaleLoad.documents.map((d) => d.sourceUri),
      ]).size,
      blockers: [
        "EHB scale-1000 discovery not finished — only 55/1000 issuers scanned; acquisition queue empty",
        "No additional authentic financing documents beyond pilot-100 (155) available to consume without launching discovery",
        "Fleet SEC: further acquisition must remain under WS-EHB ownership / shared budget",
      ],
    },
  };

  const outPath = path.join(
    process.cwd(),
    "docs",
    "cursor-cloud-compute",
    "results",
    `phase3-${checkpointId}.json`,
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join("/opt/cursor/artifacts", "cursor-cloud-compute", path.basename(outPath)),
    JSON.stringify(report, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        checkpointId,
        coverage: report.coverage,
        forensic: report.forensic,
        durabilityProved: durability.proved,
        secRefetch: secRefetchProof,
        warmDocsPerSec: report.warmRebenchmark.processingOnlyDocsPerSecond,
        qualitySample: quality.sampleSize,
        qualityAggregates: quality.aggregates,
        readiness1000: report.readiness1000,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
