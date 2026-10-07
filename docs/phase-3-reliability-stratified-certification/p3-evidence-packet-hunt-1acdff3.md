# P3 evidence packet hunt — discover only

**Checkout / `origin/main` tip:** `1acdff345fff655f602fd61ff20c395028b6f140`  
**Fetched:** `git fetch origin main` on 2026-10-07 returned that same SHA (`3f11825..1acdff3`).  
**Mode:** discover-only. No pin written. No product remediation. No `eligible:true` coerced. No discoveryId, span, edge, or seal invented.  
**Soft gate:** `PINNED_OFFLINE` ≠ `CERTIFIED`. `IMPLEMENTED` ≠ `CERTIFIED`. Invent-absence forever.

This note inventories in-repo packets for the three cells that are still HOLD or blocked-by-evidence. It does not authorize a pin.

## Lane verdicts

Each lane stops on exactly one verdict. Search stopped after two source classes (sealed CONMED / Chewy discovery, then repo-wide company-packet search). No third source class (no shortlist exhibit text, no extra sealed population) remains in the repo.

| Lane | Verdict | Why this one |
|---|---|---|
| `WITH_BUILDERS` | **BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE** | A sealed role-`BUILDER` cell exists and the emitter now emits the cross-cut. The committed hold test records `eligible:false` / `UNRESOLVED_OPERATIVE_EVIDENCE`. That missing operative evidence is the blocker. |
| `WITH_RECLASSIFICATION` | **NO_VALID_CANDIDATE** | Sealed rows mention reclassification in descriptions, and one Chewy citation uses the word inside a definition. None is a sentence-bound classification/reclassification mechanic with a selection-contract bind. |
| `ASSET_SALES` eligible / certified residual | **BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE** | Identity is already `PINNED_OFFLINE` and `eligible:false` (`UNRESOLVED_OPERATIVE_EVIDENCE`: Subsidiary, Uniform Commercial Code). The §7.5(a) alt has a sealed row and is not an eligibility packet. |

**Invent-safe residual:** none. **CANDIDATE ONLY:** not flagged.

A named checklist of five invent-safe gates is not in the stratified-cert packet at this SHA. The phrase “invent-safe” at tip appears in `docs/architecture/FINANCIAL-STATE-UNIQUENESS-KEY-EVIDENCE-ADR.md`, which lists `WITH_BUILDERS` as out of scope. The emitter design’s `eligible:true` list is four bullets (`05-pin-pipeline-emitter-design.md` lines 72–76), and this hunt does not mark those bullets Y for any unpinned cell.

## What was searched

**Pass 1 — sealed stratified universe**

- `docs/phase-3-reliability-stratified-certification/00-README.md`, `00-selection-contract.json`, `01-pin-matrix.json`, `05-pin-pipeline-emitter-design.md`
- Pin tree under `docs/phase-3-reliability-stratified-certification/pins/` (listed below)
- Registry sources in `scripts/stratified-cert/lib/package-registry.ts`: Chewy `tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage2b-discovery.json` (839 candidates; `documentDiscoveryHealth` `DISCOVERY_PARTIAL`); CONMED `tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json` (163 candidates)
- Cross-cut rules in `scripts/stratified-cert/lib/cross-cuts.ts`
- Hold test `tests/stratified-cert/pin-candidate-chewy-builders-hold.test.ts`

**Pass 2 — company packets outside that universe**

- Workspace search for `Insulet`, `Knife River`, `Gibraltar`, `Tidewater`, `Hilton Grand`, `GRANITE CONSTRUCTION`, `PODD`, `KNF`, `GVA`
- `docs/phase-2f-package-selection-log.md` (no matches)
- `docs/phase-3-validation/01-source-identity-and-selection.json` (HGV and Granite are EDGAR index rows only)
- Directory listing of `tests/fixtures/unseen-packages/` (no shortlist package folder)
- CONMED canonical map entry for `baca4371…`

No exhibit HTML/text, extraction manifest, or sealed discovery population for the shortlist issuers was found. Stop.

## Package universe that actually exists

The pin registry loads exactly two packages (`scripts/stratified-cert/lib/package-registry.ts`).

