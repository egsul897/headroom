#!/usr/bin/env python3
"""
F-5.3B final analysis: E2 record (section 12), review burden E1/E2 (section 16), additional trust gates (section 9),
original F-5 gates on the ensemble-to-ensemble score (section 8), frozen reference recall E1 vs E2 (section 15),
historical residual recovery (section 14), cost (section 19), verdict (section 18). Zero model calls; reads only
frozen artifacts produced by the other F-5.3B scripts.
  python3 scripts/f5-3b-certification-analysis.py
"""
import json, hashlib, subprocess, datetime
D = "docs/phase-3-remediation-f5-3b"; DIR = "tests/fixtures/unseen-packages/phase-3-remediation-f5-run/certification-f5-3b"
J = lambda p: json.load(open(p))
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
E1, E2 = J(f"{D}/e1-final.json"), J(f"{DIR}/e2.json")
runC, runD = J(f"{DIR}/run-C.json"), J(f"{DIR}/run-D.json")
ledger = J(f"{DIR}/ledger.json"); precheck = J(f"{D}/04-paid-pair-precheck.json")
score = J(f"{D}/07-ensemble-certification-score.json"); checks = J(f"{D}/09-e2-deterministic-checks.json")
recall = J(f"{D}/08-reference-recall-e1-e2.json"); resid = J(f"{D}/10-historical-residual-recovery-e2.json")
prereg = J(f"{D}/03-scorer-preregistration.json"); baseline = J(f"{D}/00-freeze-manifest-and-e1-baseline.json"); e1final = J(f"{D}/06-e1-rebuilt-final-code.json")
ids = E2["ensemble"]["passIds"]; c2 = E2["ensemble"]["counts"]; c1 = E1["ensemble"]["counts"]
MAT = ("CRITICAL", "MATERIAL")

def burden(E, c):
    return {"canonical": c["canonicalItems"], "corroborated": c["corroborated"], "singleton": c["singleRun"], "singletonByPass": c["singleRunByPass"], "materialSingleton": c["materialSingleRun"], "informationalSingleton": c["informationalSingleRun"], "conflicted": c["conflicted"], "materialConflicted": c["materialConflicted"], "supportReviewFraction": E["ensemble"]["supportReviewFraction"], "percentRequiringSupportReview": round(100 * E["ensemble"]["supportReviewFraction"], 2), "inventoryStatus": E["inventoryStatus"], "unaccountedSource": len(E["unaccountedSource"])}
e2record = {"runCItems": len(runC["items"]), "runDItems": len(runD["items"]), "runCStatus": runC["inventoryStatus"], "runDStatus": runD["inventoryStatus"], "runCHash": runC["frozenContentHash"], "runDHash": runD["frozenContentHash"], "canonicalItems": c2["canonicalItems"], "corroborated": c2["corroborated"], "singletonC": c2["singleRunByPass"][ids[0]], "singletonD": c2["singleRunByPass"][ids[1]], "materialSingletons": c2["materialSingleRun"], "conflicts": c2["conflicted"], "materialConflicted": c2["materialConflicted"], "unaccountedSource": len(E2["unaccountedSource"]), "accountedCharFraction": E2["sourceCoverage"]["accountedCharFraction"], "uninventoriedValues": len(E2["uninventoriedValues"]), "supportReviewFraction": E2["ensemble"]["supportReviewFraction"], "supportReviewRequired": E2["ensemble"]["supportReviewRequired"], "frozenContentHash": E2["frozenContentHash"], "algorithmVersion": E2["algorithmVersion"], "inventoryStatus": E2["inventoryStatus"], "compatibilityMode": E2["ensemble"]["compatibility"]["mode"], "rejectedUnverifiable": E2["rejectedUnverifiableItems"], "telemetryCostUsd": E2["telemetryCostUsd"], "calls": {"firstPass": E2["partition"]["firstPassCalls"], "gap": E2["partition"]["gapCalls"]}}

r1, r2 = recall["runs"]["E1"], recall["runs"]["E2"]
keys = ("discoveryRecall", "criticalMaterialRecall", "quantitativeRecall", "conditionExceptionRecall")
recall_cmp = {k: {"E1": r1[k], "E2": r2[k], "degraded": (isinstance(r1[k], (int, float)) and isinstance(r2[k], (int, float)) and r2[k] < r1[k])} for k in keys}
recall_cmp["dependencyRecall"] = {"E1": r1["dependencyRecall"], "E2": r2["dependencyRecall"]}
no_material_degradation = not any(v["degraded"] for k, v in recall_cmp.items() if k in keys)

