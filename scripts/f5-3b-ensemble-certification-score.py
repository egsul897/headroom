#!/usr/bin/env python3
"""
F-5.3B PRE-REGISTERED ENSEMBLE CERTIFICATION SCORER - compares two AUTHORITATIVE CANONICAL ENSEMBLE inventories of the
SAME source (E1 = Ensemble(old A, old B), E2 = Ensemble(new C, new D)). Zero model calls. Frozen (hashed) BEFORE the
new paid pair is run; never edited afterwards.

  python3 scripts/f5-3b-ensemble-certification-score.py <e1.json> <e2.json> <unit-6.08.json> <out.json>

SEMANTIC IDENTITY (the F-5.1 canonical definition, label-blind, SUPPORT-BLIND): two canonical items match when they
share an inventoryItemId, or when >= 50% of the shorter span overlaps AND their deontic effects do not contradict.
Pass labels and support status are NEVER matching criteria: a proposition corroborated in one ensemble and single-run
in the other is the SAME proposition (support variance is reported separately as a diagnostic).

STABILITY METRICS (the original F-5 mechanics, applied to ensembles): strict (id) stability, semantic stability,
CRITICAL/MATERIAL semantic stability, source-span coverage stability (material char-mask Jaccard), quantitative-component
stability (material value-set Jaccard), condition/exception stability, dependency/xref stability, semantic-function
stability by dimension over aligned pairs, canonical item-count delta.

ENSEMBLE-ONLY DECOMPOSITION of unmatched items (mission section 13), decided in this order per item:
  A IDENTITY_VARIANCE          an overlapping (>= 50% of shorter), effect-compatible counterpart exists but was already
                               consumed by another match (one proposition described twice at overlapping spans)
  C SEMANTIC_FUNCTION_VARIANCE an overlapping (>= 50%) counterpart exists with a CONTRADICTORY deontic effect
  F DEPENDENCY_FRAGMENTATION   a dependency/reference item whose overlapping counterpart carries the same reference
  B GRANULARITY_VARIANCE       the item sits inside (>= 90% of its chars) a broader counterpart, or contains one
  D TRUE_ENSEMBLE_OMISSION     an E1 proposition with no material E2 item covering >= 50% of its chars (E2 omitted it)
  E TRUE_ENSEMBLE_ADDITION     an E2 proposition with no material E1 item covering >= 50% of its chars (E2 added it)
  G OTHER                      anything else (non-material leftovers etc.)

DANGEROUS SILENT OMISSION (original F-5 gate, ensemble form): a CRITICAL/MATERIAL D/E case where the LACKING ensemble
(i) has no material item touching the span at all, (ii) does not disclose the span as UNACCOUNTED_SOURCE, and
(iii) presents itself as trustworthy-complete (inventoryStatus INVENTORY_OK and supportReviewRequired false). Undisclosed
cases that fail only (iii) are reported separately as "undisclosed but review-marked" - visible, never dangerous.

ORIGINAL F-5 GATES (unchanged, never rounded): CRITICAL/MATERIAL semantic stability >= 0.85 AND semantic stability
>= 0.80 AND dangerous silent omissions == 0 (frozen reference recall is scored by scripts/f5-reference-recall.py).
"""
import json, re, sys
from collections import Counter

MATERIAL = ("CRITICAL", "MATERIAL")
EFFECT = {"PERMISSION", "PROHIBITION", "REQUIREMENT"}
LOGIC = ("CONDITION", "EXCEPTION", "TRIGGER", "ALTERNATIVE", "CURE", "RECLASSIFICATION"); QUANT = ("VALUE", "FORMULA_COMPONENT", "THRESHOLD", "TIME_PERIOD"); DEP = ("REFERENCE", "DEPENDENCY", "SHARED_CAP")
GATES = {"criticalMaterialSemanticStability": 0.85, "semanticStability": 0.80, "dangerousSilentOmissions": 0}

e1_path, e2_path, unit_path, out_path = sys.argv[1:5]
E1, E2 = json.load(open(e1_path)), json.load(open(e2_path))
unit = json.load(open(unit_path)); text = unit["compile"]["sourceContext"]["regions"][0]["text"]

def role_fns(role):
    f = {"effect": "NONE", "logic": [], "quantitative": [], "dependency": []}
    if role in EFFECT: f["effect"] = role
    elif role in LOGIC: f["logic"] = [role]
    elif role in QUANT: f["quantitative"] = [role]
    elif role in DEP: f["dependency"] = [role]
    return f
