#!/usr/bin/env python3
"""
F-5.1 canonical + legacy stability scorer over two Pass A inventories of the SAME source (a pair.json). Zero model calls.

  python3 scripts/f5-1-canonical-score.py <pair.json> <out.json>

ANTI-GAMING (mission §12): every metric is reported in BOTH representations -
  canonical: identity = inventoryItemId (v5: source ownership); semantic match = same id OR (>= 50% overlap of the
             shorter span AND compatible deontic effect) - the label the model picked is NOT a matching criterion;
  legacy:    the frozen F-5 scorer's definition - same id OR (same scalar semanticRole AND >= 50% overlap) - computed
             on the DERIVED semanticRole and, separately, on the model's DECLARED primary role.
plus semantic-function stability by dimension over aligned pairs, so improvement that comes from resolving genuine
label overlap (a pair that now matches canonically but still disagrees on a dimension) is visible next to improvement
that comes from the representation itself.
"""
import json, re, sys
from collections import Counter

MATERIAL = ("CRITICAL", "MATERIAL")
src = json.load(open(sys.argv[1])); out_path = sys.argv[2]
text = src["regionText"]; R1, R2 = src["run1"], src["run2"]
LOGIC = ("CONDITION", "EXCEPTION", "TRIGGER", "ALTERNATIVE", "CURE", "RECLASSIFICATION"); QUANT = ("VALUE", "FORMULA_COMPONENT", "THRESHOLD", "TIME_PERIOD"); DEP = ("REFERENCE", "DEPENDENCY", "SHARED_CAP"); EFFECT = {"PERMISSION", "PROHIBITION", "REQUIREMENT"}
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
def items(run, tag):
    out = []
    for i in run["items"]:
        if i["sourceSpan"]["regionId"] != "operative": continue
        f = fns(i)
        out.append({"tag": tag, "id": i["inventoryItemId"], "s": i["sourceSpan"]["charStart"], "e": i["sourceSpan"]["charEnd"], "mat": i["materiality"], "role": i["semanticRole"], "declared": (i.get("declaredRoles") or [i["semanticRole"]])[0], "f": f, "values": set(vkey(v) for v in i["quantitativeValues"]), "raw": i})
    return out
A, B = items(R1, "A"), items(R2, "B")
def ov(a, b): return max(0, min(a["e"], b["e"]) - max(a["s"], b["s"]))
def frac(a, b): return ov(a, b) / max(1, min(a["e"] - a["s"], b["e"] - b["s"]))

def stability(xs, ys, match):
    used = set(); m = 0; pairs = []
    for x in xs:
        for j, y in enumerate(ys):
            if j in used: continue
            if match(x, y): used.add(j); m += 1; pairs.append((x, y)); break
    union = len(xs) + len(ys) - m
    return (round(m / union, 4) if union else None, m, union, pairs)
canon = lambda x, y: x["id"] == y["id"] or (frac(x, y) >= 0.5 and not contradict(x["f"]["effect"], y["f"]["effect"]))
legacy_derived = lambda x, y: x["id"] == y["id"] or (x["role"] == y["role"] and frac(x, y) >= 0.5)
legacy_declared = lambda x, y: x["id"] == y["id"] or (x["declared"] == y["declared"] and frac(x, y) >= 0.5)
strict = lambda x, y: x["id"] == y["id"]
mat = lambda z: z["mat"] in MATERIAL
is_ce = lambda z: any(l in ("CONDITION", "EXCEPTION") for l in z["f"]["logic"])
is_dep = lambda z: len(z["f"]["dependency"]) > 0
legacy_ce = lambda z: z["role"] in ("CONDITION", "EXCEPTION")
legacy_dep = lambda z: z["role"] in DEP

def block(match, label):
    s_all = stability(A, B, match); s_mat = stability([a for a in A if mat(a)], [b for b in B if mat(b)], match)
    return {"definition": label, "semanticStability": s_all[0], "semanticCounts": s_all[1:3], "criticalMaterialStability": s_mat[0], "criticalMaterialCounts": s_mat[1:3]}, s_all[3]
