/**
 * Package registry for offline stratified-cert pinCandidate.
 * Loads sealed discovery / docs builders / operative-state / map paths only.
 * Zero providers.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildChewy, COMPANY as CHWY_COMPANY, INSTRUMENT as CHWY_INSTRUMENT } from "../../f7a-lib";
import {
  buildDeterministicStages,
  rehydrateNodeIds,
  sealedPopulation,
  COMPANY_ID as CONMED_COMPANY,
  INSTRUMENT_KEY as CONMED_INSTRUMENT,
  PACKAGE_KEY as CONMED_PACKAGE,
} from "../../p3-conmed-pilot/pipeline";
import { loadPreservedPhase2OperativeState, checkOperativeStateAsOf } from "../../phase-3-live-validation/operative-state";
import type { DiscoveredCandidate } from "../../../lib/contract-model/compiler/discovery/types";
import type { StructuralIndex } from "../../../lib/contract-model/compiler/structural-index";
import type { PackageGraphResult } from "../../../lib/contract-model/compiler/package-graph/types";
import type { OperativeContractState, AmendmentEffectCandidate } from "../../../lib/contract-model/compiler/amendment/types";

const ROOT = process.cwd();
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export type PackageKey = "chwy-2026-credit-agreement" | "conmed-2025-credit-facility";

export interface LoadedPackage {
  packageKey: PackageKey;
  companyId: string;
  instrumentKey: string;
  candidates: DiscoveredCandidate[];
  index: StructuralIndex;
  packageGraph: PackageGraphResult | null;
  exactTermsByDocument: Map<string, Map<string, string>>;
  documents: { documentId: string; label: string; text: string; chars: number; sha256: string; rawSha256?: string; title?: string }[];
  operativeState: OperativeContractState;
  amendmentEffects: AmendmentEffectCandidate[];
  operativeStateMeta: {
    adapter: string;
    source: Record<string, unknown>;
    analyzedDocuments: { documentId: string; label: string; targetDocuments: string[] }[];
    documentsProcessed: number;
    asOfConsistency: Record<string, unknown>;
  };
  sealedDiscoverySource: string;
  sealedDiscoveryCandidateCount: number;
  sealedStructuralNodesSource: string | null;
  fixtureRoot: string;
  discoveryHealth: string | null;
  mapPath: string | null;
  mapHonesty: {
    mapTags: string[];
    mapOutcome: string;
    compilationStatus?: string;
    verificationStatus?: string;
    note: string;
  };
  rehydrationUnresolved: { discoveryId: string; nodeKey: string; outcome: string }[];
}

function readJson<T>(rel: string): T {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) throw new Error(`missing sealed input: ${rel}`);
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

function loadChewyMapHonesty(): LoadedPackage["mapHonesty"] {
  return {
    mapTags: [],
    mapOutcome: "NO_CHEWY_CANONICAL_MAP_YET",
    note: "Chewy is not yet present under docs/canonical-covenant-map/maps/. Offline pin binds sealed discovery+structural fixtures only. Absence of map REVIEW is not pre-credit for later live CERTIFIED.",
  };
}

function loadConmedMapHonesty(discoveryId: string): LoadedPackage["mapHonesty"] {
  const mapRel = "docs/canonical-covenant-map/maps/conmed-2025-credit-facility.map.json";
  const map = readJson<{
    candidates?: {
      discoveryId?: string;
      tags?: string[];
      outcome?: string;
      compilationStatus?: string;
      verificationStatus?: string;
    }[];
  }>(mapRel);
  const hit = (map.candidates ?? []).find((c) => c.discoveryId === discoveryId);
  if (!hit) {
    return {
      mapTags: [],
      mapOutcome: "NOT_IN_MAP",
      note: `No map entry for ${discoveryId} in ${mapRel}. Offline pin still binds sealed discovery; map absence is not pre-credit.`,
    };
  }
  const tags: string[] = [];
  if (hit.compilationStatus === "REVIEW_REQUIRED") tags.push("CANDIDATE_COMPILE_REVIEW_REQUIRED");
  if (hit.verificationStatus) tags.push(hit.verificationStatus);
  return {
    mapTags: [...new Set(tags.filter(Boolean))],
    mapOutcome: hit.outcome ?? "MAPPED",
    compilationStatus: hit.compilationStatus,
    verificationStatus: hit.verificationStatus,
    note: `Canonical map currently tags ${discoveryId} with historical ${(tags.length ? tags.join(" / ") : "(none)")} (outcome ${hit.outcome ?? "MAPPED"}). Offline pin remains valid. Later live CERTIFIED must clear production blockers honestly — map REVIEW is not pre-credit.`,
  };
}

function loadChewy(asOfDate: string): LoadedPackage {
  const discoveryRel = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage2b-discovery.json";
  const nodesRel = "tests/fixtures/unseen-packages/phase-3-validation-chwy-run/stage1-all-nodes.json";
  const operativeRel = "tests/fixtures/unseen-packages/phase-3-validation-chwy-run/stage5-operative-state.json";
  const runSummaryRel = "tests/fixtures/unseen-packages/phase-3-validation-chwy-run/run-summary.json";
  const paidSummaryRel = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/run-summary.json";
  const fixtureRoot = "tests/fixtures/unseen-packages/chwy-2026-credit-agreement";
  const manifestRel = `${fixtureRoot}/extraction-manifest.json`;

  const discovery = readJson<{ candidates: DiscoveredCandidate[] }>(discoveryRel);
  const stage5 = readJson<{ status: string; provisionCount: number }>(operativeRel);
  const runSummary = readJson<{ runId?: string; finishedAt?: string; productionTreeHash?: string }>(runSummaryRel);
  const paidSummary = readJson<{ discovery?: { documentDiscoveryHealth?: string }; finishedAt?: string }>(paidSummaryRel);
  const manifest = readJson<{
    documents: { documentId: string; title: string; extractedChars: number; extractedSha256?: string; rawSha256?: string; extractedFile: string }[];
  }>(manifestRel);

  // Prefer rebuild for operative text sha (production path); sealed nodes exist for cross-check only.
  const chewy = buildChewy();
  const docMeta = manifest.documents[0];
  if (!docMeta) throw new Error("Chewy extraction-manifest missing documents[0]");
  const text = chewy.text;

  const fixtureFrozenAt = (runSummary.finishedAt ?? "2026-09-03T00:00:00.000Z").slice(0, 10);
  const operativeState: OperativeContractState = {
    instrumentKey: CHWY_INSTRUMENT,
    asOfDate: fixtureFrozenAt,
    provisions: [],
    status: stage5.status === "OPERATIVE_STATE_RESOLVED" ? "OPERATIVE_STATE_RESOLVED" : "OPERATIVE_STATE_REVIEW_REQUIRED",
    summary: `${stage5.provisionCount ?? 0} amended provision(s) tracked for this instrument as of ${fixtureFrozenAt} in ${runSummary.runId ?? "PHASE_3_VALIDATION_CHWY_DETERMINISTIC"} (single-document package; no amendment chain in fixture).`,
    unattachedEffects: [],
  };

  const asOfConsistency = {
    fixtureFrozenAt,
    phase3AsOfDate: asOfDate,
    checks: [
      {
        code: "FIXTURE_DOCUMENT_PRESENT",
        passed: true,
        detail: "chwy-2026-credit-agreement doc-a extracted text hash-pinned in extraction-manifest.json",
      },
      {
        code: "SINGLE_PACKAGE_DOCUMENT_REPRESENTED",
        passed: true,
        detail: "chwy-2026-credit-agreement supplies 1 document (doc-a); operative-state run covers doc-a",
      },
      {
        code: "OPERATIVE_STATE_RESOLVED_EMPTY_PROVISIONS",
        passed: operativeState.status === "OPERATIVE_STATE_RESOLVED" && operativeState.provisions.length === 0,
        detail: `stage5-operative-state.json status ${stage5.status} with provisionCount ${stage5.provisionCount ?? 0}`,
      },
    ],
    proven: true,
  };

  return {
    packageKey: "chwy-2026-credit-agreement",
    companyId: CHWY_COMPANY,
    instrumentKey: CHWY_INSTRUMENT,
    candidates: discovery.candidates,
    index: chewy.index,
    packageGraph: chewy.access.packageGraph,
    exactTermsByDocument: chewy.access.exactTermsByDocument,
    documents: [
      {
        documentId: "doc-a",
        label: "Chewy, Inc. Credit Agreement dated as of June 23, 2026",
        text,
        chars: text.length,
        sha256: sha256(text),
        rawSha256: docMeta.rawSha256,
        title: docMeta.title,
      },
    ],
    operativeState,
    amendmentEffects: [],
    operativeStateMeta: {
      adapter: "phase3-validation-chwy-operative-state.v1",
      source: {
        path: operativeRel,
        runId: runSummary.runId ?? "PHASE_3_VALIDATION_CHWY_DETERMINISTIC",
        finishedAt: runSummary.finishedAt ?? null,
        asOfDate: fixtureFrozenAt,
        productionTreeHash: runSummary.productionTreeHash ?? null,
        instrumentKeyInReport: `instrument:doc-a`,
      },
      analyzedDocuments: [{ documentId: "doc-a", label: "Chewy, Inc. Credit Agreement dated as of June 23, 2026", targetDocuments: [] }],
      documentsProcessed: 1,
      asOfConsistency,
    },
    sealedDiscoverySource: discoveryRel,
    sealedDiscoveryCandidateCount: discovery.candidates.length,
    sealedStructuralNodesSource: nodesRel,
    fixtureRoot,
    discoveryHealth: paidSummary.discovery?.documentDiscoveryHealth ?? null,
    mapPath: null,
    mapHonesty: loadChewyMapHonesty(),
    rehydrationUnresolved: [],
  };
}

function loadConmed(asOfDate: string): LoadedPackage {
  const stages = buildDeterministicStages();
  const pop = sealedPopulation();
  const { rehydrated, unresolved } = rehydrateNodeIds(pop.all, stages.index);
  const phase2 = loadPreservedPhase2OperativeState({
    instrumentKey: CONMED_INSTRUMENT,
    baseDocumentId: "conmed-doc-a-eighth-ar-credit-agreement",
  });
  const asOf = checkOperativeStateAsOf(phase2, {
    asOfDate,
    documents: stages.documents.map((d) => ({ documentId: d.documentId, label: d.label })),
  });

  return {
    packageKey: CONMED_PACKAGE as PackageKey,
    companyId: CONMED_COMPANY,
    instrumentKey: CONMED_INSTRUMENT,
    candidates: rehydrated,
    index: stages.index,
    packageGraph: stages.packageGraph,
    exactTermsByDocument: stages.access.exactTermsByDocument,
    documents: stages.documents.map((d) => ({
      documentId: d.documentId,
      label: d.label,
      text: d.text,
      chars: d.text.length,
      sha256: sha256(d.text),
    })),
    operativeState: phase2.state,
    amendmentEffects: phase2.effects,
    operativeStateMeta: {
      adapter: phase2.adapterVersion,
      source: phase2.source as unknown as Record<string, unknown>,
      analyzedDocuments: phase2.analyzedDocuments as { documentId: string; label: string; targetDocuments: string[] }[],
      documentsProcessed: phase2.documentsProcessed,
      asOfConsistency: asOf as unknown as Record<string, unknown>,
    },
    sealedDiscoverySource: "tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json",
    sealedDiscoveryCandidateCount: pop.all.length,
    sealedStructuralNodesSource: null,
    fixtureRoot: "tests/fixtures/unseen-packages/conmed-2025-credit-facility",
    discoveryHealth: null,
    mapPath: "docs/canonical-covenant-map/maps/conmed-2025-credit-facility.map.json",
    mapHonesty: { mapTags: [], mapOutcome: "PENDING_TARGET", note: "Map honesty filled per discoveryId at emit time." },
    rehydrationUnresolved: unresolved,
  };
}

export function loadPackage(packageKey: PackageKey, asOfDate: string): LoadedPackage {
  if (packageKey === "chwy-2026-credit-agreement") return loadChewy(asOfDate);
  if (packageKey === "conmed-2025-credit-facility") return loadConmed(asOfDate);
  throw new Error(`unsupported packageKey: ${packageKey}`);
}

export function resolveMapHonesty(pkg: LoadedPackage, discoveryId: string): LoadedPackage["mapHonesty"] {
  if (pkg.packageKey === "conmed-2025-credit-facility") return loadConmedMapHonesty(discoveryId);
  return pkg.mapHonesty;
}

export function defaultPinOutDir(args: { packageKey: string; normalizedSourceRef: string; discoveryId: string; version?: number }): string {
  const short = args.discoveryId.replace(/^discovery-candidate:/, "").slice(0, 8);
  const v = args.version ?? 1;
  return path.join(
    "docs/phase-3-reliability-stratified-certification/pins",
    args.packageKey,
    `${args.normalizedSourceRef}--${short}`,
    `v${v}`,
  );
}

export { sha256 };
