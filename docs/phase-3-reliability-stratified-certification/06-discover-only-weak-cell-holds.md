# Discover-only weak-cell holds

Tip: `1acdff345fff655f602fd61ff20c395028b6f140`

**Verdict: BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE**

Soft gate. invent-absence forever. No discovery id in this note was invented. `PINNED_OFFLINE` is not `CERTIFIED`. `IMPLEMENTED` is not `CERTIFIED`. This note does not authorize a pin, a live run, or production code.

The strings `PHASE_3_BLOCKED_BY_EVIDENCE`, `CERTIFIED 0/12`, `edge=0`, and `L8` do not appear in the tree at this tip. They are not treated as findings.

## What was inventoried

Sealed company fixtures under `tests/fixtures/unseen-packages/`: `chwy-2026-credit-agreement`, `conmed-2025-credit-facility`, plus DSGR, FWRG, LSB, and RIOT packages and prior phase-3 run folders. The Chewy sealed discovery used here is `tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage2b-discovery.json` (839 candidates). The CONMED sealed population used here is `docs/phase-3-conmed-population-verified/04-population-manifest.json` (135 rows) and the cited evidence files under `docs/phase-3-conmed-population-verified/`. The pin authority is `docs/phase-3-reliability-stratified-certification/01-pin-matrix.json` and `00-selection-contract.json`.

No new EDGAR exhibit was opened.

A search of `docs/phase-3-reliability-stratified-certification/` found zero JSON `"status": "CERTIFIED"`.

## Cells

### WITH_BUILDERS — hold

Matrix status: `DEFERRED` / `honestyOutcome: PIN_HOLD`.

Sealed probe:

| Field | Value |
| --- | --- |
| discoveryId | `discovery-candidate:f62db8ebcda9d35c4fc03b2a` |
| section | Chewy `6.01(b)(4)(a)(i)` |
| role | `BUILDER` |
| window | 285 chars, matrix says UNIQUE, identity assertions true |
| eligibility | `eligible: false` |
| blocker | `UNRESOLVED_OPERATIVE_EVIDENCE`: offline bundle `AMBIGUOUS_TARGET` for Subsidiary and Uniform Commercial Code, plus context budget exceeded |

Sibling named by the matrix and still unpinned: `discovery-candidate:6ffcfd3794d39597caa7b83b` (Chewy `6.08`, `AMBIGUOUS`).

The same Chewy file contains 15 candidates with `"role": "BUILDER"`. None of them has an `eligible: true` pin packet in the stratified pin tree. Other ids in that role list, present in the sealed file and not promoted by this note:

`discovery-candidate:50b20082ccbac6f110bc121b` (`1.01`), `discovery-candidate:265838c9b0256ab7fe2e21c6` (`1.08(d)`), `discovery-candidate:501eb9d39a0af643dc5dc8ec` (`1.08(f)`), `discovery-candidate:f1296db754e8e58b2df1b98c` (`1.08(i)`; matrix already records `eligible: false`), `discovery-candidate:ac3033fd2611599aad30c670` (`1.08(j)`), `discovery-candidate:142db7a3f96baded0244e49c` (`2.09(c)`), `discovery-candidate:e499007fa727073932ae8d6a` (`2.12(a)`), `discovery-candidate:0fa404221f4a6ea4bce4d6ca` (`2.16(b)`), `discovery-candidate:dbe8ccb162675149aa57bb9c` (`6.01(b)(4)(a)(ii)`), `discovery-candidate:2c1735467ea794634bebb82c` (`6.01(b)(4)(a)(iii)`), `discovery-candidate:5d69ce8f4a323fa8640f3604` (`6.01`), `discovery-candidate:f7c9604ae98f540743e18dac` (`6.08`), `discovery-candidate:4e9e2c9c4daf1e3b1f69c3f9` (`6.08`).

Bounded residual: none. The emitter already records `WITH_BUILDERS` for a sealed `BUILDER` role. That implementation is not a pin and not a certification. Coercing `eligible: true` is forbidden. A narrower discovery id is not in the sealed tree.

### WITH_RECLASSIFICATION — hold

Matrix status: `BLOCKED`.

Blocker recorded in `01-pin-matrix.json`: no sealed Chewy or CONMED discovery candidate is bound offline to a concrete classification/reclassification mechanic. The selection contract says the CONMED §7.2 classification note is section-wide and is not a standalone frozen identity.

Sealed section spans that are the wrong shape:

| discoveryId | ref | chars | recorded compile |
| --- | --- | --- | --- |
| `discovery-candidate:4cd22c1476a7c5046da3cc41` | `7.2` | 8843 | `TIMEOUT`; verify not run |
| `discovery-candidate:08919c086272421431dd7aed` | `7.3` | 7053 | `TIMEOUT`; verify not run |

