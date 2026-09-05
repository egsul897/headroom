#!/usr/bin/env python3
"""
F-5.1 (Phase 3 Chewy remediation 5) - deterministic ROLE CONFUSION MATRIX over two Pass A inventories of the same
frozen source (default: the paid certification pair). Zero model calls.

  python3 scripts/f5-1-role-confusion.py <pair.json> <out.json>

Alignment (strongest source-semantic evidence first):
  L1 identical slot + identical span                                   (the certification's 298 pairs)
  L2 identical slot + mutual span overlap >= 50% of the longer span + identical normalized value signature
Each aligned pair records roleA -> roleB plus: proposition token jaccard, value-signature equality, referenced
sections/terms equality, span lengths, excerpt. Same-role pairs are counted as agreements; different-role pairs are
the confusion matrix. Nothing here changes production.
"""
import json, re, sys
from collections import Counter, defaultdict

src = json.load(open(sys.argv[1]))
run1, run2 = src["run1"], src["run2"]
text = src["regionText"]
MATERIAL = ("CRITICAL", "MATERIAL")

def tok(s): return set(re.findall(r"[a-z0-9]+", (s or "").lower())) - {"the", "of", "and", "or", "a", "an", "to", "in", "any", "is", "for", "that", "with", "by", "on", "as", "be", "such", "this", "its"}
def jacc(a, b): return len(a & b) / max(1, len(a | b))
def vsig(i): return "|".join(sorted(f"{v['kind']}:{v['normalizedValue'] if v['normalizedValue'] is not None else v['rawText'].strip().lower()}" for v in i["quantitativeValues"]))
def rec(i): return {"id": i["inventoryItemId"], "slot": i.get("slotId"), "s": i["sourceSpan"]["charStart"], "e": i["sourceSpan"]["charEnd"], "role": i["semanticRole"], "mat": i["materiality"], "prop": i["proposition"], "vsig": vsig(i), "secs": sorted(i["referencedSections"]), "terms": sorted(i["referencedTerms"]), "parent": i.get("parentItemId")}
A = [rec(i) for i in run1["items"] if i["sourceSpan"]["regionId"] == "operative"]
B = [rec(i) for i in run2["items"] if i["sourceSpan"]["regionId"] == "operative"]

pairs, usedA, usedB = [], set(), set()
# L1
byKeyB = defaultdict(list)
for b in B: byKeyB[(b["slot"], b["s"], b["e"])].append(b)
for a in A:
    for b in byKeyB.get((a["slot"], a["s"], a["e"]), []):
        if b["id"] in usedB: continue
        pairs.append(("L1_IDENTICAL_SLOT_SPAN", a, b)); usedA.add(a["id"]); usedB.add(b["id"]); break
# L2
def mutual(a, b):
    ov = max(0, min(a["e"], b["e"]) - max(a["s"], b["s"]))
    return ov / max(1, max(a["e"] - a["s"], b["e"] - b["s"]))
for a in A:
    if a["id"] in usedA: continue
    best = None
    for b in B:
        if b["id"] in usedB or b["slot"] != a["slot"] or b["vsig"] != a["vsig"]: continue
        m = mutual(a, b)
        if m >= 0.5 and (best is None or m > best[0]): best = (m, b)
    if best:
        pairs.append(("L2_SLOT_OVERLAP_VALUES", a, best[1])); usedA.add(a["id"]); usedB.add(best[1]["id"])

