/**
 * Evaluation Methodology V2 — FWRG / LSB / CONMED dataset adapters.
 *
 * Phase 3F.1.5. These three packages are used ONLY to test the evaluator's
 * GENERALITY across different drafting styles (indenture-adjacent covenant
 * drafting, ABL/payment-conditions drafting, amendment-heavy packages). They
 * are permanent regression evidence, never unseen packages (architecture
 * invariant #28), and nothing in this file is tuned to any of them.
 *
 * GROUND TRUTH comes from each package's own frozen, independently authored
 * answer key (`human-ground-truth.ts`). CANDIDATES come from frozen run
 * artifacts, consumed as evidence:
 *   - discovery candidates (description + verbatim sourceCitation excerpt),
 *   - raw analyzer rule/defined-term output where a run exists,
 *   - the rule objects recorded inside a compiler run — harvested as an
 *     UNLABELLED POOL. The historical run's own matching outcome
 *     (`outcome`, `mismatchReasons`) is deliberately NOT read: this evaluator
 *     re-derives every correspondence itself.
 *   - independent coverage-audit findings, as safety flags.
 */
import { join } from "node:path";

import { ALL_COVENANT_UNITS } from "@/tests/fixtures/unseen-packages/conmed-2025-credit-facility/human-ground-truth";
import { HUMAN_PROVISIONS as FWRG_PROVISIONS } from "@/tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/human-ground-truth";
import { HUMAN_PROVISIONS as LSB_PROVISIONS } from "@/tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/human-ground-truth";

import type { CandidateSemanticRepresentation, EvaluationMateriality, GroundTruthAdjudicationProvenance, GroundTruthSemanticUnit } from "../types";
import { buildCandidate, buildGroundTruthUnit, EMPTY_SELF_REPORT, fileHash, hasContent, readJson } from "./common";

export interface LegacyDataset {
  datasetKey: string;
  groundTruth: GroundTruthSemanticUnit[];
  candidates: CandidateSemanticRepresentation[];
  droppedContentFreeCandidates: number;
  inputHashes: Record<string, string>;
}

interface DiscoveryRun {
  candidates: {
    discoveryId: string;
    documentId: string;
    normalizedSourceRef: string;
    families?: string[];
    role?: string;
    description?: string;
    reviewStatus?: string;
    confidence?: number;
    sourceCitation?: string;
  }[];
}

interface AnalyzerRun {
  rawResult: {
    rules: AnalyzerRule[];
    definedTerms: { termName: string; definitionExcerpt?: string }[];
  };
}

interface AnalyzerRule {
  covenantFamily?: string;
  ruleType?: string;
  evaluationClass?: string;
  posture?: string;
  action?: string;
  entityScope?: string[];
  thresholdValue?: number;
  thresholdUnit?: string;
  formulaRef?: string;
  conditions?: { type?: string; description?: string }[];
  exceptions?: { description?: string }[];
  sourceSectionRef?: string;
  definedTermRefs?: string[];
  notes?: string;
}

interface CompilerRun {
  evaluation?: { results?: { matchedRule?: AnalyzerRule }[] };
}

interface AuditFinding {
  findingId: string;
  documentId: string;
  structuralNodeKey?: string;
  sourceCitation?: string;
  findingType: string;
  materiality: string;
  sourceEvidence?: string;
  auditorReasoning?: string;
  resolutionStatus?: string;
}

const HUMAN_GT_ADJUDICATION = (path: string, note: string): GroundTruthAdjudicationProvenance => ({
  // These fixtures state in their own headers that a single agent authored them
  // from source only, with true two-party isolation explicitly unavailable. That
  // is recorded as-is rather than presented as external lawyer review.
  kind: "AI_ADJUDICATED_FROM_SOURCE_ONLY",
  sourceStatement: note,
  authoredAt: null,
  sourceArtifactPath: path,
  externallyHumanReviewed: false,
});