def fns(i): return i.get("semanticFunctions") or role_fns(i["semanticRole"])
def contradict(a, b): return a in EFFECT and b in EFFECT and a != b
def vkey(v): return (v["kind"], v["normalizedValue"] if v["normalizedValue"] is not None else re.sub(r"\s+", " ", v["rawText"]).strip().lower())
def items(ens, tag):
    out = []
    for i in ens["items"]:
        if i["sourceSpan"]["regionId"] != "operative": continue
        sup = i.get("support") or {}
        out.append({"tag": tag, "id": i["inventoryItemId"], "s": i["sourceSpan"]["charStart"], "e": i["sourceSpan"]["charEnd"], "mat": i["materiality"], "role": i["semanticRole"], "f": fns(i), "values": set(vkey(v) for v in i["quantitativeValues"]), "refs": set(x.lower() for x in (i.get("referencedSections") or []) + (i.get("referencedTerms") or [])), "support": sup.get("supportStatus"), "passes": sup.get("supportingPasses") or [], "raw": i})
    return out
A, B = items(E1, "E1"), items(E2, "E2")
def ov(a, b): return max(0, min(a["e"], b["e"]) - max(a["s"], b["s"]))
def ln(a): return max(1, a["e"] - a["s"])
def frac(a, b): return ov(a, b) / max(1, min(ln(a), ln(b)))
mat = lambda z: z["mat"] in MATERIAL
canon = lambda x, y: x["id"] == y["id"] or (frac(x, y) >= 0.5 and not contradict(x["f"]["effect"], y["f"]["effect"]))
strict = lambda x, y: x["id"] == y["id"]
is_ce = lambda z: any(l in ("CONDITION", "EXCEPTION") for l in z["f"]["logic"])
is_dep = lambda z: len(z["f"]["dependency"]) > 0

def stability(xs, ys, match):
    """Greedy one-to-one alignment in source order; Jaccard of matched over union."""
    used = set(); pairs = []; unmatched_x = []
    for x in sorted(xs, key=lambda z: (z["s"], z["e"], z["id"])):
        hit = None
        for j, y in enumerate(ys):
            if j in used: continue
            if match(x, y): hit = j; break
        if hit is None: unmatched_x.append(x)
        else: used.add(hit); pairs.append((x, ys[hit]))
    unmatched_y = [y for j, y in enumerate(ys) if j not in used]
    m = len(pairs); union = len(xs) + len(ys) - m
    return {"value": round(m / union, 4) if union else None, "matched": m, "union": union, "pairs": pairs, "onlyX": unmatched_x, "onlyY": unmatched_y}

s_strict = stability(A, B, strict)
s_all = stability(A, B, canon)
s_mat = stability([a for a in A if mat(a)], [b for b in B if mat(b)], canon)
s_ce = stability([a for a in A if is_ce(a) and mat(a)], [b for b in B if is_ce(b) and mat(b)], canon)
s_dep = stability([a for a in A if is_dep(a) and mat(a)], [b for b in B if is_dep(b) and mat(b)], canon)

# semantic-function stability over canonically aligned pairs
def setj(a, b):
    a, b = set(a), set(b); u = a | b
    return 1.0 if not u else len(a & b) / len(u)
tok = lambda f: set(([f"effect:{f['effect']}"] if f["effect"] != "NONE" else []) + [f"logic:{x}" for x in f["logic"]] + [f"quantitative:{x}" for x in f["quantitative"]] + [f"dependency:{x}" for x in f["dependency"]])
dim = {"effect": [], "logic": [], "quantitative": [], "dependency": [], "allTokens": []}
disagree = Counter()
for x, y in s_all["pairs"]:
    fx, fy = x["f"], y["f"]
    dim["effect"].append(1.0 if fx["effect"] == fy["effect"] else 0.0)
    dim["logic"].append(setj(fx["logic"], fy["logic"])); dim["quantitative"].append(setj(fx["quantitative"], fy["quantitative"])); dim["dependency"].append(setj(fx["dependency"], fy["dependency"]))
    dim["allTokens"].append(setj(tok(fx), tok(fy)))
    for d in ("effect", "logic", "quantitative", "dependency"):
        if fx[d] != fy[d]: disagree[d] += 1
fn_stability = {d: round(sum(v) / len(v), 4) if v else None for d, v in dim.items()}
fn_all_exact = round(sum(1 for x, y in s_all["pairs"] if tok(x["f"]) == tok(y["f"])) / len(s_all["pairs"]), 4) if s_all["pairs"] else None

# coverage / values
def mask(xs):
    m = bytearray(len(text))
    for x in xs:
        if not mat(x): continue
        for p in range(x["s"], min(x["e"], len(text))): m[p] = 1
    return m
