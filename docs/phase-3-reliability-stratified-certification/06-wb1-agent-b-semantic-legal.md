# P3-WB1 Agent B — semantic/legal discovery (Chewy WITH_BUILDERS)

**Status:** DISCOVER ONLY. Pin **HOLD** remains. Not `PINNED_OFFLINE`. Not CERTIFIED.  
**Tip:** `3f1182511758c85ffc92023b06a46114820e69fe`  
**Sealed id:** `discovery-candidate:f62db8ebcda9d35c4fc03b2a`  
**Soft gate.** Invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**  
This pass did not read another agent's conclusions. No production code. No new `discoveryId`. No pin folder.

Measurement used the existing offline loader (`loadPackage` / `buildCandidateCompilerInput` / `pinCandidate`) on the sealed Chewy text. Zero providers. Probe packets were written under `/tmp` and are not pin artifacts.

---

## Seed, restated from the sealed package

| Field | Measured value |
|---|---|
| Section | `6.01(b)(4)(a)(i)` |
| Role | `BUILDER` (sealed). Cross-cut `WITH_BUILDERS` is from that role, not from the words builder or grower in the window. |
| Stratum | `DEBT` (`INDEBTEDNESS`) |
| Identity | UNIQUE. One discovery occurrence. One rebuilt structural node. Assertions true. |
| Operative window | 285 chars. sha256 `2c7edf653f9978a67b5a11a66ef6748144640adb082d0461932243499fa45a8d` |
| Review | `AUTO_ACCEPTED`. `multipleRulesLikely` false. |
| Eligibility | `eligible:false`. Sole blocker `UNRESOLVED_OPERATIVE_EVIDENCE`. |
| Other cross-cuts | `WITHOUT_SHARED_CAPS`, `WITHOUT_RECLASSIFICATION` |

Operative text:

> (i) the greater of (x) $360.0 million and (y) 50% of Consolidated EBITDA for the most recently ended Test Period, calculated on a Pro Forma Basis (for the avoidance of doubt, Unsecured Capitalized Leases shall be permitted in an unlimited amount pursuant to Section 6.01(b)(28)), plus

That sentence is a point-in-time greater-of cap component inside the purchase-money / capex indebtedness permission at §6.01(b)(4)(a). It is not a cumulative restricted-payment builder.

The agreement uses the phrase "Consolidated EBITDA grower corresponding to any fixed dollar basket" inside the three-name Pro Forma Basis sentence (definitions). That phrase is not in this 285-character window. The window does match that shape: a fixed dollar amount and a percentage of Consolidated EBITDA.

---

## A. What builder operative evidence does this sealed id contain?

The operative evidence of **this** id is the greater-of component above, plus the cross-reference to §6.01(b)(28) for unsecured capitalized leases.

Direct defined terms the sentence actually uses, and what the definition index does with them:

| Term in the sentence | Index | Full-text chars | Trust when retrieved alone |
|---|---|---|---|
| Consolidated EBITDA | UNIQUE `MEANS` | 20,175 | `CURRENT` |
| Test Period | UNIQUE `MEANS` | 581 | `CURRENT` |
| Unsecured Capitalized Leases | UNIQUE `MEANS` | 98 | `CURRENT` |
| Pro Forma Basis | **NOT_FOUND** | — | not retrieved |

Pro Forma Basis is defined. The sealed sentence is: `"Pro Forma Basis," "Pro Forma Compliance" and "Pro Forma Effect" means, ...` The single-term declaration grammar does not record a three-name `means` sentence, so the index returns `NOT_FOUND`. That is an index miss. It is not a finding that the credit agreement leaves the term undefined.

Two shorter defined terms also match inside longer terms in this neighborhood:

1. `Capitalized Leases` matches inside `Unsecured Capitalized Leases`. `Capitalized Leases` means leases recorded as leases under GAAP "of such Person and its Restricted Subsidiaries" (190 chars, UNIQUE, `CURRENT`).
2. `Restricted` matches inside `Restricted Subsidiaries`. `Restricted` means restricted cash and cash equivalents (1,167 chars, UNIQUE, `CURRENT`). It does not mean Restricted Subsidiary.