| packageKey | companyId | instrumentKey | sealed discovery | fixture |
|---|---|---|---|---|
| `conmed-2025-credit-facility` | `conmed-pilot` | `conmed-eighth-ar-credit-agreement` | `tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json` | `tests/fixtures/unseen-packages/conmed-2025-credit-facility` |
| `chwy-2026-credit-agreement` | `phase-3-validation-chwy` | `chwy-2026-revolving-credit-instrument` | `tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage2b-discovery.json` | `tests/fixtures/unseen-packages/chwy-2026-credit-agreement` |

Chewy issuer facts in the fixture manifest: Chewy, Inc., CIK `0001766502`, accession `0001193125-26-281042`, EX-10.1 (`tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extraction-manifest.json`). CONMED issuer facts: CONMED Corporation, CIK `0000816956` (`tests/fixtures/unseen-packages/conmed-2025-credit-facility/README.md`).

Other fixture directories (DSGR, FWRG, LSB, Riot, and run caches) are not loaded by `loadPackage`. They are not treated here as stratified pin populations.

### Pin folders present at tip

| Folder | Status in matrix | This hunt |
|---|---|---|
| `first-target/` | CONMED §7.6(c) baseline | not a target cell |
| `pins/chwy-2026-credit-agreement/2.18(c)(vii)--cf3d8d94/v1/` | `WITH_SHARED_CAPS` | not a target cell |
| `pins/chwy-2026-credit-agreement/6.05(a)(2)(c)--b54ed7fe/v1/` | `ASSET_SALES` identity | eligible residual still blocked |
| `pins/conmed-2025-credit-facility/7.3(m)--b5bb07b0/v1/` | LIENS | not a target cell |
| `pins/conmed-2025-credit-facility/7.8(l)--3476b082/v1/` and `7.8(d)--8aaa7b74/v1/` | INVESTMENTS | not a target cell |
| `pins/conmed-2025-credit-facility/7.1(c)--5f83b15e/v1/` | FINANCIAL_COVENANTS | not a target cell |
| `pins/chwy-2026-credit-agreement/1.08(d)(i)--c2018498/v1/`, `1.08(d)(ii)--5be40987/v1/`, `1.08(g)--c3708f1e/v1/` | FinCov follow-ons | not a target cell |
| `pins/chewy-2.18c-vii-incremental-shared-cap/` | hand pin, superseded | not a target cell |

No pin folder exists for `WITH_BUILDERS`, `WITH_RECLASSIFICATION`, or CONMED §7.5(a).

## Lane 1 — `WITH_BUILDERS`

**Verdict: BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE**

Matrix row (`01-pin-matrix.json` `crossCuts` id `WITH_BUILDERS`): `status` `DEFERRED`, `honestyOutcome` `PIN_HOLD`. `coverageSummary.crossCutsDeferred` contains `WITH_BUILDERS`. It is not in `crossCutsPinnedOffline`.

Selection-contract binding rule (`00-selection-contract.json`): include only when a sealed candidate’s operative text or map node exhibits builder/grower structure; otherwise TBD with blocker. `matrixRowsTbd` still says no builder/grower `sectionRef` is bound from sealed inventories.

Emitter at tip (`scripts/stratified-cert/lib/cross-cuts.ts`): sealed `role === "BUILDER"` derives `WITH_BUILDERS`. The builder/grower regex is supplemental only when the role is not `BUILDER`. That emitter change is `IMPLEMENTED`. It is not a pin and not `CERTIFIED`. The older priority line in `05-pin-pipeline-emitter-design.md` (“text heuristic → WITHOUT_BUILDERS”) is retained verbatim and is superseded by the P3-WB1 amendment in that same file and in `00-README.md`.

### Committed hold cell (role bind, not a pin)