canon_block, canon_pairs = block(canon, "same id OR (>=50% overlap of the shorter span AND no contradictory deontic effect) - label-blind")
derived_block, _ = block(legacy_derived, "frozen F-5 scorer: same id OR (same DERIVED semanticRole AND >=50% overlap)")
declared_block, _ = block(legacy_declared, "frozen F-5 scorer on the model's DECLARED primary role")
strict_s = stability(A, B, strict)

# function stability by dimension over canonically aligned pairs
def setj(a, b):
    a, b = set(a), set(b); u = a | b
    return 1.0 if not u else len(a & b) / len(u)
dim = {"effect": [], "logic": [], "quantitative": [], "dependency": [], "allTokens": []}
tok = lambda f: set(([f"effect:{f['effect']}"] if f["effect"] != "NONE" else []) + [f"logic:{x}" for x in f["logic"]] + [f"quantitative:{x}" for x in f["quantitative"]] + [f"dependency:{x}" for x in f["dependency"]])
disagree = Counter()
for x, y in canon_pairs:
    fx, fy = x["f"], y["f"]
    dim["effect"].append(1.0 if fx["effect"] == fy["effect"] else 0.0)
    dim["logic"].append(setj(fx["logic"], fy["logic"])); dim["quantitative"].append(setj(fx["quantitative"], fy["quantitative"])); dim["dependency"].append(setj(fx["dependency"], fy["dependency"]))
    dim["allTokens"].append(setj(tok(fx), tok(fy)))
    for d in ("effect", "logic", "quantitative", "dependency"):
        if (fx[d] != fy[d]): disagree[d] += 1
fn_stability = {d: round(sum(v) / len(v), 4) if v else None for d, v in dim.items()}
fn_exact = {d: round(sum(1 for x, y in canon_pairs if x["f"][d] == y["f"][d]) / len(canon_pairs), 4) if canon_pairs else None for d in ("effect", "logic", "quantitative", "dependency")}
fn_all_exact = round(sum(1 for x, y in canon_pairs if tok(x["f"]) == tok(y["f"])) / len(canon_pairs), 4) if canon_pairs else None
legacy_role_agree_on_pairs = round(sum(1 for x, y in canon_pairs if x["role"] == y["role"]) / len(canon_pairs), 4) if canon_pairs else None
declared_role_agree_on_pairs = round(sum(1 for x, y in canon_pairs if x["declared"] == y["declared"]) / len(canon_pairs), 4) if canon_pairs else None

# coverage / values / condition-exception / dependency
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
ce_c = stability([a for a in A if is_ce(a) and mat(a)], [b for b in B if is_ce(b) and mat(b)], canon)
dep_c = stability([a for a in A if is_dep(a) and mat(a)], [b for b in B if is_dep(b) and mat(b)], canon)
ce_l = stability([a for a in A if legacy_ce(a) and mat(a)], [b for b in B if legacy_ce(b) and mat(b)], legacy_derived)
dep_l = stability([a for a in A if legacy_dep(a) and mat(a)], [b for b in B if legacy_dep(b) and mat(b)], legacy_derived)

# run-only substantive items (canonical), invented (INFORMATIONAL isolated), duplicates
def only(xs, ys):
    used = set(); o = []
    for x in xs:
        hit = None
        for j, y in enumerate(ys):
            if j in used: continue
            if canon(x, y): hit = j; break
        if hit is not None: used.add(hit)
        else: o.append(x)
    return o
onlyA, onlyB = only(A, B), only(B, A)
def disclosed(x, other_run):
    return any(u["charStart"] < x["e"] and u["charEnd"] > x["s"] for u in other_run["unaccountedSource"])
