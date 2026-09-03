#!/usr/bin/env python3
"""
PHASE 3 SINGLE REAL-WORLD UNSEEN VALIDATION - zero-cost scorer for the Chewy paid run.
Reads the preserved paid-run outputs and the FROZEN 46-item human reference set
(docs/phase-3-validation/04-human-reference-set.json, never edited) and writes:
  11-paid-run-summary, 12-pass-a-stability, 13-reference-set-scoring, 14-metrics,
  15-trust-safety, 16-root-causes-paid, 17-gates-and-verdict-paid   (all under docs/phase-3-validation/)
Gate thresholds are PRE-REGISTERED in GATE_RULES below (written before the run finished).
Deterministic: no model calls, no randomness.
"""
import json, os, glob, re, sys, datetime
REF = "docs/phase-3-validation/04-human-reference-set.json"
RUN = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run"
DET = "tests/fixtures/unseen-packages/phase-3-validation-chwy-run"
OUT = "docs/phase-3-validation/"
MATERIAL = ("CRITICAL", "MATERIAL")
CAPTURED = ("REPRESENTED", "INTENTIONALLY_NON_COMPUTATIONAL", "UNSUPPORTED", "AMBIGUOUS")
TRUSTED_VERIFY = ("VERIFIED_NO_MATERIAL_GAP_FOUND", "VERIFIED_WITH_NON_MATERIAL_FINDINGS")
GATE_RULES = {
  "preRegisteredAt": "2026-09-03T16:35:00Z (before any paid-run output was read)",
  "TRUST_SAFETY_PASS": "dangerousSilentFailures == 0 (over every deficient reference item)",
  "PHASE_3_GENERALIZATION_PASS": "TRUST_SAFETY_PASS AND all 12 selected units attempted AND attempted-unit material discovery recall >= 0.85 AND attempted-unit full substantive-credit rate >= 0.60 AND Pass A critical/material semantic stability >= 0.80",
  "PHASE_3_GENERALIZATION_FAIL": "TRUST_SAFETY_FAIL OR attempted-unit material discovery recall < 0.50",
  "PHASE_3_GENERALIZATION_NEEDS_ITERATION": "otherwise (including any run where fewer than the 12 selected units were attempted)",
  "READY_FOR_PHASE_4": "TRUST_SAFETY_PASS AND PHASE_3_GENERALIZATION_PASS",
}
def W(name, obj):
    json.dump(obj, open(OUT + name + ".json", "w"), indent=2); print("wrote", OUT + name + ".json")
def load(p):
    return json.load(open(p))
def ov(a, b, c, d):
    return max(0, min(b, d) - max(a, c))

ref = load(REF); items = ref["items"]
summary = load(f"{RUN}/run-summary.json"); ledger = load(f"{RUN}/cost-ledger.json")
disc = load(f"{RUN}/stage2b-discovery.json") if os.path.exists(f"{RUN}/stage2b-discovery.json") else {}
cov = load(f"{RUN}/stage3e-coverage.json") if os.path.exists(f"{RUN}/stage3e-coverage.json") else {}
units = {}
for f in sorted(glob.glob(f"{RUN}/unit-*.json")):
    u = load(f); units[u["unit"]["sectionRef"]] = u

# ---------------- absolute spans for inventory items ----------------
def region_map(compile_):
    sc = compile_ and compile_.get("sourceContext")
    return {r["regionId"]: r for r in (sc["regions"] if sc else [])}
def abs_span(item, regions):
    r = regions.get(item["sourceSpan"]["regionId"])
    if not r or r["charStart"] is None or r["charStart"] < 0: return None
    return (r["charStart"] + item["sourceSpan"]["charStart"], r["charStart"] + item["sourceSpan"]["charEnd"], r["regionId"])
unit_views = {}
for ref_, u in units.items():
    c = u.get("compile") or {}
    regions = region_map(c)
    inv1 = (c.get("frozenInventory") or {}).get("items", [])
    inv2 = (u.get("inventoryRun2") or {}).get("items", [])
    disp = {a["inventoryItemId"]: a for a in ((c.get("accountability") or {}).get("items", []))}
    unit_views[ref_] = {"u": u, "compile": c, "regions": regions, "inv1": [(it, abs_span(it, regions)) for it in inv1], "inv2": [(it, abs_span(it, regions)) for it in inv2], "disp": disp,
                        "operative": regions.get("operative") or (list(regions.values())[0] if regions else None)}

