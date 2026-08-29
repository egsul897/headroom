import json

sealed = json.load(open("docs/evaluation-v2-iteration-2/_frozen-sample-labels-v2-SEALED.json"))["labels"]
reviewer = json.load(open("docs/evaluation-v2-iteration-2/_second-pass-adjudication-v2-RAW.json"))

sealed_by_id = {l["gtUnitId"]: l for l in sealed}
reviewer_by_id = {r["gtUnitId"]: r for r in reviewer}

assert set(sealed_by_id.keys()) == set(reviewer_by_id.keys()), (
    set(sealed_by_id.keys()) ^ set(reviewer_by_id.keys())
)

REVIEWER_TO_TAXONOMY = {
    "VERIFIED_OR_UNVERIFIED_REPRESENTATION": "VERIFIED_SEMANTIC_REPRESENTATION",
    "PARTIAL_REPRESENTATION": "PARTIAL_SEMANTIC_REPRESENTATION",
    "HONESTLY_UNRESOLVED": "HONESTLY_UNRESOLVED",
    "REVIEW_REQUIRED_FLAG_ONLY": "DISCOVERED_REVIEW_REQUIRED",
    "DISCOVERY_ONLY_NOT_REPRESENTED": "DISCOVERED_ONLY",
    "CONTRADICTORY": "CONTRADICTORY_REPRESENTATION",
    "AMBIGUOUS": "AMBIGUOUS",
    "UNSUPPORTED_SILENT": "HONESTLY_UNSUPPORTED",
    "GT_NOT_RESOLVABLE": "INCOMPARABLE",
}

CREDIT_STATES = {"VERIFIED_SEMANTIC_REPRESENTATION", "PARTIAL_SEMANTIC_REPRESENTATION"}
CREDIT_STATES_STRICT = {"VERIFIED_SEMANTIC_REPRESENTATION"}
EXCLUDED_STATES = {"INCOMPARABLE"}


def binary_bucket(state, strict=False):
    if state in EXCLUDED_STATES:
        return "EXCLUDED"
    credit_set = CREDIT_STATES_STRICT if strict else CREDIT_STATES
    return "CREDIT" if state in credit_set else "NO_CREDIT"


rows = []
for gt_id, s in sealed_by_id.items():
    r = reviewer_by_id[gt_id]
    v2_state = s["v2StateTaxonomyMapping"]
    reviewer_raw = r["overallDisposition"]
    reviewer_state = REVIEWER_TO_TAXONOMY.get(reviewer_raw, "UNMAPPED")
    rows.append(
        {
            "gtUnitId": gt_id,
            "v2MatchStatus": s["v2MatchStatus"],
            "v2State": v2_state,
            "reviewerRaw": reviewer_raw,
            "reviewerState": reviewer_state,
            "v2Bucket": binary_bucket(v2_state),
            "reviewerBucket": binary_bucket(reviewer_state),
            "v2BucketStrict": binary_bucket(v2_state, strict=True),
            "reviewerBucketStrict": binary_bucket(reviewer_state, strict=True),
            "detailedAgree": v2_state == reviewer_state,
        }
    )

# Binary agreement (inclusive: PARTIAL counts as credit)
included = [r for r in rows if r["v2Bucket"] != "EXCLUDED" and r["reviewerBucket"] != "EXCLUDED"]
excluded = [r for r in rows if r["v2Bucket"] == "EXCLUDED" or r["reviewerBucket"] == "EXCLUDED"]
binary_agree = [r for r in included if r["v2Bucket"] == r["reviewerBucket"]]
binary_disagree = [r for r in included if r["v2Bucket"] != r["reviewerBucket"]]

# Binary agreement (strict: only VERIFIED counts as credit)
included_strict = [r for r in rows if r["v2BucketStrict"] != "EXCLUDED" and r["reviewerBucketStrict"] != "EXCLUDED"]
binary_agree_strict = [r for r in included_strict if r["v2BucketStrict"] == r["reviewerBucketStrict"]]

# Detailed agreement (same population as binary-inclusive: excluded cases removed from both num/denom)
detailed_agree = [r for r in included if r["detailedAgree"]]
detailed_disagree = [r for r in included if not r["detailedAgree"]]

print("TOTAL CASES:", len(rows))
print("EXCLUDED (either side INCOMPARABLE):", len(excluded))
for r in excluded:
    print("  ", r["gtUnitId"], "v2:", r["v2State"], "reviewer:", r["reviewerState"])
print()
print("BINARY (inclusive) — n =", len(included))
print("  agree:", len(binary_agree), "/ ", len(included), "=", round(len(binary_agree) / len(included), 4) if included else None)
print("BINARY (strict, VERIFIED-only credit) — n =", len(included_strict))
print("  agree:", len(binary_agree_strict), "/", len(included_strict), "=", round(len(binary_agree_strict) / len(included_strict), 4) if included_strict else None)
print()
print("DETAILED — n =", len(included))
print("  agree:", len(detailed_agree), "/", len(included), "=", round(len(detailed_agree) / len(included), 4) if included else None)
print()

print("=== Confusion matrix (binary inclusive) ===")
from collections import Counter
cm = Counter((r["v2Bucket"], r["reviewerBucket"]) for r in included)
for k, v in sorted(cm.items()):
    print(" ", k, v)
print()

print("=== Binary disagreements ===")
for r in binary_disagree:
    print(" ", r["gtUnitId"], "| v2:", r["v2MatchStatus"], "->", r["v2State"], "(", r["v2Bucket"], ") | reviewer:", r["reviewerRaw"], "->", r["reviewerState"], "(", r["reviewerBucket"], ")")
print()

print("=== Detailed disagreement taxonomy (state pairs) ===")
dt = Counter((r["v2State"], r["reviewerState"]) for r in detailed_disagree)
for k, v in sorted(dt.items(), key=lambda x: -x[1]):
    print(" ", k, v)

json.dump(rows, open("docs/evaluation-v2-iteration-2/_agreement-rows.json", "w"), indent=2)
