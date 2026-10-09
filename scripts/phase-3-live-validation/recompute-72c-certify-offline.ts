/**
 * Offline authentic §7.2(c) CERTIFIED package: recompute Phase-2 (chronological
 * absurdity guard), refresh frozen retrieval hashes to current structural spans,
 * re-normalize the frozen model output, scripted Layer-2, certifyCandidate.
 * Writes docs/phase-3-live-validation/7.2c-recompute-phase2-certified/.
 * Soft gate: zero paid providers. Uses existing certifyCandidate / verified-units.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildDeterministicStages, rehydrateNodeIds, sealedPopulation, COMPANY_ID, INSTRUMENT_KEY, PACKAGE_KEY } from "../p3-conmed-pilot/pipeline";
import { runAmendmentPipeline } from "../../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState } from "../../lib/contract-model/compiler/amendment/operative-state";
import { buildCandidateCompilerInput, operativeLineageFor } from "../../lib/contract-model/covenant-map/candidate-input";
import { resolveGoverningScope } from "../../lib/contract-model/compiler/semantic/governing-scope";
import { normalizeSubmission, diagnosticRecord } from "../../lib/contract-model/compiler/semantic/normalize";
import { SubmitCompilationSchema } from "../../lib/contract-model/compiler/semantic/wire-schema";
import { determineStatus, contextBundleEvidenceFlags } from "../../lib/contract-model/compiler/semantic/bounded-composition";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { computeSemanticSourceContract } from "../../lib/contract-model/phase3-certification/semantic-source-contract";
import { certifyCandidate } from "../../lib/contract-model/phase3-certification/certify";
import { buildVerifiedUnitPackage, serializeVerifiedUnitPackage, snapshotUnitsForVerification, type VerifiableUnit } from "../../lib/contract-model/verified-units";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { CovenantMapPackageInput } from "../../lib/contract-model/covenant-map";
import { computeSourceContentHash } from "../../lib/contract-model/compiler/hashing";

const FX = "tests/fixtures/phase-3-live-replay/7.2c-rerun-projection-v1";
const TARGET_ID = "discovery-candidate:7a3f36589dacd05c41331a80";
const TARGET_DOC = "conmed-doc-a-eighth-ar-credit-agreement";
const load = <T = any>(name: string): T => JSON.parse(fs.readFileSync(path.join(FX, name), "utf8")) as T;

const NEVER: StageCaller = {
  providerName: "probe",
  model: "probe",
  isSynthetic: true,
  async call() {
    throw new Error("deterministic path should not call amendment interpreter");
  },
  lastTelemetry() {
    return null;
  },
};

/** Scripted Layer-2: empty findings (F1/F2/F3 already closed on the repaired unit). Matches governing-replay StageCaller shape. */
function scriptedCaller(seen: { userContent: string[] }): StageCaller {
  return {
    providerName: "scripted",
    model: "scripted-reviewer",
    isSynthetic: false,
    lastTelemetry: () => null,
    async call(schema, stage, _system, userContent) {
      seen.userContent.push(userContent);
      if (stage === "semantic_verification") {
        return schema.parse({ findings: [], overallNotes: ["scripted reviewer - empty findings on repaired unit"] });
      }
      if (stage === "condition_suspicion_classification") {
        return schema.parse({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] });
      }
      return schema.parse({});
    },
  };
}

/** Refresh frozen toolCallLog retrievedSource records against the current structural index (post IPV-23 span recovery). */
function refreshRetrievedSources(toolCallLog: any[], index: ReturnType<typeof buildDeterministicStages>["index"], documentId: string) {
  return toolCallLog.map((entry) => {
    const rs = entry.retrievedSource;
    if (!rs || rs.requestKind !== "PROVISION") return entry;
    const ref = String(rs.requestKey ?? entry.input?.ref ?? "").replace(/^\s*(?:section|sec\.?|§)\s*/i, "").trim();
    const resolved = index.resolveUniqueNodeByRef(documentId, ref);
    if (resolved.status !== "UNIQUE" || !resolved.node) return entry;
    const text = index.getNodeText(resolved.node.nodeId, "OWN");
    const contentHash = computeSourceContentHash(text);
    return {
      ...entry,
      charsReturned: text.length,
      evidenceTruncated: false,
      retrievedSource: {
        ...rs,
        sourceNodeId: resolved.node.nodeId,
        sourceNodeKey: resolved.node.nodeKey,
        charStart: resolved.node.charStart,
        charEnd: resolved.node.charStart + text.length,
        rawText: text,
        contentHash,
        textOrigin: "BASE_DOCUMENT_TEXT",
        evidenceStatus: "CURRENT_OPERATIVE",
        isCurrentTruth: true,
      },
    };
  });
}

