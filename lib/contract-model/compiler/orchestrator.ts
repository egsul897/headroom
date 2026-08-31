/**
 * Phase C orchestrator - runs the 11 real stages in order over one
 * financing package, persisting ContractCompilerRun/ContractCompilerStage
 * state as it goes (task §5/§6). Resumable: a stage whose freshly-computed
 * inputHash still matches its persisted COMPLETED row's inputHash is
 * skipped and its persisted `output` re-used, never re-run (task §7/§72) -
 * generalizing C0's own resumable-JSON-log discipline
 * (scripts/run-phase-c0-analyzer.ts) to a real per-stage DB state machine.
 * A stage failure never disturbs a sibling stage's persisted COMPLETED row
 * (task §74 - partial failure must preserve successful work).
 *
 * QUARANTINE NOTICE (Phase 3F.1.4, docs/HEADROOM-ROADMAP.md §1 "The
 * pre-Phase-2 'Phase C' compiler"): this file's own `runContractCompiler`
 * entry point (below) is the legacy 11-stage pipeline, superseded by the
 * deterministic Phase 2A-2G substrate. Its RULE_EXTRACTION/VERIFICATION/
 * PROMOTION stages carry a real, never-closed dangerous-unflagged error
 * rate (25.0% -> 15.625%, both above this pipeline's own required <=5%
 * safety gate - see docs/phase-c-1-multi-basket-verification.md) and are
 * NOT repaired here - quarantine only. `app/**` must never import
 * `runContractCompiler` from this file, nor `lib/contract-model/service.ts`
 * or `lib/contract-model/validators.ts` (the legacy query/validation layer
 * only this pipeline populates). Enforced mechanically by
 * `.eslintrc.json`'s `no-restricted-imports` override and
 * `tests/foundation-audit/legacy-phase-c-quarantine.test.ts` - not by
 * anything in this file's own runtime logic.
 */
import { prisma } from "../../prisma";
import { hashParts, hashJson } from "./hashing";
import { getStageCaller, type StageCaller } from "./llm-caller";
import { structureOutputHash } from "./stage-structure";
import { runStructureStageWithAmbiguityResolution, type StructuralReviewSignal, type StructuralAmbiguityResolutionRateMetrics } from "./structural-ambiguity-resolution";
import { runDefinitionsStage } from "./stage-definitions";
import { runInventoryStage } from "./stage-inventory";
import { buildRuleExtractionBatches, runRuleExtractionStage } from "./stage-rule-extraction";
import { resolveDefinedTermDependencies, detectCrossReferences } from "./stage-dependency-resolution";
import { runRelationshipsStage } from "./stage-relationships";
import { runAmendmentsStage } from "./stage-amendments";
import { runVerificationStage, MULTI_BASKET_CHECK_VERSION, type VerificationResult } from "./stage-verification";
import { runValidationStage } from "./stage-validation";
import { runCoverageStage } from "./stage-coverage";
import { runPromotionStage, type RulePromotionDecision } from "./stage-promotion";
import { persistStructuralNodes, persistDefinedTerms, persistContractRules, persistRuleRelationships, persistReferences } from "./persistence";
import { STRUCTURAL_INDEX_VERSION, type CompilerPackageInput, type StructuralNode } from "./types";
import type { CandidateContractRule, CandidateDefinedTerm } from "../types";
import { EntityClassTag } from "@prisma/client";
import type { ContractCompilerStageKind, ContractCompilerStageStatus } from "@prisma/client";

const PROMPT_VERSION = "phase-c.1";
const SCHEMA_VERSION = "phase-c.1";

export interface CompilerRunOptions {
  force?: boolean;
  /** Force only these specific stages to re-run (their downstream consumers still see the new output, since each stage reads the PRIOR stage's freshly-computed in-memory result, not just its own cache check) - lets a code fix scoped to one stage (e.g. a verification-logic bug) be re-verified without re-spending real money on unaffected upstream LLM stages. Ignored if `force` is also set (force wins, re-running everything). */
  forceStages?: ContractCompilerStageKind[];
  /** Whether to run the bounded LLM adversarial-verification pass (real cost) or the deterministic-only layer alone (free). Defaults to true - verification is mandatory per task §30, but a caller validating orchestration wiring against the synthetic provider can still exercise it (the synthetic caller returns schema defaults at zero cost either way). */
  useLlmAdversarialPass?: boolean;
}

