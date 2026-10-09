# Mutation suite run @ 7bd5f67dcb36e95a0c9a0159c8b7a3611b5cfd82

| Mutation | Operator | Pkg | Mutant | Predicted | Held | Node ids kept | Text hashes kept | Harness checks | Product checks |
|---|---|---|---|---|---|---|---|---|---|
| MUT-01 | CHANGED_THRESHOLD | A | KILLED | KILLED | yes | 10/10 | 9/10 | 13/13 | 0/0 |
| MUT-02 | ADDED_CONDITION | A | KILLED | KILLED | yes | 8/10 | 9/10 | 11/11 | 0/0 |
| MUT-03 | REMOVED_EXCEPTION | D | KILLED | KILLED | yes | 19/19 | 18/19 | 11/11 | 0/0 |
| MUT-04 | REVISED_DEFINITION | B | KILLED | KILLED | yes | 2/8 | 7/8 | 7/7 | 0/0 |
| MUT-05 | NEW_AMENDMENT | C | KILLED | KILLED | yes | 10/10 | 10/10 | 9/9 | 4/4 |
| MUT-06 | MOVED_COVENANT | A | KILLED | KILLED | yes | 10/10 | 9/10 | 7/7 | 0/0 |
| MUT-07 | CHANGED_ENTITY_SCOPE | I | KILLED | KILLED | yes | 6/15 | 14/15 | 11/11 | 0/0 |
| MUT-08 | CONFLICTING_DOCUMENT | B | KILLED | KILLED | yes | 8/8 | 8/8 | 8/8 | 3/3 |
| MUT-09 | REORDERED_HIERARCHY | A | SURVIVED | EQUIVALENT | yes | 9/10 | 10/10 | 9/9 | 0/0 |
| MUT-10 | MISSING_REFERENCED_PROVISION | C | KILLED | KILLED | yes | 10/10 | 9/10 | 10/10 | 1/1 |
| MUT-11 | CHANGED_THRESHOLD | C | KILLED | KILLED | yes | 10/10 | 10/10 | 7/7 | 2/2 |
| MUT-12 | CONFLICTING_DOCUMENT | B | KILLED | KILLED | yes | 8/8 | 8/8 | 7/7 | 3/3 |
| MUT-13 | CONFLICTING_DOCUMENT | A | KILLED | KILLED | yes | 10/10 | 10/10 | 5/5 | 3/3 |
| MUT-14 | CONFLICTING_DOCUMENT | C | KILLED | KILLED | yes | 10/10 | 10/10 | 5/5 | 3/3 |
| MUT-15 | CONFLICTING_DOCUMENT | H | SURVIVED | GAP | yes | 15/15 | 15/15 | 5/5 | 3/3 |
| MUT-16 | CONFLICTING_DOCUMENT | I | SURVIVED | GAP | yes | 15/15 | 15/15 | 10/10 | 3/3 |
| MUT-17 | OCR_NOISE | A | KILLED | KILLED | yes | 9/10 | 9/10 | 3/3 | 1/1 |
| MUT-18 | OCR_NOISE | A | KILLED | KILLED | yes | 10/10 | 9/10 | 5/5 | 1/1 |
| MUT-19 | OCR_NOISE | A | KILLED | KILLED | yes | 10/10 | 9/10 | 5/5 | 1/1 |
| MUT-20 | OCR_NOISE | A | KILLED | KILLED | yes | 7/10 | 9/10 | 6/6 | 1/1 |
| MUT-21 | OCR_NOISE | H | KILLED | KILLED | yes | 9/15 | 14/15 | 3/3 | 1/1 |
| MUT-22 | OCR_NOISE | H | KILLED | KILLED | yes | 4/4 | 3/4 | 3/3 | 1/1 |

### MUT-01 (CHANGED_THRESHOLD, pkg-a-basic-credit-agreement)

- ✅ [HARNESS] text changes: 7.01(b) — 8c8735fd1eb77d46 → 46b9be90e8f615bf
- ✅ [HARNESS] text changes: 7.01 — 34a67ec0e7f0c2f5 → e1de3e532a1041db
- ✅ [HARNESS] text stable: 7.01(c) — b5fa55823fc96ae6 → b5fa55823fc96ae6
- ✅ [HARNESS] text stable: 7.02 — 629aaa7d62651de8 → 629aaa7d62651de8
- ✅ [HARNESS] text stable: 7.03 — 7290438c6ead703c → 7290438c6ead703c
- ✅ [HARNESS] text stable: 1.01 — 4b388c298e7aecbe → 4b388c298e7aecbe
- ✅ [HARNESS] node id survives: 7.01(b) — structural-node:31bf7e885d8c7cdeb59bf2b6 → structural-node:31bf7e885d8c7cdeb59bf2b6
- ✅ [HARNESS] node id survives: 7.01(c) — structural-node:7722a548663df77e26cd0010 → structural-node:7722a548663df77e26cd0010
- ✅ [HARNESS] node id survives: 7.02 — structural-node:4872f810a1b61d6565e525b6 → structural-node:4872f810a1b61d6565e525b6
- ✅ [HARNESS] node id survives: 7.03 — structural-node:9992ee8ba513ea6077d1b881 → structural-node:9992ee8ba513ea6077d1b881
- ✅ [HARNESS] closure contains credit-agreement#7.01 — credit-agreement#7.01, credit-agreement#7.02, credit-agreement#7.03
- ✅ [HARNESS] closure contains credit-agreement#7.02 — credit-agreement#7.01, credit-agreement#7.02, credit-agreement#7.03
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:credit-agreement#7.01(b), STRUCTURE:structure:text:A-7.01, STRUCTURE:structure:text:A-7.01(b), OPERATIVE_STATE:operative:2026-06-30:credit-agreement#7.01(b)

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:credit-agreement#7.01(b) [SOURCE_PROVENANCE_FAILURE]: own text lacks "$30,000,000"
- STRUCTURE structure:text:A-7.01 [SOURCE_PROVENANCE_FAILURE]: e1de3e532a10: the parsed clause text differs from the pinned text
- STRUCTURE structure:text:A-7.01(b) [SOURCE_PROVENANCE_FAILURE]: 46b9be90e8f6: the parsed clause text differs from the pinned text
- OPERATIVE_STATE operative:2026-06-30:credit-agreement#7.01(b) [WRONG_OPERATIVE_SOURCE]: operative text lacks "$30,000,000" (provision absent; node supersession=CURRENT_OPERATIVE)