| Field | Value | Where |
|---|---|---|
| discoveryId | `discovery-candidate:f62db8ebcda9d35c4fc03b2a` | hold test; sealed Chewy discovery |
| sectionRef | `6.01(b)(4)(a)(i)` | same |
| company / package | `phase-3-validation-chwy` / `chwy-2026-credit-agreement` | registry |
| role / family | `BUILDER` / `INDEBTEDNESS` | sealed row |
| review / multipleRulesLikely | `AUTO_ACCEPTED` / false | sealed row |
| sourceCitation chars | 285 | sealed row |
| citation text | greater of $360.0 million and 50% of Consolidated EBITDA, plus | sealed row. No `builder` / `grower` / `build-up` / `accumulated amount` match |
| identity | hold test expects all identity assertions true, single occurrence | `tests/stratified-cert/pin-candidate-chewy-builders-hold.test.ts` |
| cross-cut | `WITH_BUILDERS` from role only | same test |
| eligible | `false` | same test |
| blocker | `UNRESOLVED_OPERATIVE_EVIDENCE` | same test (`AMBIGUOUS_TARGET` for Subsidiary and Uniform Commercial Code, plus context budget exceeded — stated in the matrix blocker string) |
| pin folder | absent | test expects `pins/.../6.01(b)(4)(a)(i)--f62db8eb` not to exist |

**Rows exist:** yes (sealed role `BUILDER`).  
**Sealed sentence identity of a builder/grower formula:** no. The 285-character citation is a cap formula. The selection-contract sentence bind is not met. The role bind is met and still `eligible:false`.

Sibling `discovery-candidate:6ffcfd3794d39597caa7b83b` (§6.08) is named in the matrix as `AMBIGUOUS` and unpinned. The hold test expects `pinCandidate` to throw `/AMBIGUOUS/`. Section ref `6.08` has 17 sealed Chewy candidates and 3 of them have role `BUILDER`. Their `sourceCitation` is the 50-character heading `Section 6.08 Limitation on Restricted Payments .` That is a row, not a sentence identity.

### Other sealed Chewy `role === "BUILDER"` rows (15 total)

CONMED sealed population: **0** rows with `role === "BUILDER"`.

These ids were read from `stage2b-discovery.json`. They are not new pins. “Sentence bind” means the `sourceCitation` itself matches the builder/grower regex in `cross-cuts.ts`. None of these citations do.

| sectionRef | discoveryId | review | citation chars | all candidates at that ref | sentence bind |
|---|---|---|---|---|---|
| `1.01` | `discovery-candidate:50b20082ccbac6f110bc121b` | `NEEDS_REVIEW` | 300 | 44 | no |
| `1.08(d)` | `discovery-candidate:265838c9b0256ab7fe2e21c6` | `NEEDS_REVIEW` | 300 | 1 | no |
| `1.08(f)` | `discovery-candidate:501eb9d39a0af643dc5dc8ec` | `NEEDS_REVIEW` | 4 | 2 | no |
| `1.08(i)` | `discovery-candidate:f1296db754e8e58b2df1b98c` | `NEEDS_REVIEW` | 266 | 1 | no |
| `1.08(j)` | `discovery-candidate:ac3033fd2611599aad30c670` | `NEEDS_REVIEW` | 300 | 1 | no |
| `2.09(c)` | `discovery-candidate:142db7a3f96baded0244e49c` | `UNCERTAIN` | 300 | 4 | no |
| `2.12(a)` | `discovery-candidate:e499007fa727073932ae8d6a` | `NEEDS_REVIEW` | 184 | 2 | no |
| `2.16(b)` | `discovery-candidate:0fa404221f4a6ea4bce4d6ca` | `UNCERTAIN` | 300 | 1 | no |
| `6.01(b)(4)(a)(i)` | `discovery-candidate:f62db8ebcda9d35c4fc03b2a` | `AUTO_ACCEPTED` | 285 | 1 | no (role bind only; pin HOLD) |
| `6.01(b)(4)(a)(ii)` | `discovery-candidate:dbe8ccb162675149aa57bb9c` | `AUTO_ACCEPTED` | 300 | 1 | no |
| `6.01(b)(4)(a)(iii)` | `discovery-candidate:2c1735467ea794634bebb82c` | `AUTO_ACCEPTED` | 239 | 1 | no |
| `6.01` | `discovery-candidate:5d69ce8f4a323fa8640f3604` | `AUTO_ACCEPTED` | 113 | 18 | no |
| `6.08` | `discovery-candidate:6ffcfd3794d39597caa7b83b` | `NEEDS_REVIEW` | 50 | 17 | no |
| `6.08` | `discovery-candidate:f7c9604ae98f540743e18dac` | `NEEDS_REVIEW` | 50 | 17 | no |
| `6.08` | `discovery-candidate:4e9e2c9c4daf1e3b1f69c3f9` | `UNCERTAIN` | 50 | 17 | no |