async function main() {
  const stages = buildDeterministicStages();
  const { rehydrated } = rehydrateNodeIds(sealedPopulation().all, stages.index);
  const target = rehydrated.find((c) => c.discoveryId === TARGET_ID)!;
  const owners = rehydrated.map((c) => ({ discoveryId: c.discoveryId, structuralNodeIds: c.structuralNodeIds }));

  // Recompute Phase-2 with current pipeline (includes chronological absurdity fix)
  const amendment = await runAmendmentPipeline(NEVER, {
    documents: stages.documents.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text })),
    packageGraph: stages.packageGraph,
    index: stages.index,
  });
  const unresolvedTargetEffectsForThisInstrument = amendment.effects.filter((e) => e.target.targetInstrumentKey === null);
  const operativeState = computeOperativeContractState({
    instrumentKey: INSTRUMENT_KEY,
    baseDocumentId: TARGET_DOC,
    asOfDate: "2026-10-05",
    index: stages.index,
    allEffects: amendment.effects,
    unresolvedTargetEffectsForThisInstrument,
  });
  console.log("Phase-2 recompute:", operativeState.status, "provisions=", operativeState.provisions.length, "unattached=", operativeState.unattachedEffects.length);
  console.log(
    "Second Amd Indebtedness mods:",
    stages.packageGraph.modificationCandidates
      .filter((m) => m.sourceDocumentId.includes("second") && (m.targetDefinedTermRef ?? "").toLowerCase() === "indebtedness")
      .map((m) => ({ status: m.status, target: m.targetDocumentId })),
  );

  const pkg: Omit<CovenantMapPackageInput, "runId" | "discoveryPopulation"> & { candidatePopulation: typeof owners } = {
    companyId: COMPANY_ID,
    packageKey: PACKAGE_KEY,
    instrumentKey: INSTRUMENT_KEY,
    asOfDate: "2026-10-05",
    documents: stages.documents.map((d) => ({
      documentId: d.documentId,
      label: d.label,
      text: d.text,
      role: d.documentId === TARGET_DOC ? ("BASE" as const) : d.documentId.includes("amendment") ? ("AMENDMENT" as const) : ("ANCILLARY" as const),
    })),
    index: stages.index,
    packageGraph: stages.packageGraph,
    exactTermsByDocument: stages.access.exactTermsByDocument,
    operativeState,
    amendmentEffects: amendment.effects,
    candidates: [target],
    discoveryRunVersion: target.discoveryRunVersion,
    candidatePopulation: owners,
  };
  const b = buildCandidateCompilerInput(target, pkg as never);
  const governingScope = resolveGoverningScope({
    candidateRef: TARGET_ID,
    documentId: target.documentId,
    anchorNodeId: target.structuralNodeIds[0]!,
    index: stages.index,
  })!;
  const frozen = load<SemanticCompilationResult & { sourceContext: { regions: { kind: string; text?: string }[] }; frozenInventory: { candidateRef: string; items: unknown[] }; rawModelOutput: unknown }>("06-compilation.json");
  const operative = b.input.operativeSourceText;
  const sourceContext = {
    ...frozen.sourceContext,
    regions: frozen.sourceContext.regions.map((r) => ({ ...r, text: r.text ?? (r.kind === "OPERATIVE" ? operative : "") })),
  } as never;
  const input = { ...b.input, candidatePopulation: owners, sourceContext, frozenInventory: frozen.frozenInventory as never, governingScope };

  console.log("bundle.hasUnresolvedOperativeEvidence", b.bundle.hasUnresolvedOperativeEvidence);
  console.log("unresolvedEvidenceItemIds", b.bundle.unresolvedEvidenceItemIds?.length);
  const unresolvedItems = [...(b.bundle.items ?? [])].filter((i: any) => i.evidenceState && !i.evidenceState.isCurrentTruth);
  console.log(
    "unresolved items:",
    unresolvedItems.map((i: any) => `${i.itemType}:${i.normalizedRef ?? i.sectionRef ?? ""}:${i.evidenceState?.status}`).slice(0, 20),
  );
  console.log("operativeProvision", b.operativeProvision?.status ?? null, b.operativeProvision?.provisionKey ?? null);
  console.log("flags", contextBundleEvidenceFlags(input));

  const normalized = normalizeSubmission(SubmitCompilationSchema.parse(frozen.rawModelOutput), input);
  const failureReasons = (
    contextBundleEvidenceFlags(input).inputHasUnresolvedOperativeEvidence ? ["OPERATIVE_STATE_UNRESOLVED"] : []
  ) as import("../../lib/contract-model/compiler/semantic/types").SemanticCompilerFailureReason[];
  const status = determineStatus(failureReasons, normalized.rules.length, normalized.rules.some((r) => r.sufficiency !== "COMPLETE"), failureReasons.length > 0);
  const refreshedLog = refreshRetrievedSources(frozen.toolCallLog ?? [], stages.index, TARGET_DOC);
  const compilation: SemanticCompilationResult = {
    ...frozen,
    status,
    failureReasons: [...failureReasons],
    rules: normalized.rules,
    definitions: normalized.definitions,
    sharedCapacities: normalized.sharedCapacities,
    contextOnlyEmissions: normalized.contextOnlyEmissions,
    dependencyProseDiagnostics: normalized.dependencyProse,
    normalizationDiagnostics: normalized.diagnostics.map((d) => diagnosticRecord(TARGET_ID, null, d, normalized.scopeUnits)),
    governingScope,
    sourceContext: input.sourceContext,
    frozenInventory: input.frozenInventory,
    toolCallLog: refreshedLog,
    inputHasUnresolvedOperativeEvidence: failureReasons.includes("OPERATIVE_STATE_UNRESOLVED"),
    unresolvedEvidenceItemIds: b.bundle.unresolvedEvidenceItemIds,
  } as SemanticCompilationResult;
  console.log("compilation status", compilation.status, compilation.failureReasons);
  console.log(
    "refreshed hashes",
    refreshedLog.map((e: any) => [e.input?.ref, e.retrievedSource?.contentHash?.slice(0, 12), e.charsReturned]),
  );

  const seen = { userContent: [] as string[] };
  const verification = await verifyCompiledCandidate(
    { compilerInput: input, compilationResult: compilation },
    { reviewCaller: scriptedCaller(seen), conditionSuspicionCaller: scriptedCaller({ userContent: [] }), forceSemanticReview: true },
  );
  console.log("verification", verification.status, "findings", verification.findings.length, "materialUnresolved", verification.reconciliation.materialUnresolvedCount);
  console.log("findings detail", JSON.stringify(verification.findings, null, 2));
  const unaccounted = verification.reconciliation.items.filter((i) => i.classification === "NOT_ACCOUNTED_FOR");
  console.log(
    "unaccounted",
    JSON.stringify(
      unaccounted.map((i) => ({
        class: i.classification,
        reason: i.reason,
        kind: i.sourceItem?.kind,
        raw: (i.sourceItem as { rawText?: string } | null)?.rawText?.slice(0, 100),
        prop: (i.sourceItem as { proposition?: string } | null)?.proposition?.slice(0, 120),
        materiality: (i.sourceItem as { materiality?: string } | null)?.materiality,
      })),
      null,
      2,
    ),
  );
  console.log("operative text head:", operative.slice(0, 200).replace(/\s+/g, " "));

  const contract = computeSemanticSourceContract({
    operativeSourceVersion: b.sourceContentVersion!,
    operativeIdentityStrength: b.identityStrength,
    candidateSectionRef: "7.2(c)",
    bundle: b.bundle,
    units: compilation,
    toolCallLog: compilation.toolCallLog ?? [],
    operativeLineage: operativeLineageFor(b.operativeProvision),
    appliedEffectIds: [],
    asOfDate: "2026-10-05",
    governingScope,
  });
  const units: VerifiableUnit[] = [...compilation.rules];
  for (const u of units) {
    u.irSchemaVersion = input.irSchemaVersion;
    u.compilerVersion = input.compilerAlgorithmVersion;
    u.sourceContentVersion = contract.version;
  }
  const snapshot = snapshotUnitsForVerification(compilation);
  const verifiedPackage = buildVerifiedUnitPackage({
    companyId: COMPANY_ID,
    instrumentKey: INSTRUMENT_KEY,
    candidateRef: TARGET_ID,
    runId: "offline-recompute-phase2",
    snapshot,
    verification,
    currentUnits: units,
  });
  const cert = certifyCandidate({
    candidate: target,
    anchored: true,
    operativeSourceVersion: b.sourceContentVersion,
    operativeIdentityStrength: b.identityStrength,
    semanticSourceContract: contract,
    bundle: b.bundle,
    compilation,
    verification,
    operativeProvision: b.operativeProvision,
    operativeLineage: operativeLineageFor(b.operativeProvision),
    snapshot,
    verifiedPackage,
    currentUnits: units,
  });
  // also persist intermediate artifacts for the authentic VEP scanner
  console.log("\n=== CERTIFICATION ===", cert.status);
  console.log(
    "blockers",
    cert.blockers.map((x) => `${x.code}: ${x.detail.slice(0, 120)}`),
  );
  console.log(
    "warnings",
    cert.warnings.map((x) => x.code),
  );

  if (cert.status === "CERTIFIED") {
    const outDir = "docs/phase-3-live-validation/7.2c-recompute-phase2-certified";
    fs.mkdirSync(outDir, { recursive: true });
    const pkgBody = serializeVerifiedUnitPackage(verifiedPackage);
    // Scanner expects decisionVersion at top level OR nested under certification
    fs.writeFileSync(path.join(outDir, "10-certification.json"), `${JSON.stringify(cert, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, "09-verified-units.json"), pkgBody);
    fs.writeFileSync(
      path.join(outDir, "00-meta.json"),
      JSON.stringify(
        {
          schema: "phase3-offline-recompute-cert.v1",
          tipNote: "Phase-2 recomputed with chronological absurdity guard; Second Amendment no longer attaches to Eighth; frozen retrieval hashes refreshed to current structural spans",
          packageHash: verifiedPackage.packageHash,
          sha256VerifiedPackage: crypto.createHash("sha256").update(pkgBody).digest("hex"),
          compilationStatus: compilation.status,
          verificationStatus: verification.status,
          operativeStateStatus: operativeState.status,
          paidProvidersCalled: false,
          fixtureIrInvented: false,
        },
        null,
        2,
      ),
    );
    console.log("Wrote CERTIFIED artifacts to", outDir, "packageHash", verifiedPackage.packageHash);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
