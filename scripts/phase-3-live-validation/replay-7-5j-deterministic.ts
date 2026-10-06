/**
 * §7.5(j) LIVE-EXPOSED DETERMINISTIC DEFECT CLOSURE - OFFLINE REPLAY of the frozen live artifacts (read-only regression
 * fixtures under docs/phase-3-live-validation/7.5j-end-to-end-certification/, sha256-pinned below) through the corrected
 * deterministic layers. ZERO provider calls: the Layer-2 reviewer is a scripted stand-in that returns the live reviewer's
 * RECORDED zero findings, so only the deterministic layers are exercised; nothing here is evidence of reviewer behaviour.
 *
 * BEFORE values come from the frozen artifacts themselves; AFTER values are recomputed from the same frozen inputs
 * (operative source, frozen inventory items, raw model submission, real structural index, real preserved Phase-2 state).
 * The frozen model output is NOT a desired-output fixture: its genuine gaps (related-series aggregation, the two
 * non-cash valuation mechanics, single-run support asymmetry, the (j)/(x)/(y) enumeration signal) are reported, never
 * erased. Shared by the evidence generator (derive-7-5j-deterministic-remediation.ts) and the regression test.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildDeterministicStages, rehydrateNodeIds, sealedPopulation, COMPANY_ID, INSTRUMENT_KEY, PACKAGE_KEY } from "../p3-conmed-pilot/pipeline";
import { loadPreservedPhase2OperativeState } from "./operative-state";
import { buildCandidateCompilerInput, operativeLineageFor } from "../../lib/contract-model/covenant-map/candidate-input";
import { diagnosticRecord, normalizeSubmission } from "../../lib/contract-model/compiler/semantic/normalize";
import { SubmitCompilationSchema } from "../../lib/contract-model/compiler/semantic/wire-schema";
import { determineStatus } from "../../lib/contract-model/compiler/semantic/bounded-composition";
import { resolveGoverningScope } from "../../lib/contract-model/compiler/semantic/governing-scope";
import { CANONICAL_ACTION_ONTOLOGY_VERSION, classifySourceAction, assessActionCompatibility } from "../../lib/contract-model/compiler/semantic/action-ontology";
import { SEMANTIC_COMPILER_ALGORITHM_VERSION, type SemanticCompilationResult, type SemanticCompilerFailureReason } from "../../lib/contract-model/compiler/semantic/types";
import { computeSourceCoverage } from "../../lib/contract-model/compiler/semantic-accountability/source-coverage";
import { canonicalizeFrozenQuantitativeValue } from "../../lib/contract-model/compiler/semantic-accountability/inventory";
import { quantitativeValuesEquivalent } from "../../lib/contract-model/compiler/semantic-accountability/quantitative";
import { reconcileInventoryWithComposition } from "../../lib/contract-model/compiler/semantic-accountability/reconciliation";
import { SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, type FrozenSemanticInventory, type QuantitativeValue, type SourceContextRegion } from "../../lib/contract-model/compiler/semantic-accountability/types";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import { buildSemanticVerificationProjection, computeSemanticVerificationProjectionHash, SEMANTIC_VERIFICATION_PROJECTION_VERSION } from "../../lib/contract-model/compiler/semantic-verification/projection";
import { SEMANTIC_VERIFIER_ALGORITHM_VERSION, SEMANTIC_VERIFIER_PROMPT_VERSION } from "../../lib/contract-model/compiler/semantic-verification/types";
import { computeSemanticSourceContract } from "../../lib/contract-model/phase3-certification/semantic-source-contract";
import { certifyCandidate } from "../../lib/contract-model/phase3-certification/certify";
import { buildVerifiedUnitPackage, snapshotUnitsForVerification, type VerifiableUnit } from "../../lib/contract-model/verified-units";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { IRExpression, IRRule } from "../../lib/contract-model/ir/types";
import type { CovenantMapPackageInput } from "../../lib/contract-model/covenant-map";

export const FROZEN_DIR = "docs/phase-3-live-validation/7.5j-end-to-end-certification";
export const TARGET_ID = "discovery-candidate:5aeac47ab31feb23331e4f89";
export const TARGET_DOC = "conmed-doc-a-eighth-ar-credit-agreement";
export const LIVE_AS_OF = "2026-10-06";
/** sha256 of each frozen input, recorded at closure time; a mismatch means the immutable evidence was touched. */
export const FROZEN_HASHES: Record<string, string> = {
  "01-target-identity.json": "f99d45c78246c17ac278e514c3c227f0d9ce3df7707db2f3e1020a6e815ddb2d",
  "05c-governing-scope.json": "ca6b066d39345b1abf8ec54c9b25b908f0b6ae76cc4c1be28126910ca2a155a5",
  "06-compilation.json": "869bd345d9d962374cc51d0d484ac793035778005a926270d3f5cb708fecc46f",
  "08-verification.json": "cb21b598ce53041268dafd0c1cede6a9769c93eb69f24c877593ae47e265a564",
  "10-certification.json": "4b64a9ad1c165b433f5ce10bcf3ab3e459fa3bcca93cbbbd9de0af755151b6d7",
};
export const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
const loadFrozen = <T = any>(name: string): T => JSON.parse(fs.readFileSync(path.join(FROZEN_DIR, name), "utf8")) as T;