`01-pin-matrix.json` INVESTMENTS `why` states that modest §1.08(i) `BUILDER` emits `UNRESOLVED_OPERATIVE_EVIDENCE`. The only sealed candidate at `1.08(i)` is `discovery-candidate:f1296db754e8e58b2df1b98c`. This hunt does not add an eligibility packet for it.

**Chewy is blocked** for this cell. Do not ship a pin. Do not coerce `eligible:true`.

**Missing:** a sealed operative window that both (a) is the builder/grower mechanic the selection contract names and (b) has a committed eligibility packet with an empty blocker list. The role-only cell fails (b). The other rows fail (a), and several also fail uniqueness (`1.01` has 44 candidates; `6.08` has 17).

## Lane 2 — `WITH_RECLASSIFICATION`

**Verdict: NO_VALID_CANDIDATE**

Matrix (`01-pin-matrix.json`): `status` `BLOCKED`. Blocker text: no sealed Chewy/CONMED discovery candidate bound offline to a concrete classification/reclassification mechanic identity. Do not invent sectionRefs or discoveryIds. `coverageSummary.crossCutsBlocked` contains `WITH_RECLASSIFICATION`.

Selection contract (`00-selection-contract.json`): “CONMED §7.2 closing classification/anti-duplication mechanic is section-wide; bind a concrete discovery candidate before live — do not invent IDs.” `matrixRowsTbd` repeats that the map note is not a standalone frozen identity.

Emitter: `WITH_RECLASSIFICATION` is a text heuristic only (`reclassif(y|ication)`, `re-characterize`, `anti-duplication`). There is no sealed role that maps to this cross-cut (`cross-cuts.ts`).

Canonical map (`docs/canonical-covenant-map/maps/conmed-2025-credit-facility.map.md` line 209), on `discovery-candidate:19f36eb8514494897cd4a5b6` (§7.2(d) finance-lease basket, not a reclass row): the closing classification/anti-duplication paragraph is “a Section-wide mechanic noted in overallNotes rather than folded into this rule.” That candidate’s sealed `sourceCitation` is the finance-lease basket text, not the closing paragraph.

### Reclass regex hits in the two sealed populations

`sourceCitation` match vs `description` match. A description hit is a row. It is not sealed sentence identity.

| package | discoveryId | sectionRef | role | in citation | in description |
|---|---|---|---|---|---|
| CONMED | `discovery-candidate:9fda59c688efd0a4baac658f` | `7.3` | `DESIGNATION_RULE` | no | yes (“classify, reclassify or divide a Lien…”) |
| Chewy | `discovery-candidate:58c0707a3ae002247a5319a3` | `1.01` | `DESIGNATION_RULE` | no | yes |
| Chewy | `discovery-candidate:11126e5d9b3471382e895e99` | `1.01` | `DESIGNATION_RULE` | no | yes |
| Chewy | `discovery-candidate:b6faec2341f3a04dbe755ff1` | `1.08(f)(i)(i)(A)` | `DEFINITIONAL_DEPENDENCY_CANDIDATE` | yes — parenthetical “basket reclassification” inside an incurrence-based-amount action list | no |
| Chewy | `discovery-candidate:82f0f8f14f2426d932b513dc` | `1.08(f)` | `DESIGNATION_RULE` | no (citation is `(f)`) | yes (“automatic reclassification…”) |
| Chewy | `discovery-candidate:027b4c423907d829595478fb` | `5.18` | `DESIGNATION_RULE` | no (heading only) | yes |
| Chewy | `discovery-candidate:e93fc56312525fd9ac9bfd04` | `6.01` | `DESIGNATION_RULE` | no (heading only) | yes |
| Chewy | `discovery-candidate:e8467da748d59de764b93705` | `6.08(h)` | `DESIGNATION_RULE` | no | yes |

The one citation hit is not the mechanic. `reviewStatus` is `NEEDS_REVIEW`. The section ref is a nested definitional clause. No pin folder. Not a selection-contract bind.

CONMED §7.2 lettered rows in the sealed file are indebtedness permissions/baskets. Their citations do not match the reclass regex. Count of CONMED `sourceCitation` regex hits: 0.

