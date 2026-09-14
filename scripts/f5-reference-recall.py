#!/usr/bin/env python3
"""
F-5 quality guard: scores a Pass A inventory of Chewy §6.08 against the FROZEN human reference subset for 6.08
(docs/phase-3-validation/04-human-reference-set.json, never edited, never shown to the model). Zero model calls.
  python3 scripts/f5-reference-recall.py <inventory.json or pair.json> <out.json>
Recall definitions (the frozen scorer's mechanics): a reference item is DISCOVERED when any inventory item's absolute
span overlaps its span by >= min(40, item length); critical/material recall restricts to CRITICAL/MATERIAL inventory
items over CRITICAL/MATERIAL reference items; quantitative recall = fraction of the reference span's scanned values
(the frozen run's deterministic scanner output, as recorded in items+uninventoriedValues) attached to a CRITICAL/
MATERIAL item; condition/exception recall = category C items with an overlapping CONDITION/EXCEPTION item; dependency
recall = category E items with an overlapping REFERENCE/DEPENDENCY/SHARED_CAP item (N/A when the subset has none).
"""
import json, re, sys
REF = "docs/phase-3-validation/04-human-reference-set.json"
UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json"
MATERIAL = ("CRITICAL", "MATERIAL")
ref = [i for i in json.load(open(REF))["items"] if i["section"].startswith("6.08")]
unit = json.load(open(UNIT)); base = unit["compile"]["sourceContext"]["regions"][0]["charStart"]
src = json.load(open(sys.argv[1]))
runs = {"run1": src["compile"]["frozenInventory"], "run2": src["inventoryRun2"]} if "compile" in src else {"run1": src["run1"], "run2": src["run2"]} if "run1" in src else {"run": src}
def ov(a, b, c, d): return max(0, min(b, d) - max(a, c))
MONEY = re.compile(r"(?:US\$|USD\s?|[$£€])\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|thousand|mm|bn))?", re.I)
PCT = re.compile(r"\d+(?:\.\d+)?\s?(?:%|percent\b|basis points?\b|bps\b)", re.I)
RATIO = re.compile(r"\d+(?:\.\d+)?\s*(?:to\s*1(?:\.0+)?\b|:\s*1(?:\.0+)?\b|x\b)", re.I)
text = unit["compile"]["sourceContext"]["regions"][0]["text"]
def scan(a, b):
    seg = text[a - base:b - base]; out = []
    for kind, rx in (("MONEY", MONEY), ("PERCENT", PCT), ("RATIO", RATIO)):
        for m in rx.finditer(seg): out.append((kind, a + m.start(), a + m.end()))
    return out
result = {"artifact": "F-5 reference recall over the frozen 6.08 human reference subset", "referenceItems": len(ref), "runs": {}}
for name, inv in runs.items():
    items = [(i, base + i["sourceSpan"]["charStart"], base + i["sourceSpan"]["charEnd"]) for i in inv["items"] if i["sourceSpan"]["regionId"] == "operative"]
    rows = []
    for it in ref:
        a, b = it["span"]; cat = it["category"][0]
        hits = [(i, s, e) for i, s, e in items if ov(a, b, s, e) >= min(40, e - s)]
        mat_hits = [h for h in hits if h[0]["materiality"] in MATERIAL]
        values = scan(a, b)
        covered = sum(1 for k, vs, ve in values if any(s <= vs and ve <= e and i["materiality"] in MATERIAL for i, s, e in items))
        rows.append({"id": it["id"], "category": cat, "materiality": it["materiality"], "section": it["section"], "discovered": bool(hits), "criticalMaterialDiscovered": bool(mat_hits), "overlappingItems": len(hits), "valuesInSpan": len(values), "valuesAttachedToMaterialItem": covered, "conditionExceptionHit": any(h[0]["semanticRole"] in ("CONDITION", "EXCEPTION") for h in mat_hits) if cat == "C" else None, "dependencyHit": any(h[0]["semanticRole"] in ("REFERENCE", "DEPENDENCY", "SHARED_CAP") for h in mat_hits) if cat == "E" else None})
    mat = [r for r in rows if r["materiality"] in MATERIAL]; c = [r for r in rows if r["category"] == "C"]; e = [r for r in rows if r["category"] == "E"]
    tv = sum(r["valuesInSpan"] for r in rows); cv = sum(r["valuesAttachedToMaterialItem"] for r in rows)
    result["runs"][name] = {"items": len(inv["items"]), "inventoryStatus": inv["inventoryStatus"], "discoveryRecall": round(sum(r["discovered"] for r in rows) / len(rows), 4), "criticalMaterialRecall": round(sum(r["criticalMaterialDiscovered"] for r in mat) / len(mat), 4) if mat else None, "quantitativeRecall": round(cv / tv, 4) if tv else None, "quantitativeValues": [cv, tv], "conditionExceptionRecall": round(sum(bool(r["conditionExceptionHit"]) for r in c) / len(c), 4) if c else None, "dependencyRecall": round(sum(bool(r["dependencyHit"]) for r in e) / len(e), 4) if e else "N/A (no category-E reference item in the 6.08 subset)", "rows": rows}
json.dump(result, open(sys.argv[2], "w"), indent=1)
print(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != "rows"} for k, v in result["runs"].items()}, indent=1))