The default 40,000-character bundle follows those two collisions and never stores Consolidated EBITDA, Test Period, or Unsecured Capitalized Leases. See D.

Available Amount is not this candidate's operative evidence. The 285-character window does not use it. It is a forwarding definition (`has the meaning assigned ... in Section 6.08(a)(3)`, 83 chars). It appears in a text-unbounded depth-8 expansion of this seed at depth 6, as a transitive mention, not as the cap formula. This report does not treat that mention as the builder.

---

## B. Recursive definitions — the chain that was asked, and the chain that fired

### What the definitions say

Five normalized terms in this agreement have two physical declarations: `benchmark`, `information`, `nyfrb rate`, `subsidiary`, `uniform commercial code`. Only the last two, plus `benchmark` on an unbounded walk, enter this seed.

**Subsidiary is a real pair, not a duplicate paste.**

- `"subsidiary"` means, with respect to any Person, the voting / capital-account / consolidation tests (clauses (1)–(4)). Clauses (2)(y) and (3) also say "any Restricted Subsidiary of such Person."
- `"Subsidiary"` means any subsidiary of the Borrowers.
- A following sentence says references to subsidiaries are to a subsidiary of the Borrowers unless context requires otherwise.
- Normalization collapses the two spellings. `resolveUniqueDefinitionByRef` returns `AMBIGUOUS` (2). Neither declaration is nested.

**Restricted Subsidiary does not run through Person or Affiliate.**

> "Restricted Subsidiary" means, at any time, any direct or indirect Subsidiary of the Initial Borrower (including any Foreign Subsidiary) that is not then an Unrestricted Subsidiary...

382 chars. UNIQUE. `CURRENT` when retrieved. It uses Subsidiary, Foreign Subsidiary, Initial Borrower, and Unrestricted Subsidiary. It does not use Person or Affiliate.

**Person** is UNIQUE (174 chars): any natural person, corporation, limited liability company, trust, joint venture, association, company, partnership, Governmental Authority or other entity. The retrieval denylist skips `person`, so the walker does not open it. Person does not mention Affiliate.

**Affiliate** is UNIQUE (316 chars): with respect to a specified Person, another Person that Controls, is Controlled by, or is under common Control. It is a sibling use of Person, not the next hop after Restricted Subsidiary.

So the arrow Subsidiary → Restricted Subsidiary → Person → Affiliate is not the definitional direction.

- Capital-S Subsidiary points at lowercase subsidiary, which points at Person and, in two clauses, back at Restricted Subsidiary.
- Restricted Subsidiary points at Subsidiary.
- Affiliate points at Person and Control. It is not downstream of Restricted Subsidiary.
- The default bundle's recorded cycles are `Cash Equivalents` and `Restricted` (the cash term) and `Collateral`. They are not a Subsidiary / Person / Affiliate cycle.

**Uniform Commercial Code** is one proviso, counted as two declarations. Both hits are `nested: true`. The second is the non-New York "shall mean" restatement inside the first sentence (`"UCC" or "Uniform Commercial Code" shall mean ... provided ... the term "UCC" or "Uniform Commercial Code" shall mean ...`). The uniqueness function counts both. Status `AMBIGUOUS`. 777 chars on the first-match span the bundle stored.

### What the default bundle actually walked

Eligibility's two non-current items, and the only path that reaches them under the default budget:

```
6.01(b)(4)(a)(i)
  └─ Capitalized Leases          [shorter-term hit inside "Unsecured Capitalized Leases"]
       └─ Restricted             [shorter-term hit inside "Restricted Subsidiaries"; this is restricted cash]
            ├─ Cash Equivalents
            │    └─ Foreign Subsidiary
            │         └─ Subsidiary                 depth 5  AMBIGUOUS_TARGET
            ├─ Indebtedness
            │    └─ Restricted Subsidiary           depth 5  CURRENT  (not expanded; depth bound)
            └─ Collateral
                 └─ Excluded Assets
                      └─ Uniform Commercial Code    depth 5  AMBIGUOUS_TARGET
```