export function verifyFrozenHashes(): { file: string; expected: string; actual: string; ok: boolean }[] {
  return Object.entries(FROZEN_HASHES).map(([file, expected]) => { const actual = sha256(fs.readFileSync(path.join(FROZEN_DIR, file))); return { file, expected, actual, ok: actual === expected }; });
}

function zeroFindingReviewer(): StageCaller {
  return { providerName: "scripted", model: "scripted-zero-findings (the live reviewer's recorded result)", isSynthetic: false, lastTelemetry: () => null,
    async call(schema, stage) {
      if (stage === "semantic_verification") return schema.parse({ findings: [], overallNotes: ["offline replay: Layer 2 scripted to the live reviewer's recorded zero findings; not evidence of reviewer behaviour"] });
      if (stage === "condition_suspicion_classification") return schema.parse({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [] });
      return schema.parse({});
    } };
}

const ctaNodeOf = (rule: IRRule): IRExpression | null => {
  try { return ((((rule.capacityExpression as { gatedBy: { right: { operands: IRExpression[] } } }).gatedBy.right.operands[1] as { operands: IRExpression[] }).operands[1]) ?? null); } catch { return null; }
};

export async function replayFrozen75j() {
  const hashes = verifyFrozenHashes();
  if (hashes.some((h) => !h.ok)) throw new Error(`frozen §7.5(j) evidence hash mismatch: ${JSON.stringify(hashes.filter((h) => !h.ok))}`);
  const identity = loadFrozen<{ identity: { operativeSourceText: string; operativeSourceSha256: string; anchor: { nodeId: string } } }>("01-target-identity.json").identity;
  const frozen = loadFrozen<SemanticCompilationResult & { sourceContext: { state: string; regions: (SourceContextRegion & { text?: string })[] }; frozenInventory: FrozenSemanticInventory; rawModelOutput: unknown; accountability: ReturnType<typeof reconcileInventoryWithComposition> }>("06-compilation.json");
  const frozenGoverning = loadFrozen<{ ancestorRegions: { regionId: string; role: string; text: string }[]; actionEvidence: unknown[]; inheritedAction: unknown; inheritedActionBasis: unknown; notes: string[] }>("05c-governing-scope.json");
  const frozenVerification = loadFrozen<{ status: string; findings: { severity: string; findingType: string; verificationMethod: string }[]; verificationProjection: { hash: string } }>("08-verification.json");
  const frozenCertification = loadFrozen<{ certification: { status: string; blockers: { code: string; detail: string }[] } }>("10-certification.json");
  const frozenRule = frozen.rules[0]!;
  const operative = identity.operativeSourceText;
  if (sha256(operative) !== identity.operativeSourceSha256) throw new Error("frozen operative text does not hash to its recorded sha256");

  // ---- the canonical candidate input, rebuilt exactly as the live runner built it (real index, sealed population, preserved Phase-2 state)
  const stages = buildDeterministicStages();
  const { rehydrated } = rehydrateNodeIds(sealedPopulation().all, stages.index);
  const target = rehydrated.find((c) => c.discoveryId === TARGET_ID);
  if (!target) throw new Error("target not in the sealed population");
  const owners = rehydrated.map((c) => ({ discoveryId: c.discoveryId, structuralNodeIds: c.structuralNodeIds }));
  const adapted = loadPreservedPhase2OperativeState({ instrumentKey: INSTRUMENT_KEY, baseDocumentId: TARGET_DOC });
  const pkg: Omit<CovenantMapPackageInput, "runId" | "discoveryPopulation"> & { candidatePopulation: typeof owners } = {
    companyId: COMPANY_ID, packageKey: PACKAGE_KEY, instrumentKey: INSTRUMENT_KEY, asOfDate: LIVE_AS_OF,
    documents: stages.documents.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text, role: d.documentId === TARGET_DOC ? ("BASE" as const) : d.documentId.includes("amendment") ? ("AMENDMENT" as const) : ("ANCILLARY" as const) })),
    index: stages.index, packageGraph: stages.packageGraph, exactTermsByDocument: stages.access.exactTermsByDocument, operativeState: adapted.state, amendmentEffects: adapted.effects,
    candidates: [target], discoveryRunVersion: target.discoveryRunVersion, candidatePopulation: owners,
  };
  const built = buildCandidateCompilerInput(target, pkg as never);
  if (built.input.operativeSourceText !== operative) throw new Error("the rebuilt operative source differs from the frozen one");
  const governingScope = resolveGoverningScope({ candidateRef: TARGET_ID, documentId: target.documentId, anchorNodeId: target.structuralNodeIds[0]!, index: stages.index })!;
  const regions = frozen.sourceContext.regions.map((r) => ({ ...r, text: r.text ?? (r.kind === "OPERATIVE" ? operative : "") })) as SourceContextRegion[];
  const sourceContext = { ...frozen.sourceContext, regions } as never;

  // ---- DEFECT A: source coverage over the SAME frozen items
  const items = frozen.frozenInventory.items;
  const coverageAfter = computeSourceCoverage({ regions: regions.filter((r) => r.regionId === "operative"), spans: items.map((i) => ({ regionId: i.sourceSpan.regionId, charStart: i.sourceSpan.charStart, charEnd: i.sourceSpan.charEnd, materiality: i.materiality })) });
  const defectA = {
    before: { unaccountedSource: frozen.frozenInventory.unaccountedSource.map((s) => ({ span: [s.charStart, s.charEnd], excerpt: s.excerpt })), inventoryStatus: frozen.frozenInventory.inventoryStatus, criticalItemSpanningThem: items.filter((i) => i.sourceSpan.charStart === 0).map((i) => [i.inventoryItemId, i.sourceSpan.charStart, i.sourceSpan.charEnd, i.materiality]) },
    after: { unaccountedSource: coverageAfter.unaccounted.map((s) => ({ span: [s.charStart, s.charEnd], excerpt: s.excerpt })), unaccountedValues: coverageAfter.unaccountedValues, countsByDisposition: coverageAfter.countsByDisposition, coveredSpans: coverageAfter.spans.filter((s) => s.disposition === "COVERED_BY_INVENTORY").map((s) => [s.charStart, s.charEnd]) },
    version: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION,
  };

  // ---- DEFECT B: the frozen values re-judged by the deterministic scanner (value-level, ids untouched)
  const canonicalizedItems = items.map((it) => {
    const out: QuantitativeValue[] = [];
    for (const v of it.quantitativeValues) { const c = canonicalizeFrozenQuantitativeValue(v, operative, { charStart: it.sourceSpan.charStart, charEnd: it.sourceSpan.charEnd }); if (!out.some((x) => quantitativeValuesEquivalent(x, c))) out.push(c); }
    return { ...it, quantitativeValues: out.sort((a, b) => a.charStart - b.charStart) };
  });
  const defectB = {
    before: items.filter((i) => i.quantitativeValues.some((v) => v.kind === "OTHER")).map((i) => ({ inventoryItemId: i.inventoryItemId, role: i.semanticRole, values: i.quantitativeValues.map((v) => [v.kind, v.rawText, v.normalizedValue]) , frozenDisposition: frozen.accountability.items.find((a) => a.inventoryItemId === i.inventoryItemId)?.disposition, frozenReason: frozen.accountability.items.find((a) => a.inventoryItemId === i.inventoryItemId)?.reason })),
    after: canonicalizedItems.filter((i) => items.find((x) => x.inventoryItemId === i.inventoryItemId)!.quantitativeValues.some((v) => v.kind === "OTHER")).map((i) => ({ inventoryItemId: i.inventoryItemId, values: i.quantitativeValues.map((v) => [v.kind, v.rawText, v.normalizedValue, v.unit, v.declaredKind ?? null]) })),
  };
  const inventoryStatusAfter = coverageAfter.unaccounted.length > 0 ? "INVENTORY_COVERAGE_GAP" : canonicalizedItems.length === 0 ? "INVENTORY_EMPTY_SUSPECT" : "INVENTORY_OK";
  const inventoryAfter: FrozenSemanticInventory = { ...frozen.frozenInventory, items: canonicalizedItems, unaccountedSource: coverageAfter.unaccounted.map((s) => ({ regionId: s.regionId, charStart: s.charStart, charEnd: s.charEnd, excerpt: s.excerpt, reason: s.reason, values: s.values })), uninventoriedValues: coverageAfter.unaccountedValues.map((v) => ({ ...v })), inventoryStatus: inventoryStatusAfter as never, inventoryStatusReason: `${frozen.frozenInventory.inventoryStatusReason} [offline replay ${SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION}: coverage recomputed over the same frozen items; status by the ensemble's own rule - gap iff unaccounted source remains]` };

  // ---- DEFECTS C + D: the frozen raw model submission re-normalized by the current deterministic compiler
  const input = { ...built.input, candidatePopulation: owners, sourceContext, frozenInventory: inventoryAfter, governingScope };
  const normalized = normalizeSubmission(SubmitCompilationSchema.parse(frozen.rawModelOutput), input);
  const rule = normalized.rules[0]!;
  const leadIn = frozenGoverning.ancestorRegions.find((r) => r.role === "PARENT_SCOPE")!.text;
  const ontologyAfter = classifySourceAction(leadIn);
  const defectC = {
    before: { frozenOntologyVersion: (frozenGoverning.actionEvidence[0] as { classification: { version: string } } | undefined)?.classification.version ?? null, actionEvidence: frozenGoverning.actionEvidence, inheritedAction: frozenGoverning.inheritedAction, notes: frozenGoverning.notes, ruleInheritedAction: (frozenRule.inheritedAttributes ?? []).find((a) => a.attribute === "action"), sufficiency: frozenRule.sufficiency, sufficiencyReasons: frozenRule.sufficiencyReasons ?? [] },
    after: { ontologyVersion: CANONICAL_ACTION_ONTOLOGY_VERSION, leadInClassification: ontologyAfter, compatibilityWithSellAsset: assessActionCompatibility("SELL_ASSET", ontologyAfter), governingActionEvidence: governingScope.actionEvidence, inheritedAction: governingScope.inheritedAction, notes: governingScope.notes, ruleInheritedAction: (rule.inheritedAttributes ?? []).find((a) => a.attribute === "action"), sufficiency: rule.sufficiency, sufficiencyReasons: rule.sufficiencyReasons ?? [] },
  };
  const defectD = {
    before: { compilerVersion: frozenRule.compilerVersion, ctaNode: ctaNodeOf(frozenRule), wireAsOfDate: (frozen.rawModelOutput as { rules: { capacityExpression: { gatedBy: { right: { operands: { operands: { asOfDate?: string }[] }[] } } } }[] }).rules[0]!.capacityExpression.gatedBy.right.operands[1]!.operands[1]!.asOfDate ?? null, diagnostics: (frozen.normalizationDiagnostics ?? []).map((d) => d.code) },
    after: { compilerVersion: SEMANTIC_COMPILER_ALGORITHM_VERSION, ctaNode: ctaNodeOf(rule), diagnostics: normalized.diagnostics.map((d) => ({ scope: d.scope, code: d.message.split(":")[0]!.trim() })), liftDiagnostic: normalized.diagnostics.map((d) => d.message).find((m) => m.startsWith("METRIC_REFERENCE_AS_OF_LIFTED")) ?? null },
  };

  // ---- Pass C over the canonicalized inventory and the re-normalized composition; failure reasons exactly as bounded-composition derives them
  const accountabilityAfter = reconcileInventoryWithComposition({ inventory: inventoryAfter, composition: { rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities }, dispositions: (frozen.rawModelOutput as { inventoryDispositions?: { inventoryItemId: string; disposition: string; note: string }[] }).inventoryDispositions ?? [], sourceContextState: frozen.sourceContext.state as never });
  const failureReasons: SemanticCompilerFailureReason[] = [];
  if (inventoryAfter.inventoryStatus === "INVENTORY_COVERAGE_GAP" || inventoryAfter.unaccountedSource.length > 0) failureReasons.push("SEMANTIC_INVENTORY_COVERAGE_GAP");
  if (accountabilityAfter.counts.materialMissingFromComposition > 0 || accountabilityAfter.counts.materialQuantitativeValuesMissing > 0) failureReasons.push("INVENTORY_ITEM_MISSING_FROM_COMPOSITION");
  if ((inventoryAfter.ensemble?.supportReviewRequired ?? false) || accountabilityAfter.supportReviewRequired) failureReasons.push("SEMANTIC_SUPPORT_REVIEW_REQUIRED");
  if (!accountabilityAfter.semanticallyComplete && !failureReasons.some((r) => r === "INVENTORY_ITEM_MISSING_FROM_COMPOSITION" || r === "SEMANTIC_INVENTORY_COVERAGE_GAP" || r === "SEMANTIC_SUPPORT_REVIEW_REQUIRED")) failureReasons.push("SEMANTIC_ACCOUNTABILITY_INCOMPLETE");
  const status = determineStatus(failureReasons, normalized.rules.length, normalized.rules.some((r) => r.sufficiency !== "COMPLETE"), failureReasons.length > 0);
  const compilation: SemanticCompilationResult = { ...frozen, status, failureReasons, rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities, contextOnlyEmissions: normalized.contextOnlyEmissions, dependencyProseDiagnostics: normalized.dependencyProse, normalizationDiagnostics: normalized.diagnostics.map((d) => diagnosticRecord(TARGET_ID, null, d, normalized.scopeUnits)), governingScope, sourceContext, frozenInventory: inventoryAfter, accountability: accountabilityAfter, unresolvedIssues: [] } as SemanticCompilationResult;

  // ---- deterministic verification layers (Layer 2 scripted to the recorded zero findings), projection, certification
  const contract = computeSemanticSourceContract({ operativeSourceVersion: built.sourceContentVersion!, operativeIdentityStrength: built.identityStrength, candidateSectionRef: "7.5(j)", bundle: built.bundle, units: compilation, toolCallLog: compilation.toolCallLog ?? [], operativeLineage: operativeLineageFor(built.operativeProvision), appliedEffectIds: [], asOfDate: LIVE_AS_OF, governingScope });
  const units: VerifiableUnit[] = [...compilation.rules];
  for (const u of units) { u.irSchemaVersion = input.irSchemaVersion; u.compilerVersion = input.compilerAlgorithmVersion; u.sourceContentVersion = contract.version; }
  const snapshot = snapshotUnitsForVerification(compilation);
  const verification = await verifyCompiledCandidate({ compilerInput: input, compilationResult: compilation }, { reviewCaller: zeroFindingReviewer(), conditionSuspicionCaller: zeroFindingReviewer(), forceSemanticReview: true });
  const verifiedPackage = buildVerifiedUnitPackage({ companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY, candidateRef: TARGET_ID, runId: "offline-7.5j-deterministic-remediation", snapshot, verification, currentUnits: units });
  const certification = certifyCandidate({ candidate: target, anchored: true, operativeSourceVersion: built.sourceContentVersion, operativeIdentityStrength: built.identityStrength, semanticSourceContract: contract, bundle: built.bundle, compilation, verification, operativeProvision: built.operativeProvision, operativeLineage: operativeLineageFor(built.operativeProvision), snapshot, verifiedPackage, currentUnits: units });
  const projection = buildSemanticVerificationProjection(compilation);
  const projectionJson = JSON.stringify(projection);

  const missingAfter = accountabilityAfter.items.filter((i) => i.disposition === "MISSING_FROM_COMPOSITION");
  const itemOf = (id: string) => accountabilityAfter.items.find((i) => i.inventoryItemId === id);
  const nonVocabUnsupported = (id: string) => {
    const it = itemOf(id);
    return !!it && it.disposition === "UNSUPPORTED" && typeof it.modelDisposition === "string" && it.modelDisposition.length > 0 && !/^(INTENTIONALLY_NON_COMPUTATIONAL|UNSUPPORTED|AMBIGUOUS|REPRESENTED|MISSING_FROM_COMPOSITION)$/i.test(it.modelDisposition.trim().replace(/[\s-]+/g, "_"));
  };
  const residual = {
    relatedSeries: { status: "NOT_STRUCTURALLY_REPRESENTED", evidence: "the related-series alternative lives in inventory items c262463526204a96714cd8f6 / 2bb0c84da8ad713ef2667e0f (consumed on the rule) and in the bound condition/gate excerpts; the IR carries no structural element aggregating a related series for the threshold test" },
    notesDebtSecuritiesValuation: {
      status: nonVocabUnsupported("inv-item:da2ae7a8c96e1ad42210a94e") ? "UNSUPPORTED_VIA_NON_VOCABULARY_DISPOSITION" : missingAfter.some((i) => i.inventoryItemId === "inv-item:da2ae7a8c96e1ad42210a94e") ? "MISSING_FROM_COMPOSITION (unchanged)" : "CHANGED - investigate",
      item: "inv-item:da2ae7a8c96e1ad42210a94e",
      modelDisposition: itemOf("inv-item:da2ae7a8c96e1ad42210a94e")?.modelDisposition ?? null,
      disposition: itemOf("inv-item:da2ae7a8c96e1ad42210a94e")?.disposition ?? null,
    },
    otherNonCashValuation: {
      status: ["inv-item:cfa2c306e7039e94371d186b", "inv-item:5e02c2d017c10fdbce5ccaf7"].every(nonVocabUnsupported) ? "UNSUPPORTED_VIA_NON_VOCABULARY_DISPOSITION" : missingAfter.filter((i) => i.inventoryItemId === "inv-item:cfa2c306e7039e94371d186b" || i.inventoryItemId === "inv-item:5e02c2d017c10fdbce5ccaf7").length === 2 ? "MISSING_FROM_COMPOSITION (unchanged)" : "CHANGED - investigate",
      items: ["inv-item:cfa2c306e7039e94371d186b", "inv-item:5e02c2d017c10fdbce5ccaf7"],
      modelDispositions: ["inv-item:cfa2c306e7039e94371d186b", "inv-item:5e02c2d017c10fdbce5ccaf7"].map((id) => itemOf(id)?.modelDisposition ?? null),
      dispositions: ["inv-item:cfa2c306e7039e94371d186b", "inv-item:5e02c2d017c10fdbce5ccaf7"].map((id) => itemOf(id)?.disposition ?? null),
    },
    supportAsymmetry: { supportReviewRequired: inventoryAfter.ensemble?.supportReviewRequired ?? null, materialSingleRun: inventoryAfter.ensemble?.counts.materialSingleRun ?? null, accountabilitySupportReviewRequired: accountabilityAfter.supportReviewRequired },
    enumerationSignal: verification.findings.filter((f) => f.findingType === "MISSING_RULE").map((f) => ({ severity: f.severity, verificationMethod: f.verificationMethod, signals: f.deterministicSignals })),
    gapReinventoryLocalRef: { status: "OBSERVED_BUT_NOT_REMEDIATED", detail: frozen.frozenInventory.gapReinventory?.error?.split("\n")[0] ?? null, note: "prompts and the wire schema are untouched in this closure; with defect A closed the frozen coverage gap is not reproduced over the same items, so a gap re-inventory would not have been triggered for it" },
  };

  return {
    hashes, target: { id: TARGET_ID, document: TARGET_DOC, operativeSourceSha256: identity.operativeSourceSha256, chars: operative.length }, frozenRawModelHash: sha256(JSON.stringify(frozen.rawModelOutput)), frozenInventoryHash: frozen.frozenInventory.frozenContentHash,
    versions: { accountability: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION, ontology: CANONICAL_ACTION_ONTOLOGY_VERSION, compiler: SEMANTIC_COMPILER_ALGORITHM_VERSION, verifier: SEMANTIC_VERIFIER_ALGORITHM_VERSION, verifierPrompt: SEMANTIC_VERIFIER_PROMPT_VERSION, projection: SEMANTIC_VERIFICATION_PROJECTION_VERSION, frozenCompiler: frozenRule.compilerVersion, frozenInventoryAlgorithm: frozen.frozenInventory.algorithmVersion },
    defectA, defectB, defectC, defectD,
    accountability: { before: { counts: frozen.accountability.counts, failureReasons: frozen.failureReasons, status: frozen.status, missing: frozen.accountability.items.filter((i) => i.disposition === "MISSING_FROM_COMPOSITION").map((i) => [i.inventoryItemId, i.semanticRole, i.reason]) }, after: { counts: accountabilityAfter.counts, failureReasons, status, missing: missingAfter.map((i) => [i.inventoryItemId, i.semanticRole, i.reason]), reasons: accountabilityAfter.reasons, semanticallyComplete: accountabilityAfter.semanticallyComplete, supportReviewRequired: accountabilityAfter.supportReviewRequired } },
    verification: { before: { status: frozenVerification.status, findings: frozenVerification.findings.map((f) => [f.severity, f.findingType, f.verificationMethod]), projectionHash: frozenVerification.verificationProjection.hash }, after: { status: verification.status, findings: verification.findings.map((f) => [f.severity, f.findingType, f.verificationMethod]), projectionHash: computeSemanticVerificationProjectionHash(projection), recordedProjectionHash: verification.verificationProjection?.hash ?? null, projectionCarriesAsOf: projectionJson.includes("\"AS_OF\"") && projectionJson.includes("date of such Disposition"), reviewer: "scripted zero findings (recorded live result)", qualitativeGrounding: { materialUngrounded: verification.qualitativeLineage?.materialUngrounded ?? null }, numericMaterialUnresolved: verification.reconciliation?.materialUnresolvedCount ?? null } },
    certification: { before: { status: frozenCertification.certification.status, blockers: frozenCertification.certification.blockers.map((b) => [b.code, b.detail]) }, after: { status: certification.status, blockers: certification.blockers.map((b) => [b.code, b.detail]), warnings: certification.warnings.map((w) => w.code) } },
    residual,
    rule, projection,
  };
}
