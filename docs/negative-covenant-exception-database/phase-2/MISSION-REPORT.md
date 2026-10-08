# Phase 2 Mission Report — Negative Covenant Exception Database

## Identity

| Field | Value |
| --- | --- |
| Starting PR | [#143](https://github.com/egsul897/headroom/pull/143) |
| Starting SHA | `e2d7d20768fe4842c1b5be03c540443dc29588cd` |
| Branch | `cursor/negative-covenant-exception-db-21b5` |
| Verdict | `PHASE2_PARTIAL_READY_OFFLINE` |
| Dataset version | `ncedb.phase2.v1` |

## Actual diversity (not the 100/50 target)

| Metric | Actual |
| --- | --- |
| New documents ingested this phase | **9** |
| New issuers | **5** (CHWY, ROCK, DSGR, RIOT, SUP) |
| Total documents in registry | **12** |
| Total issuers | **8** |
| Indentures ingested | **0** (pending CKF/EHB) |
| Amendments ingested | DSGR Fourth Amendment; SUP First Amendment |
| Gap to 100 agreements | **91** still needed via EHB queue + CKF download |
| Gap to 50 issuers | **45** still needed |

Phase-1 CONMED/LSB/FWRG were **not** inflated for the diversity claim. Acquisition coordination is declared in `02-diversity-acquisition-plan.json` against WS-EHB (#142) and WS-CKF (`PILOT_ISSUER_SEEDS` 100 tickers). Bulk EDGAR bytes are not committed to Git.

## Records and classification

| Classification | Count |
| --- | --- |
| CONDITIONAL | 12 |
| UNCONDITIONAL_SOURCE_VERIFIED | 4 |
| NOT_AN_AFFIRMATIVE_PERMISSION | 4 |
| UNKNOWN | 1 |
| **Total** | **21** |

Separate fields maintained: localConditions, remoteConditions, provisoAttachment, entityScope, financialTests, sharedCapacityRestrictions, amendmentAuthority, unresolvedControllingSources.

**Labels are not production capacity approvals.**

## Negative controls

| Class | Present |
| --- | --- |
| LOCAL_CONDITIONS | yes |
| REMOTE_CONDITIONS | yes |
| NO_ADDITIONAL_CONDITIONS | yes |
| AMBIGUOUS_CONDITION_SCOPE | optional / partial |
| PROHIBITION_NO_EXCEPTION | yes (Riot §5.02(c)) |
| NUMERIC_THRESHOLD_NOT_PERMISSION | yes (CONMED §7.1(a); classify mechanics) |
| CONSTRAINED_BY_OTHER_DOCUMENT | yes (LSB §6.04(b) Secured Notes) |

## Local-only vs remote examples

- **Local-only:** CONMED §7.2(d) finance leases; LSB §6.01(i); Riot §5.02(a)(ii) tax liens; CONMED §7.5(a) qualitative gates
- **Remote:** LSB §6.11(c) Payment Conditions; FWRG Available Amount builder; SUP §7.01 Permitted Liens definition; CONMED §7.2(c) → §7.3(g)/§7.1

## Source spans

- Span audit failures: **0**
- Exact quotations separated from paraphrase summaries
- Source sha256 verified against on-disk fixtures in tests

## Validation / quality

| Metric | Status |
| --- | --- |
| Exception discovery recall (Riot mini-detector) | MEASURED_ON_MINI_DETECTOR |
| False-positive exception detection | MEASURED_ON_MINI_DETECTOR |
| Remote-condition recall | **UNVERIFIED** |
| Proviso attachment accuracy | **UNVERIFIED** |
| Entity-scope accuracy | **UNVERIFIED** |
| Cross-reference accuracy | **UNVERIFIED** |
| Incorrect unconditional-permission rate | MEASURED_ON_CATALOG_INVARIANT (= 0 under adapter rules) |
| Provenance accuracy | MEASURED_PARTIAL (0 unresolved spans) |

Held-out GT: `held-out/riot-5.02-independent-gt.json` (hand-authored; not from the extractor under test).

## Integration

- Adapter: `lib/negative-covenant-exceptions/import-adapter.ts` (idempotent `importKey`)
- Export: `phase-2/knowledge-factory-export.json`
- Aligns with PAR delivery/identity contracts (sibling #138)
- Does **not** write Permission / SharedCapacityConstraint / contract-model IR

## Unresolved legal questions

See `08-unresolved-legal-questions.json` (definitional scope vs condition; Permitted Liens explosion; hanging proviso attachment; external-document conditioning; amendment identity).

## Boundaries honored

- No paid inference
- No merges
- No certification advancement
- No sealed-evidence modifications
- No production covenant-engine changes
- No Claude-owned acceptance fixture edits
