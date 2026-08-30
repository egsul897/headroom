const fs = require("fs");
const raw = JSON.parse(fs.readFileSync("/tmp/phase-3f1-6-section14-raw.json", "utf-8"));
const byPkg = Object.fromEntries(raw.packages.map((p) => [p.package, p]));

function pkgSummary(p) {
  return {
    package: p.package,
    documentId: p.documentId,
    realDiscoveredCandidateCount: p.realDiscoveredCandidateCount,
    realCompiledResultCount: p.realCompiledResultCount,
    totalStructuralNodeCount: p.totalStructuralNodeCount,
    sectionCoverage: p.sectionCoverage,
    materialClaimDiscoveryAndResolution: p.categoryBuckets.find((c) => c.category === "MATERIAL_CLAIM_BROAD") ?? null,
    basketExceptionDiscoveryAndResolution: p.categoryBuckets.find((c) => c.category === "BASKET_EXCEPTION") ?? null,
    chapeauDiscoveryAndResolution: p.categoryBuckets.find((c) => c.category === "CHAPEAU_PROXY") ?? null,
    conditionOnlyDiscoveryAndResolution: p.categoryBuckets.find((c) => c.category === "CONDITION_ONLY") ?? null,
    otherUnclassifiedSignalDiscoveryAndResolution: p.categoryBuckets.find((c) => c.category === "OTHER_UNCLASSIFIED_SIGNAL") ?? null,
    dependencyDiscovery: p.dependencyDiscovery,
    routingLayerAdmissionCounts: p.routingLayerAdmissionCounts,
    routingClosureStats: p.routingClosureStats,
    overallDocumentRollup: {
      totalMaterialSemanticUnits: p.overallDocument.totalMaterialSemanticUnits,
      rawFullyRepresentedFraction: p.overallDocument.rawFullyRepresentedFraction,
      materialityWeightedFullyRepresentedFraction: p.overallDocument.materialityWeightedFullyRepresentedFraction,
      gateStatus: p.overallDocument.gateStatus,
      dangerousUnaccountedTotal: p.overallDocument.dangerousUnaccountedTotal,
      dangerousUnaccountedByReason: p.overallDocument.dangerousUnaccountedByReason,
      coverageStateBreakdown: p.overallDocument.coverageStateBreakdown,
    },
    entireFamiliesMissing: p.overallDocument.familySummaries.filter((f) => f.entireFamilyMissing).map((f) => ({ family: f.family, unitCount: f.unitCount })),
    packageStatus: p.packageStatus,
  };
}

const fwrg = pkgSummary(byPkg.fwrg);
const lsb = pkgSummary(byPkg.lsb);

function undiscoveredTotal(p) {
  return p.overallDocument.dangerousUnaccountedByReason["NO_CANDIDATE_EVER_DISCOVERED"] ?? 0;
}
function unresolvedTotal(p) {
  const r = p.overallDocument.dangerousUnaccountedByReason;
  return (r["CANDIDATE_DISCOVERED_NEVER_COMPILED"] ?? 0) + (r["COMPILED_BUT_UNIT_OMITTED_FROM_IR"] ?? 0) + (r["COMPILED_BUT_MATERIALLY_MISREPRESENTED"] ?? 0);
}