export interface CompilerRunSummary {
  runId: string;
  companyId: string;
  packageKey: string;
  stages: { stage: ContractCompilerStageKind; status: ContractCompilerStageStatus; notes?: string[] }[];
  structuralNodes: StructuralNode[];
  definedTerms: CandidateDefinedTerm[];
  rules: CandidateContractRule[];
  verification: VerificationResult;
  promotionDecisions: RulePromotionDecision[];
  validationOk: boolean;
  coverageGapCount: number;
  relationshipsPersisted: number;
  referencesPersisted: number;
  /**
   * Phase 3F.1 Human Architecture Decision (Workstream OPEN-1 wiring fix) -
   * every AMBIGUOUS structural candidate the classifier could not
   * confidently resolve (UNCERTAIN, provider failure, or a no-credential
   * synthetic fallback) across the whole package, fail-closed EXCLUDED from
   * `structuralNodes` rather than guessed. Empty (never undefined) when the
   * STRUCTURE stage was RESUMED from a cache-hit rather than freshly run
   * this call (getOrRunStage's own resume path never re-invokes the
   * classifier, so there is nothing fresh to report that run) - this is a
   * "was reported this run", not "was ever reported for this run's persisted
   * output", visibility guarantee; see this file's own STRUCTURE-stage
   * comment for why that scoping is honest rather than a gap.
   */
  structuralReviewSignals: StructuralReviewSignal[];
  /** Same "empty on resume" scoping as `structuralReviewSignals` above - see that field's own doc comment. */
  structuralAmbiguityMetrics: StructuralAmbiguityResolutionRateMetrics | null;
}

async function upsertRun(companyId: string, packageKey: string, documentIds: string[]): Promise<string> {
  const run = await prisma.contractCompilerRun.upsert({
    where: { companyId_packageKey: { companyId, packageKey } },
    create: { companyId, packageKey, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION, documents: { create: documentIds.map((documentId) => ({ documentId })) } },
    update: {},
  });
  const existingDocs = await prisma.contractCompilerRunDocument.findMany({ where: { runId: run.id } });
  const existingIds = new Set(existingDocs.map((d) => d.documentId));
  for (const documentId of documentIds) {
    if (!existingIds.has(documentId)) await prisma.contractCompilerRunDocument.create({ data: { runId: run.id, documentId } });
  }
  return run.id;
}

async function getOrRunStage<TOutput>(runId: string, stage: ContractCompilerStageKind, inputHash: string, force: boolean, run: () => Promise<{ status: ContractCompilerStageStatus; output: TOutput; provider?: string; model?: string; telemetry?: unknown; error?: string }>): Promise<{ status: ContractCompilerStageStatus; output: TOutput; resumed: boolean }> {
  const existing = await prisma.contractCompilerStage.findUnique({ where: { runId_stage: { runId, stage } } });
  if (existing && !force && existing.status === "COMPLETED" && existing.inputHash === inputHash) {
    return { status: existing.status, output: existing.output as TOutput, resumed: true };
  }

  await prisma.contractCompilerStage.upsert({
    where: { runId_stage: { runId, stage } },
    create: { runId, stage, status: "RUNNING", inputHash, attemptCount: 1, startedAt: new Date() },
    update: { status: "RUNNING", inputHash, attemptCount: { increment: 1 }, startedAt: new Date(), error: null },
  });

  const result = await run();
  await prisma.contractCompilerStage.update({
    where: { runId_stage: { runId, stage } },
    data: { status: result.status, provider: result.provider, model: result.model, telemetry: (result.telemetry as object | null) ?? undefined, output: result.output as object, error: result.error, outputHash: hashJson(result.output), completedAt: new Date() },
  });
  return { status: result.status, output: result.output, resumed: false };
}

