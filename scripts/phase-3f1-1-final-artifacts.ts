/**
 * Phase 3F.1.1 — consolidates the intermediate forensic outputs into the
 * exact 10 required machine-readable artifacts (task §35). READ-ONLY,
 * no production code touched.
 *
 * Run via: npx tsx scripts/phase-3f1-1-final-artifacts.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const OUT_DIR = "tests/fixtures/unseen-packages/phase-3f1-1-forensics";
const FIRST_BLIND_DIR = "tests/fixtures/unseen-packages/phase-3f-first-blind-run";
const REGRESSION_DIR = "tests/fixtures/unseen-packages/phase-3f1-dsgr-remediation-regression";
const GT_DIR = "tests/fixtures/unseen-packages/phase-3f-ground-truth";

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}
function write(name: string, data: unknown) {
  const path = join(OUT_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`  [written] ${path}`);
}
function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

interface CaseForensics {
  gtUnitId: string;
  documentId: string;
  sectionRef: string;
  nodeKey: string;
  nodeKeyDuplicateCount: number;
  node: { charStart: number; charEnd: number; heading: string } | null;
  ownTextLength: number;
  ownTextEmpty: boolean;
  routedAsRegion: boolean;
  admissionReasons: string[];
  closureDepth: number | null;
  bestRegressionUnitMateriality: string | null;
  bestRegressionUnitContextuallyElevated: boolean | null;
  bestRegressionUnitFamily: string | null;
  algoA_classification: string;
  algoC_classification: string;
  algoD_classification: string;
  disposition: string;
  isFalseCreditSuspect: boolean;
  primaryRootCause: string;
  secondaryRootCauses: string[];
  rootCauseEvidence: string;
  gtDescription: string;
}

function main() {
  const cases = loadJson<CaseForensics[]>(join(OUT_DIR, "case-forensics-all-119.json"));
  const original119 = loadJson<{ gtUnitId: string; unitType: string; discoveryMatch: string; gtMateriality: string }[]>(join(OUT_DIR, "original-119-canonical.json"));
  const unitTypeById = new Map(original119.map((r) => [r.gtUnitId, r.unitType] as const));
  const discoveryMatchById = new Map(original119.map((r) => [r.gtUnitId, r.discoveryMatch] as const));

  // === 1. freeze manifest === (already written by an earlier step - re-confirm it exists, don't overwrite)
  console.log("1. phase-3f1-1-freeze-manifest.json - already written in the earlier freeze step.");

  // === 2. original-119-lineage ===
  const lineage = cases.map((c, i) => ({
    canonicalCaseId: `3F1-1-CASE-${String(i + 1).padStart(3, "0")}`,
    originalGroundTruthUnitId: c.gtUnitId,
    documentId: c.documentId,
    sourceSectionRef: c.sectionRef,
    sourceNodeId: c.node ? c.nodeKey : null,
    sourceSpan: c.node ? { charStart: c.node.charStart, charEnd: c.node.charEnd } : null,
    semanticFamily: { groundTruthUnitType: unitTypeById.get(c.gtUnitId) ?? null, matchedAuditFamily: c.bestRegressionUnitFamily },
    groundTruthMateriality: "CRITICAL",
    shortSourceDescription: c.gtDescription.slice(0, 300),
    original3FInventoryMatch: c.algoA_classification,
    original3FCoverageState: null,
    original3FDangerReason: c.algoA_classification === "VIOLATION_NO_AUDIT_MATCH" ? "no audit unit at any level" : c.algoA_classification === "VIOLATION_MATERIALITY_MISCLASSIFIED_UNFLAGGED" ? "audit unit exists but materiality misclassified below threshold" : null,
    originalFTaxonomyAssignment: c.algoA_classification === "VIOLATION_NO_AUDIT_MATCH" ? "F1" : c.algoA_classification === "VIOLATION_MATERIALITY_MISCLASSIFIED_UNFLAGGED" ? "F2" : null,
    phase3F1RoutedStatus: c.routedAsRegion,
    phase3F1RoutedRegionAdmissionReasons: c.admissionReasons,
    phase3F1ClosureDepth: c.closureDepth,
    phase3F1InventoryMatch: c.algoD_classification,
    phase3F1InventoryMateriality: c.bestRegressionUnitMateriality,
    phase3F1MaterialityProvenance: c.bestRegressionUnitContextuallyElevated === true ? "CONTEXTUAL_FLOOR" : c.bestRegressionUnitContextuallyElevated === false ? "LOCAL_CLASSIFICATION" : null,
    phase3F1CoverageState: null,
    phase3F1DangerState: c.algoD_classification,
    final3F11Disposition: c.disposition,
    residualRootCauseClass: c.disposition === "STILL_DANGEROUS" ? c.primaryRootCause : null,
    residualSecondaryRootCauses: c.secondaryRootCauses,
    evidenceReferences: [`case-forensics-all-119.json#${c.gtUnitId}`, `raw-scorer-combination-A-original-x-firstblind.json#${c.gtUnitId}`, `raw-scorer-combination-D-corrected-x-regression.json#${c.gtUnitId}`],
  }));
  write("phase-3f1-1-original-119-lineage", { totalRows: lineage.length, rows: lineage });
  console.log(`2. lineage rows: ${lineage.length} (must be 119: ${lineage.length === 119 ? "OK" : "*** MISMATCH ***"})`);
  const uniqueIds = new Set(lineage.map((r) => r.originalGroundTruthUnitId));
  console.log(`   unique canonical case IDs: ${uniqueIds.size} (must be 119: ${uniqueIds.size === 119 ? "OK" : "*** MISMATCH ***"})`);

  // === 3. scorer bridge (119 -> 93 -> 89) ===
  const scorerArtifact = cases.filter((c) => c.disposition === "SCORER_ARTIFACT_CORRECTED");
  const resolved = cases.filter((c) => c.disposition === "RESOLVED_BY_3F1");
  const stillDangerous = cases.filter((c) => c.disposition === "STILL_DANGEROUS");
  const falseCreditSuspects = scorerArtifact.filter((c) => c.isFalseCreditSuspect);
  const bridge = {
    note: "119 = the permanent, sealed original strict CRITICAL count (phase-3f-scoring-report.json, never modified). 93 = the SAME 119 cases re-scored with the corrected (descendant-union) methodology against the SAME first-blind coverage (no code change) - the 26-case difference is a pure scoring-methodology artifact, present even before any Phase 3F.1 remediation code ran. 89 = those same 93 re-scored against the DSGR remediation regression's actual coverage output - only 4 of the 93 were genuinely resolved by the Workstream A-D code changes.",
    counts: { original119: 119, scorerArtifactCorrected: scorerArtifact.length, corrected93Baseline: 119 - scorerArtifact.length, resolvedBy3F1Code: resolved.length, stillDangerous89: stillDangerous.length },
    invariant: `119 = ${scorerArtifact.length} (scorer artifact) + ${resolved.length} (resolved) + ${stillDangerous.length} (still dangerous) = ${scorerArtifact.length + resolved.length + stillDangerous.length}`,
    adversarialAudit: {
      note: "Section 6/7's own required adversarial audit: sampled the corrected scorer's own union-descendant matching against ground truth's described content. Of the 26 scorer-artifact-corrected cases, a manual source-level review found 14-16 are FALSE CREDITS (the scorer's 'best materiality among exact+descendant' pick is a topically UNRELATED descendant, not content that represents the same claim the ground-truth chapeau/lead-in/flush-clause unit describes) - e.g. ground truth 'doc-a::VI::6.01-chapeau' (the general Indebtedness prohibition) was credited via '6.01(b)(i)' (a narrow, unrelated intercompany-debt sub-cap). This means the TRUE, semantically-honest 93 baseline is itself likely an UNDERCOUNT - a real residual scoring/reconciliation defect, disclosed here, NOT fixed (production/scorer code is frozen for this phase).",
      scorerArtifactTotal: scorerArtifact.length,
      falseCreditSuspectCount: falseCreditSuspects.length,
      falseCreditSuspectIds: falseCreditSuspects.map((c) => c.gtUnitId),
      semanticallyAdjustedResidualEstimate: stillDangerous.length + falseCreditSuspects.length,
      semanticallyAdjustedResidualNote: `If the false-credit suspects are counted as still-dangerous (their own real content is not adequately represented), the TRUE residual is closer to ${stillDangerous.length} + ${falseCreditSuspects.length} = ${stillDangerous.length + falseCreditSuspects.length}, not the mechanically-reported 89. This is reported as a finding, not corrected in-place (no scorer/production code change in this phase).`,
    },
    perCaseBridge: scorerArtifact.map((c) => ({ gtUnitId: c.gtUnitId, oldScorerResult: c.algoA_classification, correctedScorerResult: c.algoC_classification, isFalseCreditSuspect: c.isFalseCreditSuspect, sourceFact: c.gtDescription.slice(0, 200), whyCorrectedIsMoreOrLessFaithful: c.isFalseCreditSuspect ? "SUSPECT: the corrected scorer's best-materiality pick is a topically unrelated descendant unit, not genuine coverage of this ground-truth unit's own claim" : "the corrected scorer's descendant union appears to genuinely represent the same claim (same specific lettered clause or closely related sub-provision)" })),
    resolvedByCodeChangeIds: resolved.map((c) => c.gtUnitId),
  };
  write("phase-3f1-1-scorer-bridge", bridge);
  console.log(`3. scorer bridge: 119 = ${scorerArtifact.length} + ${resolved.length} + ${stillDangerous.length} = ${scorerArtifact.length + resolved.length + stillDangerous.length}`);

  // === 4. residual cases ===
  write("phase-3f1-1-residual-cases", { count: stillDangerous.length, cases: stillDangerous });
  console.log(`4. residual cases: ${stillDangerous.length}`);

  // === 5. root-cause taxonomy === (already written as root-cause-taxonomy.json in the distributions step)
  const taxonomy = loadJson(join(OUT_DIR, "root-cause-taxonomy.json"));
  write("phase-3f1-1-root-cause-taxonomy", taxonomy);
  console.log("5. root-cause taxonomy copied to required filename.");

  // === 6. discovery/audit quadrants ===
  const quadrants = loadJson(join(OUT_DIR, "discovery-audit-quadrants.json"));
  write("phase-3f1-1-discovery-audit-quadrants", quadrants);
  console.log("6. quadrants copied to required filename.");

  // === 7. family/structural distribution ===
  const dist = loadJson(join(OUT_DIR, "family-structural-distribution.json"));
  write("phase-3f1-1-family-structural-distribution", dist);
  console.log("7. family/structural distribution copied to required filename.");

  // === 8. pareto ===
  const pareto = loadJson(join(OUT_DIR, "pareto.json"));
  write("phase-3f1-1-pareto", pareto);
  console.log("8. pareto copied to required filename.");

  // === 9. remediation candidates ===
  const remediationCandidates = [
    {
      candidateId: "3F1-2-A",
      title: "Phase 2A structural-index node-identity uniqueness + children-list integrity fix",
      targetsRootCauses: ["R17_STRUCTURAL_PARSER_EFFECT"],
      affectedResidualCases: 58,
      affectedResidualCasesIncludingSecondary: 70,
      safetySeverity: "HIGH - this is the dominant root cause (65.2% primary, 78.7% combined primary+secondary) of the entire residual population",
      likelyProductionModules: ["lib/contract-model/compiler/structural-index.ts (buildStructuralIndex - byKey/childrenByParentKey collision handling)", "lib/contract-model/compiler/stage-structure.ts (upstream node-key derivation, likely needs positional disambiguation, not just documentId::sectionRef)"],
      conceptualChange: "Node identity must be disambiguated when the same sectionRef pattern matches multiple physically distinct document locations (Table-of-Contents entries, cross-reference mentions inside other sections, and the real section header must never collide on one nodeKey). Requires either (a) excluding ToC-region text from structural node creation entirely, (b) validating a candidate section header against structural plausibility (e.g. requiring real body content following it, not immediately another header), or (c) a compound node-identity scheme (documentId::sectionRef::occurrenceOrdinal) with an explicit 'canonical operative instance' selection rule - NOT last-charStart-wins by accident of Map insertion order.",
      expectedGenerality: "HIGH - this is a Phase 2A defect, upstream of and shared by every downstream Phase 2B-3F consumer (Architecture Invariants #18's own named shared-substrate risk). A fix here would very likely also silently improve Phase 2B discovery quality, not just Phase 3E coverage.",
      overfittingRisk: "LOW if implemented as a generic structural-integrity rule (e.g. 'a section node's own children must never have a charStart before the node's own charStart' as a validity invariant, or ToC-detection via generic pattern - not a DSGR-specific fix)",
      regressionRisk: "MEDIUM-HIGH - this changes Phase 2A's own node identity for potentially hundreds of nodes across every existing regression package (FWRG/LSB/CONMED/DSGR); requires a full re-verification of the real zero-cost FWRG/LSB regressions and all Phase 2A/2B/2C/2D/2E/2G synthetic+real test suites, not just Phase 3E's own tests.",
      requiresIrCompilerChange: false,
      requiresArchitectureChange: true,
      note: "This is squarely OUT OF SCOPE for a routing/materiality-only 3F.1.2 patch - it requires touching Phase 2A, the shared structural substrate every later phase depends on. See gate-realism analysis for why this points toward an ARCHITECTURE_CHANGE_PROPOSAL rather than a bounded workstream patch.",
    },
    {
      candidateId: "3F1-2-B",
      title: "Contextual materiality floor: extend eligibility check past a structurally-corrupted immediate parent",
      targetsRootCauses: ["R11_MATERIALITY_INHERITANCE_NOT_TRIGGERED"],
      affectedResidualCases: 13,
      affectedResidualCasesIncludingSecondary: 1,
      safetySeverity: "MEDIUM - 12 of 13 R11 cases are themselves downstream of the same R17 defect (their immediate parent's own materiality is corrupted); only 1 is a genuine floor-selectivity gap independent of R17",
      likelyProductionModules: ["lib/contract-model/compiler/semantic-coverage/unit-hypothesis.ts (applyContextualMaterialityFloor)"],
      conceptualChange: "Superseded in priority by 3F1-2-A: once node identity is fixed, most R11 cases should self-resolve since the parent's own materiality will stop being spuriously INFORMATIONAL. The 1 residual case not explained by R17 may warrant a bounded extension (e.g. climbing past a non-operative immediate parent to the nearest genuinely operative ancestor, mirroring the existing ANCESTOR_SCOPE_CONTEXT closure reason's own bounded-climb precedent) - but this affects only 1 case and should not be prioritized ahead of 3F1-2-A.",
      expectedGenerality: "LOW on its own (1 case); MODERATE as a natural follow-on once 3F1-2-A is done and the remaining true R11 population is re-measured",
      overfittingRisk: "LOW",
      regressionRisk: "LOW - purely additive to an already-tested, already-bounded mechanism",
      requiresIrCompilerChange: false,
      requiresArchitectureChange: false,
    },
    {
      candidateId: "3F1-2-C",
      title: "classifyMateriality: extend REAL_MECHANIC_SIGNAL_NAMES / add a targeted family-headline-plus-context rule",
      targetsRootCauses: ["R10_MATERIALITY_LOCAL_CLASSIFICATION_ERROR"],
      affectedResidualCases: 10,
      safetySeverity: "MEDIUM",
      likelyProductionModules: ["lib/contract-model/compiler/semantic-coverage/unit-hypothesis.ts (classifyMateriality)"],
      conceptualChange: "10 cases carry only a FAMILY_HEADLINE-category local signal (e.g. 'asset_dispositions', 'indebtedness') with no ECONOMIC/MECHANIC-category signal, landing REVIEW_UNCERTAIN with no closure/inheritance relationship to lift them further. Needs case-level investigation (not done in this phase, frozen production code) into whether these are genuinely qualitative-only provisions (correctly REVIEW_UNCERTAIN) or whether their structural role (e.g. a numbered exception item under an un-detected operative parent, itself possibly another R17 instance) was never checked.",
      expectedGenerality: "UNKNOWN without further case-level investigation - flagged as needing the same per-case structural check applied to R11 before committing to a specific fix design",
      overfittingRisk: "MEDIUM if the fix reaches for DSGR-specific keyword additions rather than a structural role check",
      regressionRisk: "MEDIUM",
      requiresIrCompilerChange: false,
      requiresArchitectureChange: false,
    },
    {
      candidateId: "3F1-2-D",
      title: "Router: broaden seed/closure vocabulary for genuinely-reachable-but-unreached provisions",
      targetsRootCauses: ["R1_ROUTER_SEED_MISS"],
      affectedResidualCases: 8,
      safetySeverity: "LOW-MEDIUM - smallest remaining population, and the smallest fraction attributable to something Workstream A did not already address",
      likelyProductionModules: ["lib/contract-model/compiler/semantic-coverage/router.ts"],
      conceptualChange: "8 cases have a real, uncorrupted structural node that was never admitted as a seed and never reached by any of the 5 existing closure relationships (child/sibling/chapeau/proviso/ancestor). Needs per-case inspection of what structural relationship, if any, would generalize to recover them without expanding closure into an unbounded walk.",
      expectedGenerality: "LOW - smallest population, likely requires case-specific investigation before a generalized fix can be designed with confidence",
      overfittingRisk: "MEDIUM if designed from only 8 DSGR-specific examples without a genuinely generic drafting-pattern justification",
      regressionRisk: "LOW-MEDIUM",
      requiresIrCompilerChange: false,
      requiresArchitectureChange: false,
    },
  ];
  write("phase-3f1-1-remediation-candidates", { candidates: remediationCandidates, prioritizationNote: "3F1-2-A (the structural-index fix) should be addressed FIRST and separately, since it is both the dominant root cause and an architecture-boundary change (Phase 2A), not a Phase 3E patch. 3F1-2-B/C/D should be RE-MEASURED after 3F1-2-A lands, since a meaningful fraction of their own populations (12/13 of B) are themselves downstream symptoms of the same defect." });
  console.log("9. remediation candidates written.");

  // === 10. integrity manifest (end-of-phase re-hash) ===
  const productionFiles = [
    "lib/contract-model/compiler/semantic-coverage/router.ts",
    "lib/contract-model/compiler/semantic-coverage/unit-hypothesis.ts",
    "lib/contract-model/compiler/semantic-coverage/types.ts",
    "lib/contract-model/compiler/amendment/operative-state.ts",
    "lib/contract-model/compiler/amendment/types.ts",
    "lib/contract-model/compiler/semantic/compile.ts",
    "lib/contract-model/compiler/semantic/package-compile.ts",
    "lib/contract-model/compiler/structural-index.ts",
  ];
  const historicalFiles = [
    "tests/fixtures/unseen-packages/phase-3f-first-blind-run/phase-3f-first-run-integrity-manifest.json",
    "tests/fixtures/unseen-packages/phase-3f-ground-truth/phase-3f-scoring-report.json",
    "tests/fixtures/unseen-packages/phase-3f-ground-truth/phase-3f-error-taxonomy.json",
    "docs/phase-3f-unseen-package-validation.md",
  ];
  const phase3F1Files = ["docs/phase-3f1-unseen-package-safety-remediation.md"];
  const freezeManifest = loadJson<{ productionFileHashes: Record<string, string>; historicalPhase3FArtifactHashes: Record<string, string>; phase3F1ArtifactHashes: Record<string, string> }>(join(OUT_DIR, "phase-3f1-1-freeze-manifest.json"));
  const endHashes = { productionFiles: Object.fromEntries(productionFiles.map((p) => [p, sha256(p)])), historicalFiles: Object.fromEntries(historicalFiles.map((p) => [p, sha256(p)])), phase3F1Files: Object.fromEntries(phase3F1Files.map((p) => [p, sha256(p)])) };
  const productionMismatches = productionFiles.filter((p) => freezeManifest.productionFileHashes[p] !== endHashes.productionFiles[p]);
  const historicalMismatches = [...historicalFiles.filter((p) => freezeManifest.historicalPhase3FArtifactHashes[p] !== endHashes.historicalFiles[p]), ...phase3F1Files.filter((p) => freezeManifest.phase3F1ArtifactHashes[p] !== endHashes.phase3F1Files[p])];
  console.log(`\n10. Integrity re-check: production mismatches=${productionMismatches.length}, historical mismatches=${historicalMismatches.length}`);
  write("phase-3f1-1-integrity-manifest", {
    startHashes: { productionFiles: freezeManifest.productionFileHashes, historicalFiles: freezeManifest.historicalPhase3FArtifactHashes },
    endHashes,
    productionCodeByteIdentical: productionMismatches.length === 0,
    historicalArtifactsByteIdentical: historicalMismatches.length === 0,
    productionMismatches,
    historicalMismatches,
  });

  console.log("\nDone.");
}

main();
