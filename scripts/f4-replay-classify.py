#!/usr/bin/env python3
"""F-4 finding replay classification (mission sections 14-16). Zero model calls.

Reads docs/phase-3-remediation-f4/replay-before.json (post-F3 path: local window only) and replay-after.json (F-4:
authenticated retrieved evidence admitted) - both produced from the SAME code and the SAME frozen Chewy 6.08 artifacts
by scripts/f4-verifier-replay.ts - and classifies:
  section 14: the two F-4 candidate findings -> F4_AUTHENTIC_EVIDENCE_FIXED / TRUE_DISCREPANCY / DIFFERENT_ROOT_CAUSE / CANNOT_REPLAY
  section 15: every post-F3 deterministic finding before/after -> UNCHANGED / REMOVED_BY_F4 / NEW_AFTER_F4
  section 16: every recorded SEMANTIC_ONLY finding -> CANNOT_REPLAY_WITHOUT_MODEL (with the one whose subject F-4 evidence bears on annotated)
Usage: python3 scripts/f4-replay-classify.py <docsDir>
"""
import json, sys, subprocess
d = sys.argv[1] if len(sys.argv) > 1 else "docs/phase-3-remediation-f4"
before = json.load(open(f"{d}/replay-before.json"))
after = json.load(open(f"{d}/replay-after.json"))
diag = json.load(open(f"{d}/00-diagnosis-and-reproduction.json"))

# Finding ids are shared across same-type/same-citation findings (identity.ts excludes the value), so every finding is
# keyed by its full content plus an occurrence counter - the same discipline scripts/f3-replay-classify.py used.
def keyed(findings):
    out, seen = {}, {}
    for f in findings:
        base = f"{f['findingId']}|{f['findingType']}|{f.get('irPath')}|{f.get('sourceEvidence')}|{f.get('reasoning', '')[:160]}"
        n = seen.get(base, 0); seen[base] = n + 1
        out[f"{base}#{n}"] = f
    return out
bf = keyed(before["findings"])
af = keyed(after["findings"])
recorded_ids = {f["findingId"] for f in before["recordedDeterministicFindings"]}

# ---- section 14: the two F-4 candidates (from the diagnosis, never hand-typed here)
candidates = []
for c in diag["f4Findings"]:
    fid = next((k for k, f in bf.items() if f["findingId"] == c["findingId"] and f["irPath"] == c["irPath"]), c["findingId"])
    ev = [e for e in after["evidenceSet"]["authenticated"] if e["requestKind"] == "DEFINITION" and e["requestKey"] == c["sourceTerm"]]
    supported = [r for r in after["retrievedReconciliation"] if r["classification"] == "ACCOUNTED_FOR" and c["irPath"] in r["irPaths"]]
    if fid in bf and fid not in af and ev and supported and ev[0]["contentHash"] == c["definitionTextSha256"] and all(x["passed"] for x in ev[0]["checks"]):
        cls = "F4_AUTHENTIC_EVIDENCE_FIXED"
        why = (f"before: {bf[fid]['findingType']} {bf[fid]['severity']} at {c['irPath']} (value {c['irValue']}); after: the value is ACCOUNTED_FOR by the "
               f"authenticated definition of \"{c['sourceTerm']}\" (document {ev[0]['documentId']}, node {ev[0]['sourceNodeId']}, span [{ev[0]['charStart']}, {ev[0]['charEnd']}), "
               f"sha256 {ev[0]['contentHash']}) - the same span/hash the diagnosis located independently; all 7 authentication checks passed; the supporting source text is "
               f"{supported[0]['rawText']!r}")
    elif fid in bf and fid in af:
        cls = "TRUE_DISCREPANCY" if not ev else "DIFFERENT_ROOT_CAUSE"
        why = "finding persists after authenticated evidence was admitted"
    elif fid not in bf:
        cls = "CANNOT_REPLAY"
        why = "finding not reproduced by the before-path replay"
    else:
        cls = "DIFFERENT_ROOT_CAUSE"
        why = "finding removed but not by an authenticated-evidence match"
    candidates.append({"findingId": c["findingId"], "replayKey": fid, "irPath": c["irPath"], "irKind": c["irKind"], "irValue": c["irValue"], "sourceTerm": c["sourceTerm"], "beforeSeverity": bf.get(fid, {}).get("severity"), "beforeType": bf.get(fid, {}).get("findingType"), "classification": cls, "evidence": why, "supportingSourceText": supported[0]["rawText"] if supported else None, "evidenceId": ev[0]["evidenceId"] if ev else None})