function analyzerRuleToCandidate(
  rule: AnalyzerRule,
  idx: number,
  datasetKey: string,
  documentId: string,
  provenancePath: string,
  representationType: CandidateSemanticRepresentation["representationType"],
): CandidateSemanticRepresentation {
  const evaluationClass = (rule.evaluationClass ?? "").toUpperCase();
  const accountingRole =
    evaluationClass === "UNSUPPORTED"
      ? "HONEST_UNSUPPORTED"
      : evaluationClass === "JUDGMENT_REQUIRED"
        ? "HONEST_UNRESOLVED"
        : "SUBSTANTIVE_REPRESENTATION";
  const threshold = rule.thresholdValue !== undefined ? `${rule.thresholdValue} ${rule.thresholdUnit ?? ""}`.trim() : "";
  return buildCandidate({
    candidateId: `${representationType === "ANALYZER_RULE" ? "analyzer-rule" : "compiler-rule"}:${datasetKey}:${idx}:${(rule.sourceSectionRef ?? "").replace(/\s+/g, "")}`,
    datasetKey,
    packageKey: datasetKey,
    documentId,
    sectionRef: rule.sourceSectionRef ?? null,
    representationType,
    accountingRole,
    excerpts: [rule.notes ?? ""].filter((s) => s.trim().length > 0),
    normalizedSemantics: [
      `posture=${rule.posture ?? "?"}`,
      `action=${rule.action ?? "(none)"}`,
      `ruleType=${rule.ruleType ?? "?"}`,
      threshold ? `threshold=${threshold}` : "",
      rule.formulaRef ? `formula=${rule.formulaRef}` : "",
      ...(rule.conditions ?? []).map((c) => `condition ${c.type ?? ""}: ${c.description ?? ""}`),
      ...(rule.exceptions ?? []).map((e) => `exception: ${e.description ?? ""}`),
      rule.notes ?? "",
    ]
      .filter(Boolean)
      .join(" | "),
    provisionRoleDeclared: rule.ruleType ?? null,
    declaredFamily: rule.covenantFamily ?? null,
    formulaSemantics: rule.formulaRef ?? null,
    dependencyRefs: [],
    referencedDefinedTerms: rule.definedTermRefs ?? [],
    declaredScope: rule.entityScope ?? [],
    selfReportedState: {
      ...EMPTY_SELF_REPORT,
      sufficiency: rule.evaluationClass ?? null,
      unresolvedReasons: evaluationClass === "EXECUTABLE" ? [] : evaluationClass ? [`evaluationClass=${evaluationClass}`] : [],
    },
    operativeProvenance: { documentId, operativeVersionRef: null, sourceCitation: rule.sourceSectionRef ?? null },
    provenancePath,
  });
}

function discoveryToCandidates(run: DiscoveryRun, datasetKey: string, provenancePath: string): CandidateSemanticRepresentation[] {
  return run.candidates.map((c) => {
    const review = (c.reviewStatus ?? "").toUpperCase();
    return buildCandidate({
      candidateId: `discovery:${c.discoveryId}`,
      datasetKey,
      packageKey: datasetKey,
      documentId: c.documentId,
      sectionRef: c.normalizedSourceRef,
      representationType: "DISCOVERY_CANDIDATE",
      accountingRole: review === "NEEDS_REVIEW" || review === "UNCERTAIN" ? "SAFETY_FLAG" : "INVENTORY_ONLY",
      excerpts: [c.sourceCitation ?? ""].filter((s) => s.trim().length > 0),
      normalizedSemantics: c.description ?? "",
      provisionRoleDeclared: c.role ?? null,
      declaredFamily: c.families?.[0] ?? null,
      formulaSemantics: null,
      dependencyRefs: [],
      referencedDefinedTerms: [],
      selfReportedState: {
        ...EMPTY_SELF_REPORT,
        reviewStatus: c.reviewStatus ?? null,
        unresolvedReasons: review === "NEEDS_REVIEW" || review === "UNCERTAIN" ? [`discovery reviewStatus=${c.reviewStatus} confidence=${c.confidence ?? "?"}`] : [],
      },
      operativeProvenance: { documentId: c.documentId, operativeVersionRef: null, sourceCitation: c.normalizedSourceRef },
      provenancePath: `${provenancePath}#${c.discoveryId}`,
    });
  });
}