`Restricted Subsidiary` is in that bundle and is `CURRENT`. Its own mention of Subsidiary is withheld at depth 6. The ambiguous Subsidiary item arrives from Foreign Subsidiary, not from an unresolved Restricted Subsidiary row.

Person is absent. Affiliate is absent from the default bundle. On a text-unbounded depth-8 walk, Affiliate is present at depth 8 and Person is still absent. Available Amount's 83-character forwarding stub is present at depth 6 on that same unbounded walk and is `CURRENT`. That does not make Available Amount the seed's formula.

The default walk also records 7 `DEFINITION_CYCLE` stops (Cash Equivalents, Restricted, Collateral), one ambiguous relative reference (§6.02), and 22 `REFERENCED_DOCUMENT_ABSENT` leads (ABL credit agreement, intercreditor, collateral agreement, and similar). Those are inside the collision subtree. They are not eligibility blockers. Sufficiency is `BUDGET_EXCEEDED`, which outranks them.

---

## C. Superior sealed discovery candidate?

**None for this cell.** No narrower `discoveryId` is minted here.

Sealed Chewy discovery has 839 candidates and 15 with role `BUILDER`. The UNIQUE `BUILDER` rows were probed with the same offline emitter.

| Sealed id | Ref | Role | Identity | Chars | `eligible` | Why it is not a superior substitute |
|---|---|---|---|---|---|---|
| `f62db8ebcda9d35c4fc03b2a` | 6.01(b)(4)(a)(i) | BUILDER | UNIQUE | 285 | **false** | The seed. Greater-of EBITDA component. |
| `dbe8ccb162675149aa57bb9c` | 6.01(b)(4)(a)(ii) | BUILDER | UNIQUE | 670 | false | Ratio limb of the same cap. Same blocker class (`Subsidiary`). |
| `2c1735467ea794634bebb82c` | 6.01(b)(4)(a)(iii) | BUILDER | UNIQUE | 339 | false | Effective-date capitalized-lease limb. `Subsidiary` and `Uniform Commercial Code`. |
| `f1296db754e8e58b2df1b98c` | 1.08(i) | BUILDER | UNIQUE | 266 | false | Return-of-capital capacity increase. Same two ambiguous terms. `NEEDS_REVIEW`. |
| `265838c9b0256ab7fe2e21c6` | 1.08(d) | BUILDER | UNIQUE | 2,219 | false | Pro forma synergy add-back. `Subsidiary`. `NEEDS_REVIEW`. `multipleRulesLikely`. |
| `ac3033fd2611599aad30c670` | 1.08(j) | BUILDER | UNIQUE | 550 | **true** | Annual carry-forward / carry-back of any period metric. Not this grower. See below. |
| `0fa404221f4a6ea4bce4d6ca` | 2.16(b) | BUILDER | UNIQUE | 590 | **true** | Application-of-payments waterfall. The role label is not the text. See below. |
| `6ffcfd3794d39597caa7b83b` | 6.08 | BUILDER | **AMBIGUOUS** | 38,529 | not identity-pass | 17 discovery rows share `6.08`; 2 structural nodes. Description mentions the Available Amount CNI / excess-cash-flow limb. The served window is the whole section. |
| `f7c9604ae98f540743e18dac` | 6.08 | BUILDER | AMBIGUOUS | 38,529 | not identity-pass | Same ambiguous ref. |
| `4e9e2c9c4daf1e3b1f69c3f9` | 6.08 | BUILDER | AMBIGUOUS | 38,529 | not identity-pass | Same ambiguous ref. |
| `f261eb5d1a744c816f2c5aaa` | 6.01(b)(4)(a) | BASKET | UNIQUE | 898 | **true** | Parent chapeau. Emitter cross-cut is `WITHOUT_BUILDERS`. `multipleRulesLikely`. Sufficiency `BUDGET_EXCEEDED`. Not this cross-cut. |
| `c7cae40c3925d889a79765eb` | 6.08(a) | GENERAL_PROHIBITION | UNIQUE | 10,947 | false | Restricted-payment chapeau. Not role `BUILDER`. |
| `2aaad3b7822b5d7bbcd18822` | 6.08(a)(iv) | GENERAL_PROHIBITION | UNIQUE | 516 | false | Restricted-investment lead-in. Not role `BUILDER`. |