The reclassify sentence also sits inside `discovery-candidate:d743c01b399ff5f9bd439df9`. That candidate’s own section is `7.3(p)` (1255 chars). Its evidence-file compilation status is `FAILED`. The population row records compile `TIMEOUT`. Using that id as the reclassification identity would bind the wrong section.

Bounded residual: none. No standalone sealed id is the reclass mechanic.

### ASSET_SALES — Chewy pin stays ineligible; §7.5(a) is not a cert candidate

Chewy stratum pin, already written:

| Field | Value |
| --- | --- |
| discoveryId | `discovery-candidate:b54ed7fe4f8f7bb7c224d99b` |
| section | `6.05(a)(2)(c)` |
| pin | `pins/chwy-2026-credit-agreement/6.05(a)(2)(c)--b54ed7fe/v1/` |
| status | `PINNED_OFFLINE` |
| eligibility | `eligible: false` |
| blocker | `UNRESOLVED_OPERATIVE_EVIDENCE`. Bundle sufficiency `BUDGET_EXCEEDED`. Non-current items: Subsidiary and Uniform Commercial Code, each `AMBIGUOUS_TARGET` (two physical definitions in `doc-a`, no amendment history) |

`coverageSummary.assetSalesEligibleForCertifiedPath` is `false`.

CONMED §7.5(a), the sealed alternate that exists in-repo:

| Field | Value |
| --- | --- |
| discoveryId | `discovery-candidate:baca43714b8502cc9c596c23` |
| section | `7.5(a)` |
| chars | 89 |
| population | compile `COMPLETED`, verify `COMPLETED`, `verificationStatus: MATERIAL_DISCREPANCY` |
| map node | `ir-rule:b752bbaf461e4c3b704300d2` |
| map certification | `NOT_CERTIFIED`, blocker `CERTIFICATION_NOT_PERFORMED` |
| compiled family | `QUALITATIVE_NEGATIVE_COVENANTS` (map sufficiency text says `ASSET_DISPOSITIONS` was not recognized) |
| bundle | `sufficiencyState: REVIEW_REQUIRED` |
| operative text | “the Disposition of obsolete or worn out property in the ordinary course of business” |

The evidence file’s verifier reasoning says the compiled IR drops the “obsolete or worn out” limit and keeps only the ordinary-course condition. That is a recorded material discrepancy, not a clean window.

Every other sealed `7.5*` population row is also short of a clean verify: `MATERIAL_DISCREPANCY`, `VERIFICATION_INCOMPLETE`, compile `TIMEOUT` / `SCHEMA_FAILURE`, or verify not run. `7.5(j)` (`discovery-candidate:5aeac47ab31feb23331e4f89`) is the live-exhausted section the selection contract excludes from the first pin, and its population row is `SCHEMA_FAILURE`. Across all 135 population rows, verification statuses are only empty, `MATERIAL_DISCREPANCY` (34), `VERIFICATION_INCOMPLETE` (24), `REVIEW_REQUIRED` (1), and `VERIFICATION_FAILED` (1). None is a pass.

Bounded residual: none that unlocks an eligible asset-sale pin. §7.5(a) stays a sealed id with a failed verification. It is not `READY_TO_PIN`.

### PINNED_OFFLINE to CERTIFIED — not this mission

Eligible offline pins already exist (CONMED `7.6(c)`, `7.3(m)`, `7.8(l)`, `7.8(d)`, `7.1(c)`, and the Chewy financial-covenant follow-ons named in the matrix). Each packet’s status field is `PINNED_OFFLINE`. The selection contract says `CERTIFIED` requires production `certifyCandidate` with empty blockers, and live/paid runs need a separate authorization. This discover pass did not find a certification artifact, and the soft gate forbids creating one here.

That conversion is a soft-gate hold. It does not supply the missing builder, reclass, or asset-sale evidence above.

## Ranked stop

1. Leave `WITH_BUILDERS` unpinned. The missing evidence is a current, single definition for Subsidiary and for Uniform Commercial Code on `discovery-candidate:f62db8ebcda9d35c4fc03b2a`.
2. Leave `WITH_RECLASSIFICATION` blocked. The missing evidence is a sealed discovery whose own section is the classification mechanic.
3. Leave Chewy `6.05(a)(2)(c)` as the identity-only asset-sale pin. Do not promote `discovery-candidate:baca43714b8502cc9c596c23`.
4. Leave every current pin at `PINNED_OFFLINE`.

No further in-repo discover pass on these four cells is justified from the documents above.
