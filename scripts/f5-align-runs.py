#!/usr/bin/env python3
"""
F-5 (Phase 3 Chewy remediation 4) - deterministic alignment of two Pass A inventories over the SAME source unit and
decomposition of every run-only item into the mission's A-I instability classes. Zero model calls.

  python3 scripts/f5-align-runs.py <unit.json | runs.json> <out-prefix>

Input is either the recorded unit file (compile.frozenInventory = run 1, inventoryRun2 = run 2, compile.sourceContext
carries the region text) or a JSON {"regionText":..., "run1": FrozenSemanticInventory, "run2": FrozenSemanticInventory}.
Writes <out-prefix>-alignment.json, <out-prefix>-decomposition.json, <out-prefix>-metrics.json.
"""
import json, re, sys
from collections import Counter, defaultdict

MATERIAL = ("CRITICAL", "MATERIAL")
COMPONENT_ROLES = ("CONDITION", "EXCEPTION", "REFERENCE", "DEPENDENCY", "SHARED_CAP", "ALTERNATIVE", "FORMULA_COMPONENT", "THRESHOLD", "TIME_PERIOD", "TRIGGER", "VALUE")
DEP_ROLES = ("REFERENCE", "DEPENDENCY", "SHARED_CAP")
CE_ROLES = ("CONDITION", "EXCEPTION")

def load(path):
    d = json.load(open(path))
    if "compile" in d:
        return d["compile"]["sourceContext"]["regions"][0]["text"], d["compile"]["frozenInventory"], d["inventoryRun2"]
    return d["regionText"], d["run1"], d["run2"]

def ov(a, b):
    return max(0, min(a["e"], b["e"]) - max(a["s"], b["s"]))
def frac(a, b):
    o = ov(a, b); shorter = min(a["e"] - a["s"], b["e"] - b["s"]) or 1
    return o / shorter
def norm_prop(p):
    return set(t for t in re.sub(r"[^a-z0-9 ]", " ", p.lower()).split() if len(t) > 2)
def jacc(a, b):
    return len(a & b) / len(a | b) if (a | b) else 1.0
def value_key(v):
    return (v["kind"], v["normalizedValue"] if v["normalizedValue"] is not None else re.sub(r"\s+", " ", v["rawText"]).strip().lower())

def independent_bounds(text):
    bounds = {0, len(text)}
    for m in re.finditer(r"[.;:!?][\"')\]]?\s+", text): bounds.add(m.end())
    for m in re.finditer(r"\n+[ \t]*", text): bounds.add(m.end())
    return sorted(bounds)
def seg_of(bounds, pos):
    lo = 0
    for b in bounds:
        if b > pos: return (lo, b)
        lo = b
    return (lo, bounds[-1])

def items_of(run, tag):
    out = []
    for i in run["items"]:
        out.append({"tag": tag, "id": i["inventoryItemId"], "role": i["semanticRole"], "s": i["sourceSpan"]["charStart"], "e": i["sourceSpan"]["charEnd"], "mat": i["materiality"], "prop": norm_prop(i["proposition"]), "values": set(value_key(v) for v in i["quantitativeValues"]), "terms": set(t.lower() for t in i["referencedTerms"]), "sections": set(s.lower().replace(" ", "") for s in i["referencedSections"]), "parent": i["parentItemId"], "excerpt": i["sourceSpan"]["excerpt"][:120], "raw": i})
    return out

