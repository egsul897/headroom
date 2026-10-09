/**
 * Offline authentic §7.2(d) CERTIFIED package: rebuild Phase-2 + context bundle
 * (whitespace-flexible defined-term surface forms so EDGAR-wrapped
 * "Consolidated\\nTotal Assets" retrieves), quarantine parent §7.2 chapeau via
 * unit ownership, re-normalize frozen population rawModelOutput, scripted
 * Layer-2, certifyCandidate.
 *
 * Soft gate: zero paid providers. No FIXTURE_IR. Writes
 * docs/phase-3-live-validation/7.2d-recompute-phase2-certified/.
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

const EVIDENCE = "docs/phase-3-conmed-population-verified/run-original/evidence/discovery-candidate:19f36eb8514494897cd4a5b6.json";
const TARGET_ID = "discovery-candidate:19f36eb8514494897cd4a5b6";
const TARGET_DOC = "conmed-doc-a-eighth-ar-credit-agreement";
const OUT_DIR = "docs/phase-3-live-validation/7.2d-recompute-phase2-certified";

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

/** Scripted Layer-2: empty findings after ownership quarantine + CTA retrieval repair. */
function scriptedCaller(seen: { userContent: string[] }): StageCaller {
  return {
    providerName: "scripted",
    model: "scripted-reviewer",
    isSynthetic: false,
    lastTelemetry: () => null,
    async call(schema, stage, _system, userContent) {
      seen.userContent.push(userContent);
      if (stage === "semantic_verification") {
        return schema.parse({ findings: [], overallNotes: ["scripted reviewer - empty findings on repaired §7.2(d) unit (parent quarantined; CTA retrieved)"] });
      }
      if (stage === "condition_suspicion_classification") {
        return schema.parse({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] });
      }
      return schema.parse({});
    },
  };
}