# ---------------- Pass A stability ----------------
def sem_match(a, b):
    ia, sa = a; ib, sb = b
    if ia["semanticRole"] != ib["semanticRole"] or not sa or not sb: return False
    o = ov(sa[0], sa[1], sb[0], sb[1]); shorter = min(sa[1]-sa[0], sb[1]-sb[0]) or 1
    return o / shorter >= 0.5
stab_units = []; agg = {"strict": [0, 0], "semantic": [0, 0], "material": [0, 0]}
disagreements = []
for ref_, v in unit_views.items():
    if not v["inv1"] or v["u"].get("inventoryRun2") is None: stab_units.append({"unit": ref_, "status": "NOT_EVALUABLE", "run1": len(v["inv1"]), "run2": None}); continue
    ids1 = {it["inventoryItemId"] for it, _ in v["inv1"]}; ids2 = {it["inventoryItemId"] for it, _ in v["inv2"]}
    strict_i, strict_u = len(ids1 & ids2), len(ids1 | ids2)
    used = set(); matched = 0; mat_matched = 0; mat_only1 = []; mat_only2 = []
    for a in v["inv1"]:
        hit = None
        for j, b in enumerate(v["inv2"]):
            if j in used: continue
            if a[0]["inventoryItemId"] == b[0]["inventoryItemId"] or sem_match(a, b): hit = j; break
        if hit is not None:
            used.add(hit); matched += 1
            if a[0]["materiality"] in MATERIAL or v["inv2"][hit][0]["materiality"] in MATERIAL: mat_matched += 1
        elif a[0]["materiality"] in MATERIAL: mat_only1.append(a[0])
    for j, b in enumerate(v["inv2"]):
        if j not in used and b[0]["materiality"] in MATERIAL: mat_only2.append(b[0])
    union = len(v["inv1"]) + len(v["inv2"]) - matched
    mat1 = sum(1 for it, _ in v["inv1"] if it["materiality"] in MATERIAL); mat2 = sum(1 for it, _ in v["inv2"] if it["materiality"] in MATERIAL)
    mat_union = mat1 + mat2 - mat_matched
    agg["strict"][0] += strict_i; agg["strict"][1] += strict_u; agg["semantic"][0] += matched; agg["semantic"][1] += union; agg["material"][0] += mat_matched; agg["material"][1] += mat_union
    stab_units.append({"unit": ref_, "run1": len(v["inv1"]), "run2": len(v["inv2"]), "run1Hash": (v["compile"].get("frozenInventory") or {}).get("frozenContentHash"), "run2Hash": v["u"]["inventoryRun2"].get("frozenContentHash"), "hashIdentical": (v["compile"].get("frozenInventory") or {}).get("frozenContentHash") == v["u"]["inventoryRun2"].get("frozenContentHash"),
                       "strictStability": round(strict_i / strict_u, 4) if strict_u else None, "semanticStability": round(matched / union, 4) if union else None, "materialStability": round(mat_matched / mat_union, 4) if mat_union else None,
                       "materialOnlyRun1": len(mat_only1), "materialOnlyRun2": len(mat_only2)})
    for it in mat_only1: disagreements.append({"unit": ref_, "onlyIn": "run1", "materiality": it["materiality"], "role": it["semanticRole"], "excerpt": it["sourceSpan"]["excerpt"][:140]})
    for it in mat_only2: disagreements.append({"unit": ref_, "onlyIn": "run2", "materiality": it["materiality"], "role": it["semanticRole"], "excerpt": it["sourceSpan"]["excerpt"][:140]})
stability = {"strict": round(agg["strict"][0] / agg["strict"][1], 4) if agg["strict"][1] else None, "semantic": round(agg["semantic"][0] / agg["semantic"][1], 4) if agg["semantic"][1] else None, "criticalMaterial": round(agg["material"][0] / agg["material"][1], 4) if agg["material"][1] else None, "counts": agg}
W("12-pass-a-stability", {"artifact": "12-pass-a-stability", "method": "Run 1 = Pass A inside the frozen compileCovenantToIR; run 2 = standalone runSemanticInventory on the IDENTICAL resolved source context object, same prompt/model/config. Strict = identical content-derived inventoryItemId (Jaccard). Semantic = same semanticRole and >= 50% span overlap of the shorter span, greedy 1:1 (Jaccard over matched pairs). Critical/material = semantic matching restricted to items CRITICAL/MATERIAL in either run. Runs were never merged.", "totals": stability, "units": stab_units, "materialDisagreements": disagreements})