`1.08(j)` and `2.16(b)` are `eligible:true` under the current predicate (empty blocker list, identity true, no interim-B hit, `hasUnresolvedOperativeEvidence` false). They are not superior:

- `1.08(j)` sufficiency is `REVIEW_REQUIRED` (ambiguous article and section refs, and related-document leads, reached by retrieval; the 550-character sentence itself is the carry-forward rule). Discovery `NEEDS_REVIEW`. `multipleRulesLikely` true, disclosed and not an eligibility blocker. Pinning it would not be a certification of the §6.01(b)(4)(a)(i) grower, and this report does not pin it.
- `2.16(b)` sufficiency is `BUDGET_EXCEEDED`. The operative text applies insufficient funds to interest and fees, then principal. `WITH_BUILDERS` would be the sealed role alone. That is not builder or grower evidence. Discovery review `UNCERTAIN`. Stratum `OTHER`. Not a pin.

The large `1.01` / `6.01` / `6.08` `BUILDER` rows fail single-occurrence identity. They are not modest unique spans.

Available Amount, stated once and not promoted: the forwarding target `6.08(a)(3)` resolves as a UNIQUE structural node on the **rebuilt** index used by the offline loader (own text 544 chars; descendants 7,988). The frozen discovery population has **no** candidate with `normalizedSourceRef` `6.08(a)(3)` and **no** sealed candidate whose `structuralNodeIds` include that rebuilt node. This report does not invent a `discoveryId` for it. The sealed `BUILDER` rows that describe Available Amount components remain the ambiguous `6.08` ids above.

---

## D. Minimal bundle, full bundle, context-budget solution

Default budget, from `DEFAULT_RETRIEVAL_BUDGET`: definition depth 5, cross-reference depth 3, 60 items, 40,000 characters. Retrieval is depth-first in definition-index order. The first mention expanded is `Capitalized Leases`. Its subtree consumes the character cap. The clause's own metric is never added.

| Bundle | Items | Chars | Sufficiency | `hasUnresolvedOperativeEvidence` | What is present |
|---|---|---|---|---|---|
| Default (the eligibility bundle) | 53 | 39,996 | `BUDGET_EXCEEDED` | **true** — Subsidiary and Uniform Commercial Code, both depth 5 | Collision subtree. **No** Consolidated EBITDA, Test Period, or Unsecured Capitalized Leases. |
| Depth 1, same 40,000-char cap | 13 | 26,707 | `BUDGET_EXCEEDED` (depth; dependents withheld) | false | Operative text, parent scopes, siblings (ii) and (iii), §6.01(b)(28), Capitalized Leases, **Consolidated EBITDA**, Test Period, Unsecured Capitalized Leases. All `CURRENT`. |
| Depth 2, same cap | 24 | 38,514 | `BUDGET_EXCEEDED` (depth and characters) | false | Depth-1 set plus part of the next layer, including Consolidated Net Income (11,403, `CURRENT`). Character cap withholds the rest. Still no ambiguous term. |
| Text cap removed, depth 8, 400 items | 149 | 161,411 | `BUDGET_EXCEEDED` (depth 8 and cross-reference depth 3) | **true** — Subsidiary depth 5, Uniform Commercial Code depth 6, Benchmark depth 8 | Metric is present. Ambiguity remains. Person still absent. Affiliate at depth 8. Available Amount forwarding stub at depth 6. |

Stop reasons on the default bundle:

