/**
 * Process one authentic package through the learning factory loop.
 * Reuses compileFrozenDebtPackage — no parallel compiler.
 */

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  compileFrozenDebtPackage,
  OFFLINE_PACKAGE_COMPILE_VERSION,
} from "../contract-model/analysis/offline-package-compile";
import { evaluateCompileIndependently } from "./evaluation";
import { proposeBoundedImprovements } from "./improvement-loop";
import { loadPackageDocuments } from "./package-registry";
import { defaultHonestyClaims, assertAutomatedKnowledgeState } from "./promotion-guards";
import { LearningFileStore } from "./store/file-store";
import { persistPackageManifestToNeon } from "./store/neon-store";
import {
  COVENANT_LEARNING_FACTORY_VERSION,
  type LearningArtifactRecord,
  type LearningErrorRecord,
  type LearningPackageSpec,
  type LearningRunStatus,
  type PackageAuditManifest,
  type StageCheckpoint,
} from "./types";

function codeSha(): string {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

function runIdFor(packageKey: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `clr_${packageKey}_${stamp}`.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function hashFile(abs: string): { sha256: string; byteSize: number } {
  const buf = readFileSync(abs);
  return {
    sha256: createHash("sha256").update(buf).digest("hex"),
    byteSize: statSync(abs).size,
  };
}

function artifactId(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

export interface ProcessPackageOptions {
  spec: LearningPackageSpec;
  repoRoot?: string;
  store?: LearningFileStore;
  /** When true, attempt Neon persist (never required for local success). */
  persistNeon?: boolean;
  authorizePaidInference?: boolean;
  /** Skip if identical document hashes already processed OK. */
  skipIfUnchanged?: boolean;
}

export interface ProcessPackageResult {
  manifest: PackageAuditManifest;
  neon: { attempted: boolean; ok: boolean; detail: string };
}

export async function processLearningPackage(
  options: ProcessPackageOptions,
): Promise<ProcessPackageResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const store = options.store ?? new LearningFileStore();
  const spec = options.spec;
  const startedAt = new Date().toISOString();
  const runId = runIdFor(spec.packageKey);
  const stages: StageCheckpoint[] = [];
  const errors: LearningErrorRecord[] = [];
  const artifacts: LearningArtifactRecord[] = [];
  let status: LearningRunStatus = "RUNNING";

  const documentHashes = spec.documents.map((d) => {
    const abs = path.join(repoRoot, d.localPath);
    const h = hashFile(abs);
    return { documentId: d.documentId, path: d.localPath, sha256: h.sha256, byteSize: h.byteSize };
  });

  if (options.skipIfUnchanged !== false) {
    const prior = store.readPackageManifest(spec.packageKey);
    if (
      prior &&
      prior.status === "OK" &&
      prior.documentHashes.length === documentHashes.length &&
      prior.documentHashes.every((h, i) => h.sha256 === documentHashes[i]?.sha256)
    ) {
      const finishedAt = new Date().toISOString();
      const manifest: PackageAuditManifest = {
        ...prior,
        runId,
        startedAt,
        finishedAt,
        status: "SKIPPED_DUPLICATE",
        stages: [
          {
            stage: "INGEST",
            status: "SKIPPED_DUPLICATE",
            startedAt,
            finishedAt,
            diagnostics: `Unchanged document hashes vs prior run ${prior.runId}`,
          },
        ],
        claims: defaultHonestyClaims(),
      };
      store.writePackageManifest(manifest);
      return { manifest, neon: { attempted: false, ok: false, detail: "skipped duplicate" } };
    }
  }

  // INGEST
  {
    const t0 = new Date().toISOString();
    stages.push({
      stage: "INGEST",
      status: "OK",
      startedAt: t0,
      finishedAt: new Date().toISOString(),
      diagnostics: `Loaded ${spec.documents.length} committed source document(s); cohort=${spec.cohort}`,
      metrics: { documentCount: spec.documents.length },
    });
  }

  let compileSummary: PackageAuditManifest["compileSummary"];

  try {
    const documents = loadPackageDocuments(spec, repoRoot);
    const tCompile = new Date().toISOString();
    const result = await compileFrozenDebtPackage({
      companyId: spec.companyId,
      packageKey: spec.packageKey,
      instrumentKey: spec.instrumentKey,
      documents,
      authorizePaidInference: Boolean(options.authorizePaidInference),
    });

    stages.push({
      stage: "STRUCTURE",
      status: "OK",
      startedAt: tCompile,
      finishedAt: new Date().toISOString(),
      diagnostics: `nodes=${result.stages.structural.nodeCount}; defs=${result.stages.structural.definitionCount}`,
      metrics: {
        nodeCount: result.stages.structural.nodeCount,
        definitionCount: result.stages.structural.definitionCount,
      },
    });
    stages.push({
      stage: "PACKAGE_GRAPH",
      status: "OK",
      startedAt: tCompile,
      finishedAt: new Date().toISOString(),
      diagnostics: `docs=${result.stages.packageGraph.documentCount}; rels=${result.stages.packageGraph.relationshipCount}`,
      metrics: {
        documentCount: result.stages.packageGraph.documentCount,
        relationshipCount: result.stages.packageGraph.relationshipCount,
      },
    });
    stages.push({
      stage: "DISCOVERY",
      status: "OK",
      startedAt: tCompile,
      finishedAt: new Date().toISOString(),
      diagnostics: `passA=${result.stages.discovery.passACount}; candidates=${result.stages.discovery.totalCandidates}; catalogs=${result.stages.discovery.exceptionCatalogCount}`,
      metrics: {
        passACount: result.stages.discovery.passACount,
        totalCandidates: result.stages.discovery.totalCandidates,
        exceptionCatalogCount: result.stages.discovery.exceptionCatalogCount,
      },
    });
    stages.push({
      stage: "COMPILE",
      status: "OK",
      startedAt: tCompile,
      finishedAt: new Date().toISOString(),
      diagnostics: `supported=${result.summary.supportedStructureUnits}; verifiedExec=${result.summary.verifiedExecutableUnits}; unsupported=${result.summary.unsupportedUnits}; gate=${result.stages.operativeHandoff.authorityGate}`,
      metrics: {
        supportedStructureUnits: result.summary.supportedStructureUnits,
        verifiedExecutableUnits: result.summary.verifiedExecutableUnits,
        unsupportedUnits: result.summary.unsupportedUnits,
        paidInferenceUsed: result.paidInferenceUsed,
      },
    });

    compileSummary = {
      nodeCount: result.stages.structural.nodeCount,
      definitionCount: result.stages.structural.definitionCount,
      passACount: result.stages.discovery.passACount,
      totalCandidates: result.stages.discovery.totalCandidates,
      exceptionCatalogCount: result.stages.discovery.exceptionCatalogCount,
      supportedStructureUnits: result.summary.supportedStructureUnits,
      verifiedExecutableUnits: result.summary.verifiedExecutableUnits,
      unsupportedUnits: result.summary.unsupportedUnits,
      refusedExecutableUnits: result.summary.refusedExecutableUnits,
      authorityGate: result.stages.operativeHandoff.authorityGate,
      paidInferenceUsed: result.paidInferenceUsed,
    };

    // Persist unit dump for refusal audits (git-safe under docs/).
    const dumpDir = path.join(repoRoot, "docs/covenant-learning-factory/unit-dumps");
    mkdirSync(dumpDir, { recursive: true });
    writeFileSync(
      path.join(dumpDir, `${spec.packageKey}.units.json`),
      JSON.stringify(
        {
          packageKey: spec.packageKey,
          cohort: spec.cohort,
          compilerVersion: OFFLINE_PACKAGE_COMPILE_VERSION,
          greaterOfCompilerVersion: "greater-of-assets-basket.v1.1",
          generatedAt: new Date().toISOString(),
          units: result.units,
        },
        null,
        2,
      ) + "\n",
    );

    // Artifacts — PROPOSED / REVIEW_REQUIRED only
    for (const u of result.units) {
      const state =
        u.supportStatus === "UNSUPPORTED_SEMANTICS" || u.supportStatus === "AMBIGUOUS"
          ? ("REVIEW_REQUIRED" as const)
          : ("PROPOSED" as const);
      assertAutomatedKnowledgeState(state);
      const kind =
        u.supportStatus === "UNSUPPORTED_SEMANTICS"
          ? ("UNSUPPORTED_STRUCTURE" as const)
          : u.executableAuthority === "VERIFIED_EXECUTABLE"
            ? ("EXECUTABLE_RULE" as const)
            : ("COVENANT_CANDIDATE" as const);
      artifacts.push({
        artifactId: artifactId([runId, u.unitId, kind]),
        packageKey: spec.packageKey,
        kind,
        state,
        family: u.families[0],
        sourceRefs: [u.sourceRef, u.documentId],
        payload: {
          unitId: u.unitId,
          supportStatus: u.supportStatus,
          executableAuthority: u.executableAuthority,
          description: u.description,
          // Learning note: VERIFIED_EXECUTABLE is a compile-time fidelity class,
          // not Neon knowledge-state VERIFIED / production authority.
          knowledgeStateNote:
            "Artifact state is PROPOSED|REVIEW_REQUIRED only; compile executableAuthority is not Neon VERIFIED promotion",
        },
        compilerVersion: OFFLINE_PACKAGE_COMPILE_VERSION,
        createdAt: new Date().toISOString(),
      });
    }

    // Independent eval
    const tEval = new Date().toISOString();
    const { evaluation, errors: evalErrors } = evaluateCompileIndependently({
      spec,
      runId,
      result,
    });
    errors.push(...evalErrors);
    const discoveryGap = errors.some((e) => e.class === "DISCOVERY_GAP");
    stages.push({
      stage: "INDEPENDENT_EVAL",
      status: discoveryGap ? "ABSTAINED" : "OK",
      startedAt: tEval,
      finishedAt: new Date().toISOString(),
      diagnostics: evaluation.notes.join("; ") || "independent eval complete",
      metrics: {
        coverageScore: evaluation.coverageScore,
        dangerousOmissionsStatus: evaluation.dangerousOmissionsStatus,
        dangerousOmissionCount: evaluation.dangerousOmissionCount,
        abstentionCount: evaluation.abstentionCount,
        supportedStructureUnits: evaluation.supportedStructureUnits,
        verifiedExecutableUnits: evaluation.verifiedExecutableUnits,
      },
    });

    const finishedAt = new Date().toISOString();
    let manifest: PackageAuditManifest = {
      schemaVersion: "covenant-learning-factory.package-audit.v1",
      packageKey: spec.packageKey,
      companyId: spec.companyId,
      issuerCik: spec.issuerCik,
      issuerTicker: spec.issuerTicker,
      cohort: spec.cohort,
      runId,
      codeSha: codeSha(),
      factoryVersion: COVENANT_LEARNING_FACTORY_VERSION,
      compilerVersion: OFFLINE_PACKAGE_COMPILE_VERSION,
      startedAt,
      finishedAt,
      status: discoveryGap ? "ABSTAINED" : "OK",
      documentHashes,
      stages,
      compileSummary,
      artifacts,
      errors,
      evaluation,
      improvementProposals: [],
      costs: [
        {
          category: "compute.wall",
          amount: Date.parse(finishedAt) - Date.parse(startedAt),
          unit: "ms",
          estimated: false,
        },
        {
          category: "inference.paid",
          amount: result.paidInferenceUsed ? 1 : 0,
          unit: "flag",
          estimated: false,
          note: "paid inference disabled unless authorizePaidInference",
        },
      ],
      claims: defaultHonestyClaims(),
    };

    manifest.improvementProposals = proposeBoundedImprovements({
      manifest,
      errors,
    });
    stages.push({
      stage: "IMPROVEMENT_PROPOSAL",
      status: "OK",
      startedAt: finishedAt,
      finishedAt: new Date().toISOString(),
      diagnostics: `${manifest.improvementProposals.length} bounded proposal(s); autoApply=false`,
      metrics: { proposalCount: manifest.improvementProposals.length },
    });

    // Persist
    const tPersist = new Date().toISOString();
    store.writePackageManifest(manifest);
    let neon = { attempted: false, ok: false, detail: "not requested" };
    if (options.persistNeon) {
      const neonResult = await persistPackageManifestToNeon(manifest);
      neon = {
        attempted: neonResult.attempted,
        ok: neonResult.ok,
        detail: neonResult.detail,
      };
    }
    stages.push({
      stage: "PERSIST",
      status: "OK",
      startedAt: tPersist,
      finishedAt: new Date().toISOString(),
      diagnostics: `file-store ok; neon=${neon.ok ? "ok" : neon.detail}`,
    });
    manifest = { ...manifest, stages: [...stages], finishedAt: new Date().toISOString() };
    store.writePackageManifest(manifest);
    status = manifest.status;
    void status;
    return { manifest, neon };
  } catch (err) {
    const finishedAt = new Date().toISOString();
    const message = err instanceof Error ? err.message : String(err);
    errors.push({
      errorId: artifactId([runId, "FAILED", message.slice(0, 80)]),
      packageKey: spec.packageKey,
      runId,
      class: "UNKNOWN",
      severity: "HIGH",
      message,
      stage: "COMPILE",
      createdAt: finishedAt,
      correctiveHistory: [],
    });
    stages.push({
      stage: "COMPILE",
      status: "FAILED",
      startedAt,
      finishedAt,
      diagnostics: message.slice(0, 500),
    });
    const manifest: PackageAuditManifest = {
      schemaVersion: "covenant-learning-factory.package-audit.v1",
      packageKey: spec.packageKey,
      companyId: spec.companyId,
      issuerCik: spec.issuerCik,
      issuerTicker: spec.issuerTicker,
      cohort: spec.cohort,
      runId,
      codeSha: codeSha(),
      factoryVersion: COVENANT_LEARNING_FACTORY_VERSION,
      compilerVersion: OFFLINE_PACKAGE_COMPILE_VERSION,
      startedAt,
      finishedAt,
      status: "FAILED",
      documentHashes,
      stages,
      compileSummary,
      artifacts,
      errors,
      improvementProposals: [],
      costs: [
        {
          category: "compute.wall",
          amount: Date.parse(finishedAt) - Date.parse(startedAt),
          unit: "ms",
          estimated: false,
        },
      ],
      claims: defaultHonestyClaims(),
    };
    manifest.improvementProposals = proposeBoundedImprovements({ manifest, errors });
    store.writePackageManifest(manifest);
    return { manifest, neon: { attempted: false, ok: false, detail: "failed before neon" } };
  }
}
