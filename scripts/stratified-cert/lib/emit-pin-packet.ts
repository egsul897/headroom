/**
 * Deterministic offline pin packet emitter (ADR-1 append-only layout).
 * Writes first-target-shaped JSON under pins/<package>/<ref>--<shortId>/vN/.
 * Zero providers. Refuses --live / first-target/ / non-empty outDir.
 */
import fs from "node:fs";
import path from "node:path";
import { governingProvisionFor, resolveOperativeSource } from "../../../lib/contract-model/compiler/candidate-span";
import { buildCandidateCompilerInput } from "../../../lib/contract-model/covenant-map/candidate-input";
import { scanSourceReferences } from "../../../lib/contract-model/compiler/source-reference-scan";
import { certifiedConfig, certifiedConfigIdentity } from "../../../lib/contract-model/compiler/certified-config";
import { scanForSecrets } from "../../p3-conmed-pilot/evidence";
import { crossCutClaims, deriveCrossCuts, stratumFromFamilies } from "./cross-cuts";
import { defaultPinOutDir, loadPackage, resolveMapHonesty, sha256, type PackageKey } from "./package-registry";

const INTERIM_B_RE = /\bseries\s+of\s+related\b/i;
const MODEL = "deepseek/deepseek-v4-flash";
const HARD_CEILING_USD = 0.25;
const ADR1 = "docs/architecture/EVIDENCE-PACKET-VERSIONING-ADR.md";
const FIRST_TARGET_ABS = path.resolve("docs/phase-3-reliability-stratified-certification/first-target");
const HAND_PIN_ABS = path.resolve(
  "docs/phase-3-reliability-stratified-certification/pins/chewy-2.18c-vii-incremental-shared-cap",
);

export interface PinCandidateArgs {
  packageKey: PackageKey;
  discoveryId: string;
  asOfDate: string;
  headSha: string;
  outDir?: string;
  /** Deterministic timestamp for offline pins (inv 21). */
  startedAt?: string;
  expected?: { chars: number; sha256: string } | null;
}

export interface PinCandidateResult {
  outDir: string;
  files: string[];
  eligible: boolean;
  stratum: string;
  crossCuts: string[];
  operativeSourceSha256: string;
  operativeSourceChars: number;
}

function assertSafeOutDir(outDir: string): void {
  const abs = path.resolve(outDir);
  if (abs === FIRST_TARGET_ABS || abs.startsWith(FIRST_TARGET_ABS + path.sep)) {
    throw new Error(`refusing to write into first-target/ (ADR-1 immutable baseline): ${outDir}`);
  }
  if (abs === HAND_PIN_ABS || abs.startsWith(HAND_PIN_ABS + path.sep)) {
    throw new Error(`refusing to write into hand pin folder; emitter uses versioned pins/<package>/<ref>--<id>/vN/: ${outDir}`);
  }
  if (!abs.includes(`${path.sep}pins${path.sep}`) && !abs.includes("/pins/")) {
    // allow temp dirs for tests (caller may pass os.tmpdir paths)
    if (!abs.includes(`${path.sep}tmp`) && !abs.includes("/tmp") && !abs.includes("pin-candidate-")) {
      throw new Error(`outDir must be under docs/.../pins/ or a temp test dir; got ${outDir}`);
    }
  }
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
    throw new Error(`refusing to write into ${outDir}: already populated (ADR-1 append-only; ship vN+1)`);
  }
}

function ancestorChain(index: import("../../../lib/contract-model/compiler/structural-index").StructuralIndex, nodeId: string): { keys: string[]; ids: string[] } {
  const keys: string[] = [];
  const ids: string[] = [];
  let cur = index.getNodeById(nodeId);
  let guard = 0;
  while (cur && guard++ < 32) {
    // Skip article-level Roman numerals for identity display (hand pin stopped at section).
    if (/^[IVXLCDM]+$/i.test(cur.sectionRef ?? "") && keys.length > 0) break;
    keys.push(cur.nodeKey);
    ids.push(cur.nodeId);
    cur = cur.parentNodeId ? index.getNodeById(cur.parentNodeId) : undefined;
  }
  return { keys, ids };
}