Hybrid closure: credit-agreement#7.01, credit-agreement#7.02, credit-agreement#7.03 | unresolved: UNRESOLVED_DEFINED_TERM: Event of Default; UNRESOLVED_DEFINED_TERM: Security Documents; UNRESOLVED_DEFINED_TERM: Fundamental Changes

### MUT-02 (ADDED_CONDITION, pkg-a-basic-credit-agreement)

- ✅ [HARNESS] text changes: 7.01(c) — b5fa55823fc96ae6 → d1e21418c5c6b116
- ✅ [HARNESS] text changes: 7.01 — 34a67ec0e7f0c2f5 → 1496bb70d9d5f877
- ✅ [HARNESS] text stable: 7.01(b) — 8c8735fd1eb77d46 → 8c8735fd1eb77d46
- ✅ [HARNESS] text stable: 7.02 — 629aaa7d62651de8 → 629aaa7d62651de8
- ✅ [HARNESS] text stable: 7.03 — 7290438c6ead703c → 7290438c6ead703c
- ✅ [HARNESS] text stable: 1.01 — 4b388c298e7aecbe → 4b388c298e7aecbe
- ✅ [HARNESS] node id survives: 7.01(b) — structural-node:31bf7e885d8c7cdeb59bf2b6 → structural-node:31bf7e885d8c7cdeb59bf2b6
- ✅ [HARNESS] node id survives: 7.01(c) — structural-node:7722a548663df77e26cd0010 → structural-node:7722a548663df77e26cd0010
- ✅ [HARNESS] node id shifts (positional identity): 7.02 — structural-node:4872f810a1b61d6565e525b6 → structural-node:da6a1dd82d0ba1d05e754b16
- ✅ [HARNESS] node id shifts (positional identity): 7.03 — structural-node:9992ee8ba513ea6077d1b881 → structural-node:1d18d824aace5649b2163100
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:text:A-7.01, STRUCTURE:structure:text:A-7.01(c)

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:text:A-7.01 [SOURCE_PROVENANCE_FAILURE]: 1496bb70d9d5: the parsed clause text differs from the pinned text
- STRUCTURE structure:text:A-7.01(c) [SOURCE_PROVENANCE_FAILURE]: d1e21418c5c6: the parsed clause text differs from the pinned text

### MUT-03 (REMOVED_EXCEPTION, pkg-d-qualitative-restrictions)

- ✅ [HARNESS] text changes: 7.05 — de832a265e55f6f3 → ac5f09212418ecdb
- ✅ [HARNESS] text changes: 7.05(k) — 9aa474d4131a950a → c4a6cd33dd79e985
- ✅ [HARNESS] text stable: 7.05(j) — 7ecb7336efd7fea0 → 7ecb7336efd7fea0
- ✅ [HARNESS] text stable: 2.05 — a3d522719907353a → a3d522719907353a
- ✅ [HARNESS] text stable: 1.01 — de120535bbd00214 → de120535bbd00214
- ✅ [HARNESS] node id survives: 7.05(j) — structural-node:b7f1b49e9f44e25fc735204e → structural-node:b7f1b49e9f44e25fc735204e
- ✅ [HARNESS] node id survives: 7.05(k) — structural-node:7f17f3fd2293cf8ab19994b9 → structural-node:7f17f3fd2293cf8ab19994b9
- ✅ [HARNESS] node id survives: 2.05 — structural-node:a91707512b9e728e30400a5f → structural-node:a91707512b9e728e30400a5f
- ✅ [HARNESS] closure contains credit-agreement#7.05 — credit-agreement#7.05, credit-agreement#2.05
- ✅ [HARNESS] closure contains credit-agreement#2.05 — credit-agreement#7.05, credit-agreement#2.05
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:credit-agreement#7.05(l), STRUCTURE:structure:text:D-7.05, STRUCTURE:structure:text:D-7.05(k), DISCOVERY_PASS_A:discovery:pass-a-coverage

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:credit-agreement#7.05(l) [MISSING_REQUIRED_COVENANT]: NOT_FOUND (0 occurrence(s))
- STRUCTURE structure:text:D-7.05 [SOURCE_PROVENANCE_FAILURE]: ac5f09212418: the parsed clause text differs from the pinned text
- STRUCTURE structure:text:D-7.05(k) [SOURCE_PROVENANCE_FAILURE]: c4a6cd33dd79: the parsed clause text differs from the pinned text
- DISCOVERY_PASS_A discovery:pass-a-coverage [MISSING_REQUIRED_COVENANT]: uncovered: D-7.05(l) (no node)

Hybrid closure: credit-agreement#7.05, credit-agreement#2.05 | unresolved: UNRESOLVED_DEFINED_TERM: United States of America; UNRESOLVED_DEFINED_TERM: Event of Default; UNRESOLVED_DEFINED_TERM: Business Days

### MUT-04 (REVISED_DEFINITION, pkg-b-multi-document)

- ✅ [HARNESS] text changes: 1.01 — 6749a02fbee9aff8 → 1e05dad8d85c35f2
- ✅ [HARNESS] text stable: 7.01 — 6140ffb592960ddb → 6140ffb592960ddb
- ✅ [HARNESS] text stable: 7.02 — 629aaa7d62651de8 → 629aaa7d62651de8
- ✅ [HARNESS] node id survives: 1.01 — structural-node:33d1230e354a977ec7f10b1b → structural-node:33d1230e354a977ec7f10b1b
- ✅ [HARNESS] node id shifts (positional identity): 7.01 — structural-node:8b4d639a2a6e0014277916c2 → structural-node:8cf6f06297a285b421def617
- ✅ [HARNESS] node id shifts (positional identity): 7.02 — structural-node:0fb98d56b2f2c3adf9ee6a7f → structural-node:dcd9594ac2e789faebc7cc40
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:definition:credit-agreement#Consolidated EBITDA

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE definition:credit-agreement#Consolidated EBITDA [SOURCE_PROVENANCE_FAILURE]: definition text lacks "non-cash stock compensation expense"

### MUT-05 (NEW_AMENDMENT, pkg-c-amendment-supersession)

