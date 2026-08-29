/**
 * Evaluation Methodology V2 — DSGR dataset adapter.
 *
 * Phase 3F.1.5. Loads:
 *   GROUND TRUTH  from the frozen, independently authored answer key
 *                 (tests/fixtures/unseen-packages/phase-3f-ground-truth/
 *                 ground-truth-doc-{a,b,c,d}.json) and NOTHING ELSE. No
 *                 compiler, discovery or coverage output ever contributes to a
 *                 ground-truth definition.
 *   CANDIDATES    from the frozen first-blind pipeline outputs, consumed as
 *                 EVIDENCE about what the system produced — never as a
 *                 conclusion about what is true.
 *   SOURCE TEXT   from the raw extracted text, so ground-truth excerpts do not
 *                 depend on the same structural substrate as the system under
 *                 evaluation (architecture invariant #18).
 *
 * DSGR is a KNOWN regression package (invariant #28). Nothing here treats it
 * as unseen; it is a fixture for validating the evaluator.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveSourceExcerpt } from "../source-excerpt";
import type { CandidateSemanticRepresentation, GroundTruthAdjudicationProvenance, GroundTruthQualityFinding, GroundTruthSemanticUnit } from "../types";
import { buildCandidate, buildGroundTruthUnit, EMPTY_SELF_REPORT, fileHash, hasContent, readJson } from "./common";

export const DSGR_DATASET_KEY = "dsgr-2022-2025-credit-facility";

const GT_DIR = "tests/fixtures/unseen-packages/phase-3f-ground-truth";
const RUN_DIR = "tests/fixtures/unseen-packages/phase-3f-first-blind-run";
const SRC_DIR = "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text";

const DOC_SOURCES: ReadonlyArray<{ documentId: string; file: string }> = [
  { documentId: "doc-a", file: "doc-a-2022-amended-restated-credit-agreement.txt" },
  { documentId: "doc-b", file: "doc-b-2024-third-amendment.txt" },
  { documentId: "doc-c", file: "doc-c-2025-fourth-amendment.txt" },
  { documentId: "doc-d", file: "doc-d-2025-second-amended-restated-credit-agreement.txt" },
];

// --- Frozen artifact shapes (read-only) ------------------------------------

interface GtUnitRaw {
  unitId: string;
  sectionRef: string;
  unitType: string;
  materiality: "CRITICAL" | "MATERIAL" | "REVIEW_UNCERTAIN" | "INFORMATIONAL";
  description: string;
  keyDefinedTerms?: string[];
  notes?: string;
}
interface GtDocRaw {
  documentId: string;
  sourceFile: string;
  authoredAt: string;
  authoredFromSourceOnly: boolean;
  methodologyNotes: string;
  articles: { articleRef: string; heading?: string; units: GtUnitRaw[] }[];
  documentLevelNotes?: string;
}

interface DiscoveryCandidateRaw {
  discoveryId: string;
  documentId: string;
  normalizedSourceRef: string;
  families?: string[];
  role?: string;
  description?: string;
  reviewStatus?: string;
  confidence?: number;
  sourceCitation?: string;
  structuralNodeKeys?: string[];
}

interface CoverageUnitRaw {
  semanticUnitId: string;
  anchors: { documentId: string; sectionRef: string | null; sourceCitation?: string }[];
  family: string;
  familyEvidence?: string;
  postureSignal?: string;
  materiality: string;
  materialityReasoning?: string;
  excerptText?: string;
  detectedSignals?: string[];
  detectionMethod?: string;
  confidence?: string;
  uncertaintyReasons?: string[];
  operativeVersionRef?: string | null;
}
interface CoverageEntryRaw {
  semanticUnitId: string;
  coverageState: string;
  matchedIrIds?: string[];
  reasoning: string;
  materiality: string;
}
interface DangerousEntryRaw {
  semanticUnitId: string;
  reason: string;
  materiality: string;
  sourceEvidence?: string;
  auditorReasoning?: string;
}
interface CoverageResultRaw {
  packageCoverage: { documents: { documentId: string; coverageEntries: CoverageEntryRaw[]; dangerousUnaccounted: DangerousEntryRaw[] }[] };
  documentDetails: { documentId: string; units: CoverageUnitRaw[] }[];
}

interface IRRuleRaw {
  ruleId: string;
  sourceDocumentId: string;
  sourceSectionRef: string | null;
  covenantFamily: string;
  ruleType: string;
  posture: string;
  action: string | null;
  entityScope?: string[];
  conditions?: { description: string }[];
  exceptions?: { description: string }[];
  dependsOn?: { targetRuleId: string; description: string }[];
  capacityExpression?: unknown;
  sufficiency: string;
  sufficiencyReasons?: string[];
  provenance?: { sourceCitation?: string | null; excerpt?: string | null } | null;
  operativeLineage?: { operativeVersionRef?: string | null } | null;
}
interface IRDefinitionRaw {
  definitionId: string;
  sourceDocumentId: string;
  termName: string;
  covenantFamily: string;
  calculationExpression?: unknown;
  dependsOnTerms?: string[];
  sufficiency: string;
  sufficiencyReasons?: string[];
  provenance?: { sourceCitation?: string | null; excerpt?: string | null } | null;
}
interface CompiledUnitRaw {
  candidateRef: string;
  sourceDocumentId: string;
  sourceSectionRef: string | null;
  status: string;
  rules: IRRuleRaw[];
  definitions: IRDefinitionRaw[];
}

interface VerificationFindingRaw {
  findingId: string;
  sourceDocumentId: string;
  findingType: string;
  severity: string;
  sourceEvidence?: string;
  sourceCitation?: string;
  verifierReasoning?: string;
  irPath?: string;
}
interface VerificationResultRaw {
  candidateRef: string;
  status: string;
  findings: VerificationFindingRaw[];
}

interface AmendmentEffectRaw {
  effectId: string;
  amendmentDocumentId: string;
  operation: string;
  target: { targetSectionRef?: string | null; targetHint?: string | null };
  sourceCitation?: string;
  sourceExcerpt?: string;
  status: string;
  unresolvedReason?: string | null;
}

// --- Loading ---------------------------------------------------------------

export interface DsgrDataset {
  groundTruth: GroundTruthSemanticUnit[];
  candidates: CandidateSemanticRepresentation[];
  droppedContentFreeCandidates: number;
  inputHashes: Record<string, string>;
  qualityFindings: GroundTruthQualityFinding[];
}

const EXCERPT_CHARS = 2400;

export function loadDsgrDataset(repoRoot: string): DsgrDataset {
  const inputHashes: Record<string, string> = {};
  const qualityFindings: GroundTruthQualityFinding[] = [];

  const sourceText = new Map<string, string>();
  for (const d of DOC_SOURCES) {
    const path = join(repoRoot, SRC_DIR, d.file);
    inputHashes[`source:${d.documentId}`] = fileHash(path);
    sourceText.set(d.documentId, readJsonSafeText(path));
  }

  // --- Ground truth (frozen answer key only) --------------------------------
  const groundTruth: GroundTruthSemanticUnit[] = [];
  for (const docId of ["doc-a", "doc-b", "doc-c", "doc-d"]) {
    const path = join(repoRoot, GT_DIR, `ground-truth-${docId}.json`);
    inputHashes[`groundTruth:${docId}`] = fileHash(path);
    const doc = readJson<GtDocRaw>(path);
    const adjudication: GroundTruthAdjudicationProvenance = {
      // Recorded honestly from the artifact's own declaration. These files say
      // `authoredFromSourceOnly: true` and record no external lawyer review, so
      // they are AI-adjudicated-from-source-only, not a human answer key.
      kind: doc.authoredFromSourceOnly ? "AI_ADJUDICATED_FROM_SOURCE_ONLY" : "UNKNOWN_PROVENANCE",
      sourceStatement: `authoredFromSourceOnly=${doc.authoredFromSourceOnly}; methodologyNotes: ${(doc.methodologyNotes ?? "").slice(0, 600)}`,
      authoredAt: doc.authoredAt ?? null,
      sourceArtifactPath: `${GT_DIR}/ground-truth-${docId}.json`,
      externallyHumanReviewed: false,
    };
    const text = sourceText.get(doc.documentId) ?? "";
    for (const article of doc.articles) {
      for (const unit of article.units) {
        const resolved = resolveSourceExcerpt(text, unit.sectionRef, {
          maxChars: EXCERPT_CHARS,
          definedTermHints: unit.unitType === "DEFINITION" ? (unit.keyDefinedTerms ?? []) : [],
        });
        if (resolved.resolution === "UNRESOLVED_DESCRIPTION_ONLY") {
          qualityFindings.push({
            gtUnitId: unit.unitId,
            verdict: "GT_REQUIRES_DOMAIN_REVIEW",
            evidence: `The ground truth's own sectionRef "${unit.sectionRef}" could not be located in the raw source text by an independent (non-structural-index) resolver. The unit's semantic description is still evaluated; only its verbatim excerpt is unavailable.`,
            excludedFromCleanAggregates: false,
            exclusionReason: null,
          });
        }
        groundTruth.push(
          buildGroundTruthUnit({
            gtUnitId: unit.unitId,
            datasetKey: DSGR_DATASET_KEY,
            packageKey: DSGR_DATASET_KEY,
            documentId: doc.documentId,
            sectionRef: unit.sectionRef,
            articleRef: article.articleRef,
            sourceExcerpt: resolved.text,
            sourceExcerptResolution: resolved.resolution,
            semanticDescription: unit.description,
            materiality: unit.materiality,
            unitType: unit.unitType,
            referencedDefinedTerms: unit.keyDefinedTerms ?? [],
            materialDependencies: extractDependenciesFromNotes(unit.notes ?? ""),
            operativeStateAssumption: `as stated in ${doc.documentId} (${doc.sourceFile})`,
            adjudication,
            notes: unit.notes ?? null,
          }),
        );
      }
    }
  }

  // --- Candidates (production outputs, consumed as evidence) ----------------
  const candidates: CandidateSemanticRepresentation[] = [];

  const discoveryPath = join(repoRoot, RUN_DIR, "stage2-all-discovery-candidates.json");
  inputHashes["stage2"] = fileHash(discoveryPath);
  for (const c of readJson<DiscoveryCandidateRaw[]>(discoveryPath)) {
    const review = (c.reviewStatus ?? "").toUpperCase();
    candidates.push(
      buildCandidate({
        candidateId: `discovery:${c.discoveryId}`,
        datasetKey: DSGR_DATASET_KEY,
        packageKey: DSGR_DATASET_KEY,
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
        provenancePath: `${RUN_DIR}/stage2-all-discovery-candidates.json#${c.discoveryId}`,
      }),
    );
  }

  const coveragePath = join(repoRoot, RUN_DIR, "stage8-coverage-result.json");
  inputHashes["stage8"] = fileHash(coveragePath);
  const coverage = readJson<CoverageResultRaw>(coveragePath);
  const coverageByUnit = new Map<string, CoverageEntryRaw>();
  const dangerousByUnit = new Map<string, DangerousEntryRaw>();
  for (const doc of coverage.packageCoverage.documents) {
    for (const e of doc.coverageEntries) coverageByUnit.set(e.semanticUnitId, e);
    for (const d of doc.dangerousUnaccounted) dangerousByUnit.set(d.semanticUnitId, d);
  }
  const seenCoverageUnits = new Set<string>();
  for (const doc of coverage.documentDetails) {
    for (const u of doc.units) {
      if (seenCoverageUnits.has(u.semanticUnitId)) continue;
      seenCoverageUnits.add(u.semanticUnitId);
      const entry = coverageByUnit.get(u.semanticUnitId);
      const danger = dangerousByUnit.get(u.semanticUnitId);
      const state = (entry?.coverageState ?? "").toUpperCase();
      // FULLY_REPRESENTED_REVIEW_REQUIRED is deliberately NOT treated as a
      // substantive representation: the coverage auditor's own state name says
      // review is required, and its recorded reasoning for these entries is that
      // "no rule is anchored to this unit's exact citation, but its numeric value
      // appears elsewhere in the covering candidate(s)' compiled IR" — i.e. the
      // credit is a numeric coincidence, not a demonstrated correspondence. Only
      // FULLY_REPRESENTED_VERIFIED counts as substantive.
      const accountingRole = danger
        ? "SAFETY_FLAG"
        : state === "FULLY_REPRESENTED_VERIFIED"
          ? "SUBSTANTIVE_REPRESENTATION"
          : state === "FULLY_REPRESENTED_REVIEW_REQUIRED" || state === "SOURCE_CONTEXT_INCOMPLETE" || state === "AMBIGUOUS_MATCH"
            ? "HONEST_UNRESOLVED"
            : "INVENTORY_ONLY";
      const excerpt = u.excerptText ?? "";
      candidates.push(
        buildCandidate({
          candidateId: `coverage-unit:${u.semanticUnitId}`,
          datasetKey: DSGR_DATASET_KEY,
          packageKey: DSGR_DATASET_KEY,
          documentId: doc.documentId,
          sectionRef: u.anchors[0]?.sectionRef ?? null,
          representationType: "SEMANTIC_COVERAGE_UNIT",
          accountingRole,
          excerpts: [excerpt].filter((s) => s.trim().length > 0),
          normalizedSemantics: [u.familyEvidence ?? "", u.materialityReasoning ?? "", danger?.auditorReasoning ?? "", entry?.reasoning ?? ""].filter(Boolean).join(" | "),
          provisionRoleDeclared: u.postureSignal ?? null,
          declaredFamily: u.family ?? null,
          formulaSemantics: null,
          dependencyRefs: [],
          referencedDefinedTerms: [],
          selfReportedState: {
            sufficiency: null,
            coverageState: entry?.coverageState ?? null,
            reviewStatus: u.confidence === "LOW" ? "LOW_CONFIDENCE" : null,
            unresolvedReasons: [...(u.uncertaintyReasons ?? []), ...(danger ? [`dangerousUnaccounted: ${danger.reason}`] : [])],
            verifierFindings: [],
            flaggedDangerousUnaccounted: Boolean(danger),
          },
          operativeProvenance: { documentId: doc.documentId, operativeVersionRef: u.operativeVersionRef ?? null, sourceCitation: u.anchors[0]?.sourceCitation ?? null },
          provenancePath: `${RUN_DIR}/stage8-coverage-result.json#${u.semanticUnitId}`,
        }),
      );
    }
  }

  const compiledPath = join(repoRoot, RUN_DIR, "stage6-compiled-results.json");
  inputHashes["stage6"] = fileHash(compiledPath);
  for (const unit of readJson<CompiledUnitRaw[]>(compiledPath)) {
    for (const rule of unit.rules) {
      candidates.push(
        buildCandidate({
          candidateId: `ir-rule:${rule.ruleId}`,
          datasetKey: DSGR_DATASET_KEY,
          packageKey: DSGR_DATASET_KEY,
          documentId: rule.sourceDocumentId,
          sectionRef: rule.sourceSectionRef,
          representationType: "COMPILED_IR_RULE",
          accountingRole: accountingRoleForSufficiency(rule.sufficiency),
          excerpts: [rule.provenance?.excerpt ?? ""].filter((s) => s.trim().length > 0),
          normalizedSemantics: [
            `posture=${rule.posture}`,
            `action=${rule.action ?? "(none)"}`,
            `ruleType=${rule.ruleType}`,
            ...(rule.conditions ?? []).map((c) => `condition: ${c.description}`),
            ...(rule.exceptions ?? []).map((e) => `exception: ${e.description}`),
          ].join(" | "),
          provisionRoleDeclared: rule.ruleType,
          declaredFamily: rule.covenantFamily,
          formulaSemantics: rule.capacityExpression ? summariseExpression(rule.capacityExpression) : null,
          dependencyRefs: (rule.dependsOn ?? []).map((d) => d.targetRuleId),
          referencedDefinedTerms: [],
          declaredScope: rule.entityScope ?? [],
          selfReportedState: {
            sufficiency: rule.sufficiency,
            coverageState: null,
            reviewStatus: unit.status,
            unresolvedReasons: rule.sufficiency === "COMPLETE" ? [] : (rule.sufficiencyReasons ?? []),
            verifierFindings: [],
            flaggedDangerousUnaccounted: false,
          },
          operativeProvenance: {
            documentId: rule.sourceDocumentId,
            operativeVersionRef: rule.operativeLineage?.operativeVersionRef ?? null,
            sourceCitation: rule.provenance?.sourceCitation ?? null,
          },
          provenancePath: `${RUN_DIR}/stage6-compiled-results.json#${rule.ruleId}`,
        }),
      );
    }
    for (const def of unit.definitions) {
      candidates.push(
        buildCandidate({
          candidateId: `ir-definition:${def.definitionId}`,
          datasetKey: DSGR_DATASET_KEY,
          packageKey: DSGR_DATASET_KEY,
          documentId: def.sourceDocumentId,
          sectionRef: unit.sourceSectionRef,
          representationType: "COMPILED_IR_DEFINITION",
          accountingRole: accountingRoleForSufficiency(def.sufficiency),
          excerpts: [def.provenance?.excerpt ?? ""].filter((s) => s.trim().length > 0),
          normalizedSemantics: `definition of "${def.termName}"${(def.dependsOnTerms ?? []).length > 0 ? ` depending on ${(def.dependsOnTerms ?? []).join(", ")}` : ""}`,
          provisionRoleDeclared: "DEFINITION",
          declaredFamily: def.covenantFamily,
          formulaSemantics: def.calculationExpression ? summariseExpression(def.calculationExpression) : null,
          dependencyRefs: def.dependsOnTerms ?? [],
          referencedDefinedTerms: [def.termName, ...(def.dependsOnTerms ?? [])],
          selfReportedState: {
            sufficiency: def.sufficiency,
            coverageState: null,
            reviewStatus: unit.status,
            unresolvedReasons: def.sufficiency === "COMPLETE" ? [] : (def.sufficiencyReasons ?? []),
            verifierFindings: [],
            flaggedDangerousUnaccounted: false,
          },
          operativeProvenance: { documentId: def.sourceDocumentId, operativeVersionRef: null, sourceCitation: def.provenance?.sourceCitation ?? null },
          provenancePath: `${RUN_DIR}/stage6-compiled-results.json#${def.definitionId}`,
        }),
      );
    }
  }

  const verificationPath = join(repoRoot, RUN_DIR, "stage7-verification-results.json");
  inputHashes["stage7"] = fileHash(verificationPath);
  for (const result of readJson<VerificationResultRaw[]>(verificationPath)) {
    for (const f of result.findings) {
      candidates.push(
        buildCandidate({
          candidateId: `verification:${f.findingId}`,
          datasetKey: DSGR_DATASET_KEY,
          packageKey: DSGR_DATASET_KEY,
          documentId: f.sourceDocumentId,
          sectionRef: null,
          representationType: "VERIFICATION_FINDING",
          accountingRole: "SAFETY_FLAG",
          excerpts: [f.sourceEvidence ?? ""].filter((s) => s.trim().length > 0),
          normalizedSemantics: [f.findingType, f.verifierReasoning ?? ""].filter(Boolean).join(": "),
          provisionRoleDeclared: null,
          declaredFamily: null,
          formulaSemantics: null,
          dependencyRefs: [],
          referencedDefinedTerms: [],
          selfReportedState: { ...EMPTY_SELF_REPORT, reviewStatus: result.status, verifierFindings: [f.findingType], unresolvedReasons: [f.severity] },
          operativeProvenance: { documentId: f.sourceDocumentId, operativeVersionRef: null, sourceCitation: f.sourceCitation ?? null },
          provenancePath: `${RUN_DIR}/stage7-verification-results.json#${f.findingId}`,
        }),
      );
    }
  }

  const amendmentPath = join(repoRoot, RUN_DIR, "stage5-amendment-effects.json");
  inputHashes["stage5"] = fileHash(amendmentPath);
  for (const e of readJson<AmendmentEffectRaw[]>(amendmentPath)) {
    candidates.push(
      buildCandidate({
        candidateId: `amendment-effect:${e.effectId}`,
        datasetKey: DSGR_DATASET_KEY,
        packageKey: DSGR_DATASET_KEY,
        documentId: e.amendmentDocumentId,
        sectionRef: e.target.targetSectionRef ?? null,
        representationType: "AMENDMENT_EFFECT",
        accountingRole: e.status === "REVIEW_REQUIRED" ? "HONEST_UNRESOLVED" : "SUBSTANTIVE_REPRESENTATION",
        excerpts: [e.sourceExcerpt ?? ""].filter((s) => s.trim().length > 0),
        normalizedSemantics: [e.operation, e.target.targetHint ?? ""].filter(Boolean).join(": "),
        provisionRoleDeclared: "AMENDMENT_MECHANIC",
        declaredFamily: "AMENDMENT_WAIVER_CONSENT",
        formulaSemantics: null,
        dependencyRefs: [],
        referencedDefinedTerms: [],
        selfReportedState: { ...EMPTY_SELF_REPORT, reviewStatus: e.status, unresolvedReasons: e.unresolvedReason ? [e.unresolvedReason] : [] },
        operativeProvenance: { documentId: e.amendmentDocumentId, operativeVersionRef: null, sourceCitation: e.sourceCitation ?? null },
        provenancePath: `${RUN_DIR}/stage5-amendment-effects.json#${e.effectId}`,
      }),
    );
  }

  const withContent = candidates.filter(hasContent);
  return {
    groundTruth,
    candidates: withContent,
    droppedContentFreeCandidates: candidates.length - withContent.length,
    inputHashes,
    qualityFindings,
  };
}

function accountingRoleForSufficiency(sufficiency: string): CandidateSemanticRepresentation["accountingRole"] {
  switch ((sufficiency ?? "").toUpperCase()) {
    case "COMPLETE":
      return "SUBSTANTIVE_REPRESENTATION";
    case "UNSUPPORTED":
      return "HONEST_UNSUPPORTED";
    case "PARTIAL":
    case "AMBIGUOUS":
    case "MISSING_CONTEXT":
    case "CONFLICTED":
      return "HONEST_UNRESOLVED";
    default:
      return "INVENTORY_ONLY";
  }
}

/** A compact, human-readable rendering of an IR expression tree for evidence packets. */
export function summariseExpression(expr: unknown, depth = 0): string {
  if (expr === null || expr === undefined) return "";
  if (depth > 4) return "…";
  if (typeof expr !== "object") return String(expr);
  const node = expr as Record<string, unknown>;
  const kind = String(node.kind ?? "?");
  const parts: string[] = [];
  for (const key of ["amount", "value", "percent", "ratio", "metricName", "termName", "operator", "currency", "description"]) {
    if (node[key] !== undefined && node[key] !== null) parts.push(`${key}=${String(node[key])}`);
  }
  const children: string[] = [];
  for (const key of ["operands", "cases", "left", "right", "defaultValue", "gatedBy", "condition", "then", "otherwise"]) {
    const child = node[key];
    if (Array.isArray(child)) children.push(...child.slice(0, 6).map((c) => summariseExpression(c, depth + 1)));
    else if (child) children.push(summariseExpression(child, depth + 1));
  }
  return `${kind}(${parts.join(",")}${children.length > 0 ? `[${children.filter(Boolean).join("; ")}]` : ""})`;
}

function readJsonSafeText(path: string): string {
  return readFileSync(path, "utf-8");
}

/** Cross-section dependencies the ground truth's OWN notes call out as material. */
function extractDependenciesFromNotes(notes: string): string[] {
  const out = new Set<string>();
  for (const m of notes.matchAll(/\bSections?\s+([0-9]+\.[0-9]+(?:\([a-z0-9ivx]+\))*)/gi)) out.add((m[1] ?? "").toLowerCase());
  return [...out];
}
