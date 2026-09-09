#!/usr/bin/env python3
"""
F-5.3B section 14 - DIAGNOSTIC: does E2 contain the underlying source semantics of the historical F-5.2A residual
cases (50 F true omissions, 12 B granularity, 6 H dependency fragmentation from the F-5.1 pair)? Old ids are never
required; a case is SEMANTICALLY RECOVERED when a CRITICAL/MATERIAL E2 item overlaps >= 50% of the shorter span with a
compatible deontic effect (the F-5.1 canonical identity), and VALUE-PRESERVED when every stated value of the case
appears on that item. Zero model calls. The ensemble-to-ensemble gate remains primary.
  python3 scripts/f5-3b-residual-recovery.py <e2.json> <out.json>
"""
import json, re, sys
MATERIAL = ("CRITICAL", "MATERIAL"); EFFECT = {"PERMISSION", "PROHIBITION", "REQUIREMENT"}
E2 = json.load(open(sys.argv[1])); out_path = sys.argv[2]
F = json.load(open("docs/phase-3-remediation-f5-2/01-f-cases.json"))["cases"]
BH = json.load(open("docs/phase-3-remediation-f5-2/02-b-h-cases.json"))
cases = [("F", c) for c in F] + [("B", c) for c in BH["B"]["cases"]] + [("H", c) for c in BH["H"]["cases"]]
items = [i for i in E2["items"] if i["sourceSpan"]["regionId"] == "operative"]
def eff(i): return (i.get("semanticFunctions") or {}).get("effect") or (i["semanticRole"] if i["semanticRole"] in EFFECT else "NONE")
def contradict(a, b): return a in EFFECT and b in EFFECT and a != b
def vkey(v):
    if isinstance(v, str):  # historical case records carry values as "KIND rawText" strings
        kind, _, raw = v.partition(" "); return (kind, re.sub(r"\s+", " ", raw).strip().lower())
    return (v["kind"], v["normalizedValue"] if v["normalizedValue"] is not None else re.sub(r"\s+", " ", v["rawText"]).strip().lower())
def vkeys_raw(vs): return set((v["kind"], re.sub(r"\s+", " ", v["rawText"]).strip().lower()) for v in vs)
rows = []
for cls, c in cases:
    s, e = c["span"]; ce = (c.get("semanticFunctions") or {}).get("effect", "NONE")
    best = None; bestf = 0.0
    for i in items:
        a, b = i["sourceSpan"]["charStart"], i["sourceSpan"]["charEnd"]
        ov = max(0, min(e, b) - max(s, a)); f = ov / max(1, min(e - s, b - a))
        if f >= 0.5 and not contradict(ce, eff(i)) and i["materiality"] in MATERIAL and f > bestf: best, bestf = i, f
    vals = set(vkey(v) for v in c.get("quantitativeValues") or [])
    have = (set(vkey(v) for v in best["quantitativeValues"]) | vkeys_raw(best["quantitativeValues"])) if best else set()
    rows.append({"class": cls, "historicalId": c["inventoryItemId"], "presentRun": c["presentRun"], "materiality": c["materiality"], "span": [s, e], "excerpt": c["excerpt"][:100], "recovered": best is not None, "e2Id": best["inventoryItemId"] if best else None, "e2Support": (best.get("support") or {}).get("supportStatus") if best else None, "overlapOfShorter": round(bestf, 4), "valuesPreserved": vals <= have, "valuesExpected": len(vals)})
def summary(cls):
    xs = [r for r in rows if r["class"] == cls]
    return {"total": len(xs), "recovered": sum(r["recovered"] for r in xs), "recoveryRate": round(sum(r["recovered"] for r in xs) / len(xs), 4) if xs else None, "valuesPreserved": sum(r["valuesPreserved"] for r in xs if r["recovered"]), "bySupport": {k: sum(1 for r in xs if r["e2Support"] == k) for k in ("CORROBORATED", "SINGLE_RUN", "CONFLICTED")}, "notRecovered": [{"historicalId": r["historicalId"], "excerpt": r["excerpt"], "materiality": r["materiality"]} for r in xs if not r["recovered"]]}
result = {"artifact": "F-5.3B diagnostic: historical F/B/H residual semantics recovered by E2 (old ids not required)", "F": summary("F"), "B": summary("B"), "H": summary("H"), "rows": rows}
json.dump(result, open(out_path, "w"), indent=1)
print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "notRecovered"} for k, v in result.items() if k in ("F", "B", "H")}, indent=1))