- ✅ [HARNESS] text stable: 7.01 — 60c1f13619be3b55 → 60c1f13619be3b55
- ✅ [HARNESS] text stable: 7.01(d) — aeb9aeff4fd96ab5 → aeb9aeff4fd96ab5
- ✅ [HARNESS] text stable: 7.02 — c2c029ea130035b1 → c2c029ea130035b1
- ✅ [HARNESS] node id survives: 7.01 — structural-node:46c093f47f3d52f1fe48def4 → structural-node:46c093f47f3d52f1fe48def4
- ✅ [HARNESS] node id survives: 7.01(d) — structural-node:2a738b7424281b41e0e9f8cb → structural-node:2a738b7424281b41e0e9f8cb
- ✅ [HARNESS] node id survives: 7.02 — structural-node:01c40a8e873b78b3602e0368 → structural-node:01c40a8e873b78b3602e0368
- ✅ [PRODUCT] operative 7.01(d)@2026-06-30 = SUPERSEDED from amendment-3 — SUPERSEDED (OPERATIVE_STATE_RESOLVED, applied 1, source amendment-3); instrument OPERATIVE_STATE_RESOLVED, unattached 0
- ✅ [PRODUCT] operative 7.01(d)@2025-12-31 = CURRENT — CURRENT (OPERATIVE_STATE_RESOLVED, applied 0, source credit-agreement); instrument OPERATIVE_STATE_RESOLVED, unattached 0
- ✅ [PRODUCT] operative 7.01(b)@2026-06-30 = SUPERSEDED from amendment-1 — SUPERSEDED (OPERATIVE_STATE_RESOLVED, applied 1, source amendment-1); instrument OPERATIVE_STATE_RESOLVED, unattached 0
- ✅ [PRODUCT] operative 7.01(e)@2026-06-30 = DELETED from amendment-2 — DELETED (OPERATIVE_STATE_RESOLVED, applied 1, source amendment-2); instrument OPERATIVE_STATE_RESOLVED, unattached 0
- ✅ [HARNESS] closure contains credit-agreement#7.01 — credit-agreement#7.01, credit-agreement#7.02, amendment-1#1, amendment-2#1, amendment-3#1, amendment-1#2, amendment-2#2, amendment-3#2
- ✅ [HARNESS] closure contains amendment-3#1 — credit-agreement#7.01, credit-agreement#7.02, amendment-1#1, amendment-2#1, amendment-3#1, amendment-1#2, amendment-2#2, amendment-3#2
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: OPERATIVE_STATE:operative:2026-06-30:credit-agreement#7.01(d)

New deterministic failures (the unchanged manifest against the mutant):
- OPERATIVE_STATE operative:2026-06-30:credit-agreement#7.01(d) [WRONG_OPERATIVE_SOURCE]: 1 effect(s) applied at 2026-06-30 although none expected; supersession status KNOWN_SUPERSEDED; operative text lacks "$5,000,000" (provision OPERATIVE_STATE_RESOLVED, applied=1, source=amendment-3; no

Hybrid closure: credit-agreement#7.01, credit-agreement#7.02, amendment-1#1, amendment-2#1, amendment-3#1, amendment-1#2, amendment-2#2, amendment-3#2 | unresolved: UNRESOLVED_DEFINED_TERM: Event of Default; UNRESOLVED_DEFINED_TERM: Security Documents; AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(b); UNRESOLVED_DEFINED_TERM: Credit Agreement; AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(e); AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(d)

### MUT-06 (MOVED_COVENANT, pkg-a-basic-credit-agreement)

- ✅ [HARNESS] text stable: 7.01 — 34a67ec0e7f0c2f5 → 34a67ec0e7f0c2f5
- ✅ [HARNESS] text stable: 7.03 — 7290438c6ead703c → 7290438c6ead703c
- ✅ [HARNESS] node id survives: 7.01 — structural-node:30229784fda7b97c12644917 → structural-node:30229784fda7b97c12644917
- ✅ [HARNESS] node id survives: 7.03 — structural-node:9992ee8ba513ea6077d1b881 → structural-node:9992ee8ba513ea6077d1b881
- ✅ [HARNESS] closure contains credit-agreement#7.04 — credit-agreement#7.04, credit-agreement#7.01
- ✅ [HARNESS] closure contains credit-agreement#7.01 — credit-agreement#7.04, credit-agreement#7.01
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:credit-agreement#7.02, DISCOVERY_PASS_A:discovery:pass-a-coverage

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:credit-agreement#7.02 [MISSING_REQUIRED_COVENANT]: NOT_FOUND (0 occurrence(s))
- DISCOVERY_PASS_A discovery:pass-a-coverage [MISSING_REQUIRED_COVENANT]: uncovered: A-7.02 (no node)

Hybrid closure: credit-agreement#7.04, credit-agreement#7.01 | unresolved: UNRESOLVED_DEFINED_TERM: Event of Default; UNRESOLVED_DEFINED_TERM: Security Documents

### MUT-07 (CHANGED_ENTITY_SCOPE, pkg-i-secured-debt-lien)

- ✅ [HARNESS] text changes: 7.01(b) — 675b1c21c49f6c69 → acedcd099a1f53e3
- ✅ [HARNESS] text changes: 7.01 — 22e05931fc5ee017 → ef292d37ed52b30c
- ✅ [HARNESS] text stable: 7.01(c) — 3896182233a77e01 → 3896182233a77e01
- ✅ [HARNESS] text stable: 7.02 — 5c2666d1d4888042 → 5c2666d1d4888042
- ✅ [HARNESS] text stable: 9.15 — decc64ffb55f61ad → decc64ffb55f61ad
- ✅ [HARNESS] text stable: 1.01 — 491c6a0721063951 → 491c6a0721063951
- ✅ [HARNESS] node id survives: 7.01(b) — structural-node:a7312e2877531aee47fb7331 → structural-node:a7312e2877531aee47fb7331
- ✅ [HARNESS] node id shifts (positional identity): 7.01(c) — structural-node:e50bd7a1fbcd38b079ed7327 → structural-node:7aa371c4c5d7e49f14654cf1
- ✅ [HARNESS] node id shifts (positional identity): 7.02 — structural-node:f0610fbb76a2d044a1d17aee → structural-node:63894c91b79d96942cbc9cfb
- ✅ [HARNESS] node id shifts (positional identity): 9.15 — structural-node:68249f897465e5d0f02ff070 → structural-node:05324d48706cedb3b851f35f
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:credit-agreement#7.01(b), STRUCTURE:structure:text:I-7.01, STRUCTURE:structure:text:I-7.01(b)

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:credit-agreement#7.01(b) [SOURCE_PROVENANCE_FAILURE]: own text lacks "Borrower and the Guarantors"
- STRUCTURE structure:text:I-7.01 [SOURCE_PROVENANCE_FAILURE]: ef292d37ed52: the parsed clause text differs from the pinned text
- STRUCTURE structure:text:I-7.01(b) [SOURCE_PROVENANCE_FAILURE]: acedcd099a1f: the parsed clause text differs from the pinned text

