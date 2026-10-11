# Archived / open PR inventory and dispositions

Inventory refreshed against GitHub at consolidation time. Dispositions are relative to the #293 consolidation tip (includes #298 absorption).

## Disposition legend

| Code | Meaning |
|---|---|
| ABSORBED | Unique safe production already on #293 tip |
| SUPERSEDED | Parallel/older implementation; do not resurrect wholesale |
| KEEP_SEPARATE | Valid open workstream; merge independently when ready |
| DOCS_ONLY | No unique production to recover |
| CLOSED_UNMERGED | Closed without merge; content superseded or absorbed elsewhere |

## Canonical / Agent stream (high priority)

| PR | Title (abbrev) | Disposition |
|---|---|---|
| #293 | Canonical product integration | **MERGE_CANDIDATE → main** (human) — tip `2ab1ac78`, exact-tip CI green |
| #298 | Absorb #296 P0 authority edges | **ABSORBED** into #293 tip; close as absorbed (do not re-merge) |
| #296 | P0 fail-closed operative authority | **SUPERSEDED** by #298 selective absorption (do not wholesale resurrect alternate `governing-provision` shape) |
| #297 | P0 adversarial fixture + authority closure | **ABSORBED** (code at `60dbdeee` on #293; PR may be closed as duplicate of tip) |
| #295 / #299 / #292 / #286 | Agent #11 acceptance docs | **DOCS_ONLY** — leave open or close; no production recovery |
| #294 | Persistence / Neon institutional memory | **KEEP_SEPARATE** — unique `lib/persistence/**` + SSR gate; blocked on tenant auth / request assembly / IdP |
| #291 | Persistence evidence on EVAL DB | **ABSORBED** (docs/evidence into #293 integrate commit) |
| #290 | HEADROOM-9 evidence pathway | **ABSORBED** into #293 |
| #287 | HEADROOM-6 recursive legal context | **ABSORBED** into #293 |
| #285 | Unified verified transaction execution | **ABSORBED** into #293 |
| #283 | Operative restatement authority | **ABSORBED** into #293 |
| #282 | Trusted identity boundary | **ABSORBED** into #293 |

## Closed unmerged (sample)

| PR | Disposition |
|---|---|
| #281 HEADROOM-9 financial/utilization | **SUPERSEDED** by #290 path on tip |
| #234 verified remaining resolver | **SUPERSEDED** by later capacity stack on main/#293 |
| #232 Neon activation matrix | **SUPERSEDED** / historical |

## Older open product PRs (#220–#264, #251–#258, etc.)

**SUPERSEDED** by #250→#293 canonical stack unless a file-level audit shows unique production not present on tip. Do **not** wholesale-merge. No additional narrowly scoped recovery PR opened this turn: spot-check of #283/#287/#282/#285/#290/#298 unique `lib/` surfaces are present on consolidation tip; #294 retained separate.

## Recovery rule applied

Recover only safe, generalizable improvements not already absorbed. #298 null-date/`UNSUPPORTED` edge was the only outstanding P0 authority delta vs tip — now absorbed. No further consolidation PRs created.