rows, ordered, unordered, agree = [], Counter(), Counter(), Counter()
for level, a, b in pairs:
    same = a["role"] == b["role"]
    (agree if same else ordered)[(a["role"], b["role"])] += 1
    if not same: unordered[tuple(sorted((a["role"], b["role"])))] += 1
    rows.append({"level": level, "slot": a["slot"], "span": [a["s"], a["e"]], "spanB": [b["s"], b["e"]], "roleA": a["role"], "roleB": b["role"], "sameRole": same, "matA": a["mat"], "matB": b["mat"], "propJaccard": round(jacc(tok(a["prop"]), tok(b["prop"])), 2), "valuesEqual": a["vsig"] == b["vsig"], "vsig": a["vsig"], "sectionsEqual": a["secs"] == b["secs"], "termsEqual": a["terms"] == b["terms"], "parentBothSet": bool(a["parent"]) and bool(b["parent"]), "excerpt": text[a["s"]:a["e"]][:200], "propA": a["prop"][:220], "propB": b["prop"][:220], "idA": a["id"], "idB": b["id"]})

conf = [r for r in rows if not r["sameRole"]]
def roleset(r): return {r["roleA"], r["roleB"]}
out = {
    "artifact": "F-5.1 role confusion matrix over two Pass A inventories of frozen Chewy 6.08 (certification pair)",
    "itemsA": len(A), "itemsB": len(B), "alignedPairs": len(pairs), "byLevel": Counter(l for l, _, _ in pairs),
    "sameRolePairs": len(pairs) - len(conf), "roleConflictPairs": len(conf),
    "roleConflictRate": round(len(conf) / max(1, len(pairs)), 4),
    "conflictsByLevel": Counter(r["level"] for r in conf),
    "conflictsMaterial": sum(1 for r in conf if r["matA"] in MATERIAL or r["matB"] in MATERIAL),
    "conflictsWithEqualValues": sum(1 for r in conf if r["valuesEqual"]),
    "conflictsWithValues": sum(1 for r in conf if r["vsig"]),
    "conflictsPropJaccardGte05": sum(1 for r in conf if r["propJaccard"] >= 0.5),
    "conflictsSectionsAndTermsEqual": sum(1 for r in conf if r["sectionsEqual"] and r["termsEqual"]),
    "orderedMatrix": {f"{a}->{b}": n for (a, b), n in ordered.most_common()},
    "unorderedMatrix": {f"{a}<->{b}": n for (a, b), n in unordered.most_common()},
    "agreementByRole": {a: n for (a, _), n in agree.most_common()},
    "roleMarginalsA": Counter(a["role"] for a in A), "roleMarginalsB": Counter(b["role"] for b in B),
    "perRoleConflictShare": {},
    "investigatedPairs": {},
    "rows": rows,
}
for role in sorted(set(out["roleMarginalsA"]) | set(out["roleMarginalsB"])):
    inv = sum(1 for r in rows if role in roleset(r)); c = sum(1 for r in conf if role in roleset(r))
    out["perRoleConflictShare"][role] = {"alignedPairsInvolving": inv, "conflicts": c, "conflictShare": round(c / inv, 3) if inv else None}
for name, (x, y) in {"VALUE<->FORMULA_COMPONENT": ("VALUE", "FORMULA_COMPONENT"), "VALUE<->THRESHOLD": ("VALUE", "THRESHOLD"), "FORMULA_COMPONENT<->ALTERNATIVE": ("FORMULA_COMPONENT", "ALTERNATIVE"), "THRESHOLD<->CONDITION": ("THRESHOLD", "CONDITION"), "CONDITION<->TRIGGER": ("CONDITION", "TRIGGER"), "REFERENCE<->DEPENDENCY": ("REFERENCE", "DEPENDENCY"), "PERMISSION<->EXCEPTION": ("PERMISSION", "EXCEPTION"), "SHARED_CAP<->FORMULA_COMPONENT": ("SHARED_CAP", "FORMULA_COMPONENT")}.items():
    out["investigatedPairs"][name] = unordered.get(tuple(sorted((x, y))), 0)
out["investigatedPairs"]["OTHER<->substantive"] = sum(n for (a, b), n in unordered.items() if "OTHER" in (a, b))
json.dump(out, open(sys.argv[2], "w"), indent=1, default=dict)
print(json.dumps({k: v for k, v in out.items() if k not in ("rows", "agreementByRole")}, indent=1, default=dict))
