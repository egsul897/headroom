#!/usr/bin/env python3
"""
F-6 deterministic rescoring of the 6.08 reference items ONLY (zero model calls, frozen reference set never edited).
Re-applies the exact representationMechanical rule of scripts/phase-3-validation-chwy-score.py to the FROZEN
Pass A run-1 inventory of unit 6.08, substituting the replayed Pass C dispositions (before vs after the F-6 fix)
for the recorded ones. Does NOT issue a Phase 3 generalization verdict.
  python3 scripts/f6-rescore-608.py <replay-before.json> <replay-after.json> <out.json>
"""
import json, sys
REF = "docs/phase-3-validation/04-human-reference-set.json"
UNIT = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json"
MATERIAL = ("CRITICAL", "MATERIAL")
def ov(a, b, c, d): return max(0, min(b, d) - max(a, c))
ref = json.load(open(REF)); unit = json.load(open(UNIT)); c = unit["compile"]
regions = {r["regionId"]: r for r in c["sourceContext"]["regions"]}
def abs_span(item):
    r = regions.get(item["sourceSpan"]["regionId"])
    if not r or r["charStart"] is None or r["charStart"] < 0: return None
    return (r["charStart"] + item["sourceSpan"]["charStart"], r["charStart"] + item["sourceSpan"]["charEnd"])
inv1 = [(it, abs_span(it)) for it in c["frozenInventory"]["items"]]
recorded = {i["inventoryItemId"]: i for i in c["accountability"]["items"]}
def rep_for(disp_map, a, b):
    hits = [item for item, sp in inv1 if sp and ov(a, b, sp[0], sp[1]) >= min(40, sp[1] - sp[0])]
    disc = [{"id": it["inventoryItemId"], "materiality": it["materiality"], "disposition": disp_map[it["inventoryItemId"]]["disposition"], "valuesMissing": sum(1 for q in disp_map[it["inventoryItemId"]]["quantitative"] if q["disposition"] == "VALUE_MISSING_FROM_COMPOSITION")} for it in hits]
    if not disc: return "MISSING", disc
    mat = [d for d in disc if d["materiality"] in MATERIAL] or disc
    ds = [d["disposition"] for d in mat]
    if ds and all(d == "REPRESENTED" for d in ds) and all(d["valuesMissing"] == 0 for d in mat): return "FULL", disc
    if any(d == "REPRESENTED" for d in ds): return "PARTIAL", disc
    if any(d in ("UNSUPPORTED", "INTENTIONALLY_NON_COMPUTATIONAL") for d in ds): return "UNSUPPORTED", disc
    if any(d == "AMBIGUOUS" for d in ds): return "AMBIGUOUS", disc
    return "MISSING", disc
def load_replay(p):
    d = json.load(open(p)); return {i["inventoryItemId"]: i for i in d["accountabilityItems"]}
before = load_replay(sys.argv[1]); after = load_replay(sys.argv[2])
# sanity: the replayed BEFORE dispositions must equal the recorded ones for every item (reproduction proof)
recorded_disp = {k: {"disposition": v["disposition"], "quantitative": [{"disposition": q["disposition"]} for q in v.get("quantitative", [])]} for k, v in recorded.items()}
repro = all(before[k]["disposition"] == recorded[k]["disposition"] for k in recorded)
rows = []
for it in ref["items"]:
    if not it["section"].startswith("6.08"): continue
    a, b = it["span"]
    r_rec, _ = rep_for(recorded_disp, a, b); r_bef, d_bef = rep_for(before, a, b); r_aft, d_aft = rep_for(after, a, b)
    changed = [(x["id"], x["disposition"], y["disposition"]) for x, y in zip(d_bef, d_aft) if x["disposition"] != y["disposition"]]
    rows.append({"id": it["id"], "category": it["category"][0], "materiality": it["materiality"], "section": it["section"], "recorded": r_rec, "replayBefore": r_bef, "replayAfter": r_aft, "overlappingItems": len(d_bef), "itemsChanged": changed})
from collections import Counter
out = {"artifact": "F-6 deterministic rescoring of the frozen 6.08 reference items (measurement only, no Phase 3 verdict)", "referenceSet": REF, "referenceSetEdited": False, "replayBeforeReproducesRecordedDispositions": repro,
       "before": dict(Counter(r["replayBefore"] for r in rows)), "after": dict(Counter(r["replayAfter"] for r in rows)), "rows": rows}
json.dump(out, open(sys.argv[3], "w"), indent=2)
print(json.dumps({k: v for k, v in out.items() if k != "rows"}, indent=1))
for r in rows: print(r["id"], r["materiality"], r["section"], r["replayBefore"], "->", r["replayAfter"], len(r["itemsChanged"]), "items changed")