**Missing, and not present as a candidate to finish:** a sealed discovery row whose operative citation is the classification/reclassification mechanic, with `sectionRef` + `discoveryId` bound. Company packets that might have contained one are not in the repo (next section).

## Lane 3 — `ASSET_SALES` eligible residual

**Verdict: BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE**

The stratum is already identity-pinned. That pin is not the eligible path and is not `CERTIFIED`.

| Field | Value | Where |
|---|---|---|
| pin | `pins/chwy-2026-credit-agreement/6.05(a)(2)(c)--b54ed7fe/v1/` | matrix pinId `chwy-6.05a2c-b54ed7fe-v1` |
| status | `PINNED_OFFLINE` | `01c-target-eligibility.json` |
| discoveryId | `discovery-candidate:b54ed7fe4f8f7bb7c224d99b` | identity packet |
| sectionRef | `6.05(a)(2)(c)` | identity packet |
| package / company | `chwy-2026-credit-agreement` / `phase-3-validation-chwy` | identity packet / registry |
| role / family | `BASKET` / `ASSET_SALES` | matrix |
| identityStrength | `STRONG` | eligibility packet |
| eligible | `false` | eligibility packet line 209 |
| blockers | `["UNRESOLVED_OPERATIVE_EVIDENCE"]` | eligibility packet |
| unresolved refs | `Subsidiary` and `Uniform Commercial Code`, both `AMBIGUOUS_TARGET` (two physical definitions, no amendment history) | eligibility packet `nonCurrentItems` |
| bundle | `BUDGET_EXCEEDED` | same |
| cross-cuts on this pin | `WITHOUT_SHARED_CAPS`, `WITHOUT_BUILDERS`, `WITHOUT_RECLASSIFICATION` | eligibility `crossCutClaims` |
| matrix flag | `assetSalesEligibleForCertifiedPath: false` | `01-pin-matrix.json` `coverageSummary` |

**Rows exist and sealed sentence identity exists for this basket** (857-character window, already pinned). **Eligible / certified identity does not.** `PINNED_OFFLINE` ≠ `CERTIFIED`.

Selection contract still lists `ASSET_SALES` under `matrixRowsTbd` with blocker “Prefer non-7.5(j) basket; exclude series-aggregation-only windows until A/C ADR.” The matrix pin is the later authority for identity status. §7.5(j) `discovery-candidate:5aeac47ab31feb23331e4f89` remains the live-exhausted series window named by the contract. This hunt does not reopen it.

### Alt — CONMED §7.5(a) `baca4371…`

Sealed row, not a pin, not an eligibility packet.

| Field | Value | Where |
|---|---|---|
| discoveryId | `discovery-candidate:baca43714b8502cc9c596c23` | `phase-2f-stage2-discovery-candidates.json` lines 2177–2199 |
| sectionRef | `7.5(a)` | same |
| documentId | `conmed-doc-a-eighth-ar-credit-agreement` | same |
| company / package | `conmed-pilot` / `conmed-2025-credit-facility` | registry |
| families | `["DISPOSITIONS"]` only | sealed row. Code maps `DISPOSITIONS` → stratum `ASSET_SALES` (`cross-cuts.ts`). The row does not carry family `ASSET_SALES` |
| role | `EXCEPTION` | sealed row |
| review / multipleRulesLikely | `AUTO_ACCEPTED` / false | sealed row |
| sourceCitation | `(a) the Disposition of obsolete or worn out property in the ordinary course of business;` (89 chars) | sealed row |
| structural keys | `7.5(a)` and parent `7.5` | sealed row |
| map outcome | `MAPPED_WITH_REVIEW` | `conmed-2025-credit-facility.map.json` lines 23384–23416 |
| map compilation | `REVIEW_REQUIRED` / `SEMANTIC_ACCOUNTABILITY_INCOMPLETE` | same |
| map verification | `MATERIAL_DISCREPANCY` | same |
| map certification | `NOT_CERTIFIED` / `CERTIFICATION_NOT_PERFORMED` | same |
| map operative chars | 89 | same |
| pin folder | none | pin tree listing |
| eligibility packet | none | no `01c-target-eligibility.json` for this id |

**Rows exist:** yes. **Sealed citation is one sentence:** yes, in the discovery `sourceCitation` and the map’s 89-character operative length. **That is not a stratified eligibility seal and not `CERTIFIED`.** Map `REVIEW` is not pre-credit. This hunt did not run `pinCandidate` and does not claim `eligible`, `singleOccurrence`, or interim-B cleanliness for this id.