function auditFindingsToCandidates(findings: AuditFinding[], datasetKey: string, provenancePath: string): CandidateSemanticRepresentation[] {
  return findings.map((f) =>
    buildCandidate({
      candidateId: `audit-finding:${f.findingId}`,
      datasetKey,
      packageKey: datasetKey,
      documentId: f.documentId,
      sectionRef: (f.structuralNodeKey ?? "").split("::")[1] ?? null,
      representationType: "VERIFICATION_FINDING",
      accountingRole: "SAFETY_FLAG",
      excerpts: [f.sourceEvidence ?? ""].filter((s) => s.trim().length > 0),
      normalizedSemantics: [f.findingType, f.auditorReasoning ?? ""].filter(Boolean).join(": "),
      provisionRoleDeclared: null,
      declaredFamily: null,
      formulaSemantics: null,
      dependencyRefs: [],
      referencedDefinedTerms: [],
      selfReportedState: { ...EMPTY_SELF_REPORT, reviewStatus: f.resolutionStatus ?? null, verifierFindings: [f.findingType], unresolvedReasons: [f.materiality] },
      operativeProvenance: { documentId: f.documentId, operativeVersionRef: null, sourceCitation: f.sourceCitation ?? null },
      provenancePath: `${provenancePath}#${f.findingId}`,
    }),
  );
}

function finish(datasetKey: string, groundTruth: GroundTruthSemanticUnit[], candidates: CandidateSemanticRepresentation[], inputHashes: Record<string, string>): LegacyDataset {
  const withContent = candidates.filter(hasContent);
  return { datasetKey, groundTruth, candidates: withContent, droppedContentFreeCandidates: candidates.length - withContent.length, inputHashes };
}

// ---------------------------------------------------------------------------
// FWRG
// ---------------------------------------------------------------------------

const FWRG_DIR = "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement";