def mutual(a, b): return ov(a, b) / max(1, max(a["e"] - a["s"], b["e"] - b["s"]))
def dup(xs):
    # two items of one run that own (almost) the same stretch (>= 90% of the LONGER span) without contradictory effects - a nested item is NOT a duplicate
    n = 0
    for i, x in enumerate(xs):
        for y in xs[i + 1:]:
            if mutual(x, y) >= 0.9 and not contradict(x["f"]["effect"], y["f"]["effect"]) and x["id"] != y["id"]: n += 1
    return n
gap1, gap2 = R1.get("gapReinventory") or {}, R2.get("gapReinventory") or {}
result = {
    "artifact": "F-5.1 canonical + legacy stability over one Pass A pair", "input": sys.argv[1],
    "run1Items": len(A), "run2Items": len(B), "itemCountDelta": len(B) - len(A),
    "strictStability": strict_s[0], "strictCounts": strict_s[1:3],
    "canonical": canon_block,
    "legacyDerivedRole": derived_block,
    "legacyDeclaredRole": declared_block,
    "functionStabilityByDimension_jaccardMean": fn_stability,
    "functionStabilityByDimension_exactAgreement": fn_exact,
    "allFunctionsExactAgreement": fn_all_exact,
    "dimensionDisagreementsOnAlignedPairs": dict(disagree),
    "legacyDerivedRoleAgreementOnAlignedPairs": legacy_role_agree_on_pairs,
    "declaredRoleAgreementOnAlignedPairs": declared_role_agree_on_pairs,
    "alignedPairs": len(canon_pairs),
    "sourceSpanCoverageStability": mj(mask(A), mask(B)),
    "quantitativeComponentStability": round(len(v1 & v2) / len(v1 | v2), 4) if (v1 | v2) else None,
    "conditionExceptionStability": {"canonical": ce_c[0], "canonicalCounts": ce_c[1:3], "legacy": ce_l[0], "legacyCounts": ce_l[1:3]},
    "dependencyXrefStability": {"canonical": dep_c[0], "canonicalCounts": dep_c[1:3], "legacy": dep_l[0], "legacyCounts": dep_l[1:3]},
    "runOnlySubstantive": {"aOnly": sum(1 for x in onlyA if mat(x)), "bOnly": sum(1 for x in onlyB if mat(x)), "aOnlyDisclosedByB": sum(1 for x in onlyA if mat(x) and disclosed(x, R2)), "bOnlyDisclosedByA": sum(1 for x in onlyB if mat(x) and disclosed(x, R1))},
    "inventedSemantics": {"aOnlyNonMaterial": sum(1 for x in onlyA if not mat(x)), "bOnlyNonMaterial": sum(1 for x in onlyB if not mat(x))},
    "intraRunDuplicatePairs": {"run1": dup(A), "run2": dup(B)}, "duplicateRate": {"run1": round(dup(A) / max(1, len(A)), 4), "run2": round(dup(B) / max(1, len(B)), 4)},
    "gapPass": {"run1": gap1, "run2": gap2, "unaccountedSegments": [len(R1["unaccountedSource"]), len(R2["unaccountedSource"])], "identicalUnaccountedSegments": len(set((u["charStart"], u["charEnd"]) for u in R1["unaccountedSource"]) & set((u["charStart"], u["charEnd"]) for u in R2["unaccountedSource"]))},
    "inventoryStatus": [R1["inventoryStatus"], R2["inventoryStatus"]],
    "accountedCharFraction": [R1["sourceCoverage"]["accountedCharFraction"], R2["sourceCoverage"]["accountedCharFraction"]],
    "runOnlyRows": [{"run": x["tag"], "id": x["id"], "role": x["role"], "functions": x["f"], "materiality": x["mat"], "span": [x["s"], x["e"]], "excerpt": text[x["s"]:x["e"]][:120]} for x in onlyA + onlyB],
}
json.dump(result, open(out_path, "w"), indent=1)
print(json.dumps({k: v for k, v in result.items() if k != "runOnlyRows"}, indent=1))