# ---------------- 3E coverage lookups ----------------
cov_units = []
try:
    for d in cov.get("packageCoverage", {}).get("documents", []):
        states = {e["semanticUnitId"]: e for e in d.get("coverageEntries", [])}
        for un in d.get("units", []):
            e = states.get(un["semanticUnitId"], {})
            cov_units.append({"anchors": un.get("anchors", []), "state": e.get("coverageState"), "materiality": un.get("materiality"), "family": un.get("family")})
except Exception as ex:
    print("coverage lookup unavailable:", ex)
def cov_status_for(a, b):
    hits = []
    for e in cov_units:
        for an in e["anchors"]:
            if ov(a, b, an["charStart"], an["charEnd"]) > 0: hits.append(e["state"]); break
    return hits

# ---------------- reference-set scoring ----------------
rows = []
for it in items:
    a, b = it["span"]; mat = it["materiality"]
    covering = []
    for ref_, v in unit_views.items():
        for rid, r in v["regions"].items():
            if r["charStart"] is not None and ov(a, b, r["charStart"], r["charEnd"]) > 0: covering.append((ref_, rid)); break
    attempted = [ref_ for ref_, _ in covering]
    inv_hits = []; run2_hits = 0
    for ref_, v in unit_views.items():
        for item, sp in v["inv1"]:
            if sp and ov(a, b, sp[0], sp[1]) >= min(40, sp[1]-sp[0]): inv_hits.append((ref_, item))
        for item, sp in v["inv2"]:
            if sp and ov(a, b, sp[0], sp[1]) >= min(40, sp[1]-sp[0]): run2_hits += 1
    disc_items = [{"unit": ref_, "id": item["inventoryItemId"], "role": item["semanticRole"], "materiality": item["materiality"], "disposition": (unit_views[ref_]["disp"].get(item["inventoryItemId"]) or {}).get("disposition"), "valuesMissing": sum(1 for q in (unit_views[ref_]["disp"].get(item["inventoryItemId"]) or {}).get("quantitative", []) if q["disposition"] == "VALUE_MISSING_FROM_COMPOSITION"), "excerpt": item["sourceSpan"]["excerpt"][:120]} for ref_, item in inv_hits]
    mat_items = [d for d in disc_items if d["materiality"] in MATERIAL] or disc_items
    dispositions = [d["disposition"] for d in mat_items]
    if not covering: rep = "NOT_ATTEMPTED"
    elif not disc_items: rep = "MISSING"
    elif dispositions and all(d == "REPRESENTED" for d in dispositions) and all(d["valuesMissing"] == 0 for d in mat_items): rep = "FULL"
    elif any(d == "REPRESENTED" for d in dispositions): rep = "PARTIAL"
    elif any(d == "UNSUPPORTED" or d == "INTENTIONALLY_NON_COMPUTATIONAL" for d in dispositions): rep = "UNSUPPORTED"
    elif any(d == "AMBIGUOUS" for d in dispositions): rep = "AMBIGUOUS"
    else: rep = "MISSING"
    unit_states = []
    for ref_ in dict.fromkeys(attempted):
        v = unit_views[ref_]; c = v["compile"]; u = v["u"]
        unit_states.append({"unit": ref_, "sourceContext": (c.get("sourceContext") or {}).get("state"), "inventoryStatus": (c.get("frozenInventory") or {}).get("inventoryStatus"), "compileStatus": c.get("status"), "failureReasons": c.get("failureReasons"), "semanticallyComplete": (c.get("accountability") or {}).get("semanticallyComplete"), "verifyStatus": (u.get("verify") or {}).get("status"), "materialFindings": sum(1 for f in (u.get("verify") or {}).get("findings", []) if f.get("severity") == "MATERIAL")})
    trusted = any(s["compileStatus"] == "COMPLETED" and s["semanticallyComplete"] is True and s["verifyStatus"] in TRUSTED_VERIFY for s in unit_states)
    deficient = rep != "FULL"
    if not deficient: stage = None
    elif rep == "NOT_ATTEMPTED": stage = "OTHER"
    elif not disc_items:
        # was the span inside the compiled operative unit at all?
        inside = any(ov(a, b, v["operative"]["charStart"], v["operative"]["charEnd"]) > 0 for ref_ in dict.fromkeys(attempted) for v in [unit_views[ref_]] if v["operative"])
        stage = "SOURCE_INVENTORY" if inside else "STRUCTURAL_CONTEXT"
    elif rep in ("PARTIAL", "MISSING"): stage = "IR_COMPOSITION"
    else: stage = "IR_COMPOSITION"
    cov_hits = cov_status_for(a, b)
    sec_token = re.split(r"[ /]", it["section"])[0]
    vf = []
    for ref_ in dict.fromkeys(attempted):
        for f in (unit_views[ref_]["u"].get("verify") or {}).get("findings", []):
            cite = (f.get("sourceCitation") or "") + " " + (f.get("irPath") or "")
            if sec_token and sec_token in cite: vf.append({"unit": ref_, "severity": f.get("severity"), "type": f.get("findingType"), "irPath": (f.get("irPath") or "")[:90], "citation": f.get("sourceCitation")})
    trust = None
    if deficient:
        trust = "DANGEROUS_SILENT_FAILURE" if (trusted and rep in ("PARTIAL", "MISSING") and cov_hits and all(h == "FULLY_REPRESENTED_VERIFIED" for h in cov_hits)) else "SAFE_FAILURE"
    blockers = []
    for s in unit_states:
        if s["sourceContext"] in ("TRUNCATED_SOURCE", "STRUCTURALLY_INCOMPLETE_SOURCE", "UNKNOWN_SOURCE_COMPLETENESS"): blockers.append(s["sourceContext"])
        if s["inventoryStatus"] and s["inventoryStatus"] != "INVENTORY_OK": blockers.append(s["inventoryStatus"])
        if s["compileStatus"] and s["compileStatus"] != "COMPLETED": blockers.append("COMPILE_" + s["compileStatus"])
        if s["semanticallyComplete"] is False: blockers.append("ACCOUNTABILITY_INCOMPLETE")
        if s["verifyStatus"] and s["verifyStatus"] not in TRUSTED_VERIFY: blockers.append("VERIFIER_" + s["verifyStatus"])
    if rep == "NOT_ATTEMPTED": blockers.append("UNIT_NOT_COMPILED")
    if rep in ("UNSUPPORTED", "AMBIGUOUS"): blockers.append(rep)
    rows.append({"id": it["id"], "category": it["category"][0], "materiality": mat, "section": it["section"], "span": it["span"], "coveringUnits": attempted, "discoveredByPassA": bool(disc_items), "passARun2Hits": run2_hits, "inventoryItems": disc_items[:12], "inventoryItemCount": len(disc_items), "composedIntoIR": any(d == "REPRESENTED" for d in dispositions), "representationMechanical": rep, "unitStates": unit_states, "coverageAuditStatuses": cov_hits[:6], "verifierFindingsTouching": vf[:6], "trustedAsComplete": trusted, "earliestFailureStage": stage, "trustSafety": trust, "trustBlockers": sorted(set(blockers)), "substantiveCredit": "PENDING_HUMAN_ADJUDICATION" if rep == "FULL" else "NONE"})