def main():
    text, run1, run2 = load(sys.argv[1]); prefix = sys.argv[2]
    A = items_of(run1, "run1"); B = items_of(run2, "run2")
    bounds = independent_bounds(text)
    byid_b = {b["id"]: b for b in B}

    # ---- 1. exact identity ----
    pairs = []  # (a, b, tier)
    usedA, usedB = set(), set()
    for a in A:
        if a["id"] in byid_b:
            pairs.append((a, byid_b[a["id"]], "IDENTICAL")); usedA.add(a["id"]); usedB.add(a["id"])

    # ---- 2. overlap graph among the rest (>= 50% of the shorter span, any role) ----
    restA = [a for a in A if a["id"] not in usedA]; restB = [b for b in B if b["id"] not in usedB]
    edges = defaultdict(list)  # a.id -> [(b, frac)]
    redges = defaultdict(list)
    for a in restA:
        for b in restB:
            f = frac(a, b)
            if f >= 0.5:
                edges[a["id"]].append((b, f)); redges[b["id"]].append((a, f))

    # connected components
    comp = {}; comps = []
    for a in restA:
        if a["id"] in comp: continue
        stack = [("A", a)]; members = {"A": [], "B": []}; cid = len(comps)
        while stack:
            side, node = stack.pop()
            if node["id"] in comp: continue
            comp[node["id"]] = cid; members[side].append(node)
            if side == "A":
                for b, _ in edges[node["id"]]:
                    if b["id"] not in comp: stack.append(("B", b))
            else:
                for a2, _ in redges[node["id"]]:
                    if a2["id"] not in comp: stack.append(("A", a2))
        comps.append(members)
    for b in restB:
        if b["id"] not in comp:
            comp[b["id"]] = len(comps); comps.append({"A": [], "B": [b]})

    # ---- 3. classify ----
    classified = []  # rows: item tag/id/role/mat/class/detail
    def cls(item, klass, detail, counterpart=None):
        classified.append({"run": item["tag"], "inventoryItemId": item["id"], "role": item["role"], "materiality": item["mat"], "span": [item["s"], item["e"]], "class": klass, "detail": detail, "counterpart": counterpart, "excerpt": item["excerpt"]})

    def other_run_any_overlap(item, others):
        return [o for o in others if ov(item, o) > 0]
    unacc1 = [(u["charStart"], u["charEnd"]) for u in run1["unaccountedSource"]]
    unacc2 = [(u["charStart"], u["charEnd"]) for u in run2["unaccountedSource"]]
    def disclosed(item, unacc):
        return any(max(0, min(item["e"], e) - max(item["s"], s)) > 0 for s, e in unacc)

    for members in comps:
        As, Bs = members["A"], members["B"]
        if len(As) == 1 and len(Bs) == 1:
            a, b = As[0], Bs[0]; f = frac(a, b); same_span = a["s"] == b["s"] and a["e"] == b["e"]
            if a["role"] == b["role"]:
                if a["mat"] != b["mat"] and ((a["mat"] in MATERIAL) != (b["mat"] in MATERIAL)):
                    k, d = "E_MATERIALITY_INSTABILITY", f"{a['mat']} vs {b['mat']}"
                elif same_span or f >= 0.9:
                    k, d = "A_IDENTITY_INSTABILITY", "same span" if same_span else f"overlap {f:.2f}" + ("; value signature differs" if a["values"] != b["values"] else "; boundary drift")
                else:
                    k, d = "C_BOUNDARY_INSTABILITY", f"overlap {f:.2f}; spans {a['s']}-{a['e']} vs {b['s']}-{b['e']}"
            else:
                if jacc(a["prop"], b["prop"]) >= 0.3 or f >= 0.9:
                    k, d = "D_ROLE_INSTABILITY", f"{a['role']} vs {b['role']} (prop jaccard {jacc(a['prop'], b['prop']):.2f}, overlap {f:.2f})"
                else:
                    k, d = "I_OTHER", f"overlapping but different role ({a['role']} vs {b['role']}) and proposition"
            pairs.append((a, b, k)); cls(a, k, d, b["id"]); cls(b, k, d, a["id"])
        elif As and Bs:
            # one-to-many / many-to-many: same-role members are granularity; component-role members nested inside a broader different-role item are dependency fragmentation
            roles_a = Counter(x["role"] for x in As); roles_b = Counter(x["role"] for x in Bs)
            for side, mine, theirs in (("A", As, Bs), ("B", Bs, As)):
                for x in mine:
                    same_role_counter = [y for y in theirs if y["role"] == x["role"] and frac(x, y) >= 0.5]
                    broader = [y for y in theirs if (y["e"] - y["s"]) > (x["e"] - x["s"]) and ov(x, y) >= 0.8 * (x["e"] - x["s"]) and y["role"] != x["role"]]
                    if same_role_counter:
                        k, d = "B_GRANULARITY_INSTABILITY", f"{len(mine)} items in {x['tag']} vs {len(theirs)} in the other run over one source stretch; same-role counterpart(s) {len(same_role_counter)}"
                    elif x["role"] in COMPONENT_ROLES and broader:
                        k, d = "H_DEPENDENCY_FRAGMENTATION", f"{x['role']} carried only in {x['tag']} inside a broader {broader[0]['role']} item of the other run"
                    elif broader or any(frac(x, y) >= 0.5 for y in theirs):
                        k, d = "B_GRANULARITY_INSTABILITY", f"nested/overlapping with different-role item(s) {sorted(set(y['role'] for y in theirs))}"
                    else:
                        k, d = "I_OTHER", "component of a many-to-many overlap group with no direct counterpart"
                    cls(x, k, d, ",".join(y["id"] for y in theirs)[:200])
        else:
            for x in As + Bs:
                others = B if x["tag"] == "run1" else A
                unacc_other = unacc2 if x["tag"] == "run1" else unacc1
                touching = other_run_any_overlap(x, others)
                if x["mat"] not in MATERIAL:
                    k, d = "G_TRUE_SEMANTIC_ADDITION", f"{x['mat']} item with no counterpart (non-accounting echo)"
                elif not touching:
                    k, d = "F_TRUE_SEMANTIC_OMISSION", "no item of any role in the other run touches this span" + ("; DISCLOSED by the other run's unaccountedSource" if disclosed(x, unacc_other) else "; NOT disclosed - the other run's coverage accounted for this text without an item")
                else:
                    k, d = "F_TRUE_SEMANTIC_OMISSION", f"other run touches the span only marginally (<50% of the shorter span) via {len(touching)} item(s)" + ("; DISCLOSED" if disclosed(x, unacc_other) else "")
                cls(x, k, d)

    # intra-run duplicates (G): same run, same role, >=90% overlap
    dup = {"run1": 0, "run2": 0}
    for tag, items in (("run1", A), ("run2", B)):
        for i, x in enumerate(items):
            for y in items[i + 1:]:
                if x["role"] == y["role"] and frac(x, y) >= 0.9: dup[tag] += 1

    # ---- 4. metrics (the frozen scorer's definitions, plus the mission's additional ones) ----
    def sem_stability(filterfn):
        a_items = [a for a in A if filterfn(a)]; b_items = [b for b in B if filterfn(b)]
        used = set(); matched = 0
        for a in a_items:
            for j, b in enumerate(b_items):
                if j in used: continue
                if a["id"] == b["id"] or (a["role"] == b["role"] and frac(a, b) >= 0.5): used.add(j); matched += 1; break
        union = len(a_items) + len(b_items) - matched
        return round(matched / union, 4) if union else None, matched, union
    strict = (len(set(a["id"] for a in A) & set(b["id"] for b in B)), len(set(a["id"] for a in A) | set(b["id"] for b in B)))
    def mask(items, only_material=True):
        m = bytearray(len(text))
        for x in items:
            if only_material and x["mat"] not in MATERIAL: continue
            for p in range(x["s"], min(x["e"], len(text))): m[p] = 1
        return m
    def mask_j(m1, m2):
        inter = sum(1 for p in range(len(text)) if m1[p] and m2[p]); uni = sum(1 for p in range(len(text)) if m1[p] or m2[p])
        return round(inter / uni, 4) if uni else None
    def unacc_mask(unacc):
        m = bytearray(len(text))
        for s, e in unacc:
            for p in range(s, min(e, len(text))): m[p] = 1
        return m
    def values_of(items):
        return set((x["role"] if False else "", k[0], k[1]) for x in items if x["mat"] in MATERIAL for k in x["values"])
    vals1, vals2 = values_of(A), values_of(B)
    # value + position: same value anchored inside the same independent segment
    def val_pos(items):
        out = set()
        for x in items:
            for v in x["raw"]["quantitativeValues"]:
                if v["charStart"] >= 0: out.add((value_key(v), seg_of(bounds, v["charStart"])))
        return out
    vp1, vp2 = val_pos(A), val_pos(B)
    dep_terms = lambda items: set((t, seg_of(bounds, x["s"])) for x in items if x["role"] in DEP_ROLES for t in (x["terms"] | x["sections"]))
    def scorer_only(xs, ys):
        used = set(); only = 0
        for x in xs:
            hit = None
            for j, y in enumerate(ys):
                if j in used: continue
                if x["id"] == y["id"] or (x["role"] == y["role"] and frac(x, y) >= 0.5): hit = j; break
            if hit is not None: used.add(hit)
            elif x["mat"] in MATERIAL: only += 1
        return only
    semantic = sem_stability(lambda x: True); material = sem_stability(lambda x: x["mat"] in MATERIAL)
    ce = sem_stability(lambda x: x["role"] in CE_ROLES and x["mat"] in MATERIAL); dep = sem_stability(lambda x: x["role"] in DEP_ROLES and x["mat"] in MATERIAL)
    metrics = {
        "run1Items": len(A), "run2Items": len(B), "itemCountDelta": len(B) - len(A),
        "strictStability": round(strict[0] / strict[1], 4), "strictCounts": strict,
        "semanticStability": semantic[0], "semanticCounts": semantic[1:],
        "criticalMaterialStability": material[0], "criticalMaterialCounts": material[1:],
        "sourceSpanCoverageStability": mask_j(mask(A), mask(B)),
        "unaccountedSourceStability": mask_j(unacc_mask(unacc1), unacc_mask(unacc2)),
        "quantitativeComponentStability": round(len(vals1 & vals2) / len(vals1 | vals2), 4) if (vals1 | vals2) else None,
        "quantitativeComponentAtSamePositionStability": round(len(vp1 & vp2) / len(vp1 | vp2), 4) if (vp1 | vp2) else None,
        "conditionExceptionStability": ce[0], "conditionExceptionCounts": ce[1:],
        "dependencyXrefStability": dep[0], "dependencyXrefCounts": dep[1:],
        "dependencyTermsAtPositionStability": round(len(dep_terms(A) & dep_terms(B)) / len(dep_terms(A) | dep_terms(B)), 4) if (dep_terms(A) | dep_terms(B)) else None,
        "intraRunDuplicatePairs": dup, "duplicateRate": {k: round(v / max(1, len(A if k == 'run1' else B)), 4) for k, v in dup.items()},
        # the frozen scorer's own definition: CRITICAL/MATERIAL items with no semantic match (same role, >= 50% overlap) in the other run
        "materialOnlyRun1": scorer_only(A, B), "materialOnlyRun2": scorer_only(B, A),
        "materialNonIdenticalRun1": sum(1 for r in classified if r["run"] == "run1" and r["materiality"] in MATERIAL),
        "materialNonIdenticalRun2": sum(1 for r in classified if r["run"] == "run2" and r["materiality"] in MATERIAL),
        "unaccountedSegments": {"run1": len(unacc1), "run2": len(unacc2)},
        "accountedCharFraction": {"run1": run1["sourceCoverage"]["accountedCharFraction"], "run2": run2["sourceCoverage"]["accountedCharFraction"]},
    }
    # ---- decomposition counts ----
    by_class = Counter(r["class"] for r in classified)
    by_class_mat = Counter((r["class"], "material" if r["materiality"] in MATERIAL else "nonmaterial") for r in classified)
    by_class_run = Counter((r["class"], r["run"]) for r in classified)
    omissions = [r for r in classified if r["class"].startswith("F_")]
    decomposition = {
        "artifact": "F-5 instability decomposition of every run-only Pass A item (both directions), classes A-I",
        "method": "exact id -> IDENTICAL; otherwise items are linked when they overlap >= 50% of the shorter span (any role); connected overlap groups are classified: 1-1 same role = A (identity, overlap >= 0.9 or same span) / C (boundary) / E (materiality tier crosses CRITICAL-MATERIAL vs other); 1-1 different role = D (role) when the propositions or spans agree, else I; 1-n/n-m = B (granularity) for same-role members, H (dependency fragmentation) for component-role members nested inside a broader different-role item; isolated CRITICAL/MATERIAL items = F (omission by the other run, with disclosure through the other run's unaccountedSource checked), isolated non-accounting items = G; intra-run same-role >= 90% overlaps are counted as duplicates.",
        "identicalPairs": sum(1 for p in pairs if p[2] == "IDENTICAL"),
        "runOnlyItemsClassified": len(classified),
        "countsByClass": dict(sorted(by_class.items())),
        "countsByClassAndSeverity": {f"{k[0]}|{k[1]}": v for k, v in sorted(by_class_mat.items())},
        "countsByClassAndRun": {f"{k[0]}|{k[1]}": v for k, v in sorted(by_class_run.items())},
        "omissionsDisclosedVsNot": {"disclosed": sum(1 for r in omissions if "DISCLOSED" in r["detail"]), "notDisclosed": sum(1 for r in omissions if "NOT disclosed" in r["detail"])},
        "rows": classified,
    }
    alignment = {"artifact": "F-5 deterministic alignment of the two frozen Pass A runs over Chewy §6.08", "regionChars": len(text), "independentSegments": len(bounds) - 1,
                 "pairs": [{"run1": a["id"], "run2": b["id"], "tier": t, "role": a["role"] + ("" if a["role"] == b["role"] else "/" + b["role"]), "spanRun1": [a["s"], a["e"]], "spanRun2": [b["s"], b["e"]], "overlapOfShorter": round(frac(a, b), 3), "sameValues": a["values"] == b["values"], "propJaccard": round(jacc(a["prop"], b["prop"]), 3)} for a, b, t in pairs]}
    json.dump(alignment, open(f"{prefix}-alignment.json", "w"), indent=1)
    json.dump(decomposition, open(f"{prefix}-decomposition.json", "w"), indent=1)
    json.dump(metrics, open(f"{prefix}-metrics.json", "w"), indent=1)
    print(json.dumps(metrics, indent=1))
    print(json.dumps({k: v for k, v in decomposition.items() if k != "rows"}, indent=1))

main()