# ---- section 15: every post-F3 deterministic finding
rows = []
for fid, f in bf.items():
    if fid in af:
        g = af[fid]
        rows.append({"findingId": f["findingId"], "replayKey": fid, "findingType": f["findingType"], "severity": f["severity"], "irPath": f["irPath"], "sourceEvidence": f["sourceEvidence"], "status": "UNCHANGED", "afterSeverity": g["severity"], "afterType": g["findingType"], "recordedInFrozenRun": f["findingId"] in recorded_ids, "note": "identical finding id, type and severity before and after F-4 - not a retrieved-source case" if g["severity"] == f["severity"] and g["findingType"] == f["findingType"] else "same id, severity/type changed"})
    else:
        rows.append({"findingId": f["findingId"], "replayKey": fid, "findingType": f["findingType"], "severity": f["severity"], "irPath": f["irPath"], "sourceEvidence": f["sourceEvidence"], "status": "REMOVED_BY_F4", "recordedInFrozenRun": f["findingId"] in recorded_ids, "note": next((c["classification"] for c in candidates if c["replayKey"] == fid), "removed")})
for fid, g in af.items():
    if fid not in bf:
        rows.append({"findingId": g["findingId"], "replayKey": fid, "findingType": g["findingType"], "severity": g["severity"], "irPath": g["irPath"], "sourceEvidence": g["sourceEvidence"], "status": "NEW_AFTER_F4", "recordedInFrozenRun": False, "note": g["reasoning"][:300]})

# ---- section 16: semantic-only findings
sem = []
for f in before["recordedSemanticOnlyFindings"]:
    bears = (f["ruleOrDefinitionId"] == diag["f4Findings"][0]["irPath"].split(".")[0] or "Threshold Amount" in (f.get("reasoning") or "")) and f["irPath"].startswith(diag["f4Findings"][0]["irPath"].split(".")[0])
    sem.append({"findingId": f["findingId"], "method": f["method"], "findingType": f["findingType"], "severity": f["severity"], "ruleOrDefinitionId": f["ruleOrDefinitionId"], "irPath": f["irPath"], "classification": "CANNOT_REPLAY_WITHOUT_MODEL", "note": ("the recorded reviewer's reasoning rests on the same absence F-4 closes (it was never shown the retrieved definition); whether the reviewer withdraws it can only be established by a model call, which this mission does not make - retained, not re-judged" if bears else "a Layer 2 judgment on a subject F-4's evidence does not bear on - retained as recorded")})

summary = {
    "artifact": "F-4 finding replay classification (sections 14-16) - 0 model calls",
    "gitSha": subprocess.check_output(["git", "rev-parse", "HEAD"]).decode().strip(),
    "inputs": {"replayBefore": before["inputs"], "replayAfterEvidenceSetHash": after["evidenceSet"]["evidenceSetHash"], "diagnosisGitSha": diag["gitSha"]},
    "section14_f4Candidates": candidates,
    "section15_deterministicReplay": {
        "beforeCount": len(bf), "afterCount": len(af),
        "beforeMaterial": sum(1 for f in bf.values() if f["severity"] == "MATERIAL"), "afterMaterial": sum(1 for f in af.values() if f["severity"] == "MATERIAL"),
        "counts": {k: sum(1 for r in rows if r["status"] == k) for k in ["UNCHANGED", "REMOVED_BY_F4", "NEW_AFTER_F4"]},
        "beforeFindingIdsEqualRecordedPostF3Ids": sorted({f["findingId"] for f in bf.values()}) == sorted(recorded_ids),
        "recordedFrozenRunDeterministicCount": len(before["recordedDeterministicFindings"]),
        "rows": rows,
    },
    "section16_semanticOnly": sem,
    "reconciliationCounts": {"before": before["reconciliationCounts"], "after": after["reconciliationCounts"]},
    "authenticatedEvidenceAdmitted": [{"requestKind": e["requestKind"], "requestKey": e["requestKey"], "role": e["role"], "documentId": e["documentId"], "sourceNodeId": e["sourceNodeId"], "span": [e["charStart"], e["charEnd"]], "contentHash": e["contentHash"], "numericItems": e["numericItems"], "usedToSupport": [r["irPaths"] for r in after["retrievedReconciliation"] if r["evidence"]["evidenceId"] == e["evidenceId"] and r["classification"] == "ACCOUNTED_FOR"], "compilerRecordPresent": e["compilerRecord"]["present"], "linkage": [l["origin"] for l in e["linkage"]]} for e in after["evidenceSet"]["authenticated"]],
    "rejectedRequests": after["evidenceSet"]["rejected"],
}
json.dump(summary, open(f"{d}/02-finding-replay-classification.json", "w"), indent=1)
print(json.dumps({"s14": [(c["findingId"][:8], c["classification"]) for c in candidates], "s15": summary["section15_deterministicReplay"]["counts"], "material": [summary["section15_deterministicReplay"]["beforeMaterial"], summary["section15_deterministicReplay"]["afterMaterial"]], "s16": [(s["findingId"][:8], s["classification"]) for s in sem]}, indent=1))