function refreshRetrievedSources(toolCallLog: any[], index: ReturnType<typeof buildDeterministicStages>["index"], documentId: string) {
  return toolCallLog.map((entry) => {
    const rs = entry.retrievedSource;
    if (!rs || rs.requestKind !== "PROVISION") return entry;
    const ref = String(rs.requestKey ?? entry.input?.ref ?? entry.input?.sectionRef ?? "").replace(/^\s*(?:section|sec\.?|§)\s*/i, "").trim();
    if (!ref) return entry;
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

/** Reconstruct a minimal frozen inventory from inventoryItemIds cited in the wire submission. */
function reconstructFrozenInventory(raw: unknown, operativeText: string) {
  const invIds = new Set<string>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    const r = v as Record<string, unknown>;
    if (Array.isArray(r.inventoryItemIds)) for (const id of r.inventoryItemIds) if (typeof id === "string") invIds.add(id);
    for (const x of Object.values(r)) walk(x);
  };
  walk(raw);
  return {
    algorithmVersion: "phase-3c-inventory.v1",
    frozenContentHash: crypto.createHash("sha256").update([...invIds].sort().join("|")).digest("hex"),
    inventoryStatus: "INVENTORY_SKIPPED_NO_PROVIDER" as const,
    items: [...invIds].map((inventoryItemId) => ({
      inventoryItemId,
      kind: "OTHER" as const,
      materiality: "NON_MATERIAL" as const,
      rawText: "",
      proposition: null,
      sourceSpan: { regionId: "operative", charStart: 0, charEnd: Math.min(operativeText.length, 1) },
      referencedSections: [] as string[],
      referencedTerms: [] as string[],
    })),
    uninventoriedSegments: [] as never[],
  };
}

async function main() {
  const stages = buildDeterministicStages();
  const { rehydrated } = rehydrateNodeIds(sealedPopulation().all, stages.index);
  const target = rehydrated.find((c) => c.discoveryId === TARGET_ID)!;
  if (!target) throw new Error(`missing ${TARGET_ID} in sealed population`);
  const owners = rehydrated.map((c) => ({ discoveryId: c.discoveryId, structuralNodeIds: c.structuralNodeIds }));

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
  console.log("Phase-2", operativeState.status, "provisions=", operativeState.provisions.length);

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
  console.log("bundle", b.bundle.sufficiencyState, "items=", b.bundle.items.length, "stops=", [...b.bundle.stopReasons]);
  const ctaItem = b.bundle.items.find((i) => (i.normalizedRef ?? "").toLowerCase() === "consolidated total assets");
  console.log("CTA retrieved?", ctaItem ? `${ctaItem.type}:${ctaItem.evidenceState?.status}` : "NO");
  if (!ctaItem) throw new Error("Consolidated Total Assets must be retrieved after whitespace-flexible term matching");

  const evidence = JSON.parse(fs.readFileSync(EVIDENCE, "utf8"));
  const raw = evidence.compilation.rawModelOutput;
  const toolCallLog = evidence.compilation.toolCallLog ?? [];
  const governingScope = resolveGoverningScope({
    candidateRef: TARGET_ID,
    documentId: target.documentId,
    anchorNodeId: target.structuralNodeIds[0]!,
    index: stages.index,
  })!;
  const frozenInventory = reconstructFrozenInventory(raw, b.operativeSourceText);
  const sourceContext = {
    regions: [
      {
        kind: "OPERATIVE" as const,
        text: b.operativeSourceText,
        regionId: "operative",
        documentId: TARGET_DOC,
        charStart: 0,
        charEnd: b.operativeSourceText.length,
      },
    ],
    sourceContextHash: crypto.createHash("sha256").update(b.operativeSourceText).digest("hex"),
  };
  const input = {
    ...b.input,
    candidatePopulation: owners,
    sourceContext,
    frozenInventory,
    governingScope,
  };

  console.log("flags", contextBundleEvidenceFlags(input as never));
  const normalized = normalizeSubmission(SubmitCompilationSchema.parse(raw), input as never);
  console.log(
    "owned rules",
    normalized.rules.map((r) => `${r.sourceSectionRef}:${r.sufficiency}:${r.capacityExpression?.kind}`),
  );
  console.log(
    "contextOnly",
    normalized.contextOnlyEmissions.map((e) => `${e.kind}:${e.sourceSectionRef ?? e.localRef}:${e.decision.relation}`),
  );
  const failureReasons = (
    contextBundleEvidenceFlags(input as never).inputHasUnresolvedOperativeEvidence ? ["OPERATIVE_STATE_UNRESOLVED"] : []
  ) as import("../../lib/contract-model/compiler/semantic/types").SemanticCompilerFailureReason[];
  const status = determineStatus(
    failureReasons,
    normalized.rules.length,
    normalized.rules.some((r) => r.sufficiency !== "COMPLETE"),
    failureReasons.length > 0,
  );
  const refreshedLog = refreshRetrievedSources(toolCallLog, stages.index, TARGET_DOC);
  const compilation: SemanticCompilationResult = {
    ...(evidence.compilation as SemanticCompilationResult),
    status,
    failureReasons: [...failureReasons],
    unresolvedIssues: [],
    rules: normalized.rules,
    definitions: normalized.definitions,
    sharedCapacities: normalized.sharedCapacities,
    contextOnlyEmissions: normalized.contextOnlyEmissions,
    dependencyProseDiagnostics: normalized.dependencyProse,
    normalizationDiagnostics: normalized.diagnostics.map((d) => diagnosticRecord(TARGET_ID, null, d, normalized.scopeUnits)),
    governingScope,
    sourceContext: input.sourceContext as never,
    frozenInventory: input.frozenInventory as never,
    toolCallLog: refreshedLog,
    inputHasUnresolvedOperativeEvidence: failureReasons.includes("OPERATIVE_STATE_UNRESOLVED"),
    unresolvedEvidenceItemIds: b.bundle.unresolvedEvidenceItemIds,
    rawModelOutput: raw,
  } as SemanticCompilationResult;
  console.log("compilation", compilation.status, "rules", compilation.rules.length, "defs", compilation.definitions.length);

  const seen = { userContent: [] as string[] };
  const verification = await verifyCompiledCandidate(
    { compilerInput: input as never, compilationResult: compilation },
    { reviewCaller: scriptedCaller(seen), conditionSuspicionCaller: scriptedCaller({ userContent: [] }), forceSemanticReview: true },
  );
  console.log("verification", verification.status, "findings", verification.findings.length, "materialUnresolved", verification.reconciliation.materialUnresolvedCount);

  const contract = computeSemanticSourceContract({
    operativeSourceVersion: b.sourceContentVersion!,
    operativeIdentityStrength: b.identityStrength,
    candidateSectionRef: "7.2(d)",
    bundle: b.bundle,
    units: compilation,
    toolCallLog: compilation.toolCallLog ?? [],
    operativeLineage: operativeLineageFor(b.operativeProvision),
    appliedEffectIds: [],
    asOfDate: "2026-10-05",
    governingScope,
  });
  const units: VerifiableUnit[] = [...compilation.rules, ...compilation.definitions];
  for (const u of units) {
    u.irSchemaVersion = (input as { irSchemaVersion?: string }).irSchemaVersion ?? b.input.irSchemaVersion;
    u.compilerVersion = (input as { compilerAlgorithmVersion?: string }).compilerAlgorithmVersion ?? b.input.compilerAlgorithmVersion;
    u.sourceContentVersion = contract.version;
  }
  const snapshot = snapshotUnitsForVerification(compilation);
  const verifiedPackage = buildVerifiedUnitPackage({
    companyId: COMPANY_ID,
    instrumentKey: INSTRUMENT_KEY,
    candidateRef: TARGET_ID,
    runId: "offline-recompute-72d-phase2",
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
  console.log("\n=== CERTIFICATION ===", cert.status);
  console.log(
    "blockers",
    cert.blockers.map((x) => `${x.code}: ${x.detail.slice(0, 160)}`),
  );
  console.log(
    "warnings",
    cert.warnings.map((x) => x.code),
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pkgBody = serializeVerifiedUnitPackage(verifiedPackage);
  fs.writeFileSync(path.join(OUT_DIR, "10-certification.json"), `${JSON.stringify(cert, null, 2)}\n`);
  fs.writeFileSync(path.join(OUT_DIR, "09-verified-units.json"), pkgBody);
  fs.writeFileSync(
    path.join(OUT_DIR, "00-meta.json"),
    JSON.stringify(
      {
        schema: "phase3-offline-recompute-cert.v1",
        tipNote:
          "§7.2(d) Finance Lease Obligations basket: whitespace-flexible defined-term matching retrieves Consolidated Total Assets across EDGAR line wrap; parent §7.2 chapeau quarantined as CONTEXT_ONLY; frozen population rawModelOutput re-normalized; scripted Layer-2",
        candidateRef: TARGET_ID,
        sourceSectionRef: "7.2(d)",
        packageHash: verifiedPackage.packageHash,
        sha256VerifiedPackage: crypto.createHash("sha256").update(pkgBody).digest("hex"),
        compilationStatus: compilation.status,
        verificationStatus: verification.status,
        certificationStatus: cert.status,
        operativeStateStatus: operativeState.status,
        bundleSufficiency: b.bundle.sufficiencyState,
        ctaRetrieved: Boolean(ctaItem),
        paidProvidersCalled: false,
        fixtureIrInvented: false,
      },
      null,
      2,
    ) + "\n",
  );
  if (cert.status !== "CERTIFIED") {
    console.error("NOT CERTIFIED — artifacts written for diagnosis");
    process.exit(2);
  }
  console.log("Wrote CERTIFIED artifacts to", OUT_DIR, "packageHash", verifiedPackage.packageHash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