export function loadFwrgDataset(repoRoot: string): LegacyDataset {
  const datasetKey = "fwrg-2021-credit-agreement";
  const documentId = "fwrg";
  const adjudication = HUMAN_GT_ADJUDICATION(
    `${FWRG_DIR}/human-ground-truth.ts`,
    "Fixture header: authored by direct reading of the real source text BEFORE any extraction system saw the document; single-agent authoring, no external legal review recorded.",
  );
  const groundTruth = FWRG_PROVISIONS.map((p) =>
    buildGroundTruthUnit({
      gtUnitId: p.id,
      datasetKey,
      packageKey: datasetKey,
      documentId,
      sectionRef: p.sourceSectionRef,
      articleRef: null,
      sourceExcerpt: "",
      sourceExcerptResolution: "UNRESOLVED_DESCRIPTION_ONLY",
      semanticDescription: [p.summary, p.realFigures.join("; "), p.stretchNotes ?? ""].filter(Boolean).join(" "),
      materiality: "CRITICAL" as EvaluationMateriality,
      unitType: p.ruleType,
      referencedDefinedTerms: p.definedTermRefs,
      materialDependencies: [],
      operativeStateAssumption: "single-document package, no amendments in scope",
      adjudication,
      notes: p.stretchNotes ?? null,
    }),
  );

  const inputHashes: Record<string, string> = {};
  const candidates: CandidateSemanticRepresentation[] = [];

  const discoveryPath = join(repoRoot, FWRG_DIR, "discovery-runs/run-1787801821.json");
  inputHashes["fwrg:discovery"] = fileHash(discoveryPath);
  candidates.push(...discoveryToCandidates(readJson<DiscoveryRun>(discoveryPath), datasetKey, `${FWRG_DIR}/discovery-runs/run-1787801821.json`));

  const analyzerPath = join(repoRoot, FWRG_DIR, "analyzer-runs/VERCEL_AI_GATEWAY__anthropic-claude-sonnet-5.json");
  inputHashes["fwrg:analyzer"] = fileHash(analyzerPath);
  const analyzer = readJson<AnalyzerRun>(analyzerPath);
  analyzer.rawResult.rules.forEach((r, i) => candidates.push(analyzerRuleToCandidate(r, i, datasetKey, documentId, `${FWRG_DIR}/analyzer-runs/VERCEL_AI_GATEWAY__anthropic-claude-sonnet-5.json#rules[${i}]`, "ANALYZER_RULE")));
  analyzer.rawResult.definedTerms.forEach((t, i) =>
    candidates.push(
      buildCandidate({
        candidateId: `analyzer-term:${datasetKey}:${i}`,
        datasetKey,
        packageKey: datasetKey,
        documentId,
        sectionRef: null,
        representationType: "ANALYZER_DEFINED_TERM",
        accountingRole: "SUBSTANTIVE_REPRESENTATION",
        excerpts: [t.definitionExcerpt ?? ""].filter((s) => s.trim().length > 0),
        normalizedSemantics: `definition of "${t.termName}": ${t.definitionExcerpt ?? ""}`,
        provisionRoleDeclared: "DEFINITION",
        declaredFamily: "DEFINITIONS_CALCULATION_RULES",
        formulaSemantics: null,
        dependencyRefs: [],
        referencedDefinedTerms: [t.termName],
        selfReportedState: { ...EMPTY_SELF_REPORT },
        operativeProvenance: { documentId, operativeVersionRef: null, sourceCitation: null },
        provenancePath: `${FWRG_DIR}/analyzer-runs/VERCEL_AI_GATEWAY__anthropic-claude-sonnet-5.json#definedTerms[${i}]`,
      }),
    ),
  );

  return finish(datasetKey, groundTruth, candidates, inputHashes);
}

// ---------------------------------------------------------------------------
// LSB
// ---------------------------------------------------------------------------

const LSB_DIR = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement";

export function loadLsbDataset(repoRoot: string): LegacyDataset {
  const datasetKey = "lsb-2023-abl-credit-agreement";
  const documentId = "lsb";
  const adjudication = HUMAN_GT_ADJUDICATION(`${LSB_DIR}/human-ground-truth.ts`, "Fixture header: authored from the real source text before extraction; single-agent authoring, no external legal review recorded.");
  const groundTruth = LSB_PROVISIONS.map((p) =>
    buildGroundTruthUnit({
      gtUnitId: p.id,
      datasetKey,
      packageKey: datasetKey,
      documentId,
      sectionRef: p.sourceSectionRef,
      articleRef: null,
      sourceExcerpt: "",
      sourceExcerptResolution: "UNRESOLVED_DESCRIPTION_ONLY",
      semanticDescription: [p.summary, p.realFigures.join("; "), p.stretchNotes ?? ""].filter(Boolean).join(" "),
      materiality: "CRITICAL" as EvaluationMateriality,
      unitType: p.ruleType,
      referencedDefinedTerms: p.definedTermRefs,
      materialDependencies: [],
      operativeStateAssumption: "single-document package plus an out-of-package intercreditor joinder",
      adjudication,
      notes: p.stretchNotes ?? null,
    }),
  );

  const inputHashes: Record<string, string> = {};
  const candidates: CandidateSemanticRepresentation[] = [];

  const discoveryPath = join(repoRoot, LSB_DIR, "discovery-runs/run-1787801821.json");
  inputHashes["lsb:discovery"] = fileHash(discoveryPath);
  candidates.push(...discoveryToCandidates(readJson<DiscoveryRun>(discoveryPath), datasetKey, `${LSB_DIR}/discovery-runs/run-1787801821.json`));

  const compilerPath = join(repoRoot, LSB_DIR, "compiler-runs/run-1787767205274.json");
  inputHashes["lsb:compiler"] = fileHash(compilerPath);
  const compiler = readJson<CompilerRun>(compilerPath);
  const harvested = (compiler.evaluation?.results ?? []).map((r) => r.matchedRule).filter((r): r is AnalyzerRule => Boolean(r));
  harvested.forEach((r, i) => candidates.push(analyzerRuleToCandidate(r, i, datasetKey, documentId, `${LSB_DIR}/compiler-runs/run-1787767205274.json#harvestedRule[${i}]`, "COMPILED_IR_RULE")));

  return finish(datasetKey, groundTruth, candidates, inputHashes);
}