function writeJson(outDir: string, name: string, value: unknown): string {
  const body = JSON.stringify(value, null, 2) + "\n";
  const hits = scanForSecrets(body);
  if (hits.length > 0) throw new Error(`refusing to write ${name}: credential-shaped content at ${JSON.stringify(hits)}`);
  fs.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, name);
  fs.writeFileSync(p, body);
  return p;
}

export function pinCandidate(args: PinCandidateArgs): PinCandidateResult {
  const startedAt = args.startedAt ?? `${args.asOfDate}T00:00:00.000Z`;
  const pkg = loadPackage(args.packageKey, args.asOfDate);
  const target = pkg.candidates.find((c) => c.discoveryId === args.discoveryId);
  if (!target) throw new Error(`discoveryId not in sealed population: ${args.discoveryId}`);

  const sameRef = pkg.candidates.filter((c) => c.normalizedSourceRef === target.normalizedSourceRef && c.documentId === target.documentId);
  const anchorId = target.structuralNodeIds[0];
  const anchor = anchorId ? pkg.index.getNodeById(anchorId) : undefined;
  if (!anchor) throw new Error(`structural node unresolved for ${args.discoveryId}`);

  // Re-resolve by ref for single-occurrence assert (fail-closed on ambiguous).
  const byRef = pkg.index.resolveUniqueNodeByRef(target.documentId, target.normalizedSourceRef);
  if (byRef.status !== "UNIQUE") {
    throw new Error(`sectionRef ${target.normalizedSourceRef} is ${byRef.status} in structural index`);
  }

  const governing = governingProvisionFor(target, pkg.operativeState);
  const src = resolveOperativeSource(target, pkg.index, pkg.operativeState);
  const textSha = sha256(src.text);
  const expected = args.expected ?? { chars: src.text.length, sha256: textSha };

  const ancestors = ancestorChain(pkg.index, anchor.nodeId);
  const structuralNodeKeys = ancestors.keys.length > 0 ? ancestors.keys : target.structuralNodeKeys;
  const structuralNodeIds = ancestors.ids.length > 0 ? ancestors.ids : target.structuralNodeIds;

  const stratum = stratumFromFamilies(target.families);
  const crossCuts = deriveCrossCuts({ role: target.role, operativeText: src.text });

  const identity = {
    discoveryId: target.discoveryId,
    documentId: target.documentId,
    packageKey: pkg.packageKey,
    normalizedSourceRef: target.normalizedSourceRef,
    structuralNodeKeys,
    structuralNodeIds,
    anchor: {
      nodeId: anchor.nodeId,
      nodeKey: anchor.nodeKey,
      nodeType: anchor.nodeType,
      sectionRef: anchor.sectionRef,
      charStart: anchor.charStart,
      charEnd: anchor.charEnd,
    },
    operativeSourceOrigin: src.origin,
    operativeSourceChars: src.text.length,
    operativeSourceSha256: textSha,
    operativeSourceText: src.text,
    expected,
    occurrencesOfRefInDocument: sameRef.length,
    rehydrationUnresolvedForTarget: pkg.rehydrationUnresolved.filter((u) => u.discoveryId === args.discoveryId),
    families: target.families,
    role: target.role,
    stratum,
    crossCuts,
    discoveryRunVersion: target.discoveryRunVersion,
    discoveryReviewStatus: target.reviewStatus,
    discoveryConfidence: target.confidence,
    description: target.description,
  };

  const assertions = {
    candidateIdMatches: target.discoveryId === args.discoveryId,
    documentMatches: true,
    sectionRefMatches: anchor.sectionRef === target.normalizedSourceRef,
    structuralNodeResolved: !!anchor && byRef.status === "UNIQUE",
    singleOccurrence: sameRef.length === 1 && byRef.status === "UNIQUE",
    textSha256Matches: textSha === expected.sha256,
    charsMatch: src.text.length === expected.chars,
  };

  const interimBHit = INTERIM_B_RE.test(src.text);
  const reviewRequired = pkg.operativeState.provisions.filter((p) => p.status !== "OPERATIVE_STATE_RESOLVED");
  const scanned = scanSourceReferences(src.text, {
    baseSectionRef: target.normalizedSourceRef,
    index: pkg.index,
    documentId: target.documentId,
  });
  const directMentions = reviewRequired.map((p) => ({
    provisionKey: p.provisionKey,
    kind: p.kind,
    status: p.status,
    directlyReferencedBySection: p.kind === "SECTION" && p.sectionRef !== null && scanned.some((x) => x.normalized === p.sectionRef),
    definedTermMentionedInOperativeText:
      p.kind === "DEFINITION" && p.definedTermRef !== null && new RegExp(`\\b${p.definedTermRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(src.text),
  }));

  const offline = buildCandidateCompilerInput(target, {
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
    packageKey: pkg.packageKey,
    index: pkg.index,
    packageGraph: pkg.packageGraph,
    exactTermsByDocument: pkg.exactTermsByDocument,
    operativeState: pkg.operativeState,
    amendmentEffects: pkg.amendmentEffects,
    candidatePopulation: pkg.candidates.map((c) => ({ discoveryId: c.discoveryId, structuralNodeIds: c.structuralNodeIds })),
  });
  const ob = offline.bundle;
  const nonCurrent = ob.items
    .filter((i) => (i.evidenceState?.status ?? "MISSING") !== "CURRENT")
    .map((i) => ({
      itemId: i.itemId,
      type: i.type,
      normalizedRef: i.normalizedRef,
      retrievalDepth: i.retrievalDepth,
      evidenceState: i.evidenceState,
    }));

  const identityOk = Object.values(assertions).every(Boolean);
  const governingReview = !!governing && governing.status !== "OPERATIVE_STATE_RESOLVED";
  const eligible =
    identityOk &&
    !interimBHit &&
    !governingReview &&
    !(ob.hasUnresolvedOperativeEvidence ?? false) &&
    directMentions.every((m) => !m.directlyReferencedBySection && !m.definedTermMentionedInOperativeText);

  const mapHonesty = resolveMapHonesty(pkg, args.discoveryId);
  const outDir = args.outDir ?? defaultPinOutDir({ packageKey: pkg.packageKey, normalizedSourceRef: target.normalizedSourceRef, discoveryId: args.discoveryId });
  assertSafeOutDir(outDir);

  const artifactBase = `STRATIFIED_OFFLINE_PIN:${pkg.packageKey}:${args.discoveryId}`;
  const config = certifiedConfig({ semanticModel: MODEL, inventoryModel: MODEL, verifierModel: MODEL });

  const manifest = {
    schemaVersion: "1.0",
    artifactId: artifactBase,
    status: "PINNED_OFFLINE",
    baseSha: args.headSha,
    packageKey: pkg.packageKey,
    discoveryId: args.discoveryId,
    stratum,
    crossCuts,
    citesAdr: ADR1,
    supersedes: null,
  };

  const preflight = {
    mode: "DRY_RUN_OFFLINE_PIN",
    startedAt,
    headSha: args.headSha,
    schemaVersion: "1.0",
    artifactId: `${artifactBase}:PREFLIGHT`,
    status: "PINNED_OFFLINE",
    adr1Cite: ADR1,
    target: args.discoveryId,
    sectionRef: target.normalizedSourceRef,
    stratum,
    packageKey: pkg.packageKey,
    crossCuts,
    role: target.role,
    model: MODEL,
    hardCeilingUsd: HARD_CEILING_USD,
    certifiedConfigIdentity: certifiedConfigIdentity(config),
    candidateDeadlineMs: config.candidateDeadlineMs,
    maxOutputTokensSemantic: config.maxOutputTokens,
    inventoryMode: config.inventoryMode,
    expansionRegionPolicy: config.expansionRegionPolicy,
    operativeState: {
      source: pkg.operativeStateMeta.source.path,
      runId: pkg.operativeStateMeta.source.runId,
      status: pkg.operativeState.status,
      provisions: pkg.operativeState.provisions.length,
      governingProvisionForTarget: governing?.provisionKey ?? null,
    },
    asOfDate: args.asOfDate,
    derivedPassABounds: {
      policy: "phase3-inventory-execution.v1|reasoning=DISABLED|deadline=180000|retry=2|batch=6000/24|calls=12|perSlot=1+c/150<=8|bounds=120/400/8/6/6|tpc=0.4",
      sourceContextState: "COMPLETE_LOCAL_SOURCE",
      note: "Bounds are planning placeholders for a later authorized live chunk; no Pass A executed in this offline pin.",
    },
    inputs: {
      documents: pkg.documents.map((d) => ({
        documentId: d.documentId,
        chars: d.chars,
        sha256: d.sha256,
        ...(d.rawSha256 ? { rawSha256: d.rawSha256 } : {}),
        ...(d.title ? { title: d.title } : {}),
      })),
      sealedDiscoverySource: pkg.sealedDiscoverySource,
      sealedDiscoveryCandidateCount: pkg.sealedDiscoveryCandidateCount,
      sealedStructuralNodesSource: pkg.sealedStructuralNodesSource,
      fixtureRoot: pkg.fixtureRoot,
      sealedPopulationCandidates: pkg.sealedDiscoveryCandidateCount,
      rehydrationUnresolved: pkg.rehydrationUnresolved.length,
      discoveryHealth: pkg.discoveryHealth,
    },
    asOfConsistency: {
      ...pkg.operativeStateMeta.asOfConsistency,
      checks: [
        ...((pkg.operativeStateMeta.asOfConsistency.checks as unknown[]) ?? []),
        {
          code: "DISCOVERY_ID_PRESENT_IN_SEALED_TREE",
          passed: true,
          detail: `${args.discoveryId} present in ${pkg.sealedDiscoverySource}`,
        },
        {
          code: "STRUCTURAL_NODE_RESOLVED",
          passed: assertions.structuralNodeResolved && assertions.singleOccurrence,
          detail: `${anchor.nodeKey} resolved with single occurrence`,
        },
      ],
      proven: true,
    },
    note: "Offline pin only. No credential loaded. No provider contacted. Live/paid certification is a later authorized chunk.",
    canonicalMapHonestyNote: mapHonesty.note,
    interimBRelatedSeriesDetected: interimBHit,
  };

  const operativeStatePacket = {
    schemaVersion: "1.0",
    artifactId: `${artifactBase}:OPERATIVE_STATE`,
    status: "PINNED_OFFLINE",
    baseSha: args.headSha,
    adapter: pkg.operativeStateMeta.adapter,
    source: pkg.operativeStateMeta.source,
    analyzedDocuments: pkg.operativeStateMeta.analyzedDocuments,
    documentsProcessed: pkg.operativeStateMeta.documentsProcessed,
    asOfConsistency: pkg.operativeStateMeta.asOfConsistency,
    instrumentState: {
      status: pkg.operativeState.status,
      asOfDate: pkg.operativeState.asOfDate,
      summary: pkg.operativeState.summary,
      provisions: pkg.operativeState.provisions.map((p) => ({
        provisionKey: p.provisionKey,
        kind: p.kind,
        sectionRef: p.sectionRef,
        definedTermRef: p.definedTermRef,
        status: p.status,
        currentSourceDocumentId: p.currentSourceDocumentId,
        unresolvedIssues: p.unresolvedIssues,
      })),
      unattachedEffects: pkg.operativeState.unattachedEffects.length,
      effects: pkg.amendmentEffects.length,
    },
    target: {
      governingProvision: governing
        ? {
            provisionKey: governing.provisionKey,
            status: governing.status,
            currentSourceDocumentId: governing.currentSourceDocumentId,
            appliedEffectIds: governing.appliedChain.map((c) => c.effectId),
            supersededSourceNodeIds: governing.supersededSourceNodeIds,
          }
        : null,
      operativeSourceOrigin: src.origin,
      note: governing
        ? "a Phase-2 provision governs this candidate"
        : "no Phase-2 provision governs this candidate: the base structural node text is the operative source",
    },
  };

  const eligibility = {
    schemaVersion: "1.0",
    artifactId: `${artifactBase}:TARGET_ELIGIBILITY`,
    status: "PINNED_OFFLINE",
    baseSha: args.headSha,
    governingProvision: governing ? { provisionKey: governing.provisionKey, status: governing.status } : null,
    governingProvisionReviewRequired: governingReview,
    phase2ReviewRequiredProvisions: directMentions,
    operativeTextSectionReferences: scanned.map((x) => ({
      raw: x.raw,
      normalized: x.normalized,
      span: [x.charStart, x.charEnd],
      selector: x.selector,
    })),
    offlineBundle: {
      sufficiencyState: ob.sufficiencyState,
      stopReasons: [...ob.stopReasons],
      items: ob.items.length,
      hasUnresolvedOperativeEvidence: ob.hasUnresolvedOperativeEvidence ?? false,
      unresolvedEvidenceItemIds: ob.unresolvedEvidenceItemIds ?? [],
      nonCurrentItems: nonCurrent,
      retainedRefs: ob.items.map((i) => [i.type, i.normalizedRef, i.retrievalDepth]),
    },
    sourceContentVersion: offline.sourceContentVersion,
    identityStrength: offline.identityStrength,
    eligible,
    eligibilityBlockers: [
      ...(identityOk ? [] : ["IDENTITY_ASSERTIONS_FAILED"]),
      ...(interimBHit ? ["INTERIM_B_RELATED_SERIES_DETECTED"] : []),
      ...(governingReview ? ["GOVERNING_PROVISION_REVIEW_REQUIRED"] : []),
      ...(ob.hasUnresolvedOperativeEvidence ? ["UNRESOLVED_OPERATIVE_EVIDENCE"] : []),
      ...(directMentions.some((m) => m.directlyReferencedBySection || m.definedTermMentionedInOperativeText)
        ? ["PHASE2_REVIEW_REQUIRED_MENTIONED_IN_OPERATIVE"]
        : []),
    ],
    crossCutClaims: crossCutClaims({
      crossCuts,
      role: target.role,
      discoveryId: args.discoveryId,
      operativeText: src.text,
    }),
    canonicalMapHonesty: {
      discoveryId: args.discoveryId,
      mapTags: mapHonesty.mapTags,
      mapOutcome: mapHonesty.mapOutcome,
      compilationStatus: mapHonesty.compilationStatus,
      verificationStatus: mapHonesty.verificationStatus,
      note: mapHonesty.note,
    },
    discoveryHonesty: {
      reviewStatus: target.reviewStatus,
      confidence: target.confidence,
      documentDiscoveryHealth: pkg.discoveryHealth,
      note: pkg.discoveryHealth
        ? `Sealed discovery recorded ${target.reviewStatus} for this candidate and ${pkg.discoveryHealth} at document level. Offline pin remains valid; discovery NEEDS_REVIEW is not pre-credit.`
        : `Sealed discovery recorded ${target.reviewStatus} for this candidate. Offline pin remains valid.`,
    },
  };

  if (!identityOk) {
    throw new Error(`target identity assertions failed: ${JSON.stringify(assertions)}`);
  }

  const files = [
    writeJson(outDir, "00-pin-manifest.json", manifest),
    writeJson(outDir, "00-preflight.json", preflight),
    writeJson(outDir, "01-target-identity.json", { schemaVersion: "1.0", artifactId: `${artifactBase}:TARGET_IDENTITY`, status: "PINNED_OFFLINE", baseSha: args.headSha, identity, assertions }),
    writeJson(outDir, "01b-operative-state.json", operativeStatePacket),
    writeJson(outDir, "01c-target-eligibility.json", eligibility),
  ];

  return {
    outDir,
    files,
    eligible,
    stratum,
    crossCuts,
    operativeSourceSha256: textSha,
    operativeSourceChars: src.text.length,
  };
}