def mj(m1, m2):
    inter = sum(1 for p in range(len(text)) if m1[p] and m2[p]); uni = sum(1 for p in range(len(text)) if m1[p] or m2[p])
    return round(inter / uni, 4) if uni else None
vals = lambda xs: set(k for x in xs if mat(x) for k in x["values"])
v1, v2 = vals(A), vals(B)

# ---- SUPPORT diagnostics (never identity) ----
def support_counts(ens):
    c = ens["ensemble"]["counts"]
    return {"canonical": c["canonicalItems"], "corroborated": c["corroborated"], "singleRun": c["singleRun"], "singleRunByPass": c["singleRunByPass"], "materialSingleRun": c["materialSingleRun"], "conflicted": c["conflicted"], "materialConflicted": c["materialConflicted"], "supportReviewRequired": ens["ensemble"]["supportReviewRequired"], "supportReviewFraction": ens["ensemble"]["supportReviewFraction"], "inventoryStatus": ens["inventoryStatus"], "unaccountedSource": len(ens["unaccountedSource"]), "accountedCharFraction": ens["sourceCoverage"]["accountedCharFraction"], "uninventoriedValues": len(ens["uninventoriedValues"])}
agree = sum(1 for x, y in s_all["pairs"] if x["support"] == y["support"]); npairs = len(s_all["pairs"])
transitions = Counter(f"{x['support']}->{y['support']}" for x, y in s_all["pairs"])
corr_e1_single_e2 = [(x, y) for x, y in s_all["pairs"] if x["support"] == "CORROBORATED" and y["support"] == "SINGLE_RUN"]
single_e1_corr_e2 = [(x, y) for x, y in s_all["pairs"] if x["support"] == "SINGLE_RUN" and y["support"] == "CORROBORATED"]
support = {"E1": support_counts(E1), "E2": support_counts(E2), "alignedPairs": npairs, "supportStatusAgreementOnMatched": round(agree / npairs, 4) if npairs else None, "transitionsOnMatched": dict(transitions), "corroboratedInE1_singletonInE2": len(corr_e1_single_e2), "singletonInE1_corroboratedInE2": len(single_e1_corr_e2), "matchedMaterialWhoseSupportChanged": sum(1 for x, y in s_all["pairs"] if mat(x) and x["support"] != y["support"]), "note": "support-state variance is diagnostic; it never erases an otherwise valid source proposition and never enters the identity match"}

# ---- ensemble-only decomposition A-G ----
def cover_fraction(x, ys):
    covered = bytearray(ln(x))
    for y in ys:
        if not mat(y): continue
        lo, hi = max(x["s"], y["s"]), min(x["e"], y["e"])
        for p in range(lo, hi): covered[p - x["s"]] = 1
    return sum(covered) / ln(x)
def disclosed_by(x, ens):
    return any(u["regionId"] == "operative" and u["charStart"] < x["e"] and u["charEnd"] > x["s"] for u in ens["unaccountedSource"])
def trust_claims_complete(ens):
    return ens["inventoryStatus"] == "INVENTORY_OK" and not ens["ensemble"]["supportReviewRequired"]
def classify(x, others, lacking_ens, side):
    overl = [y for y in others if ov(x, y) > 0]
    if any(frac(x, y) >= 0.5 and not contradict(x["f"]["effect"], y["f"]["effect"]) for y in overl): cls = "A_IDENTITY_VARIANCE"
    elif any(frac(x, y) >= 0.5 and contradict(x["f"]["effect"], y["f"]["effect"]) for y in overl): cls = "C_SEMANTIC_FUNCTION_VARIANCE"
    elif is_dep(x) and any(x["refs"] & y["refs"] for y in overl): cls = "F_DEPENDENCY_FRAGMENTATION"
    elif any(ov(x, y) / ln(x) >= 0.9 or ov(x, y) / ln(y) >= 0.9 for y in overl): cls = "B_GRANULARITY_VARIANCE"
    elif mat(x) and cover_fraction(x, others) < 0.5: cls = "D_TRUE_ENSEMBLE_OMISSION" if side == "E1" else "E_TRUE_ENSEMBLE_ADDITION"
    else: cls = "G_OTHER"
    material_touch = any(mat(y) for y in overl)
    disclosed = disclosed_by(x, lacking_ens)
    dangerous = cls in ("D_TRUE_ENSEMBLE_OMISSION", "E_TRUE_ENSEMBLE_ADDITION") and mat(x) and not material_touch and not disclosed and trust_claims_complete(lacking_ens)
    return {"class": cls, "presentIn": side, "lackingIn": "E2" if side == "E1" else "E1", "id": x["id"], "materiality": x["mat"], "role": x["role"], "functions": x["f"], "support": x["support"], "passes": x["passes"], "span": [x["s"], x["e"]], "excerpt": text[x["s"]:x["e"]][:160], "values": sorted(f"{k}:{v}" for k, v in x["values"]), "coverFractionByOtherMaterial": round(cover_fraction(x, others), 4), "otherMaterialItemTouches": material_touch, "disclosedAsUnaccountedByLacking": disclosed, "lackingClaimsComplete": trust_claims_complete(lacking_ens), "dangerousSilentOmission": dangerous}