export async function runContractCompiler(input: CompilerPackageInput, options: CompilerRunOptions = {}): Promise<CompilerRunSummary> {
  const { companyId, packageKey, documents } = input;
  const force = options.force ?? false;
  const forceStages = new Set(options.forceStages ?? []);
  const shouldForce = (stage: ContractCompilerStageKind): boolean => force || forceStages.has(stage);
  const useLlmAdversarialPass = options.useLlmAdversarialPass ?? true;
  const runId = await upsertRun(companyId, packageKey, documents.map((d) => d.documentId));
  const stages: CompilerRunSummary["stages"] = [];
  const caller: StageCaller = getStageCaller();
  const entityClassTags = new Set(Object.values(EntityClassTag));

  // Provider/model identity is part of every LLM-calling stage's inputHash
  // (not just document content) - a stage run under the synthetic caller
  // must never be silently "resumed" once a real credential is available,
  // and a model change must invalidate a stage's cached output exactly like
  // a document-text change would (task §63 - "a prompt change must be
  // capable of invalidating/recompiling affected stages"). Moved above the
  // STRUCTURE stage (Phase 3F.1 Human Architecture Decision, Workstream
  // OPEN-1 wiring fix) because STRUCTURE is no longer a purely deterministic
  // stage either - see structureInputHash's own comment immediately below.
  const providerIdentity = `${caller.providerName}::${caller.model}`;

  // Stage 1: STRUCTURE.
  // Phase 3F.1.4 fix (foundation-audit §R / 10-cache-invalidation-assurance.json,
  // "orchestrator.ts STRUCTURE-stage resumability gate": FAILED) - this hash
  // MUST include STRUCTURAL_INDEX_VERSION alongside document identity/text.
  // Before this fix it covered only documentId+text, so a structural-
  // parsing-ALGORITHM change (a STRUCTURAL_INDEX_VERSION bump, or any
  // parseDocumentStructure bug fix) over UNCHANGED document text was
  // invisible to getOrRunStage's cache-check - it would resume and
  // re-persist the stale, pre-change structural nodes forward into every
  // downstream stage forever, exactly as if the parser had never changed.
  // Proven both directions in
  // tests/foundation-audit/cache-invalidation-audit.test.ts (version bump
  // now forces recompute; unchanged version + unchanged text still resumes).
  //
  // Phase 3F.1 Human Architecture Decision (Workstream OPEN-1 WIRING FIX):
  // STRUCTURE is no longer purely deterministic - `runStructureStageWithAmbiguityResolution`
  // (structural-ambiguity-resolution.ts) routes any candidate the
  // deterministic triage cannot confidently resolve to the bounded
  // structural-ambiguity classifier, so this stage's real output can now
  // depend on `providerIdentity` too (a different provider/model - or a
  // credential becoming available where none existed before - can change an
  // AMBIGUOUS candidate's resolved verdict over the SAME document text).
  // `providerIdentity` is therefore folded into structureInputHash exactly
  // like every other LLM-calling stage's own inputHash already does above -
  // never leaving a provider/credential change invisible to this cache gate
  // the way the pre-OPEN-1-wiring, purely-deterministic STRUCTURE stage
  // never needed to.
  const structureInputHash = hashParts([STRUCTURAL_INDEX_VERSION, providerIdentity, ...documents.map((d) => `${d.documentId}:${d.text}`)]);
  let structuralReviewSignals: StructuralReviewSignal[] = [];
  let structuralAmbiguityMetrics: StructuralAmbiguityResolutionRateMetrics | null = null;
  const structureRes = await getOrRunStage(runId, "STRUCTURE", structureInputHash, shouldForce("STRUCTURE"), async () => {
    // instrumentKey: this legacy Phase C pipeline (CompilerPackageInput) has
    // no "instrument" concept distinct from the package itself - packageKey
    // is the stable, unique-enough scope this classifier's cache identity
    // needs (see runStructureStageWithAmbiguityResolution's own doc comment).
    const r = await runStructureStageWithAmbiguityResolution(documents, { companyId, instrumentKey: packageKey }, caller);
    structuralReviewSignals = r.reviewSignals;
    structuralAmbiguityMetrics = r.metrics;
    return { status: r.status, output: r.output, notes: r.notes };
  });
  stages.push({ stage: "STRUCTURE", status: structureRes.status });
  const structuralNodes = structureRes.output;
  const nodeIndex = await persistStructuralNodes(companyId, structuralNodes);
  const documentIdBySectionRef = new Map(structuralNodes.filter((n) => n.nodeType === "SECTION").map((n) => [n.sectionRef.replace(/\s+/g, ""), n.documentId] as const));

  // Stage 2: DEFINITIONS (real LLM call).
  const definitionsInputHash = hashParts([providerIdentity, structureOutputHash(structuralNodes), ...documents.map((d) => d.text)]);
  const definitionsRes = await getOrRunStage(runId, "DEFINITIONS", definitionsInputHash, shouldForce("DEFINITIONS"), () => runDefinitionsStage(caller, documents));
  stages.push({ stage: "DEFINITIONS", status: definitionsRes.status });
  const definedTerms = definitionsRes.output.definedTerms;
  // A defined term is attributed to the document whose structural nodes
  // contain its cited section, falling back to the package's first document
  // for a term with no resolvable section (an honest, generalized default,
  // not a company-specific assumption).
  const termsByDocument = new Map<string, CandidateDefinedTerm[]>();
  for (const term of definedTerms) {
    const docId = (term.sourceSectionRef && documentIdBySectionRef.get(term.sourceSectionRef.replace(/\s+/g, ""))) || documents[0]?.documentId || "";
    termsByDocument.set(docId, [...(termsByDocument.get(docId) ?? []), term]);
  }
  for (const [docId, terms] of termsByDocument) await persistDefinedTerms(companyId, docId, terms);

  // Stage 3: INVENTORY (real LLM call, independent of rule extraction - task §13).
  const inventoryInputHash = hashParts([providerIdentity, structureOutputHash(structuralNodes)]);
  const inventoryRes = await getOrRunStage(runId, "INVENTORY", inventoryInputHash, shouldForce("INVENTORY"), () => runInventoryStage(caller, documents, structuralNodes));
  stages.push({ stage: "INVENTORY", status: inventoryRes.status });

  // Stage 4: RULE_EXTRACTION (real LLM call(s), bounded/batched by article - task §15).
  const batches = buildRuleExtractionBatches(documents, structuralNodes, definedTerms);
  const ruleExtractionInputHash = hashParts([providerIdentity, hashJson(definedTerms), ...batches.map((b) => b.text)]);
  const ruleExtractionRes = await getOrRunStage(runId, "RULE_EXTRACTION", ruleExtractionInputHash, shouldForce("RULE_EXTRACTION"), () => runRuleExtractionStage(caller, batches));
  stages.push({ stage: "RULE_EXTRACTION", status: ruleExtractionRes.status });
  const extractedRules = ruleExtractionRes.output.rules;

  // Stage 5: DEPENDENCY_RESOLUTION (deterministic).
  const depResInputHash = hashParts([hashJson(extractedRules), hashJson(definedTerms)]);
  const depResRes = await getOrRunStage(runId, "DEPENDENCY_RESOLUTION", depResInputHash, shouldForce("DEPENDENCY_RESOLUTION"), async () => {
    const termDeps = resolveDefinedTermDependencies(extractedRules, definedTerms);
    const refsByDocument: Record<string, ReturnType<typeof detectCrossReferences>> = {};
    for (const d of documents) refsByDocument[d.documentId] = detectCrossReferences(d.documentId, d.text, structuralNodes);
    return { status: "COMPLETED" as const, output: { termDeps, refsByDocument } };
  });
  stages.push({ stage: "DEPENDENCY_RESOLUTION", status: depResRes.status });
  const unresolvedByRule = new Map<string, string[]>();
  for (const dep of depResRes.output.termDeps) {
    if (dep.state !== "RESOLVED") {
      unresolvedByRule.set(dep.ruleSourceSectionRef, [...(unresolvedByRule.get(dep.ruleSourceSectionRef) ?? []), dep.termRef]);
    }
  }
  let referencesPersisted = 0;
  for (const doc of documents) {
    referencesPersisted += await persistReferences(companyId, doc.documentId, depResRes.output.refsByDocument[doc.documentId] ?? [], nodeIndex);
  }

  // Stage 6: RELATIONSHIPS (real LLM call, given already-extracted rules - task §24).
  const relationshipsInputHash = hashParts([providerIdentity, hashJson(extractedRules)]);
  const relationshipsRes = await getOrRunStage(runId, "RELATIONSHIPS", relationshipsInputHash, shouldForce("RELATIONSHIPS"), () => runRelationshipsStage(caller, extractedRules));
  stages.push({ stage: "RELATIONSHIPS", status: relationshipsRes.status });

  // Stage 7: AMENDMENTS (deterministic detection; representation-only, task §27 scope).
  // Phase 3F.1.4 fix (foundation-audit §R / 10-cache-invalidation-assurance.json,
  // "orchestrator.ts AMENDMENTS-stage resumability gate": FAILED) - this hash
  // MUST cover document text, not just label. The real runAmendmentsStage
  // (stage-amendments.ts) scans BOTH d.label AND d.text.slice(0, 2000) for
  // amendment markers; before this fix, a text edit that flips a document
  // from ordinary prose to a genuinely amendment-shaped preamble (same
  // documentId/label) was invisible to this gate, so getOrRunStage resumed
  // the stale, not-amendment-shaped cached row instead of the REVIEW_REQUIRED
  // a fresh call to runAmendmentsStage on that input actually produces.
  // Hashes the FULL text (not only the 2000-char window the detector reads)
  // deliberately: this stage is a cheap deterministic regex scan with no LLM
  // cost, so a conservative over-invalidation on a text change outside that
  // window (e.g. whitespace-only, or a change past char 2000) costs nothing
  // real, while staying correct even if the detector's own window size ever
  // changes independently of this hash. Proven both directions in
  // tests/foundation-audit/cache-invalidation-audit.test.ts (a text change
  // that flips amendment-shaped detection now forces recompute; unchanged
  // label+text still resumes).
  const amendmentsInputHash = hashParts(documents.map((d) => `${d.label}:${d.text}`));
  const amendmentsRes = await getOrRunStage(runId, "AMENDMENTS", amendmentsInputHash, shouldForce("AMENDMENTS"), async () => runAmendmentsStage(documents));
  stages.push({ stage: "AMENDMENTS", status: amendmentsRes.status });

  // Persist rules BEFORE verification/validation so those stages see real
  // rows - each rule attributed to the document whose structural nodes
  // actually contain its cited section (documentIdBySectionRef), never
  // assumed to belong to whichever document happened to be first.
  let ruleIdBySectionRef = new Map<string, string>();
  const rulesByDocument = new Map<string, CandidateContractRule[]>();
  for (const rule of extractedRules) {
    const docId = documentIdBySectionRef.get(rule.sourceSectionRef.replace(/\s+/g, "")) ?? documents[0]?.documentId ?? "";
    rulesByDocument.set(docId, [...(rulesByDocument.get(docId) ?? []), rule]);
  }
  for (const [docId, docRules] of rulesByDocument) {
    const ids = await persistContractRules(companyId, docId, docRules, nodeIndex, entityClassTags);
    ruleIdBySectionRef = new Map([...ruleIdBySectionRef, ...ids]);
  }
  const relationshipsPersisted = await persistRuleRelationships(companyId, relationshipsRes.output.relationships, ruleIdBySectionRef);

  // Stage 8: VERIFICATION (deterministic, mandatory + bounded real LLM adversarial pass - task §30;
  // Phase C.1 adds a deterministic section-level basket-completeness pass, task §2-4).
  // Real, top-level SECTION boundaries per document (charEnd = the next
  // SECTION's own charStart, or the document's end) - feeds the new
  // basket-completeness pass's own "what is this section's real source
  // text" question; ARTICLE nodes are irrelevant here since baskets live
  // at SECTION granularity.
  const sectionBoundariesByDocument = new Map<string, { sectionPrefix: string; charStart: number; charEnd: number }[]>();
  for (const doc of documents) {
    const docSections = structuralNodes.filter((n) => n.documentId === doc.documentId && n.nodeType === "SECTION").sort((a, b) => a.charStart - b.charStart);
    sectionBoundariesByDocument.set(
      doc.documentId,
      docSections.map((s, i) => ({ sectionPrefix: s.sectionRef.replace(/\s+/g, ""), charStart: s.charStart, charEnd: docSections[i + 1] ? docSections[i + 1]!.charStart : doc.text.length }))
    );
  }
  const verificationInputHash = hashParts([useLlmAdversarialPass ? providerIdentity : "deterministic-only", MULTI_BASKET_CHECK_VERSION, hashJson(extractedRules)]);
  const verificationRes = await getOrRunStage(runId, "VERIFICATION", verificationInputHash, shouldForce("VERIFICATION"), () => {
    const verificationBatches = documents.map((d) => ({ documentId: d.documentId, sourceText: d.text, rules: rulesByDocument.get(d.documentId) ?? [], sectionBoundaries: sectionBoundariesByDocument.get(d.documentId) ?? [] }));
    return runVerificationStage(caller, verificationBatches, useLlmAdversarialPass);
  });
  stages.push({ stage: "VERIFICATION", status: verificationRes.status });

  // Stage 9: VALIDATION (reuse validators.ts, deterministic, runs against persisted rows).
  const validationInputHash = hashJson(verificationRes.output.finalRules.map((r) => r.sourceSectionRef));
  const validationRes = await getOrRunStage(runId, "VALIDATION", validationInputHash, shouldForce("VALIDATION"), () => runValidationStage(companyId));
  stages.push({ stage: "VALIDATION", status: validationRes.status });

  // Stage 10: COVERAGE (task §37 - independent inventory vs modeled output; fixes the C0 definedTerms[]-scope gap generally, task §38).
  const coverageInputHash = hashJson({ inventory: inventoryRes.output, rules: extractedRules, terms: definedTerms });
  const coverageRes = await getOrRunStage(runId, "COVERAGE", coverageInputHash, shouldForce("COVERAGE"), async () => runCoverageStage(inventoryRes.output, extractedRules, definedTerms));
  stages.push({ stage: "COVERAGE", status: coverageRes.status });

  // Stage 11: PROMOTION (the hard execution invariant, task §4/§42-44).
  const promotionInputHash = hashJson({ rules: verificationRes.output.finalRules, validationOk: validationRes.output.ok });
  const promotionRes = await getOrRunStage(runId, "PROMOTION", promotionInputHash, shouldForce("PROMOTION"), async () => {
    const decisions = runPromotionStage(verificationRes.output.finalRules, verificationRes.output, validationRes.output, unresolvedByRule);
    const blocked = decisions.filter((d) => d.executabilityState !== "EXECUTABLE" && d.executabilityState !== "NON_EXECUTABLE_QUALITATIVE");
    return { status: blocked.length > 0 ? ("REVIEW_REQUIRED" as const) : ("COMPLETED" as const), output: decisions };
  });
  stages.push({ stage: "PROMOTION", status: promotionRes.status });

  await prisma.contractCompilerRun.update({ where: { id: runId }, data: { completedAt: new Date() } });

  return {
    runId,
    companyId,
    packageKey,
    stages,
    structuralNodes,
    definedTerms,
    rules: verificationRes.output.finalRules,
    verification: verificationRes.output,
    promotionDecisions: promotionRes.output,
    validationOk: validationRes.output.ok,
    coverageGapCount: coverageRes.output.filter((c) => c.disposition === "REVIEW_REQUIRED" || c.disposition === "UNHANDLED").length,
    relationshipsPersisted,
    referencesPersisted,
    structuralReviewSignals,
    structuralAmbiguityMetrics,
  };
}
