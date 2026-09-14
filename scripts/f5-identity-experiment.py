#!/usr/bin/env python3
"""
F-5 zero-cost identity experiment: recompute every frozen item's identity under candidate canonical schemes and
measure strict stability, intra-run merges and potential false merges - WITHOUT any model call. The schemes:
  S0 span            role + verified span + values                           (current production)
  S1 segment         role + independent segment containing span start + values
  S2 segment+ids     S1 + normalized source-owned identifiers (referenced terms/sections)
  S3 node            role + deepest structural node containing span start + values
  S4 node+segment    role + deepest node + independent segment (within the node) + values
  S5 node+segment+ids  S4 + identifiers
  python3 scripts/f5-identity-experiment.py <unit.json> <nodes.json> <out.json>
"""
import json, re, sys
from collections import Counter, defaultdict
MATERIAL = ("CRITICAL", "MATERIAL")
d = json.load(open(sys.argv[1])); nodes = json.load(open(sys.argv[2]))["nodes"]
text = d["compile"]["sourceContext"]["regions"][0]["text"]
runs = {"run1": d["compile"]["frozenInventory"]["items"], "run2": d["inventoryRun2"]["items"]}
bounds = sorted({0, len(text)} | {m.end() for m in re.finditer(r"[.;:!?][\"')\]]?\s+", text)} | {m.end() for m in re.finditer(r"\n+[ \t]*", text)})
def seg(pos):
    lo = 0
    for b in bounds:
        if b > pos: return (lo, b)
        lo = b
    return (lo, bounds[-1])
def deepest(pos):
    cands = [n for n in nodes if n["charStart"] <= pos < n["charEnd"]]
    return min(cands, key=lambda n: n["charEnd"] - n["charStart"])["sectionRef"] if cands else "?"
def vsig(i): return "|".join(sorted(f"{v['kind']}:{v['normalizedValue'] if v['normalizedValue'] is not None else v['rawText'].lower()}" for v in i["quantitativeValues"]))
def ids(i): return "|".join(sorted(set(t.lower().strip() for t in i["referencedTerms"]) | set(s.lower().replace(" ", "") for s in i["referencedSections"])))
def prop(i): return set(t for t in re.sub(r"[^a-z0-9 ]", " ", i["proposition"].lower()).split() if len(t) > 2)
SCHEMES = {
    "S0_span": lambda i: (i["semanticRole"], i["sourceSpan"]["charStart"], i["sourceSpan"]["charEnd"], vsig(i)),
    "S1_segment": lambda i: (i["semanticRole"], seg(i["sourceSpan"]["charStart"]), vsig(i)),
    "S2_segment_ids": lambda i: (i["semanticRole"], seg(i["sourceSpan"]["charStart"]), vsig(i), ids(i)),
    "S3_node": lambda i: (i["semanticRole"], deepest(i["sourceSpan"]["charStart"]), vsig(i)),
    "S4_node_segment": lambda i: (i["semanticRole"], deepest(i["sourceSpan"]["charStart"]), seg(i["sourceSpan"]["charStart"]), vsig(i)),
    "S5_node_segment_ids": lambda i: (i["semanticRole"], deepest(i["sourceSpan"]["charStart"]), seg(i["sourceSpan"]["charStart"]), vsig(i), ids(i)),
}
out = {}
for name, fn in SCHEMES.items():
    keys = {r: [fn(i) for i in items] for r, items in runs.items()}
    sets = {r: set(k) for r, k in keys.items()}
    mat_sets = {r: set(fn(i) for i in items if i["materiality"] in MATERIAL) for r, items in runs.items()}
    merges = {}; false_merges = {}; examples = []
    for r, items in runs.items():
        groups = defaultdict(list)
        for i, k in zip(items, keys[r]): groups[k].append(i)
        merged = [g for g in groups.values() if len(g) > 1]
        merges[r] = sum(len(g) - 1 for g in merged)
        fm = 0
        for g in merged:
            for a in g[1:]:
                pa, pb = prop(g[0]), prop(a)
                j = len(pa & pb) / len(pa | pb) if (pa | pb) else 1
                same_span = abs(a["sourceSpan"]["charStart"] - g[0]["sourceSpan"]["charStart"]) < 5
                if j < 0.2 and not same_span:
                    fm += 1
                    if len(examples) < 6: examples.append({"run": r, "scheme": name, "a": g[0]["proposition"][:100], "b": a["proposition"][:100], "spans": [[g[0]["sourceSpan"]["charStart"], g[0]["sourceSpan"]["charEnd"]], [a["sourceSpan"]["charStart"], a["sourceSpan"]["charEnd"]]]})
        false_merges[r] = fm
    inter = sets["run1"] & sets["run2"]; union = sets["run1"] | sets["run2"]
    minter = mat_sets["run1"] & mat_sets["run2"]; munion = mat_sets["run1"] | mat_sets["run2"]
    out[name] = {"strictStability": round(len(inter) / len(union), 4), "counts": [len(inter), len(union)], "criticalMaterialStrictStability": round(len(minter) / len(munion), 4), "distinctKeys": {r: len(s) for r, s in sets.items()}, "intraRunMerges": merges, "potentialFalseMerges(propJaccard<0.2, not same start)": false_merges, "examples": examples}
json.dump({"artifact": "F-5 zero-cost identity-scheme experiment over the two frozen Chewy 6.08 runs", "independentSegments": len(bounds) - 1, "structuralNodes": len(nodes), "schemes": out}, open(sys.argv[3], "w"), indent=1)
for k, v in out.items(): print(k, {kk: vv for kk, vv in v.items() if kk != "examples"})