**Missing for the alt:** a committed offline eligibility packet. Until that exists, the alt is not `READY_TO_PIN`.

## Shortlist company ledger

Prior names were searched. Absence is the finding.

| Name | In-repo packet? | company id | discoveryId | Seal | Verdict for use on these three cells |
|---|---|---|---|---|---|
| Insulet | no matches | none | none | none | **NO_VALID_CANDIDATE** |
| Knife River | no matches | none | none | none | **NO_VALID_CANDIDATE** |
| Gibraltar | no matches | none | none | none | **NO_VALID_CANDIDATE** |
| Tidewater | no matches | none | none | none | **NO_VALID_CANDIDATE** |
| Granite (GVA) | EDGAR index row only | none in repo. Index text: `GRANITE CONSTRUCTION INC (GVA) (CIK 0000861459)`, file_date `2026-06-02`, EX-4.1, adsh `0001437749-26-019166` (`01-source-identity-and-selection.json` i:82) | none | no exhibit, no discovery | **NO_VALID_CANDIDATE** |
| HGV | EDGAR index row only | none in repo. Index text: `Hilton Grand Vacations Inc. (HGV) (CIK 0001674168)`, file_date `2026-07-17`, EX-10.1, adsh `0001140361-26-028827` (same file, i:65) | none | no exhibit, no title block, no discovery | **NO_VALID_CANDIDATE** |
| Chewy | sealed package, see above | `phase-3-validation-chwy` | builders and asset-sale ids cited above | discovery sealed; builders pin HOLD; asset-sale identity `PINNED_OFFLINE` | builders and eligible asset-sale residual stay **BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE** |
| CONMED | sealed package, see above | `conmed-pilot` | §7.5(a) cited above; zero `BUILDER` roles; no reclass sentence | discovery sealed; §7.5(a) not pinned | not a valid reclass candidate; §7.5(a) is not an eligibility seal |

## Honesty ledger

| Claim | Status |
|---|---|
| `WITH_BUILDERS` emitter honors sealed role `BUILDER` | `IMPLEMENTED`. Not `CERTIFIED`. Not a pin |
| `WITH_BUILDERS` matrix cell | `DEFERRED` / `PIN_HOLD`. Not `PINNED_OFFLINE` |
| `WITH_RECLASSIFICATION` | `BLOCKED` in the matrix. This hunt’s stop verdict is `NO_VALID_CANDIDATE` |
| `ASSET_SALES` identity pin | `PINNED_OFFLINE`, `eligible:false`. Not `CERTIFIED` |
| `ASSET_SALES` eligible path | blocked. `assetSalesEligibleForCertifiedPath` is false |
| CONMED §7.5(a) | sealed discovery row + map `NOT_CERTIFIED`. Not a pin |
| Shortlist issuers | no document packets |
| Five invent-safe gates all Y | not stamped. Checklist not defined for this packet at tip |
| New discoveryIds, spans, edges, seals | none added |
| `eligible:true` | not claimed for any unpinned cell |

## What remains HOLD, and the named blocker

- **`WITH_BUILDERS` stays pin HOLD.** Blocker: `discovery-candidate:f62db8ebcda9d35c4fc03b2a` is `eligible:false` with `UNRESOLVED_OPERATIVE_EVIDENCE`. No other sealed row is a sentence-bound builder/grower bind with an eligibility packet.
- **`WITH_RECLASSIFICATION` stays unbound.** Blocker: no valid sealed sentence of the mechanic. The §7.2 closing paragraph is a map overall-note, not a discovery identity.
- **`ASSET_SALES` eligible/certified path stays blocked.** Blocker: pinned Chewy §6.05(a)(2)(c) unresolved `Subsidiary` and `Uniform Commercial Code` (`AMBIGUOUS_TARGET`). §7.5(a) does not fill that gap; it has no eligibility packet and its map status is `NOT_CERTIFIED`.
- **Shortlist packets stay absent.** Blocker: not in the repo. Do not fetch or invent them in a later pin.

No lane is `READY_TO_PIN`. No lane is `READY_FOR_GENERALIZED_IMPLEMENTATION`.