rows = [classify(x, B, E2, "E1") for x in s_all["onlyX"]] + [classify(y, A, E1, "E2") for y in s_all["onlyY"]]
by_class = Counter(r["class"] for r in rows); by_class_material = Counter(r["class"] for r in rows if r["materiality"] in MATERIAL)
de_material = [r for r in rows if r["class"] in ("D_TRUE_ENSEMBLE_OMISSION", "E_TRUE_ENSEMBLE_ADDITION") and r["materiality"] in MATERIAL]
dangerous = [r for r in de_material if r["dangerousSilentOmission"]]
undisclosed_review_marked = [r for r in de_material if not r["otherMaterialItemTouches"] and not r["disclosedAsUnaccountedByLacking"] and not r["lackingClaimsComplete"]]

result = {
    "artifact": "F-5.3B pre-registered ensemble-to-ensemble certification score (E1 vs E2), label-blind and support-blind identity",
    "inputs": {"e1": e1_path, "e2": e2_path, "unit": unit_path, "e1Hash": E1.get("frozenContentHash"), "e2Hash": E2.get("frozenContentHash"), "e1Passes": E1["ensemble"]["passIds"], "e2Passes": E2["ensemble"]["passIds"]},
    "e1Items": len(A), "e2Items": len(B), "canonicalItemCountDelta": len(B) - len(A),
    "strictCanonicalIdentityStability": s_strict["value"], "strictCounts": [s_strict["matched"], s_strict["union"]],
    "semanticStability": s_all["value"], "semanticCounts": [s_all["matched"], s_all["union"]],
    "criticalMaterialSemanticStability": s_mat["value"], "criticalMaterialCounts": [s_mat["matched"], s_mat["union"]],
    "sourceSpanCoverageStability": mj(mask(A), mask(B)),
    "quantitativeComponentStability": round(len(v1 & v2) / len(v1 | v2), 4) if (v1 | v2) else None, "quantitativeCounts": [len(v1 & v2), len(v1 | v2)],
    "conditionExceptionStability": s_ce["value"], "conditionExceptionCounts": [s_ce["matched"], s_ce["union"]],
    "dependencyXrefStability": s_dep["value"], "dependencyXrefCounts": [s_dep["matched"], s_dep["union"]],
    "semanticFunctionStabilityByDimension_jaccardMean": fn_stability, "allFunctionsExactAgreementOnAligned": fn_all_exact, "dimensionDisagreementsOnAligned": dict(disagree), "alignedPairs": len(s_all["pairs"]),
    "support": support,
    "ensembleOnlyDecomposition": {"total": len(rows), "byClass": dict(by_class), "byClassMaterial": dict(by_class_material), "e1Only": len(s_all["onlyX"]), "e2Only": len(s_all["onlyY"]), "materialTrueOmissionOrAddition": len(de_material), "undisclosedButReviewMarked": len(undisclosed_review_marked), "dangerousSilentOmissions": len(dangerous)},
    "gates": {"criticalMaterialSemanticStability": {"value": s_mat["value"], "threshold": GATES["criticalMaterialSemanticStability"], "pass": s_mat["value"] is not None and s_mat["value"] >= GATES["criticalMaterialSemanticStability"]}, "semanticStability": {"value": s_all["value"], "threshold": GATES["semanticStability"], "pass": s_all["value"] is not None and s_all["value"] >= GATES["semanticStability"]}, "dangerousSilentOmissions": {"value": len(dangerous), "threshold": 0, "pass": len(dangerous) == 0}, "referenceRecall": "scored separately by scripts/f5-reference-recall.py (no material degradation vs E1 / frozen baseline 1.0)", "roundingPolicy": "none - 0.849 fails 0.85"},
    "rows": rows,
}
json.dump(result, open(out_path, "w"), indent=1)
print(json.dumps({k: v for k, v in result.items() if k not in ("rows",)}, indent=1))