g = score["gates"]
original_gates = {"criticalMaterialSemanticStability": g["criticalMaterialSemanticStability"], "semanticStability": g["semanticStability"], "dangerousSilentOmissions": g["dangerousSilentOmissions"], "frozenReferenceRecallNoMaterialDegradation": {"pass": no_material_degradation, "detail": recall_cmp}}
original_pass = all(x["pass"] for x in original_gates.values())

sp = checks["supportPropagation"]; pv = checks["preservation"]; rg = checks["rawGaps"]; oi = checks["orderIndependence"]; sv = checks["sourceVerification"]
additional = {
    "zeroFalseCompleteness": {"pass": not rg["falseCompleteness"] and not sp["counterfactualRawCompleteAllAccounted"]["semanticallyComplete"], "detail": {"unionStatus": rg["unionStatus"], "counterfactualRawCompleteAllAccountedStillNotComplete": not sp["counterfactualRawCompleteAllAccounted"]["semanticallyComplete"]}},
    "zeroMaterialSourceUnverifiableSurviving": {"pass": sv["materialUnverifiableSurviving"] == 0 and sv["failures"] == 0, "detail": sv},
    "zeroContradictoryEffectsSilentlyMerged": {"pass": pv["contradictoryEffectMerges"] == 0, "detail": pv["contradictoryEffectMerges"]},
    "zeroLostQuantitativeValues": {"pass": pv["valuesLost"] == 0, "detail": pv["valuesLost"]},
    "zeroDanglingLineage": {"pass": pv["danglingParents"] == 0, "detail": {"parentLinks": pv["parentLinks"], "dangling": pv["danglingParents"]}},
    "supportReviewRequiredPropagatesToReviewRequired": {"pass": sp["ensembleSupportReviewRequired"] == sp["reconciliationSupportReviewRequired"] and (not sp["ensembleSupportReviewRequired"] or (sp["rollupStatus"] != "SEMANTICALLY_COMPLETE" and sp["counterfactualRawCompleteAllAccounted"]["rollup"] == "REVIEW_REQUIRED")), "detail": {"ensemble": sp["ensembleSupportReviewRequired"], "reconciliation": sp["reconciliationSupportReviewRequired"], "rollup": sp["rollupStatus"], "counterfactualRollup": sp["counterfactualRawCompleteAllAccounted"]["rollup"]}},
    "rawBothPassGapsRemainDisclosed": {"pass": rg["gapsInBothPassesStillDisclosed"] == rg["gapsInBothPasses"], "detail": rg},
    "orderIndependenceHolds": {"pass": oi["unionCD_equals_unionDC"] and oi["reproducesOrchestratorE2"], "detail": oi},
    "inputCompatibilityGatePassed": {"pass": checks["compatibility"]["mode"] == "STRICT" and checks["compatibility"]["allChecksPass"], "detail": checks["compatibility"]},
}
additional_pass = all(x["pass"] for x in additional.values())

criteria = {
    "1_dualPassProductionPathWired": True,
    "2_inputCompatibilityGatePasses": additional["inputCompatibilityGatePassed"]["pass"],
    "3_supportAsymmetryConflictsPropagateToReviewRequired": additional["supportReviewRequiredPropagatesToReviewRequired"]["pass"],
    "4_e1Reproduced": baseline["e1"]["reproduced"] and e1final["e1"]["reproduced"],
    "5_exactlyOneNewPairCompleted": len(ledger["passIds"]) == 2 and runC["inventoryStatus"] in ("INVENTORY_OK", "INVENTORY_COVERAGE_GAP") and runD["inventoryStatus"] in ("INVENTORY_OK", "INVENTORY_COVERAGE_GAP") and ledger["ensembleBuilt"],
    "6_e2BuiltFromCDOnly": sorted(E2["ensemble"]["passHashes"].values()) == sorted([runC["frozenContentHash"], runD["frozenContentHash"]]) and len(E2["ensemble"]["passIds"]) == 2,
    "7_criticalMaterialEnsembleStabilityGte085": g["criticalMaterialSemanticStability"]["pass"],
    "8_ensembleSemanticStabilityGte080": g["semanticStability"]["pass"],
    "9_zeroDangerousSilentOmissions": g["dangerousSilentOmissions"]["pass"],
    "10_frozenReferenceRecallNotMateriallyDegraded": no_material_degradation,
    "11_zeroFalseCompleteness": additional["zeroFalseCompleteness"]["pass"],
    "12_noMaterialSourceUnverifiableAdditionsSurvive": additional["zeroMaterialSourceUnverifiableSurviving"]["pass"],
    "13_noValuesOrLineageLost": additional["zeroLostQuantitativeValues"]["pass"] and additional["zeroDanglingLineage"]["pass"],
}
trust_safe = all(criteria[k] for k in criteria if k not in ("7_criticalMaterialEnsembleStabilityGte085", "8_ensembleSemanticStabilityGte080"))
if all(criteria.values()): verdict = "F5_CLOSED"
elif trust_safe: verdict = "F5_NEEDS_ARCHITECTURAL_ITERATION"
else: verdict = "F5_NOT_CLOSED"