### MUT-08 (CONFLICTING_DOCUMENT, pkg-b-multi-document)

- ✅ [HARNESS] text stable: 7.01 — 6140ffb592960ddb → 6140ffb592960ddb
- ✅ [HARNESS] text stable: 7.01(b) — 6d0bc7a1df156e0a → 6d0bc7a1df156e0a
- ✅ [HARNESS] text stable: 7.02 — 629aaa7d62651de8 → 629aaa7d62651de8
- ✅ [HARNESS] node id survives: 7.01 — structural-node:8b4d639a2a6e0014277916c2 → structural-node:8b4d639a2a6e0014277916c2
- ✅ [HARNESS] node id survives: 7.01(b) — structural-node:a3f272bc4c79b3960177a92d → structural-node:a3f272bc4c79b3960177a92d
- ✅ [PRODUCT] operative 7.01(b)@2026-06-30 = SUPERSEDED from side-letter — SUPERSEDED (OPERATIVE_STATE_REVIEW_REQUIRED, applied 1, source side-letter); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] instrument status @2026-06-30 is not OPERATIVE_STATE_RESOLVED — SUPERSEDED (OPERATIVE_STATE_REVIEW_REQUIRED, applied 1, source side-letter); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] amendment pipeline surfaces side-letter as an effect (resolved or unresolved) — 1 effect(s) [UNKNOWN_CHANGE/REVIEW_REQUIRED→credit-agreement#7.01(b)], 0 unattached, interpreter calls 0; cross-document leads from side-letter: the Credit Agreement→credit-agreement REVIEW_REQUIRED
- ✅ [HARNESS] closure contains credit-agreement#7.01 — credit-agreement#7.01, credit-agreement#7.02, indenture#4.09, side-letter#1, supplemental-indenture-1#1, supplemental-indenture-1#2
- ✅ [HARNESS] closure contains side-letter#1 — credit-agreement#7.01, credit-agreement#7.02, indenture#4.09, side-letter#1, supplemental-indenture-1#1, supplemental-indenture-1#2
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: OPERATIVE_STATE:operative:2026-06-30:credit-agreement#7.01(b)

New deterministic failures (the unchanged manifest against the mutant):
- OPERATIVE_STATE operative:2026-06-30:credit-agreement#7.01(b) [EVIDENCE_INCOMPLETE]: 1 effect(s) applied at 2026-06-30 although none expected; provision OPERATIVE_STATE_REVIEW_REQUIRED while manifest expects CURRENT; supersession status KNOWN_SUPERSEDED; operative text lacks "$30,000,

Hybrid closure: credit-agreement#7.01, credit-agreement#7.02, indenture#4.09, side-letter#1, supplemental-indenture-1#1, supplemental-indenture-1#2 | unresolved: Section 7.01(b) from 1 → NOT_FOUND; UNRESOLVED_DEFINED_TERM: Security Documents; UNRESOLVED_DEFINED_TERM: Granite Trust Company; UNRESOLVED_DEFINED_TERM: Senior Notes; UNRESOLVED_DEFINED_TERM: Credit Agreement; UNRESOLVED_DEFINED_TERM: Issue Date; UNRESOLVED_DEFINED_TERM: Capital Lease Obligations; AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(b); AMBIGUOUS_RELATIVE_REFERENCE: Section 4.09(c); amendment side-letter: REVIEW_REQUIRED (UNCLASSIFIED_OVERRIDE: override from documentId=side-letter label="Side Letter" effectId=2f269af059e0f97699a20c8a4acc412e5331acb614d9f8c8ce87904fb217cd68 names Section 7.01(b). Its effect on that provision was not established, so the base text is not the resolved operative text.)

### MUT-09 (REORDERED_HIERARCHY, pkg-a-basic-credit-agreement)

- ✅ [HARNESS] text stable: 7.01 — 34a67ec0e7f0c2f5 → 34a67ec0e7f0c2f5
- ✅ [HARNESS] text stable: 7.02 — 629aaa7d62651de8 → 629aaa7d62651de8
- ✅ [HARNESS] text stable: 7.03 — 7290438c6ead703c → 7290438c6ead703c
- ✅ [HARNESS] text stable: 1.01 — 4b388c298e7aecbe → 4b388c298e7aecbe
- ✅ [HARNESS] node id survives: 7.01 — structural-node:30229784fda7b97c12644917 → structural-node:30229784fda7b97c12644917
- ✅ [HARNESS] node id survives: 1.01 — structural-node:0300a1239f09bf858ff7e35f → structural-node:0300a1239f09bf858ff7e35f
- ✅ [HARNESS] node id shifts (positional identity): 7.02 — structural-node:4872f810a1b61d6565e525b6 → structural-node:50ed3d6cb5f4323852d005f8
- ✅ [HARNESS] node id shifts (positional identity): 7.03 — structural-node:9992ee8ba513ea6077d1b881 → structural-node:4872f810a1b61d6565e525b6
- ✅ [HARNESS] kill prediction (EQUIVALENT) holds — SURVIVED: no new deterministic failure

### MUT-10 (MISSING_REFERENCED_PROVISION, pkg-c-amendment-supersession)

- ✅ [HARNESS] text changes: 7.02 — c2c029ea130035b1 → f533cfa9911da7bd
- ✅ [HARNESS] text stable: 7.01 — 60c1f13619be3b55 → 60c1f13619be3b55
- ✅ [HARNESS] text stable: 7.01(d) — aeb9aeff4fd96ab5 → aeb9aeff4fd96ab5
- ✅ [HARNESS] text stable: 1.01 — 418cb22ef822e4da → 418cb22ef822e4da
- ✅ [HARNESS] node id survives: 7.01 — structural-node:46c093f47f3d52f1fe48def4 → structural-node:46c093f47f3d52f1fe48def4
- ✅ [HARNESS] node id survives: 7.01(d) — structural-node:2a738b7424281b41e0e9f8cb → structural-node:2a738b7424281b41e0e9f8cb
- ✅ [HARNESS] node id survives: 7.02 — structural-node:01c40a8e873b78b3602e0368 → structural-node:01c40a8e873b78b3602e0368
- ✅ [HARNESS] closure contains credit-agreement#7.02 — credit-agreement#7.02, credit-agreement#7.01, amendment-1#1, amendment-2#1, amendment-1#2, amendment-2#2
- ✅ [HARNESS] closure contains credit-agreement#7.01 — credit-agreement#7.02, credit-agreement#7.01, amendment-1#1, amendment-2#1, amendment-1#2, amendment-2#2
- ✅ [PRODUCT] closure flags "7.01(f)" — AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(f) | UNRESOLVED_DEFINED_TERM: Event of Default | UNRESOLVED_DEFINED_TERM: Security Documents | AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(b) | UNRESOLVED_DEFINED_TERM: Credit Agreement | AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(e)
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:text:C-7.02, CONTEXT_RETRIEVAL:context:C-7.02:cross-references

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:text:C-7.02 [SOURCE_PROVENANCE_FAILURE]: f533cfa9911d: the parsed clause text differs from the pinned text
- CONTEXT_RETRIEVAL context:C-7.02:cross-references [MISSING_DEPENDENCY]: no structural reference to 7.01(d) from 7.02 and no CROSS_REFERENCE bundle item for it (refs seen: SECTION 7.02→ok, Section 7.01(f)→no SECTION node with ref "7.01(f)" exists among this document's own 

Hybrid closure: credit-agreement#7.02, credit-agreement#7.01, amendment-1#1, amendment-2#1, amendment-1#2, amendment-2#2 | unresolved: AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(f); UNRESOLVED_DEFINED_TERM: Event of Default; UNRESOLVED_DEFINED_TERM: Security Documents; AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(b); UNRESOLVED_DEFINED_TERM: Credit Agreement; AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(e)

### MUT-11 (CHANGED_THRESHOLD, pkg-c-amendment-supersession)

- ✅ [HARNESS] text stable: 7.01 — 60c1f13619be3b55 → 60c1f13619be3b55
- ✅ [HARNESS] text stable: 7.01(b) — ffdfe828e4b08dc9 → ffdfe828e4b08dc9
- ✅ [HARNESS] text stable: 7.02 — c2c029ea130035b1 → c2c029ea130035b1
- ✅ [HARNESS] node id survives: 7.01 — structural-node:46c093f47f3d52f1fe48def4 → structural-node:46c093f47f3d52f1fe48def4
- ✅ [HARNESS] node id survives: 7.01(b) — structural-node:7b44ed5adc3a7d1db6ff37c5 → structural-node:7b44ed5adc3a7d1db6ff37c5
- ✅ [HARNESS] node id survives: 7.02 — structural-node:01c40a8e873b78b3602e0368 → structural-node:01c40a8e873b78b3602e0368
- ✅ [PRODUCT] operative 7.01(b)@2025-12-31 = SUPERSEDED from amendment-1 — SUPERSEDED (OPERATIVE_STATE_RESOLVED, applied 1, source amendment-1); instrument OPERATIVE_STATE_RESOLVED, unattached 0
- ✅ [PRODUCT] operative 7.01(b)@2025-06-30 = CURRENT — CURRENT (OPERATIVE_STATE_RESOLVED, applied 0, source credit-agreement); instrument OPERATIVE_STATE_RESOLVED, unattached 0
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:amendment-1#1, OPERATIVE_STATE:operative:2025-12-31:credit-agreement#7.01(b), OPERATIVE_STATE:operative:2026-06-30:credit-agreement#7.01(b)

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:amendment-1#1 [SOURCE_PROVENANCE_FAILURE]: own text lacks "$40,000,000"
- OPERATIVE_STATE operative:2025-12-31:credit-agreement#7.01(b) [WRONG_OPERATIVE_SOURCE]: current text lacks "$40,000,000" (provision OPERATIVE_STATE_RESOLVED, applied=1, source=amendment-1; node supersession=KNOWN_SUPERSEDED)
- OPERATIVE_STATE operative:2026-06-30:credit-agreement#7.01(b) [WRONG_OPERATIVE_SOURCE]: current text lacks "$40,000,000" (provision OPERATIVE_STATE_RESOLVED, applied=1, source=amendment-1; node supersession=KNOWN_SUPERSEDED)

### MUT-12 (CONFLICTING_DOCUMENT, pkg-b-multi-document)

- ✅ [HARNESS] text stable: 7.01 — 6140ffb592960ddb → 6140ffb592960ddb
- ✅ [HARNESS] text stable: 7.01(b) — 6d0bc7a1df156e0a → 6d0bc7a1df156e0a
- ✅ [HARNESS] node id survives: 7.01 — structural-node:8b4d639a2a6e0014277916c2 → structural-node:8b4d639a2a6e0014277916c2
- ✅ [HARNESS] node id survives: 7.01(b) — structural-node:a3f272bc4c79b3960177a92d → structural-node:a3f272bc4c79b3960177a92d
- ✅ [PRODUCT] operative 7.01(b)@2026-06-30 = SUPERSEDED from side-letter — SUPERSEDED (OPERATIVE_STATE_REVIEW_REQUIRED, applied 1, source side-letter); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] instrument status @2026-06-30 is not OPERATIVE_STATE_RESOLVED — SUPERSEDED (OPERATIVE_STATE_REVIEW_REQUIRED, applied 1, source side-letter); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] amendment pipeline surfaces side-letter as an effect (resolved or unresolved) — 1 effect(s) [UNKNOWN_CHANGE/REVIEW_REQUIRED→credit-agreement#7.01(b)], 0 unattached, interpreter calls 0; cross-document leads from side-letter: the Credit Agreement→credit-agreement REVIEW_REQUIRED, the Credit Agreement→credit-agreement REVIEW_REQUIRED
- ✅ [HARNESS] closure contains credit-agreement#7.01 — credit-agreement#7.01, credit-agreement#7.02, indenture#4.09, side-letter#1, supplemental-indenture-1#1, supplemental-indenture-1#2
- ✅ [HARNESS] closure contains side-letter#1 — credit-agreement#7.01, credit-agreement#7.02, indenture#4.09, side-letter#1, supplemental-indenture-1#1, supplemental-indenture-1#2
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: OPERATIVE_STATE:operative:2026-06-30:credit-agreement#7.01(b)

New deterministic failures (the unchanged manifest against the mutant):
- OPERATIVE_STATE operative:2026-06-30:credit-agreement#7.01(b) [EVIDENCE_INCOMPLETE]: 1 effect(s) applied at 2026-06-30 although none expected; provision OPERATIVE_STATE_REVIEW_REQUIRED while manifest expects CURRENT; supersession status KNOWN_SUPERSEDED; operative text lacks "$30,000,

Hybrid closure: credit-agreement#7.01, credit-agreement#7.02, indenture#4.09, side-letter#1, supplemental-indenture-1#1, supplemental-indenture-1#2 | unresolved: Section 7.01(b) from 1 → NOT_FOUND; UNRESOLVED_DEFINED_TERM: Security Documents; UNRESOLVED_DEFINED_TERM: Granite Trust Company; UNRESOLVED_DEFINED_TERM: Senior Notes; UNRESOLVED_DEFINED_TERM: Credit Agreement; UNRESOLVED_DEFINED_TERM: Issue Date; UNRESOLVED_DEFINED_TERM: Capital Lease Obligations; AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(b); AMBIGUOUS_RELATIVE_REFERENCE: Section 4.09(c); amendment side-letter: REVIEW_REQUIRED (UNCLASSIFIED_OVERRIDE: override from documentId=side-letter label="Side Letter" effectId=2f269af059e0f97699a20c8a4acc412e5331acb614d9f8c8ce87904fb217cd68 names Section 7.01(b). Its effect on that provision was not established, so the base text is not the resolved operative text.)

### MUT-13 (CONFLICTING_DOCUMENT, pkg-a-basic-credit-agreement)

- ✅ [HARNESS] text stable: 7.01 — 34a67ec0e7f0c2f5 → 34a67ec0e7f0c2f5
- ✅ [HARNESS] text stable: 7.01(b) — 8c8735fd1eb77d46 → 8c8735fd1eb77d46
- ✅ [HARNESS] node id survives: 7.01 — structural-node:30229784fda7b97c12644917 → structural-node:30229784fda7b97c12644917
- ✅ [HARNESS] node id survives: 7.01(b) — structural-node:31bf7e885d8c7cdeb59bf2b6 → structural-node:31bf7e885d8c7cdeb59bf2b6
- ✅ [PRODUCT] operative 7.01(b)@2026-06-30 = SUPERSEDED from side-letter — SUPERSEDED (OPERATIVE_STATE_REVIEW_REQUIRED, applied 1, source side-letter); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] instrument status @2026-06-30 is not OPERATIVE_STATE_RESOLVED — SUPERSEDED (OPERATIVE_STATE_REVIEW_REQUIRED, applied 1, source side-letter); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] amendment pipeline surfaces side-letter as an effect (resolved or unresolved) — 1 effect(s) [UNKNOWN_CHANGE/REVIEW_REQUIRED→credit-agreement#7.01(b)], 0 unattached, interpreter calls 0; cross-document leads from side-letter: the Credit Agreement→credit-agreement REVIEW_REQUIRED, the Credit Agreement→credit-agreement REVIEW_REQUIRED
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: OPERATIVE_STATE:operative:2026-06-30:credit-agreement#7.01(b)

New deterministic failures (the unchanged manifest against the mutant):
- OPERATIVE_STATE operative:2026-06-30:credit-agreement#7.01(b) [EVIDENCE_INCOMPLETE]: 1 effect(s) applied at 2026-06-30 although none expected; provision OPERATIVE_STATE_REVIEW_REQUIRED while manifest expects CURRENT; supersession status KNOWN_SUPERSEDED; operative text lacks "$30,000,

### MUT-14 (CONFLICTING_DOCUMENT, pkg-c-amendment-supersession)

- ✅ [HARNESS] text stable: 7.01 — 60c1f13619be3b55 → 60c1f13619be3b55
- ✅ [HARNESS] text stable: 7.01(b) — ffdfe828e4b08dc9 → ffdfe828e4b08dc9
- ✅ [HARNESS] node id survives: 7.01 — structural-node:46c093f47f3d52f1fe48def4 → structural-node:46c093f47f3d52f1fe48def4
- ✅ [HARNESS] node id survives: 7.01(b) — structural-node:7b44ed5adc3a7d1db6ff37c5 → structural-node:7b44ed5adc3a7d1db6ff37c5
- ✅ [PRODUCT] operative 7.01(b)@2026-06-30 = SUPERSEDED from side-letter — SUPERSEDED (OPERATIVE_STATE_REVIEW_REQUIRED, applied 2, source side-letter); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] instrument status @2026-06-30 is not OPERATIVE_STATE_RESOLVED — SUPERSEDED (OPERATIVE_STATE_REVIEW_REQUIRED, applied 2, source side-letter); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] amendment pipeline surfaces side-letter as an effect (resolved or unresolved) — 1 effect(s) [UNKNOWN_CHANGE/REVIEW_REQUIRED→credit-agreement#7.01(b)], 0 unattached, interpreter calls 0; cross-document leads from side-letter: the Credit Agreement→credit-agreement REVIEW_REQUIRED
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: OPERATIVE_STATE:operative:2025-06-30:credit-agreement#7.01(b), OPERATIVE_STATE:operative:2026-06-30:credit-agreement#7.01(b)

New deterministic failures (the unchanged manifest against the mutant):
- OPERATIVE_STATE operative:2025-06-30:credit-agreement#7.01(b) [EVIDENCE_INCOMPLETE]: provision OPERATIVE_STATE_REVIEW_REQUIRED while manifest expects CURRENT (provision OPERATIVE_STATE_REVIEW_REQUIRED, applied=0, source=credit-agreement; node supersession=CURRENT_OPERATIVE)
- OPERATIVE_STATE operative:2026-06-30:credit-agreement#7.01(b) [EVIDENCE_INCOMPLETE]: current source side-letter ≠ amendment-1; current text lacks "$40,000,000" (provision OPERATIVE_STATE_REVIEW_REQUIRED, applied=2, source=side-letter; node supersession=KNOWN_SUPERSEDED)

### MUT-15 (CONFLICTING_DOCUMENT, pkg-h-unseen-composition)

- ✅ [HARNESS] text stable: 7.02 — 742b318ac35e3f43 → 742b318ac35e3f43
- ✅ [HARNESS] text stable: 7.02(d) — 8e12dc55fa97a1f4 → 8e12dc55fa97a1f4
- ✅ [HARNESS] node id survives: 7.02 — structural-node:10d2dcb6371544e8e2cc716a → structural-node:10d2dcb6371544e8e2cc716a
- ✅ [HARNESS] node id survives: 7.02(d) — structural-node:6476d0281b3e3b6f6cf04197 → structural-node:6476d0281b3e3b6f6cf04197
- ✅ [PRODUCT] operative 7.02(d)@2027-03-31 = SUPERSEDED from side-letter — SUPERSEDED (OPERATIVE_STATE_REVIEW_REQUIRED, applied 1, source side-letter); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] instrument status @2027-03-31 is not OPERATIVE_STATE_RESOLVED — SUPERSEDED (OPERATIVE_STATE_REVIEW_REQUIRED, applied 1, source side-letter); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] amendment pipeline surfaces side-letter as an effect (resolved or unresolved) — 1 effect(s) [UNKNOWN_CHANGE/REVIEW_REQUIRED→abl-credit-agreement#7.02(d)], 0 unattached, interpreter calls 0; cross-document leads from side-letter: none
- ✅ [HARNESS] kill prediction (GAP) holds — SURVIVED: no new deterministic failure

### MUT-16 (CONFLICTING_DOCUMENT, pkg-i-secured-debt-lien)

- ✅ [HARNESS] text stable: 7.02 — 5c2666d1d4888042 → 5c2666d1d4888042
- ✅ [HARNESS] text stable: 7.02(b) — cf766ed68be2eb31 → cf766ed68be2eb31
- ✅ [HARNESS] text stable: 9.15 — decc64ffb55f61ad → decc64ffb55f61ad
- ✅ [HARNESS] node id survives: 7.02 — structural-node:f0610fbb76a2d044a1d17aee → structural-node:f0610fbb76a2d044a1d17aee
- ✅ [HARNESS] node id survives: 7.02(b) — structural-node:c2adf4789ac8875281851207 → structural-node:c2adf4789ac8875281851207
- ✅ [HARNESS] node id survives: 9.15 — structural-node:68249f897465e5d0f02ff070 → structural-node:68249f897465e5d0f02ff070
- ✅ [PRODUCT] operative 7.02(b)@2026-12-31 = CURRENT — CURRENT (OPERATIVE_STATE_REVIEW_REQUIRED, applied 0, source credit-agreement); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] instrument status @2026-12-31 is not OPERATIVE_STATE_RESOLVED — CURRENT (OPERATIVE_STATE_REVIEW_REQUIRED, applied 0, source credit-agreement); instrument OPERATIVE_STATE_REVIEW_REQUIRED, unattached 0
- ✅ [PRODUCT] amendment pipeline surfaces consent as an effect (resolved or unresolved) — 2 effect(s) [UNKNOWN_CHANGE/REVIEW_REQUIRED→credit-agreement#7.02(b), UNKNOWN_CHANGE/REVIEW_REQUIRED→credit-agreement#7.01(b)], 0 unattached, interpreter calls 0; cross-document leads from consent: the Credit Agreement→credit-agreement REVIEW_REQUIRED, the Credit Agreement→credit-agreement REVIEW_REQUIRED
- ✅ [HARNESS] closure contains credit-agreement#7.02 — credit-agreement#7.02, credit-agreement#9.15, credit-agreement#7.01, credit-agreement#1.01, amendment-1#1, consent#1, amendment-1#2
- ✅ [HARNESS] closure contains credit-agreement#9.15 — credit-agreement#7.02, credit-agreement#9.15, credit-agreement#7.01, credit-agreement#1.01, amendment-1#1, consent#1, amendment-1#2
- ✅ [HARNESS] closure contains consent#1 — credit-agreement#7.02, credit-agreement#9.15, credit-agreement#7.01, credit-agreement#1.01, amendment-1#1, consent#1, amendment-1#2
- ✅ [HARNESS] kill prediction (GAP) holds — SURVIVED: no new deterministic failure

Hybrid closure: credit-agreement#7.02, credit-agreement#9.15, credit-agreement#7.01, credit-agreement#1.01, amendment-1#1, consent#1, amendment-1#2 | unresolved: UNRESOLVED_DEFINED_TERM: Secured Indebtedness; UNRESOLVED_DEFINED_TERM: Indebtedness of Foreign Subsidiaries; UNRESOLVED_DEFINED_TERM: United States of America; UNRESOLVED_DEFINED_TERM: Security Documents; OTHER: 7.02(a); OTHER: 7.02(c); UNRESOLVED_DEFINED_TERM: Defined Terms; UNRESOLVED_DEFINED_TERM: Event of Default; AMBIGUOUS_RELATIVE_REFERENCE: Section 1.01; UNRESOLVED_DEFINED_TERM: Credit Agreement; AMBIGUOUS_RELATIVE_REFERENCE: Section 7.01(b); AMBIGUOUS_RELATIVE_REFERENCE: Section 7.02(b); UNRESOLVED_DEFINED_TERM: Required Lenders; UNRESOLVED_DEFINED_TERM: Borrower of Liens; amendment consent: REVIEW_REQUIRED (UNCLASSIFIED_OVERRIDE: override from documentId=consent label="Lender Consent" effectId=c518c6489c97595cc4b82ce7ea5212f65fcf07bac2a145f2fe45fd14cd4fa02b names Section 7.02(b). Its effect on that provision was not established, so the base text is not the resolved operative text.); amendment consent: REVIEW_REQUIRED (UNCLASSIFIED_OVERRIDE: override from documentId=consent label="Lender Consent" effectId=777b45f0c3e71529527dfa25f04a61372e591e0aef6018e140a57f31532c80f9 names Section 7.01(b). Its effect on that provision was not established, so the base text is not the resolved operative text.)

### MUT-17 (OCR_NOISE, pkg-a-basic-credit-agreement)

- ✅ [HARNESS] text stable: 7.03 — 7290438c6ead703c → 7290438c6ead703c
- ✅ [HARNESS] node id survives: 7.01 — structural-node:30229784fda7b97c12644917 → structural-node:30229784fda7b97c12644917
- ✅ [PRODUCT] OCR: 7.02 is intact or absent-with-diagnostics, never silently absorbed — 1 node(s) for 7.02; intact true; absorbed by nobody; health diagnostics 0
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:text:A-7.02

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:text:A-7.02 [SOURCE_PROVENANCE_FAILURE]: 0d79fb5752ed: the parsed clause text differs from the pinned text

### MUT-18 (OCR_NOISE, pkg-a-basic-credit-agreement)

- ✅ [HARNESS] text stable: 7.02 — 629aaa7d62651de8 → 629aaa7d62651de8
- ✅ [HARNESS] text stable: 7.03 — 7290438c6ead703c → 7290438c6ead703c
- ✅ [HARNESS] node id survives: 7.02 — structural-node:4872f810a1b61d6565e525b6 → structural-node:4872f810a1b61d6565e525b6
- ✅ [HARNESS] node id survives: 7.03 — structural-node:9992ee8ba513ea6077d1b881 → structural-node:9992ee8ba513ea6077d1b881
- ✅ [PRODUCT] OCR: 7.01 is intact or absent-with-diagnostics, never silently absorbed — 1 node(s) for 7.01; intact true; absorbed by nobody; health diagnostics 0
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:text:A-7.01

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:text:A-7.01 [SOURCE_PROVENANCE_FAILURE]: 9ab32576f40d: the parsed clause text differs from the pinned text

### MUT-19 (OCR_NOISE, pkg-a-basic-credit-agreement)

- ✅ [HARNESS] text changes: 7.01 — 34a67ec0e7f0c2f5 → 80c7cd5858946490
- ✅ [HARNESS] text stable: 7.02 — 629aaa7d62651de8 → 629aaa7d62651de8
- ✅ [HARNESS] text stable: 7.03 — 7290438c6ead703c → 7290438c6ead703c
- ✅ [HARNESS] node id survives: 7.01(b) — structural-node:31bf7e885d8c7cdeb59bf2b6 → structural-node:31bf7e885d8c7cdeb59bf2b6
- ✅ [PRODUCT] OCR: 7.01(c) is intact or absent-with-diagnostics, never silently absorbed — 1 node(s) for 7.01(c); intact true; absorbed by nobody; health diagnostics 0
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:text:A-7.01, STRUCTURE:structure:text:A-7.01(c), STRUCTURE:structure:enumeration-gap:credit-agreement#7.01

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:text:A-7.01 [SOURCE_PROVENANCE_FAILURE]: 80c7cd585894: the parsed clause text differs from the pinned text
- STRUCTURE structure:text:A-7.01(c) [SOURCE_PROVENANCE_FAILURE]: 59eee80f9527: the parsed clause text differs from the pinned text
- STRUCTURE structure:enumeration-gap:credit-agreement#7.01 [SOURCE_PROVENANCE_FAILURE]: unrecognised enumerator (с) where (c) was expected; health diagnostics 0 - the gap is silent

### MUT-20 (OCR_NOISE, pkg-a-basic-credit-agreement)

- ✅ [HARNESS] text changes: 7.01(b) — 8c8735fd1eb77d46 → 4456a500f6d9c3d4
- ✅ [HARNESS] text changes: 7.01 — 34a67ec0e7f0c2f5 → 5b1d670fc0eae917
- ✅ [HARNESS] text stable: 7.02 — 629aaa7d62651de8 → 629aaa7d62651de8
- ✅ [HARNESS] text stable: 7.03 — 7290438c6ead703c → 7290438c6ead703c
- ✅ [HARNESS] node id survives: 7.01(b) — structural-node:31bf7e885d8c7cdeb59bf2b6 → structural-node:31bf7e885d8c7cdeb59bf2b6
- ✅ [PRODUCT] OCR: 7.01(b) is intact or absent-with-diagnostics, never silently absorbed — 1 node(s) for 7.01(b); intact true; absorbed by nobody; health diagnostics 0
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:text:A-7.01, STRUCTURE:structure:text:A-7.01(b)

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:text:A-7.01 [SOURCE_PROVENANCE_FAILURE]: 5b1d670fc0ea: the parsed clause text differs from the pinned text
- STRUCTURE structure:text:A-7.01(b) [SOURCE_PROVENANCE_FAILURE]: 4456a500f6d9: the parsed clause text differs from the pinned text

### MUT-21 (OCR_NOISE, pkg-h-unseen-composition)

- ✅ [HARNESS] text stable: 7.11 — 056095cdca0f5726 → 056095cdca0f5726
- ✅ [HARNESS] node id survives: 7.02 — structural-node:10d2dcb6371544e8e2cc716a → structural-node:10d2dcb6371544e8e2cc716a
- ✅ [PRODUCT] OCR: 7.03 is intact or absent-with-diagnostics, never silently absorbed — 1 node(s) for 7.03; intact true; absorbed by nobody; health diagnostics 0
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:text:H-7.03

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:text:H-7.03 [SOURCE_PROVENANCE_FAILURE]: e62b6d8af0ba: the parsed clause text differs from the pinned text

### MUT-22 (OCR_NOISE, pkg-h-unseen-composition)

- ✅ [HARNESS] text stable: 2.01 — 316f4b5e1a9e479f → 316f4b5e1a9e479f
- ✅ [HARNESS] node id survives: 2.01 — structural-node:bb40689c4a887060586585d9 → structural-node:bb40689c4a887060586585d9
- ✅ [PRODUCT] OCR: 4.01 is intact or absent-with-diagnostics, never silently absorbed — 1 node(s) for 4.01; intact true; absorbed by nobody; health diagnostics 0
- ✅ [HARNESS] kill prediction (KILLED) holds — KILLED: STRUCTURE:structure:text:H-ICA-4.01

New deterministic failures (the unchanged manifest against the mutant):
- STRUCTURE structure:text:H-ICA-4.01 [SOURCE_PROVENANCE_FAILURE]: 104501b4bee5: the parsed clause text differs from the pinned text