W("13-reference-set-scoring", {"artifact": "13-reference-set-scoring", "referenceSet": REF, "referenceItems": len(rows), "method": "Mechanical mapping of each frozen reference span onto the paid-run evidence: covering units (any resolved source-context region overlapping the span), Pass A run-1 inventory items overlapping the span (>= 40 chars or the whole item), Pass C dispositions of those items, unit-level compile/accountability/verifier states, and 3E coverage statuses. representationMechanical: FULL = every material overlapping item REPRESENTED with no missing quantitative value; PARTIAL = some REPRESENTED; UNSUPPORTED/AMBIGUOUS = explicit non-complete disposition; MISSING = not inventoried or all MISSING_FROM_COMPOSITION; NOT_ATTEMPTED = no compiled unit reached the span. Human substantive adjudication of FULL items is recorded separately in 13b.", "rows": rows})

# ---------------- metrics ----------------
def rate(n, d): return round(n / d, 4) if d else None
cat = lambda c: [r for r in rows if r["category"] == c]
attempted_rows = [r for r in rows if r["representationMechanical"] != "NOT_ATTEMPTED"]
mat_rows = [r for r in rows if r["materiality"] in MATERIAL]
metrics = {
  "referenceItems": len(rows), "criticalMaterialItems": len(mat_rows), "attemptedItems": len(attempted_rows), "notAttempted": len(rows) - len(attempted_rows),
  "all46": {"materialDiscoveryRecall": rate(sum(r["discoveredByPassA"] for r in mat_rows), len(mat_rows)), "overallDiscoveryRecall": rate(sum(r["discoveredByPassA"] for r in rows), len(rows)), "quantitativeComponentRecall": rate(sum(r["discoveredByPassA"] for r in cat("D")), len(cat("D"))), "exceptionConditionRecall": rate(sum(r["discoveredByPassA"] for r in cat("C")), len(cat("C"))), "dependencyCrossReferenceRecall": rate(sum(r["discoveredByPassA"] for r in cat("E")), len(cat("E"))), "fullMechanicalRate": rate(sum(r["representationMechanical"] == "FULL" for r in rows), len(rows))},
  "attemptedUnitsOnly": {"materialDiscoveryRecall": rate(sum(r["discoveredByPassA"] for r in attempted_rows if r["materiality"] in MATERIAL), sum(1 for r in attempted_rows if r["materiality"] in MATERIAL)), "overallDiscoveryRecall": rate(sum(r["discoveredByPassA"] for r in attempted_rows), len(attempted_rows)), "quantitativeComponentRecall": rate(sum(r["discoveredByPassA"] for r in attempted_rows if r["category"] == "D"), sum(1 for r in attempted_rows if r["category"] == "D")), "exceptionConditionRecall": rate(sum(r["discoveredByPassA"] for r in attempted_rows if r["category"] == "C"), sum(1 for r in attempted_rows if r["category"] == "C")), "dependencyCrossReferenceRecall": rate(sum(r["discoveredByPassA"] for r in attempted_rows if r["category"] == "E"), sum(1 for r in attempted_rows if r["category"] == "E")), "fullMechanicalRate": rate(sum(r["representationMechanical"] == "FULL" for r in attempted_rows), len(attempted_rows))},
  "representationCounts": {k: sum(r["representationMechanical"] == k for r in rows) for k in ("FULL", "PARTIAL", "UNSUPPORTED", "AMBIGUOUS", "MISSING", "NOT_ATTEMPTED")},
  "byCategory": {c: {"items": len(cat(c)), "discovered": sum(r["discoveredByPassA"] for r in cat(c)), "full": sum(r["representationMechanical"] == "FULL" for r in cat(c)), "notAttempted": sum(r["representationMechanical"] == "NOT_ATTEMPTED" for r in cat(c))} for c in "ABCDEF"},
  "note": "fullSubstantiveCreditRate is finalized in 17 after human adjudication of the mechanical FULL rows (13b); mechanical FULL is an upper bound.",
}
W("14-metrics-paid", {"artifact": "14-metrics-paid", **metrics})
deficient = [r for r in rows if r["representationMechanical"] != "FULL"]
W("15-trust-safety", {"artifact": "15-trust-safety", "rule": "DANGEROUS_SILENT_FAILURE only when material semantics are missing/wrong AND the covering unit is trusted as semantically complete (compile COMPLETED + accountability semanticallyComplete + verifier VERIFIED_*) AND the 3E coverage entry for the span is FULLY_REPRESENTED_VERIFIED; every other deficiency is SAFE_FAILURE with its blocking state listed.", "deficientItems": len(deficient), "dangerousSilentFailures": sum(r["trustSafety"] == "DANGEROUS_SILENT_FAILURE" for r in deficient), "safeFailures": sum(r["trustSafety"] == "SAFE_FAILURE" for r in deficient), "unitsTrustedAsComplete": [ref_ for ref_, v in unit_views.items() if v["compile"].get("status") == "COMPLETED" and (v["compile"].get("accountability") or {}).get("semanticallyComplete") is True and (v["u"].get("verify") or {}).get("status") in TRUSTED_VERIFY], "rows": [{"id": r["id"], "materiality": r["materiality"], "representation": r["representationMechanical"], "trustSafety": r["trustSafety"], "blockers": r["trustBlockers"]} for r in deficient]})
from collections import Counter
W("16-root-causes-paid", {"artifact": "16-root-causes-paid", "byStage": dict(Counter(r["earliestFailureStage"] for r in deficient)), "byStageAndRepresentation": dict(Counter(f'{r["earliestFailureStage"]}|{r["representationMechanical"]}' for r in deficient)), "items": [{"id": r["id"], "stage": r["earliestFailureStage"], "representation": r["representationMechanical"], "units": r["coveringUnits"], "blockers": r["trustBlockers"]} for r in deficient], "note": "Underlying-cause grouping and OBS-1/2/3 impact are written by hand in 17 after reading the evidence."})
print(json.dumps({"stability": stability, "metrics": {k: metrics[k] for k in ("all46", "attemptedUnitsOnly", "representationCounts")}, "dangerous": sum(r["trustSafety"] == "DANGEROUS_SILENT_FAILURE" for r in deficient), "safe": sum(r["trustSafety"] == "SAFE_FAILURE" for r in deficient)}, indent=1))