- `CONTEXT_BUDGET_EXCEEDED: maxDefinitionDepth (5)` with real withholdings (depth-6 mentions include Capital Stock, Initial Borrower, Restricted Subsidiary, Uniform Commercial Code, and others).
- `CONTEXT_BUDGET_EXCEEDED: maxTextBudgetChars`.
- `CONTEXT_BUDGET_EXCEEDED: maxCrossReferenceDepth (3)`, including a stop at separately owned §6.01(b)(28).

### What a budget change does not do

Raising the character cap does not make Subsidiary or Uniform Commercial Code unique. The unbounded run is larger and still unresolved, and it adds Benchmark. Those three statuses are two-declaration collisions. No character limit collapses them.

Cutting depth to 1 removes the two eligibility items because they sit at depth 5, and it does store the metric. Sufficiency stays `BUDGET_EXCEEDED` because Consolidated EBITDA's own dependents, including Consolidated Net Income, are withheld. The eligibility predicate looks only at non-current evidence items. It does not look at sufficiency. A depth cut would change the predicate's boolean without making the grower fully retrieved. That is not a certification, and this report does not authorize the cut.

### Solution the measurement supports

Keep the seed `eligible:false` / pin HOLD.

The minimal honest set for **this sentence** is the 285-character window plus the direct UNIQUE definitions it uses (Consolidated EBITDA, Test Period, Unsecured Capitalized Leases) and the §6.01(b)(28) cross-reference, with two disclosures that are not absence claims:

1. `Capitalized Leases` and `Restricted` are shorter-term matches. They are real definitions. They are not the terms the sentence is using.
2. Pro Forma Basis is defined by a three-name sentence the index does not record.

The full default bundle is a different graph: restricted-cash and excluded-assets definitions reached through those shorter-term matches. That graph is what makes eligibility fail. It is also the graph that omits the EBITDA definition the percentage is taken from.

A later invent-safe change would have to separate those two facts. Spending more characters does not resolve the two-declaration terms. Omitting depth-5 terms does not complete the EBITDA definition. Neither observation is a pin, a code change, or a `CERTIFIED` claim.

---

## Dependency graph (default eligibility bundle, definition edges only)

```
OPERATIVE 6.01(b)(4)(a)(i)
└─ DEFINITION Capitalized Leases
   └─ Restricted                         [cash]
      ├─ Cash Equivalents
      │   ├─ Agreement, Approved Bank, Investment Grade Rating, Preferred Stock
      │   ├─ Foreign Subsidiary → Subsidiary          AMBIGUOUS_TARGET
      │   ├─ Indebtedness
      │   │   ├─ Restricted Subsidiary                CURRENT, not expanded
      │   │   ├─ Unrestricted Subsidiary, Qualified Restricted Subsidiary
      │   │   ├─ Lien, Obligations, Swap, Transactions, Parent Entity, Effective Date
      │   │   └─ Subsidiary                           (also from this text; already stored)
      │   └─ Investments
      │       └─ Capital Stock, Equity Interests, Initial Borrower, Restricted Parties
      └─ Collateral
          └─ Excluded Assets
              ├─ Uniform Commercial Code              AMBIGUOUS_TARGET
              ├─ CFC, FSHCO, Receivables Assets, Receivables Subsidiary, Vehicles
              └─ Secured Obligations, Security Documents, Lenders
```

Not on this graph: Consolidated EBITDA, Test Period, Unsecured Capitalized Leases, Pro Forma Basis, Person, Affiliate, Available Amount.

---

## Hold

- Do not coerce `eligible:true` on `discovery-candidate:f62db8ebcda9d35c4fc03b2a`.
- Do not pin `1.08(j)` or `2.16(b)` from this report. Predicate-true is not sufficiency, and neither window is this grower.
- Do not invent a `discoveryId` for `6.08(a)(3)` or any narrower Available Amount limb.
- Do not describe Available Amount as the operative evidence of the sealed id.
- Soft gate only. No live or paid run. IMPLEMENTED ≠ CERTIFIED.