cost = {"paidCalls": len(ledger["calls"]), "paidSpendUsdRateCard": round(ledger["spent"], 4), "gatewayReportedSpendUsd": ledger.get("gatewayReportedSpendUsd"), "creditsBefore": ledger.get("creditsBefore"), "creditsAfter": ledger.get("creditsAfter"), "cap": ledger["cap"], "refusals": len(ledger["refusals"]), "byPass": {p: round(sum(k["costUsd"] for k in ledger["calls"] if k["stage"].startswith(p + ":")), 4) for p in ids}, "estimateBefore": precheck["estimate"]}
support_diag = score["support"]
summary = {
    "artifact": "F-5.3B final summary - dual-pass ensemble production activation + authoritative output certification",
    "verdict": verdict,
    "at": datetime.datetime.utcnow().isoformat() + "Z",
    "gitShaAtAnalysis": subprocess.check_output(["git", "rev-parse", "HEAD"]).decode().strip(),
    "startingSha": baseline["startingSha"],
    "e1": {"frozenContentHash": E1["frozenContentHash"], "reproducedAtStartingSha": baseline["e1"]["reproduced"], "reproducedUnderFinalCode": e1final["e1"]["reproduced"], "burden": burden(E1, c1), "referenceRecall": {k: r1[k] for k in keys}},
    "e2": e2record,
    "ensembleToEnsemble": {k: score[k] for k in ("e1Items", "e2Items", "canonicalItemCountDelta", "strictCanonicalIdentityStability", "semanticStability", "semanticCounts", "criticalMaterialSemanticStability", "criticalMaterialCounts", "sourceSpanCoverageStability", "quantitativeComponentStability", "conditionExceptionStability", "dependencyXrefStability", "semanticFunctionStabilityByDimension_jaccardMean", "allFunctionsExactAgreementOnAligned", "alignedPairs")},
    "decomposition": score["ensembleOnlyDecomposition"],
    "supportDiagnostics": support_diag,
    "reviewBurden": {"E1": burden(E1, c1), "E2": burden(E2, c2), "matchedMaterialWhoseSupportChanged": support_diag["matchedMaterialWhoseSupportChanged"], "corroboratedInE1_singletonInE2": support_diag["corroboratedInE1_singletonInE2"], "singletonInE1_corroboratedInE2": support_diag["singletonInE1_corroboratedInE2"], "note": "reported, not thresholded; singletons are never suppressed"},
    "historicalResidualRecoveryByE2": {k: {kk: vv for kk, vv in resid[k].items() if kk != "notRecovered"} for k in ("F", "B", "H")},
    "referenceRecall": recall_cmp,
    "originalF5Gates": original_gates, "originalF5GatesPass": original_pass,
    "additionalTrustGates": additional, "additionalTrustGatesPass": additional_pass,
    "successCriteria": criteria,
    "cost": cost,
    "hashes": {"e2": sha(f"{DIR}/e2.json"), "runC": sha(f"{DIR}/run-C.json"), "runD": sha(f"{DIR}/run-D.json"), "ledger": sha(f"{DIR}/ledger.json"), "scorer": sha("scripts/f5-3b-ensemble-certification-score.py"), "scorerPreregistered": prereg["scorerSha256"], "scorerUnchangedSincePreregistration": sha("scripts/f5-3b-ensemble-certification-score.py") == prereg["scorerSha256"], "humanReference": sha("docs/phase-3-validation/04-human-reference-set.json"), "humanReferencePreregistered": prereg["humanReferenceSha256"]},
}
json.dump(summary, open(f"{D}/11-final-summary.json", "w"), indent=1)
print(json.dumps({k: summary[k] for k in ("verdict", "e2", "ensembleToEnsemble", "decomposition", "reviewBurden", "historicalResidualRecoveryByE2", "referenceRecall", "originalF5GatesPass", "additionalTrustGatesPass", "successCriteria", "cost")}, indent=1))