// ---------------------------------------------------------------------------
// CONMED
// ---------------------------------------------------------------------------

const CONMED_GT_PATH = "tests/fixtures/unseen-packages/conmed-2025-credit-facility/human-ground-truth.ts";
const CONMED_FREEZE_DIR = "tests/fixtures/unseen-packages/phase-2f-freeze";

export function loadConmedDataset(repoRoot: string): LegacyDataset {
  const datasetKey = "conmed-2025-credit-facility";
  const adjudication = HUMAN_GT_ADJUDICATION(
    CONMED_GT_PATH,
    "Fixture header: authored AFTER the first-blind run was sealed and FROM THE SOURCE DOCUMENTS ONLY; single-agent limitation disclosed in the fixture itself — true two-party isolation was not available.",
  );
  const materialityMap: Record<string, EvaluationMateriality> = { MATERIAL: "MATERIAL", NON_MATERIAL: "INFORMATIONAL", UNCERTAIN: "REVIEW_UNCERTAIN" };
  const groundTruth = ALL_COVENANT_UNITS.map((u) =>
    buildGroundTruthUnit({
      gtUnitId: u.id,
      datasetKey,
      packageKey: datasetKey,
      documentId: u.documentId,
      sectionRef: u.sourceSectionRef,
      articleRef: null,
      sourceExcerpt: "",
      sourceExcerptResolution: "UNRESOLVED_DESCRIPTION_ONLY",
      semanticDescription: [u.summary, u.realFigures.join("; ")].filter(Boolean).join(" "),
      materiality: materialityMap[u.materiality] ?? "REVIEW_UNCERTAIN",
      unitType: u.isBasketLevel ? "BASKET" : "COVENANT",
      referencedDefinedTerms: u.requiredDefinedTerms,
      materialDependencies: u.parentUnit ? [u.parentUnit] : [],
      operativeStateAssumption: `as stated in ${u.documentId}`,
      adjudication,
      notes: null,
    }),
  );

  const inputHashes: Record<string, string> = {};
  const candidates: CandidateSemanticRepresentation[] = [];

  const discoveryPath = join(repoRoot, CONMED_FREEZE_DIR, "phase-2f-stage2-discovery-candidates.json");
  inputHashes["conmed:discovery"] = fileHash(discoveryPath);
  candidates.push(...discoveryToCandidates({ candidates: readJson<DiscoveryRun["candidates"]>(discoveryPath) }, datasetKey, `${CONMED_FREEZE_DIR}/phase-2f-stage2-discovery-candidates.json`));

  const findingsPath = join(repoRoot, CONMED_FREEZE_DIR, "phase-2f-stage5-audit-findings.json");
  inputHashes["conmed:auditFindings"] = fileHash(findingsPath);
  candidates.push(...auditFindingsToCandidates(readJson<AuditFinding[]>(findingsPath), datasetKey, `${CONMED_FREEZE_DIR}/phase-2f-stage5-audit-findings.json`));

  return finish(datasetKey, groundTruth, candidates, inputHashes);
}