const output = {
  schemaVersion: "1.0",
  phaseVersion: "phase-3f1-6-final-foundation-certification.v1",
  artifactId: "DISCOVERY_COVERAGE_CERTIFICATION",
  generatedAt: new Date().toISOString(),
  section: 14,
  purpose: "Independently certify basic discovery behavior on known real packages (FWRG, LSB) using the already-built Phase 3E source-first semantic-coverage framework (lib/contract-model/compiler/semantic-coverage/**), measuring section/material-claim/basket-exception/chapeau/dependency coverage SEPARATELY rather than one averaged number, and classifying every non-fully-represented material claim as UNDISCOVERED vs DISCOVERED_BUT_UNRESOLVED.",
  methodology: {
    framework: "runSemanticCoverageAudit (lib/contract-model/compiler/semantic-coverage/pipeline.ts) - Phase 3E's own independent, source-first MaterialSemanticUnit inventory (Layers A/B, deterministic, $0 cost, no model call) reconciled against REAL, preserved Phase 2B discovery output and REAL, preserved Phase 3B compiled IR - zero new model calls, matching the immediately preceding phase's own cost discipline.",
    zeroCostEvidence: "tests/fixtures/unseen-packages/fwrg-2021-credit-agreement/discovery-runs/run-1787801821.json (252 real candidates, 418 real structural nodes) and tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/discovery-runs/run-1787801821.json (82 real candidates, 76 real structural nodes), reconciled against tests/fixtures/unseen-packages/phase-3b-real-regression-run/run-1787866714176.json (the real, preserved Phase 3B compiled IR this codebase has genuinely produced).",
    newScript: "scripts/phase-3f1-6-discovery-coverage-certification.ts (new, read-only script; reuses scripts/phase-3e-real-fwrg-regression.ts / phase-3e-real-lsb-regression.ts / phase-3e-real-package-regression.ts loaders verbatim, adds category bucketing + routing-layer admission-reason breakdown + section-level rollup on top, never re-derives the underlying discovery/compile evidence).",
    structuralProximityNeverUsedAsCredit: "candidatesCoveringUnit() (reconciliation.ts) determines which candidates COULD cover a unit via structural containment, but actual coverage-state credit (findAnchoredRule) requires the compiled IR rule's own provenance.sourceCitation to match the unit's own anchor citation (exact or prefix match) - a candidate merely existing in the same/an ancestor section, with no rule anchored to this unit's own specific text, is correctly classified UNREPRESENTED/COMPILED_BUT_UNIT_OMITTED_FROM_IR, never credited as FULLY_REPRESENTED. Independently re-read (not merely trusted) as part of this certification - see 13-claim-identity-certification.json's Section 15 methodology for the identity-layer analogue of this same check.",
    categoryProxyDisclosure: "MaterialSemanticUnit does not persist its own generating detectionSignature (chapeau:/item:/whole-region:), so basket-exception/chapeau/material-claim categories below are reconstructed from each unit's own persisted postureSignal/detectedSignals fields (documented in scripts/phase-3f1-6-discovery-coverage-certification.ts's own header) - a disclosed proxy, not a hidden exact ground truth. Dependency discovery is NOT unit-level at all; it reuses the framework's own independent CrossSectionRelationshipFinding output (auditCrossSectionRelationships), a genuine cross-unit relationship check.",
    undiscoveredVsUnresolvedClassification: "Every material/critical unit not FULLY_REPRESENTED is drawn from doc.dangerousUnaccounted (DangerousUnaccountedSemanticUnit.reason): NO_CANDIDATE_EVER_DISCOVERED => UNDISCOVERED (no DiscoveredCandidate/MaterialSemanticUnit correspondence ever existed); CANDIDATE_DISCOVERED_NEVER_COMPILED / COMPILED_BUT_UNIT_OMITTED_FROM_IR / COMPILED_BUT_MATERIALLY_MISREPRESENTED => DISCOVERED_BUT_UNRESOLVED (a candidate/compiled result exists but coverage-state never reached FULLY_REPRESENTED_VERIFIED). This mirrors the pipeline's own built-in classification verbatim - not a re-derived taxonomy.",
    safeFailureArchitectureScopeNote: "The review-event/safe-failure architecture (lib/contract-model/compiler/safe-failure/**) is explicitly NOT credited here as solving any UNDISCOVERED case - it operates on MaterialSemanticUnits already detected by Phase 3E's own Layer A/B/C inventory; a claim in the NO_CANDIDATE_EVER_DISCOVERED bucket never reaches that inventory as a unit lacking a corresponding real-world candidate, so safe-failure has no unit to attach a review event to for the discovery gap itself (it CAN and does attach review events to the DISCOVERED_BUT_UNRESOLVED units, which is a separate, later-stage capability).",
  },
  packagesCertified: {
    fwrg: fwrg,
    lsb: lsb,
  },
  packagesNotCertified: {
    conmed: { status: "NOT_RUN", reason: "tests/fixtures/unseen-packages/conmed-2025-credit-facility/ has curated/raw-source text and human-ground-truth fixtures, but no preserved whole-document Phase 2B discovery-run JSON + structural-index-loader harness of the kind scripts/phase-3e-real-fwrg-regression.ts/phase-3e-real-lsb-regression.ts already have for FWRG/LSB. Building that harness was out of scope per this task's own 'do not build new [real-fixture] ones' instruction, so CONMED is disclosed as NOT independently coverage-certified this phase rather than silently omitted." },
    dsgr: { status: "NOT_RUN", reason: "Same limitation as CONMED - tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/ has real text/curated fixtures (scripts/phase-3f1-dsgr-remediation-regression.ts exists for a DIFFERENT, narrower P1-remediation check) but no preserved whole-document discovery-run+structural-index zero-cost coverage harness of the FWRG/LSB shape. Disclosed as NOT_RUN, not silently omitted." },
  },
  crossPackageSummary: {
    combinedUndiscoveredMaterialCriticalUnits: undiscoveredTotal(byPkg.fwrg) + undiscoveredTotal(byPkg.lsb),
    combinedDiscoveredButUnresolvedMaterialCriticalUnits: unresolvedTotal(byPkg.fwrg) + unresolvedTotal(byPkg.lsb),
    observation: "FWRG's own real discovery run (252 candidates covering the entire Article 6 document) produced ZERO NO_CANDIDATE_EVER_DISCOVERED material/critical units - Phase 2B discovery itself, at real document scale, found SOMETHING corresponding to every material/critical unit Phase 3E's independent inventory hypothesized. LSB's real run shows 3 genuinely UNDISCOVERED material/critical units (0 basket-exception, per-category breakdown above) out of 77 dangerous-unaccounted units. In BOTH packages the overwhelming majority of the gap is DISCOVERED_BUT_UNRESOLVED (395/395 FWRG, 74/77 LSB) - i.e. this codebase's real historical bottleneck is COMPILATION coverage (only 5/252 FWRG and 3/82 LSB real discovered candidates have ever actually been run through the real Phase 3B compiler at all), not discovery-stage blindness. This is the same honest conclusion the underlying real-regression scripts' own header comments already state, independently re-confirmed here by category rather than only in aggregate.",
    materialityWeightedFullyRepresentedFraction: { fwrg: fwrg.overallDocumentRollup.materialityWeightedFullyRepresentedFraction, lsb: lsb.overallDocumentRollup.materialityWeightedFullyRepresentedFraction },
  },
  findings: [
    { id: "F14-1", severity: "MAJOR_NON_BLOCKING", area: "compilation-coverage", statement: "Both real packages show DOCUMENT_GATE_FAILED and PACKAGE_SEMANTICALLY_INCOMPLETE at the whole-document scale this certification measures, driven overwhelmingly by DISCOVERED_BUT_UNRESOLVED units (never compiled, or compiled but the compiled IR omits the specific unit) rather than by genuine discovery-stage blindness. This is a real, disclosed, pre-existing capacity gap (this codebase has never run the real compiler across a FULL real document, only hand-selected sections), not a newly-introduced defect, and not a discovery-mechanism defect - classified MAJOR_NON_BLOCKING (a scale/coverage gap, not an identity/safety-integrity defect) rather than BLOCKER." },
    { id: "F14-2", severity: "MINOR", area: "discovery-stage-blindness", statement: "LSB shows 3 genuinely UNDISCOVERED material/critical units (NO_CANDIDATE_EVER_DISCOVERED) even at real document scale - a real, if numerically small, discovery-stage gap distinct from the much larger compilation-coverage gap. Disclosed, not remediated (remediation is out of this certification's scope - see ground rules)." },
    { id: "F14-3", severity: "INFORMATIONAL", area: "scope", statement: "CONMED/DSGR could not be independently coverage-certified this phase for lack of a preserved zero-cost whole-document discovery-run+structural-index harness of the FWRG/LSB shape, and building one was out of scope. Certification for those two packages is DEFERRED, not PASSED." },
  ],
  sectionVerdict: "CERTIFIED_WITH_DISCLOSED_GAPS",
  sectionVerdictRationale: "The discovery/coverage MEASUREMENT framework itself (Phase 3E) is real, independently source-first, and correctly refuses to substitute structural proximity for semantic credit - re-verified directly in this certification. What it measures at real FWRG/LSB document scale is a genuine, disclosed, large compilation-coverage gap (this codebase has never compiled a full real document), plus a small but real discovery-stage blind spot in LSB. Neither finding is a BLOCKER under this section's own definition (no claim-identity conflation, no false FULLY_REPRESENTED credit via proximity, no silent treatment of incomplete output as complete was found at the discovery/coverage-measurement layer itself) - they are honest, already-disclosed capacity gaps the framework itself surfaces rather than hides.",
};

fs.writeFileSync("docs/phase-3f1-6-final-foundation-certification/12-discovery-coverage-certification.json", JSON.stringify(output, null, 2) + "\n");
console.log("wrote 12-discovery-coverage-certification.json");
